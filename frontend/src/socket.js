import { io } from 'socket.io-client';

const getSocketUrl = () => {
    if (typeof window === 'undefined') return 'http://localhost:3000';
    const host = window.location.hostname;
    
    // VS Code Dev Tunnels Port Forwarding resolver
    if (host.includes('devtunnels.ms')) {
        return window.location.origin.replace('-5173.', '-3000.');
    }
    
    // Standard LAN / Localhost
    return `http://${host}:3000`;
};

export const socket = io(getSocketUrl(), {
    transports: ['websocket', 'polling'],
    reconnection: true
});