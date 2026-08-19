import express from 'express';
import session from 'express-session';
import mysql from 'mysql2';
import http from 'http';
import { Server } from 'socket.io';
import multer from 'multer';
import * as XLSX from 'xlsx';
import {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const app = express();
const server = http.createServer(app);

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

// Google Input Tools Transliteration Engine
const transliterateWithGoogle = async (text) => {
    if (!text || typeof text !== 'string' || !text.trim()) return '';

    try {
        const url = `https://inputtools.google.com/request?text=${encodeURIComponent(text.trim())}&itc=ne-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8&app=demopage`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const data = await response.json();
        
        if (data && data[0] === 'SUCCESS' && data[1] && data[1].length > 0) {
            return data[1].map(item => (item[1] && item[1][0]) ? item[1][0] : item[0]).join(' ');
        }
    } catch (err) {
        console.error(`Google Transliteration failed for "${text}":`, err.message);
    }
    return '';
};

// Common Parliamentary Designations
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

// Real-Time Parliamentary State
let activeSection = 'sunya'; // 'sunya' | 'aakasmik' | 'bishesh'
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

const recordSpokenMember = (speaker, section) => {
    if (!speaker || !section) return;
    const cat = ['sunya', 'aakasmik', 'bishesh'].includes(section) ? section : activeSection;
    const identifier = (speaker.uniqueId || speaker.unique_id || speaker.name).toLowerCase().trim();
    if (!spokenMembers[cat].includes(identifier)) {
        spokenMembers[cat].push(identifier);
    }
};

const clearAutoAdvance = () => {
    if (autoAdvanceTimeout) {
        clearTimeout(autoAdvanceTimeout);
        autoAdvanceTimeout = null;
    }
};

const broadcastState = () => {
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
            const spoken = floorTimer.duration - remaining;
            logSpeakingTime(activeInterruption.speaker, spoken > 0 ? spoken : floorTimer.duration, 'aakasmik');
            recordSpokenMember(activeInterruption.speaker, 'aakasmik');
            activeInterruption = null;
        }

        if (savedFloorSpeaker) {
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

    socket.on('switchSection', (sectionName) => {
        if (['sunya', 'aakasmik', 'bishesh'].includes(sectionName)) {
            activeSection = sectionName;
            broadcastState();
        }
    });

    socket.on('requestFloor', async (payload) => {
        const speaker = payload.speaker || payload;
        const section = payload.sectionCategory || 'sunya';
        const requestedMinutes = parseInt(payload.requestedMinutes || 3, 10);
        const requestedSeconds = parseInt(payload.requestedSeconds || 0, 10);
        const topic = payload.topic || speaker.topic || 'General Debate';
        const topic_ne = payload.topic_ne || speaker.topic_ne || await transliterateWithGoogle(topic);
        const name_ne = speaker.name_ne || await transliterateWithGoogle(speaker.name);
        const position_ne = speaker.position_ne || positionMap[speaker.position?.toLowerCase()] || await transliterateWithGoogle(speaker.position);

        if (!speaker || !speaker.name) return;

        const speakerKey = (speaker.uniqueId || speaker.unique_id || speaker.name).toLowerCase().trim();

        if (spokenMembers[section] && spokenMembers[section].includes(speakerKey)) {
            const sectionNames = { sunya: 'शून्य समय', aakasmik: 'आकस्मिक समय', bishesh: 'विशेष समय' };
            socket.emit('requestRejected', {
                reason: `तपाईंले यस ${sectionNames[section] || section} मा पहिले नै बोलिसक्नु भएको छ।`
            });
            return;
        }

        const targetQueue = queues[section] || queues.sunya;
        const isQueued = targetQueue.some(s => (s.uniqueId && s.uniqueId === (speaker.uniqueId || speaker.unique_id)) || s.name.toLowerCase() === speaker.name.toLowerCase());
        const isActive = activeSpeaker && activeSpeaker.name.toLowerCase() === speaker.name.toLowerCase() && activeSpeaker.sessionCategory === section;

        if (!isQueued && !isActive) {
            targetQueue.push({
                uniqueId: speaker.uniqueId || speaker.unique_id || null,
                socketId: socket.id,
                name: speaker.name,
                name_ne: name_ne,
                position: speaker.position || 'Member',
                position_ne: position_ne,
                topic: topic,
                topic_ne: topic_ne,
                sessionCategory: section,
                requestedMinutes,
                requestedSeconds,
                timestamp: new Date().toLocaleTimeString()
            });
            broadcastState();
        }
    });

    socket.on('raiseInterruption', async (data) => {
        if (!data || !data.speaker || !data.speaker.name) return;

        const speakerKey = (data.speaker.uniqueId || data.speaker.unique_id || data.speaker.name).toLowerCase().trim();

        if (spokenMembers.aakasmik.includes(speakerKey)) {
            socket.emit('requestRejected', {
                reason: 'तपाईंले आकस्मिक समयमा भाग लिइसक्नु भएको छ, अब थप हस्तक्षेप गर्न मिल्दैन।'
            });
            return;
        }

        const isInterrupted = interruptions.some(s => s.name.toLowerCase() === data.speaker.name.toLowerCase());

        if (!isInterrupted) {
            const interrupterObj = {
                socketId: socket.id,
                uniqueId: data.speaker.uniqueId || data.speaker.unique_id || null,
                name: data.speaker.name,
                name_ne: data.speaker.name_ne || await transliterateWithGoogle(data.speaker.name),
                position: data.speaker.position || 'Member',
                position_ne: data.speaker.position_ne || positionMap[data.speaker.position?.toLowerCase()] || await transliterateWithGoogle(data.speaker.position),
                reason: data.reason || 'Point of Order',
                sessionCategory: 'aakasmik',
                timestamp: new Date().toLocaleTimeString()
            };

            interruptions.push(interrupterObj);

            const isAlreadyInAakasmik = queues.aakasmik.some(s => s.name.toLowerCase() === data.speaker.name.toLowerCase());
            if (!isAlreadyInAakasmik) {
                queues.aakasmik.push({
                    ...interrupterObj,
                    topic: `[हस्तक्षेप]: ${data.reason || 'Point of Order'}`,
                    topic_ne: `[हस्तक्षेप]: ${data.reason || 'Point of Order'}`,
                    requestedMinutes: 1,
                    requestedSeconds: 0
                });
            }

            broadcastState();
        }
    });

    // HEAD: Allow a specific queued speaker directly
    socket.on('allowQueuedSpeaker', ({ section, index }) => {
        const targetQueue = queues[section];
        if (targetQueue && targetQueue[index]) {
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
            const chosen = targetQueue.splice(index, 1)[0];
            activeSpeaker = chosen;

            const durationSecs = (chosen.requestedMinutes || 3) * 60 + (chosen.requestedSeconds || 0);
            setTimerFromSeconds(durationSecs > 0 ? durationSecs : 180);
            broadcastState();
        }
    });

    // HEAD: Deny/remove a specific queued speaker
    socket.on('denyQueuedSpeaker', ({ section, index }) => {
        const targetQueue = queues[section];
        if (targetQueue && targetQueue[index]) {
            targetQueue.splice(index, 1);
            broadcastState();
        }
    });

    // HEAD: Next speaker in current section
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
        activeSpeaker = targetQueue.shift() || null;
        
        if (activeSpeaker) {
            const durationSecs = (activeSpeaker.requestedMinutes || 3) * 60 + (activeSpeaker.requestedSeconds || 0);
            setTimerFromSeconds(durationSecs > 0 ? durationSecs : 180);
        } else {
            floorTimer = { duration: 0, endsAt: null, remainingSeconds: 0, isPaused: false };
        }
        
        broadcastState();
    });

    socket.on('allowInterruption', (index) => {
        if (interruptions[index]) {
            const interrupter = interruptions[index];
            interruptions.splice(index, 1);

            let remainingTimeForActive = 0;
            if (activeSpeaker) {
                const remaining = floorTimer.endsAt ? Math.max(0, Math.ceil((floorTimer.endsAt - Date.now()) / 1000)) : floorTimer.remainingSeconds;
                const spoken = floorTimer.duration > 0 ? (floorTimer.duration - remaining) : 1;
                const prevCat = activeSpeaker.sessionCategory || activeSection;
                logSpeakingTime(activeSpeaker, spoken, prevCat);
                recordSpokenMember(activeSpeaker, prevCat);
                remainingTimeForActive = remaining;
            }

            clearAutoAdvance();

            if (activeSpeaker) {
                savedFloorSpeaker = {
                    speaker: activeSpeaker,
                    remainingSeconds: remainingTimeForActive
                };
            }

            activeInterruption = {
                speaker: { 
                    uniqueId: interrupter.uniqueId,
                    name: interrupter.name, 
                    name_ne: interrupter.name_ne, 
                    position: interrupter.position, 
                    position_ne: interrupter.position_ne,
                    sessionCategory: 'aakasmik'
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

    // Reset lockouts per section or all sections
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

    // WORKER: Live Topic and Time Assignment
    socket.on('workerUpdateSpeaker', async ({ uniqueId, name, topic, topic_ne, minutes, seconds }) => {
        const neTopic = topic_ne || await transliterateWithGoogle(topic);
        const reqMins = parseInt(minutes || 3, 10);
        const reqSecs = parseInt(seconds || 0, 10);

        ['sunya', 'aakasmik', 'bishesh'].forEach(sec => {
            queues[sec].forEach(spk => {
                if ((uniqueId && spk.uniqueId === uniqueId) || (name && spk.name.toLowerCase() === name.toLowerCase())) {
                    spk.topic = topic;
                    spk.topic_ne = neTopic;
                    spk.requestedMinutes = reqMins;
                    spk.requestedSeconds = reqSecs;
                }
            });
        });

        if (activeSpeaker && ((uniqueId && activeSpeaker.uniqueId === uniqueId) || (name && activeSpeaker.name.toLowerCase() === name.toLowerCase()))) {
            activeSpeaker.topic = topic;
            activeSpeaker.topic_ne = neTopic;
            activeSpeaker.requestedMinutes = reqMins;
            activeSpeaker.requestedSeconds = reqSecs;
        }

        io.emit('speakerTopicUpdated', {
            uniqueId,
            name,
            topic,
            topic_ne: neTopic
        });

        if (uniqueId) {
            db.query('UPDATE imported_speakers SET topic = ?, topic_ne = ?, requested_minutes = ? WHERE unique_id = ?', [topic, neTopic, reqMins, uniqueId]);
            db.query('UPDATE permanent_members SET topic = ?, topic_ne = ? WHERE unique_id = ?', [topic, neTopic, uniqueId], (err) => {
                if (err) console.error('Error updating permanent_members topic:', err);
            });
        }

        broadcastState();
    });
});

// Import Roster Spreadsheet
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
                const name_ne = explicitNameNe || (await transliterateWithGoogle(name)) || null;

                const explicitPosNe = String(row['Position (Nepali)'] || row['पद'] || '').trim();
                const position_ne = explicitPosNe || positionMap[position.toLowerCase()] || (await transliterateWithGoogle(position)) || null;

                const explicitTopicNe = String(row['Topic (Nepali)'] || row['विषय'] || '').trim();
                const topic_ne = explicitTopicNe || (await transliterateWithGoogle(topic)) || null;

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
                const isQueued = targetQueue.some(s => s.uniqueId === uniqueId || s.name.toLowerCase() === name.toLowerCase());
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

// Import Verified JSON from Review Grid
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
                name_ne = await transliterateWithGoogle(name);
            }

            const position = String(row.position || 'Member of Parliament').trim();
            let position_ne = String(row.position_ne || '').trim();
            if (!position_ne && position) {
                position_ne = positionMap[position.toLowerCase()] || await transliterateWithGoogle(position);
            }

            const topic = String(row.topic || 'General Session').trim();
            let topic_ne = String(row.topic_ne || '').trim();
            if (!topic_ne && topic) {
                topic_ne = await transliterateWithGoogle(topic);
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
                const isQueued = targetQueue.some(s => s.uniqueId === uniqueId || s.name.toLowerCase() === name.toLowerCase());
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

// Purge Temporary Session Roster on Logout
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

// Import Permanent Members Spreadsheet
app.post('/api/import-permanent-members', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file provided.' });

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(sheet);

        if (!rawData || rawData.length === 0) {
            return res.status(400).json({ error: 'Uploaded file is empty.' });
        }

        let insertedCount = 0;

        for (const row of rawData) {
            const uniqueId = String(row['Unique ID'] || row['ID'] || row['unique_id'] || '').trim();
            const name = String(row['Name'] || row['Full Name'] || row['Speaker Name'] || '').trim();
            const position = String(row['Position'] || row['Designation'] || 'Member of Parliament').trim();

            if (uniqueId && name) {
                const explicitNameNe = String(row['Name (Nepali)'] || row['Nepali Name'] || row['नाम'] || '').trim();
                const name_ne = explicitNameNe || (await transliterateWithGoogle(name)) || null;

                const explicitPosNe = String(row['Position (Nepali)'] || row['पद'] || '').trim();
                const position_ne = explicitPosNe || positionMap[position.toLowerCase()] || (await transliterateWithGoogle(position)) || null;

                db.query(`
                    INSERT INTO permanent_members (unique_id, name, name_ne, position, position_ne)
                    VALUES (?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                        name = VALUES(name),
                        name_ne = VALUES(name_ne),
                        position = VALUES(position),
                        position_ne = VALUES(position_ne)
                `, [uniqueId, name, name_ne, position, position_ne]);
                insertedCount++;
            }
        }

        return res.json({ success: true, count: insertedCount });
    } catch (err) {
        console.error('Directory Import Error:', err);
        return res.status(500).json({ error: 'Failed to parse file.' });
    }
});

// Fetch All Imported Speakers
app.get('/api/imported-speakers', (req, res) => {
    db.query('SELECT * FROM imported_speakers ORDER BY id ASC', (err, results) => {
        if (err) {
            console.error('Error fetching imported speakers:', err);
            return res.status(500).json({ error: 'Database query failed.' });
        }
        res.json(results);
    });
});

// Clear All Imported Speakers
app.delete('/api/imported-speakers', (req, res) => {
    db.query('TRUNCATE TABLE imported_speakers', (err) => {
        if (err) {
            console.error('Error clearing imported speakers:', err);
            return res.status(500).json({ error: 'Failed to clear database table.' });
        }
        res.json({ success: true, message: 'All imported records cleared.' });
    });
});

// Fetch Permanent Members
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
        res.json(results);
    });
});

// Add or Register a New Permanent Member manually (with schema safety fallback)
app.post('/api/permanent-members', async (req, res) => {
    try {
        const { uniqueId, name, position, topic } = req.body;
        if (!uniqueId || !name) {
            return res.status(400).json({ error: 'Unique ID and Full Name are required.' });
        }

        const name_ne = req.body.name_ne || await transliterateWithGoogle(name);
        const position_ne = req.body.position_ne || positionMap[position?.toLowerCase()] || await transliterateWithGoogle(position);
        const topic_ne = req.body.topic_ne || (topic ? await transliterateWithGoogle(topic) : null);

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
                // Fallback for earlier database schemas
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

// Update / Edit an Existing Permanent Member (with schema safety fallback)
app.put('/api/permanent-members/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { uniqueId, name, position, topic } = req.body;

        if (!name || !uniqueId) {
            return res.status(400).json({ error: 'Name and Unique ID are required.' });
        }

        const name_ne = req.body.name_ne || await transliterateWithGoogle(name);
        const position_ne = req.body.position_ne || positionMap[position?.toLowerCase()] || await transliterateWithGoogle(position);
        const topic_ne = req.body.topic_ne || (topic ? await transliterateWithGoogle(topic) : null);

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
                // Fallback update
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

// Delete Permanent Member
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

// Speaker Login via ID
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

// Grouped stats query with Nepal Time offset (UTC +05:45)
app.get('/api/speaker-stats', (req, res) => {
    const query = `
        SELECT 
            name, 
            position, 
            SUM(duration_seconds) as total_seconds, 
            COUNT(*) as session_count,
            DATE_FORMAT(MAX(created_at), '%Y-%m-%d %H:%i:%s') as last_spoken_at,
            DATE_FORMAT(DATE_ADD(created_at, INTERVAL 345 MINUTE), '%Y-%m-%d') as session_date
        FROM speaker_logs 
        GROUP BY name, position, DATE_FORMAT(DATE_ADD(created_at, INTERVAL 345 MINUTE), '%Y-%m-%d') 
        ORDER BY MAX(created_at) DESC
    `;
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching speaker stats:', err);
            return res.status(500).json({ error: 'Database error fetching stats.' });
        }
        res.json(results);
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

app.post('/api/register-options', async (req, res) => {
    const { name, position } = req.body;
    if (!name || !position) return res.status(400).json({ error: 'Name and Position required.' });

    const empId = `SPK-${Date.now()}`;
    req.session.pendingSpeaker = { empId, name, position };

    try {
        const rpID = getRpID(req);
        const options = await generateRegistrationOptions({
            rpName: 'Assembly Queue Portal',
            rpID: rpID,
            userID: new Uint8Array(Buffer.from(empId, 'utf-8')),
            userName: name,
            userDisplayName: `${name} (${position})`,
            attestationType: 'none',
            authenticatorSelection: {
                userVerification: 'preferred',
                residentKey: 'discouraged'
            },
        });

        req.session.currentChallenge = options.challenge;
        res.json(options);
    } catch (error) {
        console.error('Registration Options Error:', error);
        res.status(500).json({ error: 'Failed to generate registration options.' });
    }
});

app.post('/api/verify-registration', async (req, res) => {
    const { body } = req.body;
    const pending = req.session.pendingSpeaker;

    if (!pending) return res.status(400).json({ error: 'Session expired. Please retry.' });

    try {
        const verification = await verifyRegistrationResponse({
            response: body,
            expectedChallenge: req.session.currentChallenge,
            expectedOrigin: getOrigin(req),
            expectedRPID: getRpID(req),
        });

        if (verification.verified) {
            const { credential } = verification.registrationInfo;
            db.query('INSERT INTO speakers (emp_id, name, position) VALUES (?, ?, ?)', [pending.empId, pending.name, pending.position]);
            db.query('INSERT INTO authenticators (id, emp_id, public_key, counter) VALUES (?, ?, ?, ?)', [
                credential.id, pending.empId, Buffer.from(credential.publicKey).toString('base64'), credential.counter
            ]);
            return res.json({ verified: true, name: pending.name, position: pending.position });
        }
    } catch (err) {
        console.error('Verification Error:', err);
    }
    res.status(400).json({ error: 'Biometric registration failed.' });
});

app.get('/api/auth-options', async (req, res) => {
    try {
        const options = await generateAuthenticationOptions({ 
            rpID: getRpID(req), 
            userVerification: 'preferred' 
        });
        req.session.currentChallenge = options.challenge;
        res.json(options);
    } catch (error) {
        console.error('Auth Options Error:', error);
        res.status(500).json({ error: 'Failed to generate auth options.' });
    }
});

app.post('/api/verify-auth', async (req, res) => {
    const { body } = req.body;
    db.query('SELECT * FROM authenticators WHERE id = ?', [body.id], async (err, results) => {
        if (err || results.length === 0) return res.status(400).json({ error: 'Device not recognized.' });
        const auth = results[0];

        try {
            const verification = await verifyAuthenticationResponse({
                response: body,
                expectedChallenge: req.session.currentChallenge,
                expectedOrigin: getOrigin(req),
                expectedRPID: getRpID(req),
                credential: {
                    id: auth.id,
                    publicKey: new Uint8Array(Buffer.from(auth.public_key, 'base64')),
                    counter: auth.counter,
                },
            });

            if (verification.verified) {
                db.query('SELECT name, position FROM speakers WHERE emp_id = ?', [auth.emp_id], (e, r) => {
                    return res.json({ verified: true, speaker: r[0] });
                });
                return;
            }
        } catch (err) {
            console.error('Auth Verification Error:', err);
        }
        res.status(400).json({ error: 'Biometric authentication failed.' });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend live on http://localhost:${PORT}`);
});