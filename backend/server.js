import express from 'express';
import session from 'express-session';
import mysql from 'mysql2';
import http from 'http';
import { Server } from 'socket.io';
import {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const app = express();
const server = http.createServer(app);

// Enable Socket.IO CORS
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.set('trust proxy', 1); // Trust devtunnels / reverse proxy
app.use(express.json());

// Session Configuration for cross-device tunneling
app.use(session({
    secret: process.env.SESSION_SECRET || 'assembly-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false, // Set to false for local/tunnel HTTP proxying
        sameSite: 'lax'
    }
}));

// MySQL Database Pool (XAMPP Default)
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '', 
    database: process.env.DB_NAME || 'assembly_db'
});

// Domain & RPID Resolution Helpers (Fixes WebAuthn iOS/Devtunnel Pattern Errors)
const getRpID = (req) => {
    const rawHost = req.get('x-forwarded-host') || req.get('host') || 'localhost';
    return rawHost.split(':')[0];
};

const getOrigin = (req) => {
    const rawHost = req.get('x-forwarded-host') || req.get('host') || 'localhost:5173';
    const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
    return `${proto}://${rawHost}`;
};

// Memory State
let queue = [];
let interruptions = [];
let activeSpeaker = null;
let floorTimer = { duration: 0, endsAt: null, remainingSeconds: 0, isPaused: false };
let autoAdvanceTimeout = null;

const clearAutoAdvance = () => {
    if (autoAdvanceTimeout) {
        clearTimeout(autoAdvanceTimeout);
        autoAdvanceTimeout = null;
    }
};

// Real-Time Socket Management
io.on('connection', (socket) => {
    socket.emit('queueUpdated', { queue, interruptions, activeSpeaker, floorTimer });

    const setTimerFromSeconds = (totalSeconds) => {
        clearAutoAdvance();
        const endsAt = Date.now() + totalSeconds * 1000;
        floorTimer = {
            duration: totalSeconds,
            endsAt,
            remainingSeconds: totalSeconds,
            isPaused: false
        };

        // When timer hits 0, clear the current active speaker automatically
        autoAdvanceTimeout = setTimeout(() => {
            activeSpeaker = null;
            floorTimer = { duration: 0, endsAt: null, remainingSeconds: 0, isPaused: false };
            io.emit('queueUpdated', { queue, interruptions, activeSpeaker, floorTimer });
        }, totalSeconds * 1000);
    };

    socket.on('requestFloor', (speaker) => {
        if (!speaker || !speaker.name) return;
        const isQueued = queue.some(s => s.name.toLowerCase() === speaker.name.toLowerCase());
        const isActive = activeSpeaker && activeSpeaker.name.toLowerCase() === speaker.name.toLowerCase();

        if (!isQueued && !isActive) {
            queue.push({
                socketId: socket.id,
                name: speaker.name,
                position: speaker.position || 'Member',
                timestamp: new Date().toLocaleTimeString()
            });
            io.emit('queueUpdated', { queue, interruptions, activeSpeaker, floorTimer });
        }
    });

    socket.on('raiseInterruption', (data) => {
        if (!data || !data.speaker || !data.speaker.name) return;
        const isInterrupted = interruptions.some(s => s.name.toLowerCase() === data.speaker.name.toLowerCase());

        if (!isInterrupted) {
            interruptions.push({
                socketId: socket.id,
                name: data.speaker.name,
                position: data.speaker.position || 'Member',
                reason: data.reason || 'Point of Order',
                timestamp: new Date().toLocaleTimeString()
            });
            io.emit('queueUpdated', { queue, interruptions, activeSpeaker, floorTimer });
        }
    });

    socket.on('nextSpeaker', () => {
        clearAutoAdvance();
        activeSpeaker = queue.shift() || null;
        floorTimer = { duration: 0, endsAt: null, remainingSeconds: 0, isPaused: false };
        io.emit('queueUpdated', { queue, interruptions, activeSpeaker, floorTimer });
    });

    socket.on('allowInterruption', (index) => {
        if (interruptions[index]) {
            clearAutoAdvance();
            const interrupter = interruptions[index];
            activeSpeaker = { name: interrupter.name, position: interrupter.position };
            interruptions.splice(index, 1);
            floorTimer = { duration: 0, endsAt: null, remainingSeconds: 0, isPaused: false };
            io.emit('queueUpdated', { queue, interruptions, activeSpeaker, floorTimer });
        }
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
            io.emit('queueUpdated', { queue, interruptions, activeSpeaker, floorTimer });
        }
    });

    socket.on('pauseTimer', () => {
        if (activeSpeaker && floorTimer.endsAt && !floorTimer.isPaused) {
            clearAutoAdvance();
            const remaining = Math.max(0, Math.ceil((floorTimer.endsAt - Date.now()) / 1000));
            floorTimer.remainingSeconds = remaining;
            floorTimer.isPaused = true;
            floorTimer.endsAt = null;
            io.emit('queueUpdated', { queue, interruptions, activeSpeaker, floorTimer });
        }
    });

    socket.on('resumeTimer', () => {
        if (activeSpeaker && floorTimer.isPaused && floorTimer.remainingSeconds > 0) {
            setTimerFromSeconds(floorTimer.remainingSeconds);
            io.emit('queueUpdated', { queue, interruptions, activeSpeaker, floorTimer });
        }
    });

    socket.on('resetTimer', () => {
        if (activeSpeaker) {
            clearAutoAdvance();
            floorTimer = { duration: 0, endsAt: null, remainingSeconds: 0, isPaused: false };
            io.emit('queueUpdated', { queue, interruptions, activeSpeaker, floorTimer });
        }
    });

    socket.on('dismissInterruption', (index) => {
        if (interruptions[index]) {
            interruptions.splice(index, 1);
            io.emit('queueUpdated', { queue, interruptions, activeSpeaker, floorTimer });
        }
    });

    socket.on('clearActive', () => {
        clearAutoAdvance();
        activeSpeaker = null;
        floorTimer = { duration: 0, endsAt: null, remainingSeconds: 0, isPaused: false };
        io.emit('queueUpdated', { queue, interruptions, activeSpeaker, floorTimer });
    });
});

// Admin Login
app.post('/api/head-login', (req, res) => {
    const { username, password } = req.body;
    db.query('SELECT * FROM head_masters WHERE username = ? AND password_hash = ?', [username, password], (err, results) => {
        if (err || results.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }
        return res.json({ success: true, token: `HEAD-TOKEN-${Date.now()}` });
    });
});

// WebAuthn Registration Options (Fixed iOS String Pattern)
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

// Verify Registration Response
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

// WebAuthn Authentication Options
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

// Verify Authentication Response
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