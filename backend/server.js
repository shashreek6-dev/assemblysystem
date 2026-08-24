import express from 'express';
import session from 'express-session';
import mysql from 'mysql2';
import http from 'http';
import { Server } from 'socket.io';
import multer from 'multer';
import * as XLSX from 'xlsx';
import cors from 'cors';
import {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const app = express();
const server = http.createServer(app);

app.use(cors({
    origin: true,
    credentials: true
}));

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const upload = multer({ storage: multer.memoryStorage() });

app.set('trust proxy', 1);
app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || 'assembly-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false,
        sameSite: 'lax'
    }
}));

const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '', 
    database: process.env.DB_NAME || 'assembly_db'
});

const getRpID = (req) => {
    const rawHost = req.get('x-forwarded-host') || req.get('host') || 'localhost';
    return rawHost.split(':')[0];
};

const getOrigin = (req) => {
    const rawHost = req.get('x-forwarded-host') || req.get('host') || 'localhost:5173';
    const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
    return `${proto}://${rawHost}`;
};

const translateToNepali = async (text) => {
    if (!text || typeof text !== 'string' || !text.trim()) return '';
    const cleanText = text.trim();

    if (/[\u0900-\u097F]/.test(cleanText)) return cleanText;

    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ne&dt=t&q=${encodeURIComponent(cleanText)}`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data && data[0] && Array.isArray(data[0])) {
                const translated = data[0].map(item => item[0]).join('').trim();
                if (translated) return translated;
            }
        }
    } catch (err) {
        console.error(`Neural translation error for "${cleanText}":`, err.message);
    }

    return cleanText;
};

const positionMap = {
    "mp": "माननीय सांसद",
    "member of parliament": "माननीय संसद सदस्य",
    "opposition leader": "प्रमुख प्रतिपक्षी दलका नेता",
    "cabinet minister": "माननीय मन्त्री",
    "minister": "मन्त्री",
    "prime minister": "सम्माननीय प्रधानमन्त्री",
    "pm": "सम्माननीय प्रधानमन्त्री",
    "speaker": "सम्माननीय सभामुख",
    "deputy speaker": "माननीय उपसभामुख",
    "secretary general": "महासचिव",
    "member": "सदस्य"
};

let activeSection = 'sunya'; 
let queues = {
    sunya: [],
    aakasmik: [],
    bishesh: []
};
let interruptions = [];
let activeSpeaker = null;
let floorTimer = { duration: 0, endsAt: null, remainingSeconds: 0, isPaused: false };
let autoAdvanceTimeout = null;
let savedFloorSpeaker = null;
let activeInterruption = null;

let spokenMembers = {
    sunya: [],
    aakasmik: [],
    bishesh: []
};

const logSpeakingTime = (speaker, durationSeconds, sessionCategory = 'general') => {
    if (!speaker || !speaker.name) return;
    const finalSeconds = Math.max(1, Math.round(durationSeconds));
    db.query(
        'INSERT INTO speaker_logs (name, position, duration_seconds, created_at) VALUES (?, ?, ?, NOW())',
        [speaker.name, speaker.position || 'Member of Parliament', finalSeconds],
        (err) => {
            if (err) {
                console.error('Error recording speaker log:', err);
            } else {
                io.emit('speakerStatsUpdated');
            }
        }
    );
};

const matchesSpeaker = (spk1, spk2) => {
    if (!spk1 || !spk2) return false;
    const id1 = String(spk1.uniqueId || spk1.unique_id || '').trim().toLowerCase();
    const id2 = String(spk2.uniqueId || spk2.unique_id || '').trim().toLowerCase();
    if (id1 && id2 && id1 === id2) return true;

    const name1 = String(spk1.name || '').trim().toLowerCase();
    const name2 = String(spk2.name || '').trim().toLowerCase();
    return Boolean(name1 && name2 && name1 === name2);
};

const recordSpokenMember = (speaker, section) => {
    if (!speaker || !section) return;
    const cat = ['sunya', 'aakasmik', 'bishesh'].includes(section) ? section : activeSection;
    const keyById = speaker.uniqueId || speaker.unique_id;
    const keyByName = speaker.name ? speaker.name.toLowerCase().trim() : null;

    if (keyById) {
        const idLower = String(keyById).toLowerCase().trim();
        if (!spokenMembers[cat].includes(idLower)) spokenMembers[cat].push(idLower);
    }
    if (keyByName && !spokenMembers[cat].includes(keyByName)) {
        spokenMembers[cat].push(keyByName);
    }

    queues[cat] = queues[cat].filter(s => !matchesSpeaker(s, speaker));
    if (cat === 'aakasmik') {
        interruptions = interruptions.filter(s => !matchesSpeaker(s, speaker));
    }
};

const isMemberLockedOut = (speaker, section) => {
    if (!speaker || !spokenMembers[section]) return false;
    const keyById = String(speaker.uniqueId || speaker.unique_id || '').toLowerCase().trim();
    const keyByName = String(speaker.name || '').toLowerCase().trim();
    return (Boolean(keyById) && spokenMembers[section].includes(keyById)) || (Boolean(keyByName) && spokenMembers[section].includes(keyByName));
};

const clearAutoAdvance = () => {
    if (autoAdvanceTimeout) {
        clearTimeout(autoAdvanceTimeout);
        autoAdvanceTimeout = null;
    }
};

const broadcastState = () => {
    ['sunya', 'aakasmik', 'bishesh'].forEach(sec => {
        queues[sec] = queues[sec].filter(s => !isMemberLockedOut(s, sec));
    });
    interruptions = interruptions.filter(s => !isMemberLockedOut(s, 'aakasmik'));

    io.emit('queueUpdated', {
        activeSection,
        queues,
        queue: queues[activeSection] || [],
        interruptions,
        activeSpeaker,
        floorTimer,
        savedFloorSpeaker,
        activeInterruption,
        spokenMembers
    });
};

io.on('connection', (socket) => {
    socket.emit('queueUpdated', {
        activeSection,
        queues,
        queue: queues[activeSection] || [],
        interruptions,
        activeSpeaker,
        floorTimer,
        savedFloorSpeaker,
        activeInterruption,
        spokenMembers
    });

    const setTimerFromSeconds = (totalSeconds) => {
        clearAutoAdvance();
        const endsAt = Date.now() + totalSeconds * 1000;
        floorTimer = {
            duration: totalSeconds,
            endsAt,
            remainingSeconds: totalSeconds,
            isPaused: false
        };

        autoAdvanceTimeout = setTimeout(() => {
            if (activeInterruption) {
                endCurrentInterruption();
            } else {
                if (activeSpeaker) {
                    const sessionCat = activeSpeaker.sessionCategory || activeSection;
                    logSpeakingTime(activeSpeaker, floorTimer.duration, sessionCat);
                    recordSpokenMember(activeSpeaker, sessionCat);
                }
                activeSpeaker = null;
                floorTimer = { duration: 0, endsAt: null, remainingSeconds: 0, isPaused: false };
                broadcastState();
            }
        }, totalSeconds * 1000);
    };

    const endCurrentInterruption = () => {
        clearAutoAdvance();
        if (activeInterruption) {
            const remaining = floorTimer.endsAt ? Math.max(0, Math.ceil((floorTimer.endsAt - Date.now()) / 1000)) : floorTimer.remainingSeconds;
            const spoken = Math.max(1, floorTimer.duration - remaining);
            const interrupter = activeInterruption.speaker;
            
            logSpeakingTime(interrupter, spoken, 'aakasmik');
            recordSpokenMember(interrupter, 'aakasmik');
            activeInterruption = null;
        }

        if (savedFloorSpeaker && savedFloorSpeaker.speaker) {
            activeSpeaker = savedFloorSpeaker.speaker;
            const resumeSeconds = savedFloorSpeaker.remainingSeconds;
            savedFloorSpeaker = null;

            if (resumeSeconds > 0) {
                setTimerFromSeconds(resumeSeconds);
            } else {
                floorTimer = { duration: 0, endsAt: null, remainingSeconds: 0, isPaused: false };
            }
        } else {
            activeSpeaker = null;
            floorTimer = { duration: 0, endsAt: null, remainingSeconds: 0, isPaused: false };
        }

        broadcastState();
    };

    socket.on('requestStateSync', () => {
        socket.emit('queueUpdated', {
            activeSection,
            queues,
            queue: queues[activeSection] || [],
            interruptions,
            activeSpeaker,
            floorTimer,
            savedFloorSpeaker,
            activeInterruption,
            spokenMembers
        });
    });

    socket.on('switchSection', (sectionName) => {
        if (['sunya', 'aakasmik', 'bishesh'].includes(sectionName)) {
            activeSection = sectionName;
            broadcastState();
        }
    });

    socket.on('requestFloor', async (payload) => {
        if (!payload) return;

        const rawSpeaker = payload.speaker || payload;
        const section = payload.sectionCategory || payload.section || 'sunya';
        const validSection = ['sunya', 'aakasmik', 'bishesh'].includes(section) ? section : 'sunya';

        const rawUniqueId = rawSpeaker.uniqueId || rawSpeaker.unique_id || payload.uniqueId || payload.unique_id || null;
        const rawName = (rawSpeaker.name || payload.name || '').trim();
        const rawPos = rawSpeaker.position || payload.position || 'Member of Parliament';

        if (!rawName) return;

        const spkCheckObj = { uniqueId: rawUniqueId, name: rawName };
        if (isMemberLockedOut(spkCheckObj, validSection)) {
            const sectionNames = { sunya: 'सुन्ने समय', aakasmik: 'आकस्मिक समय', bishesh: 'विशेष समय' };
            socket.emit('requestRejected', {
                reason: `तपाईंले यस ${sectionNames[validSection] || validSection} मा पहिले नै बोलिसक्नु भएको छ।`
            });
            return;
        }

        const requestedMinutes = parseInt(payload.requestedMinutes !== undefined ? payload.requestedMinutes : 3, 10);
        const requestedSeconds = parseInt(payload.requestedSeconds !== undefined ? payload.requestedSeconds : 0, 10);
        const topic = (payload.topic || rawSpeaker.topic || 'General Debate').trim();

        const topic_ne = (payload.topic_ne || rawSpeaker.topic_ne || await translateToNepali(topic)).trim();
        const name_ne = (rawSpeaker.name_ne || await translateToNepali(rawName)).trim();
        const position_ne = (rawSpeaker.position_ne || positionMap[rawPos.toLowerCase()] || await translateToNepali(rawPos)).trim();

        const targetQueue = queues[validSection];
        const isQueued = targetQueue.some(s => matchesSpeaker(s, spkCheckObj));
        const isActive = activeSpeaker && matchesSpeaker(activeSpeaker, spkCheckObj);

        if (!isQueued && !isActive) {
            targetQueue.push({
                uniqueId: rawUniqueId,
                unique_id: rawUniqueId,
                socketId: socket.id,
                name: rawName,
                name_ne: name_ne,
                position: rawPos,
                position_ne: position_ne,
                topic: topic,
                topic_ne: topic_ne,
                sessionCategory: validSection,
                requestedMinutes,
                requestedSeconds,
                timestamp: new Date().toLocaleTimeString()
            });

            broadcastState();
        }
    });

    socket.on('raiseInterruption', async (data) => {
        if (!data) return;
        const spk = data.speaker || data;
        const rawName = (spk.name || '').trim();
        const rawUniqueId = spk.uniqueId || spk.unique_id || null;

        if (!rawName) return;

        const checkObj = { uniqueId: rawUniqueId, name: rawName };
        if (isMemberLockedOut(checkObj, 'aakasmik')) {
            socket.emit('requestRejected', {
                reason: 'तपाईंले आकस्मिक समयमा भाग लिइसक्नु भएको छ, अब थप हस्तक्षेप गर्न मिल्दैन।'
            });
            return;
        }

        const isInterrupted = interruptions.some(s => matchesSpeaker(s, checkObj));

        if (!isInterrupted) {
            const rawPos = spk.position || 'Member of Parliament';
            const interrupterObj = {
                socketId: socket.id,
                uniqueId: rawUniqueId,
                unique_id: rawUniqueId,
                name: rawName,
                name_ne: spk.name_ne || await translateToNepali(rawName),
                position: rawPos,
                position_ne: position_ne || positionMap[rawPos.toLowerCase()] || await translateToNepali(rawPos),
                reason: data.reason || 'Point of Order',
                sessionCategory: 'aakasmik',
                timestamp: new Date().toLocaleTimeString()
            };

            interruptions.push(interrupterObj);
            broadcastState();
        }
    });

    socket.on('allowQueuedSpeaker', ({ section, index }) => {
        const targetQueue = queues[section];
        if (targetQueue && targetQueue[index]) {
            const chosen = targetQueue.splice(index, 1)[0];

            if (isMemberLockedOut(chosen, section)) {
                broadcastState();
                return;
            }

            if (activeSpeaker) {
                const remaining = floorTimer.endsAt ? Math.max(0, Math.ceil((floorTimer.endsAt - Date.now()) / 1000)) : floorTimer.remainingSeconds;
                const spoken = floorTimer.duration > 0 ? (floorTimer.duration - remaining) : 1;
                const prevCat = activeSpeaker.sessionCategory || activeSection;
                logSpeakingTime(activeSpeaker, spoken, prevCat);
                recordSpokenMember(activeSpeaker, prevCat);
            }

            clearAutoAdvance();
            savedFloorSpeaker = null;
            activeInterruption = null;
            activeSpeaker = chosen;

            recordSpokenMember(chosen, section);

            const durationSecs = (chosen.requestedMinutes || 3) * 60 + (chosen.requestedSeconds || 0);
            setTimerFromSeconds(durationSecs > 0 ? durationSecs : 180);
            broadcastState();
        }
    });

    socket.on('denyQueuedSpeaker', ({ section, index }) => {
        const targetQueue = queues[section];
        if (targetQueue && targetQueue[index]) {
            targetQueue.splice(index, 1);
            broadcastState();
        }
    });

    socket.on('nextSpeaker', (forcedSection = null) => {
        const currentTargetSection = forcedSection || activeSection;
        const targetQueue = queues[currentTargetSection] || queues.sunya;

        if (activeSpeaker) {
            const remaining = floorTimer.endsAt ? Math.max(0, Math.ceil((floorTimer.endsAt - Date.now()) / 1000)) : floorTimer.remainingSeconds;
            const spoken = floorTimer.duration > 0 ? (floorTimer.duration - remaining) : 1;
            const prevCat = activeSpeaker.sessionCategory || currentTargetSection;
            logSpeakingTime(activeSpeaker, spoken, prevCat);
            recordSpokenMember(activeSpeaker, prevCat);
        }

        clearAutoAdvance();
        savedFloorSpeaker = null;
        activeInterruption = null;
        
        let candidate = null;
        while (targetQueue.length > 0) {
            const nextCandidate = targetQueue.shift();
            if (!isMemberLockedOut(nextCandidate, currentTargetSection)) {
                candidate = nextCandidate;
                break;
            }
        }

        activeSpeaker = candidate;
        
        if (activeSpeaker) {
            recordSpokenMember(activeSpeaker, currentTargetSection);
            const durationSecs = (activeSpeaker.requestedMinutes || 3) * 60 + (activeSpeaker.requestedSeconds || 0);
            setTimerFromSeconds(durationSecs > 0 ? durationSecs : 180);
        } else {
            floorTimer = { duration: 0, endsAt: null, remainingSeconds: 0, isPaused: false };
        }
        
        broadcastState();
    });

    socket.on('allowInterruption', (index) => {
        if (interruptions[index]) {
            const interrupter = interruptions.splice(index, 1)[0];
            recordSpokenMember(interrupter, 'aakasmik');

            let remainingTimeForActive = 0;
            if (activeSpeaker) {
                if (floorTimer.endsAt) {
                    remainingTimeForActive = Math.max(0, Math.ceil((floorTimer.endsAt - Date.now()) / 1000));
                } else {
                    remainingTimeForActive = floorTimer.remainingSeconds || 0;
                }

                const spoken = floorTimer.duration > 0 ? Math.max(1, floorTimer.duration - remainingTimeForActive) : 1;
                const prevCat = activeSpeaker.sessionCategory || activeSection;
                logSpeakingTime(activeSpeaker, spoken, prevCat);

                savedFloorSpeaker = {
                    speaker: { ...activeSpeaker },
                    remainingSeconds: remainingTimeForActive
                };
            }

            clearAutoAdvance();

            activeInterruption = {
                speaker: { 
                    uniqueId: interrupter.uniqueId || interrupter.unique_id || null,
                    name: interrupter.name, 
                    name_ne: interrupter.name_ne, 
                    position: interrupter.position, 
                    position_ne: interrupter.position_ne,
                    sessionCategory: 'aakasmik',
                    topic: `Point of Order: ${interrupter.reason}`,
                    topic_ne: `नियमापत्ति: ${interrupter.reason}`
                },
                reason: interrupter.reason
            };

            activeSpeaker = activeInterruption.speaker;
            setTimerFromSeconds(60);
            broadcastState();
        }
    });

    socket.on('finishInterruption', () => {
        endCurrentInterruption();
    });

    socket.on('setSpeakingTime', (payload) => {
        if (!activeSpeaker) return;

        let totalSeconds = 0;
        if (typeof payload === 'number') {
            totalSeconds = payload * 60;
        } else if (typeof payload === 'object' && payload !== null) {
            const mins = parseInt(payload.minutes || 0, 10);
            const secs = parseInt(payload.seconds || 0, 10);
            totalSeconds = (mins * 60) + secs;
        }

        if (totalSeconds > 0) {
            setTimerFromSeconds(totalSeconds);
            broadcastState();
        }
    });

    socket.on('pauseTimer', () => {
        if (activeSpeaker && floorTimer.endsAt && !floorTimer.isPaused) {
            clearAutoAdvance();
            const remaining = Math.max(0, Math.ceil((floorTimer.endsAt - Date.now()) / 1000));
            floorTimer.remainingSeconds = remaining;
            floorTimer.isPaused = true;
            floorTimer.endsAt = null;
            broadcastState();
        }
    });

    socket.on('resumeTimer', () => {
        if (activeSpeaker && floorTimer.isPaused && floorTimer.remainingSeconds > 0) {
            setTimerFromSeconds(floorTimer.remainingSeconds);
            broadcastState();
        }
    });

    socket.on('resetTimer', () => {
        if (activeSpeaker) {
            const remaining = floorTimer.endsAt ? Math.max(0, Math.ceil((floorTimer.endsAt - Date.now()) / 1000)) : floorTimer.remainingSeconds;
            const spoken = floorTimer.duration > 0 ? (floorTimer.duration - remaining) : 1;
            const prevCat = activeSpeaker.sessionCategory || activeSection;
            logSpeakingTime(activeSpeaker, spoken, prevCat);
            recordSpokenMember(activeSpeaker, prevCat);
            
            clearAutoAdvance();
            floorTimer = { duration: 0, endsAt: null, remainingSeconds: 0, isPaused: false };
            broadcastState();
        }
    });

    socket.on('dismissInterruption', (index) => {
        if (interruptions[index]) {
            interruptions.splice(index, 1);
            broadcastState();
        }
    });

    socket.on('clearActive', () => {
        if (activeSpeaker) {
            const remaining = floorTimer.endsAt ? Math.max(0, Math.ceil((floorTimer.endsAt - Date.now()) / 1000)) : floorTimer.remainingSeconds;
            const spoken = floorTimer.duration > 0 ? (floorTimer.duration - remaining) : 1;
            const prevCat = activeSpeaker.sessionCategory || activeSection;
            logSpeakingTime(activeSpeaker, spoken, prevCat);
            recordSpokenMember(activeSpeaker, prevCat);
        }
        clearAutoAdvance();
        savedFloorSpeaker = null;
        activeInterruption = null;
        activeSpeaker = null;
        floorTimer = { duration: 0, endsAt: null, remainingSeconds: 0, isPaused: false };
        broadcastState();
    });

    socket.on('clearSectionQueue', (section) => {
        if (queues[section]) {
            queues[section] = [];
            broadcastState();
        }
    });

    socket.on('resetSectionLockout', (section) => {
        if (spokenMembers[section]) {
            spokenMembers[section] = [];
            broadcastState();
        }
    });

    socket.on('resetAllLockouts', () => {
        spokenMembers = { sunya: [], aakasmik: [], bishesh: [] };
        broadcastState();
    });

    socket.on('workerUpdateSpeaker', async ({ uniqueId, name, topic, topic_ne, minutes, seconds }) => {
        const cleanTopic = (topic || '').trim();
        let resolvedTopicNe = (topic_ne || '').trim();
        if (!resolvedTopicNe || resolvedTopicNe === 'सदन वक्तव्य' || resolvedTopicNe === 'सदनको वक्तव्य') {
            resolvedTopicNe = await translateToNepali(cleanTopic);
        }

        const reqMins = parseInt(minutes || 3, 10);
        const reqSecs = parseInt(seconds || 0, 10);

        const targetMatcher = (spk) => {
            if (!spk) return false;
            const id1 = String(spk.uniqueId || spk.unique_id || '').trim().toLowerCase();
            const id2 = String(uniqueId || '').trim().toLowerCase();
            if (id1 && id2 && id1 === id2) return true;
            
            const n1 = String(spk.name || '').trim().toLowerCase();
            const n2 = String(name || '').trim().toLowerCase();
            return Boolean(n1 && n2 && n1 === n2);
        };

        ['sunya', 'aakasmik', 'bishesh'].forEach(sec => {
            queues[sec].forEach(spk => {
                if (targetMatcher(spk)) {
                    spk.topic = cleanTopic;
                    spk.topic_ne = resolvedTopicNe;
                    spk.requestedMinutes = reqMins;
                    spk.requestedSeconds = reqSecs;
                }
            });
        });

        if (activeSpeaker && targetMatcher(activeSpeaker)) {
            activeSpeaker.topic = cleanTopic;
            activeSpeaker.topic_ne = resolvedTopicNe;
            activeSpeaker.requestedMinutes = reqMins;
            activeSpeaker.requestedSeconds = reqSecs;
        }

        if (savedFloorSpeaker && targetMatcher(savedFloorSpeaker.speaker)) {
            savedFloorSpeaker.speaker.topic = cleanTopic;
            savedFloorSpeaker.speaker.topic_ne = resolvedTopicNe;
            savedFloorSpeaker.speaker.requestedMinutes = reqMins;
            savedFloorSpeaker.speaker.requestedSeconds = reqSecs;
        }

        if (uniqueId) {
            db.query('UPDATE imported_speakers SET topic = ?, topic_ne = ?, requested_minutes = ? WHERE unique_id = ?', [cleanTopic, resolvedTopicNe, reqMins, uniqueId]);
            db.query('UPDATE permanent_members SET topic = ?, topic_ne = ? WHERE unique_id = ?', [cleanTopic, resolvedTopicNe, uniqueId]);
        }
        if (name) {
            db.query('UPDATE imported_speakers SET topic = ?, topic_ne = ?, requested_minutes = ? WHERE name = ?', [cleanTopic, resolvedTopicNe, reqMins, name]);
            db.query('UPDATE permanent_members SET topic = ?, topic_ne = ? WHERE name = ?', [cleanTopic, resolvedTopicNe, name]);
        }

        io.emit('speakerTopicUpdated', {
            uniqueId,
            name,
            topic: cleanTopic,
            topic_ne: resolvedTopicNe
        });

        io.emit('directoryUpdated');
        broadcastState();
    });
});

app.post('/api/translate', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.json({ translated: '' });
        const translated = await translateToNepali(text);
        res.json({ translated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/import-roster', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No Excel file provided.' });

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(sheet);

        if (!rawData || rawData.length === 0) {
            return res.status(400).json({ error: 'Excel sheet is empty.' });
        }

        const newImported = [];

        for (const row of rawData) {
            const uniqueId = String(row['Unique ID'] || row['ID'] || row['unique_id'] || `MP-${Date.now()}-${Math.floor(Math.random()*1000)}`).trim();
            const name = String(row['Name'] || row['Full Name'] || row['Speaker Name'] || '').trim();
            const position = String(row['Position'] || row['Designation'] || 'Member of Parliament').trim();
            const topic = String(row['Topic'] || row['Topic for Speaking'] || 'Assembly Floor Session').trim();
            const requestedMinutes = parseInt(row['Requested Time (mins)'] || row['Requested Time'] || row['Time'] || 3, 10);
            const sessionCategory = String(row['Session Type'] || row['Time Category'] || 'sunya').toLowerCase().trim();
            const validCategory = ['sunya', 'aakasmik', 'bishesh'].includes(sessionCategory) ? sessionCategory : 'sunya';

            if (name) {
                const explicitNameNe = String(row['Name (Nepali)'] || row['Nepali Name'] || row['नाम'] || '').trim();
                const name_ne = explicitNameNe || (await translateToNepali(name)) || null;

                const explicitPosNe = String(row['Position (Nepali)'] || row['पद'] || '').trim();
                const position_ne = explicitPosNe || positionMap[position.toLowerCase()] || (await translateToNepali(position)) || null;

                const explicitTopicNe = String(row['Topic (Nepali)'] || row['विषय'] || '').trim();
                const topic_ne = explicitTopicNe || (await translateToNepali(topic)) || null;

                newImported.push({ uniqueId, name, name_ne, position, position_ne, topic, topic_ne, requestedMinutes, sessionCategory: validCategory });

                db.query(`
                    INSERT INTO imported_speakers (unique_id, name, name_ne, position, position_ne, topic, topic_ne, requested_minutes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                        name = VALUES(name), 
                        name_ne = VALUES(name_ne),
                        position = VALUES(position), 
                        position_ne = VALUES(position_ne),
                        topic = VALUES(topic), 
                        topic_ne = VALUES(topic_ne),
                        requested_minutes = VALUES(requested_minutes)
                `, [uniqueId, name, name_ne, position, position_ne, topic, topic_ne, requestedMinutes]);

                db.query(`
                    INSERT INTO permanent_members (unique_id, name, name_ne, position, position_ne, topic, topic_ne)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                        name = VALUES(name),
                        name_ne = VALUES(name_ne),
                        position = VALUES(position),
                        position_ne = VALUES(position_ne),
                        topic = VALUES(topic),
                        topic_ne = VALUES(topic_ne)
                `, [uniqueId, name, name_ne, position, position_ne, topic, topic_ne]);

                const targetQueue = queues[validCategory];
                const isQueued = targetQueue.some(s => matchesSpeaker(s, { uniqueId, name }));
                if (!isQueued) {
                    targetQueue.push({
                        uniqueId,
                        socketId: null,
                        name,
                        name_ne,
                        position,
                        position_ne,
                        topic,
                        topic_ne,
                        sessionCategory: validCategory,
                        requestedMinutes,
                        requestedSeconds: 0,
                        timestamp: new Date().toLocaleTimeString()
                    });
                }
            }
        }

        broadcastState();
        return res.json({ success: true, count: newImported.length, records: newImported });
    } catch (err) {
        console.error('Import Error:', err);
        return res.status(500).json({ error: 'Failed to process Excel file.' });
    }
});

app.post('/api/import-permanent-members', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No Excel file provided.' });

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(sheet);

        if (!rawData || rawData.length === 0) {
            return res.status(400).json({ error: 'Uploaded Excel sheet is empty.' });
        }

        let insertedCount = 0;

        for (const row of rawData) {
            const uniqueId = String(row['Unique ID'] || row['ID'] || row['unique_id'] || `MP-${Date.now()}-${Math.floor(Math.random()*1000)}`).trim();
            const name = String(row['Name'] || row['Full Name'] || row['Speaker Name'] || '').trim();
            const position = String(row['Position'] || row['Designation'] || 'Member of Parliament').trim();
            const topic = String(row['Topic'] || row['Topic for Speaking'] || '').trim();

            if (uniqueId && name) {
                const explicitNameNe = String(row['Name (Nepali)'] || row['Nepali Name'] || row['नाम'] || '').trim();
                const name_ne = explicitNameNe || (await translateToNepali(name)) || null;

                const explicitPosNe = String(row['Position (Nepali)'] || row['पद'] || '').trim();
                const position_ne = explicitPosNe || positionMap[position.toLowerCase()] || (await translateToNepali(position)) || null;

                const explicitTopicNe = String(row['Topic (Nepali)'] || row['विषय'] || '').trim();
                const topic_ne = explicitTopicNe || (topic ? await translateToNepali(topic) : null);

                db.query(`
                    INSERT INTO permanent_members (unique_id, name, name_ne, position, position_ne, topic, topic_ne)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                        name = VALUES(name),
                        name_ne = VALUES(name_ne),
                        position = VALUES(position),
                        position_ne = VALUES(position_ne),
                        topic = VALUES(topic),
                        topic_ne = VALUES(topic_ne)
                `, [uniqueId, name, name_ne, position, position_ne, topic || null, topic_ne || null]);

                if (activeSpeaker && matchesSpeaker(activeSpeaker, { uniqueId, name })) {
                    activeSpeaker.name = name;
                    if (name_ne) activeSpeaker.name_ne = name_ne;
                    activeSpeaker.position = position;
                    if (position_ne) activeSpeaker.position_ne = position_ne;
                    if (topic) activeSpeaker.topic = topic;
                    if (topic_ne) activeSpeaker.topic_ne = topic_ne;
                }

                ['sunya', 'aakasmik', 'bishesh'].forEach(sec => {
                    queues[sec].forEach(spk => {
                        if (matchesSpeaker(spk, { uniqueId, name })) {
                            spk.name = name;
                            if (name_ne) spk.name_ne = name_ne;
                            spk.position = position;
                            if (position_ne) spk.position_ne = position_ne;
                            if (topic) spk.topic = topic;
                            if (topic_ne) spk.topic_ne = topic_ne;
                        }
                    });
                });

                insertedCount++;
            }
        }

        io.emit('directoryUpdated');
        broadcastState();

        return res.json({ success: true, count: insertedCount });
    } catch (err) {
        console.error('Directory Import Error:', err);
        return res.status(500).json({ error: 'Failed to parse Excel file.' });
    }
});

app.post('/api/import-roster-json', async (req, res) => {
    try {
        const { records } = req.body;
        if (!records || !Array.isArray(records) || records.length === 0) {
            return res.status(400).json({ error: 'No records provided.' });
        }

        for (const row of records) {
            const uniqueId = String(row.uniqueId || `MP-${Date.now()}`).trim();
            const name = String(row.name || '').trim();
            
            let name_ne = String(row.name_ne || '').trim();
            if (!name_ne && name) {
                name_ne = await translateToNepali(name);
            }

            const position = String(row.position || 'Member of Parliament').trim();
            let position_ne = String(row.position_ne || '').trim();
            if (!position_ne && position) {
                position_ne = positionMap[position.toLowerCase()] || await translateToNepali(position);
            }

            const topic = String(row.topic || 'General Session').trim();
            let topic_ne = String(row.topic_ne || '').trim();
            if (!topic_ne && topic) {
                topic_ne = await translateToNepali(topic);
            }

            const requestedMinutes = parseInt(row.requestedMinutes || 3, 10);
            const sessionCategory = String(row.sessionCategory || activeSection || 'sunya').toLowerCase();
            const validCategory = ['sunya', 'aakasmik', 'bishesh'].includes(sessionCategory) ? sessionCategory : 'sunya';

            if (name) {
                db.query(`
                    INSERT INTO imported_speakers (unique_id, name, name_ne, position, position_ne, topic, topic_ne, requested_minutes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                        name = VALUES(name), 
                        name_ne = VALUES(name_ne),
                        position = VALUES(position), 
                        position_ne = VALUES(position_ne),
                        topic = VALUES(topic), 
                        topic_ne = VALUES(topic_ne),
                        requested_minutes = VALUES(requested_minutes)
                `, [uniqueId, name, name_ne || null, position, position_ne || null, topic, topic_ne || null, requestedMinutes]);

                db.query(`
                    INSERT INTO permanent_members (unique_id, name, name_ne, position, position_ne, topic, topic_ne)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                        name = VALUES(name),
                        name_ne = VALUES(name_ne),
                        position = VALUES(position),
                        position_ne = VALUES(position_ne),
                        topic = VALUES(topic),
                        topic_ne = VALUES(topic_ne)
                `, [uniqueId, name, name_ne || null, position, position_ne || null, topic, topic_ne || null]);

                const targetQueue = queues[validCategory];
                const isQueued = targetQueue.some(s => matchesSpeaker(s, { uniqueId, name }));
                if (!isQueued) {
                    targetQueue.push({
                        uniqueId,
                        socketId: null,
                        name,
                        name_ne: name_ne || null,
                        position,
                        position_ne: position_ne || null,
                        topic,
                        topic_ne: topic_ne || null,
                        sessionCategory: validCategory,
                        requestedMinutes,
                        requestedSeconds: 0,
                        timestamp: new Date().toLocaleTimeString()
                    });
                }
            }
        }

        broadcastState();
        return res.json({ success: true, count: records.length });
    } catch (err) {
        console.error('Error importing JSON roster:', err);
        return res.status(500).json({ error: 'Server database error during import.' });
    }
});

app.post('/api/logout-clear-session', (req, res) => {
    db.query('TRUNCATE TABLE imported_speakers', (err) => {
        if (err) console.error('Error truncating imported_speakers on logout:', err);
    });

    queues = { sunya: [], aakasmik: [], bishesh: [] };
    interruptions = [];
    activeSpeaker = null;
    floorTimer = { duration: 0, endsAt: null, remainingSeconds: 0, isPaused: false };
    savedFloorSpeaker = null;
    activeInterruption = null;
    spokenMembers = { sunya: [], aakasmik: [], bishesh: [] };
    clearAutoAdvance();

    broadcastState();
    res.json({ success: true, message: 'Session and imported roster cleared on logout.' });
});

app.get('/api/imported-speakers', (req, res) => {
    db.query('SELECT * FROM imported_speakers ORDER BY id ASC', (err, results) => {
        if (err) {
            console.error('Error fetching imported speakers:', err);
            return res.status(500).json({ error: 'Database query failed.' });
        }
        res.json(results || []);
    });
});

app.delete('/api/imported-speakers', (req, res) => {
    db.query('TRUNCATE TABLE imported_speakers', (err) => {
        if (err) {
            console.error('Error clearing imported speakers:', err);
            return res.status(500).json({ error: 'Failed to clear database table.' });
        }
        res.json({ success: true, message: 'All imported records cleared.' });
    });
});

app.get('/api/permanent-members', (req, res) => {
    const { query } = req.query;
    let sql = 'SELECT * FROM permanent_members ORDER BY id ASC';
    let params = [];

    if (query) {
        sql = 'SELECT * FROM permanent_members WHERE unique_id LIKE ? OR name LIKE ? OR name_ne LIKE ? ORDER BY id ASC';
        params = [`%${query}%`, `%${query}%`, `%${query}%`];
    }

    db.query(sql, params, (err, results) => {
        if (err) {
            console.error('Error fetching directory:', err);
            return res.status(500).json({ error: 'Database error fetching directory.' });
        }
        res.json(results || []);
    });
});

app.post('/api/permanent-members', async (req, res) => {
    try {
        const { uniqueId, name, position, topic } = req.body;
        if (!uniqueId || !name) {
            return res.status(400).json({ error: 'Unique ID and Full Name are required.' });
        }

        const name_ne = req.body.name_ne || await translateToNepali(name);
        const position_ne = req.body.position_ne || positionMap[position?.toLowerCase()] || await translateToNepali(position);
        const topic_ne = req.body.topic_ne || (topic ? await translateToNepali(topic) : null);

        const sqlWithTopic = `
            INSERT INTO permanent_members (unique_id, name, name_ne, position, position_ne, topic, topic_ne)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                name = VALUES(name),
                name_ne = VALUES(name_ne),
                position = VALUES(position),
                position_ne = VALUES(position_ne),
                topic = VALUES(topic),
                topic_ne = VALUES(topic_ne)
        `;

        db.query(sqlWithTopic, [uniqueId.trim(), name.trim(), name_ne || null, position?.trim() || 'Member of Parliament', position_ne || null, topic?.trim() || null, topic_ne || null], (err) => {
            if (err) {
                db.query(`
                    INSERT INTO permanent_members (unique_id, name, name_ne, position, position_ne)
                    VALUES (?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                        name = VALUES(name),
                        name_ne = VALUES(name_ne),
                        position = VALUES(position),
                        position_ne = VALUES(position_ne)
                `, [uniqueId.trim(), name.trim(), name_ne || null, position?.trim() || 'Member of Parliament', position_ne || null], (fallbackErr) => {
                    if (fallbackErr) {
                        console.error('Error adding member:', fallbackErr);
                        return res.status(500).json({ error: fallbackErr.message });
                    }
                    io.emit('directoryUpdated');
                    return res.json({ success: true, message: 'Member added successfully.' });
                });
            } else {
                io.emit('directoryUpdated');
                return res.json({ success: true, message: 'Member added successfully.' });
            }
        });
    } catch (err) {
        console.error('Error in POST /api/permanent-members:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/permanent-members/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { uniqueId, name, position, topic } = req.body;

        if (!name || !uniqueId) {
            return res.status(400).json({ error: 'Name and Unique ID are required.' });
        }

        const name_ne = req.body.name_ne || await translateToNepali(name);
        const position_ne = req.body.position_ne || positionMap[position?.toLowerCase()] || await translateToNepali(position);
        const topic_ne = req.body.topic_ne || (topic ? await translateToNepali(topic) : null);

        const sqlWithTopic = `
            UPDATE permanent_members 
            SET unique_id = ?, name = ?, name_ne = ?, position = ?, position_ne = ?, topic = ?, topic_ne = ?
            WHERE id = ? OR unique_id = ?
        `;

        db.query(sqlWithTopic, [
            uniqueId.trim(), 
            name.trim(), 
            name_ne || null, 
            position ? position.trim() : 'Member of Parliament', 
            position_ne || null, 
            topic ? topic.trim() : null, 
            topic_ne || null, 
            id, 
            uniqueId.trim()
        ], (err) => {
            if (err) {
                db.query(`
                    UPDATE permanent_members 
                    SET unique_id = ?, name = ?, name_ne = ?, position = ?, position_ne = ?
                    WHERE id = ? OR unique_id = ?
                `, [uniqueId.trim(), name.trim(), name_ne || null, position ? position.trim() : 'Member of Parliament', position_ne || null, id, uniqueId.trim()], (fallbackErr) => {
                    if (fallbackErr) {
                        console.error('Error updating member:', fallbackErr);
                        return res.status(500).json({ error: fallbackErr.message });
                    }
                    io.emit('directoryUpdated');
                    return res.json({ success: true, message: 'Member updated successfully.' });
                });
            } else {
                io.emit('directoryUpdated');
                return res.json({ success: true, message: 'Member updated successfully.' });
            }
        });
    } catch (err) {
        console.error('Error in PUT /api/permanent-members:', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/permanent-members/:id', (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM permanent_members WHERE id = ? OR unique_id = ?', [id, id], (err) => {
        if (err) {
            console.error('Error deleting member:', err);
            return res.status(500).json({ error: 'Failed to delete record.' });
        }
        io.emit('directoryUpdated');
        res.json({ success: true });
    });
});

app.post('/api/speaker-id-login', (req, res) => {
    const { uniqueId } = req.body;
    if (!uniqueId) return res.status(400).json({ error: 'Unique ID is required.' });

    db.query('SELECT * FROM imported_speakers WHERE unique_id = ?', [uniqueId.trim()], (err, results) => {
        if (!err && results.length > 0) {
            const spk = results[0];
            return res.json({
                success: true,
                speaker: {
                    uniqueId: spk.unique_id,
                    name: spk.name,
                    name_ne: spk.name_ne,
                    position: spk.position,
                    position_ne: spk.position_ne,
                    topic: spk.topic,
                    topic_ne: spk.topic_ne,
                    requestedMinutes: spk.requested_minutes
                }
            });
        }

        db.query('SELECT * FROM permanent_members WHERE unique_id = ?', [uniqueId.trim()], (e, permResults) => {
            if (e || permResults.length === 0) {
                return res.status(404).json({ error: 'Unique ID not found in roster.' });
            }
            const perm = permResults[0];
            return res.json({
                success: true,
                speaker: {
                    uniqueId: perm.unique_id,
                    name: perm.name,
                    name_ne: perm.name_ne,
                    position: perm.position,
                    position_ne: perm.position_ne,
                    topic: perm.topic || 'Floor Debate',
                    topic_ne: perm.topic_ne || 'सदन छलफल',
                    requestedMinutes: 3
                }
            });
        });
    });
});

app.get('/api/speaker-stats', (req, res) => {
    const query = `
        SELECT 
            name, 
            position, 
            SUM(duration_seconds) as total_seconds, 
            COUNT(*) as session_count,
            DATE_FORMAT(MAX(created_at), '%Y-%m-%d %H:%i:%s') as last_spoken_at,
            DATE_FORMAT(MAX(created_at), '%Y-%m-%d') as session_date
        FROM speaker_logs 
        GROUP BY name, position, DATE_FORMAT(created_at, '%Y-%m-%d') 
        ORDER BY MAX(created_at) DESC
    `;
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching speaker stats:', err);
            return res.status(500).json({ error: 'Database error fetching stats.' });
        }
        res.json(results || []);
    });
});

app.post('/api/head-login', (req, res) => {
    const { username, password } = req.body;
    db.query('SELECT * FROM head_masters WHERE username = ? AND password_hash = ?', [username, password], (err, results) => {
        if (err || results.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }
        return res.json({ success: true, token: `HEAD-TOKEN-${Date.now()}` });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend live on http://localhost:${PORT}`);
});