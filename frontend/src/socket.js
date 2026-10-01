import { io } from 'socket.io-client';

const getBackendUrl = () => {
    if (typeof window === 'undefined') return 'http://localhost:3000';
    const host = window.location.hostname;
    if (host.includes('devtunnels.ms')) {
        return window.location.origin.replace('-5173.', '-3000.');
    }
    return `http://${host}:3000`;
};

export const socket = io(getBackendUrl(), {
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
});

// Server clock offset in milliseconds (Server Time - Client Local Time)
export let serverOffsetMs = 0;

export const syncClockWithServer = () => {
    const t0 = Date.now();
    socket.emit('pingSync', (serverTime) => {
        const t1 = Date.now();
        const roundTripLatency = (t1 - t0) / 2;
        // Accurate server time calculated with latency compensation
        serverOffsetMs = (serverTime + roundTripLatency) - t1;
    });
};

socket.on('connect', () => {
    syncClockWithServer();
});

// Periodically resync clock offset every 30 seconds to prevent hardware drift
setInterval(() => {
    if (socket.connected) {
        syncClockWithServer();
    }
}, 30000);

export const getEstimatedServerNow = () => {
    return Date.now() + serverOffsetMs;
};