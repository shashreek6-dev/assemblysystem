import { io } from 'socket.io-client';

// Connect dynamically to the same origin so Vite proxy forwards to port 3000
export const socket = io({
    autoConnect: true,
});