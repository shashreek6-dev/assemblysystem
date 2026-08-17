import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { useLanguage } from '../context/LanguageContext';
import LanguageToggle from './LanguageToggle';
import TimerModal from './TimerModal';

export default function PresidingConsole() {
    const navigate = useNavigate();
    const { t, toDevanagariDigits } = useLanguage();
    const closeTimeoutRef = useRef(null);
    const isExpiringRef = useRef(false);

    const [state, setState] = useState({
        queue: [],
        interruptions: [],
        activeSpeaker: null,
        floorTimer: { duration: 0, endsAt: null, remainingSeconds: 0, isPaused: false }
    });

    // Holds speaker reference so modal doesn't turn blank during the 5s grace period
    const [displaySpeaker, setDisplaySpeaker] = useState(null);

    // Initialized as empty strings so 0 acts purely as a placeholder
    const [customMins, setCustomMins] = useState('');
    const [customSecs, setCustomSecs] = useState('');
    const [remainingSecs, setRemainingSecs] = useState(0);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('adminToken');
        if (!token) navigate('/admin/login');
    }, [navigate]);

    const handleSignOut = () => {
        localStorage.removeItem('adminToken');
        navigate('/admin/login');
    };

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        };
    }, []);

    // Listen to real-time server updates
    useEffect(() => {
        socket.on('queueUpdated', (data) => {
            setState(data);

            if (data.activeSpeaker) {
                setDisplaySpeaker(data.activeSpeaker);
            }
        });
        return () => socket.off('queueUpdated');
    }, []);

    // Countdown interval + Guaranteed 5-second close delay
    useEffect(() => {
        const { endsAt, isPaused, remainingSeconds } = state.floorTimer;
        
        if (isPaused) {
            setRemainingSecs(remainingSeconds);
            return;
        }
        
        if (!endsAt) {
            if (!isExpiringRef.current) {
                setRemainingSecs(0);
            }
            return;
        }

        isExpiringRef.current = false;

        const interval = setInterval(() => {
            const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
            setRemainingSecs(left);
            
            if (left <= 0) {
                clearInterval(interval);
                isExpiringRef.current = true;

                if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
                
                closeTimeoutRef.current = setTimeout(() => {
                    setIsModalOpen(false);
                    isExpiringRef.current = false;
                }, 5000); // 5-second delay before auto-closing
            }
        }, 250);

        return () => clearInterval(interval);
    }, [state.floorTimer]);

    const handleStart = () => {
        if (!state.activeSpeaker) return alert(t.assignSpeakerAlert);
        
        const mins = parseInt(customMins || '0', 10);
        const secs = parseInt(customSecs || '0', 10);

        if (mins === 0 && secs === 0) return alert(t.selectDurationAlert);

        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        isExpiringRef.current = false;
        
        setDisplaySpeaker(state.activeSpeaker);
        socket.emit('setSpeakingTime', { minutes: mins, seconds: secs });
        setIsModalOpen(true);
    };

    const handleReset = () => {
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        isExpiringRef.current = false;
        socket.emit('resetTimer');
        setIsModalOpen(false);
    };

    const handleManualClear = () => {
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        isExpiringRef.current = false;
        socket.emit('clearActive');
        setIsModalOpen(false);
    };

    const formatClock = (seconds) => {
        const m = String(Math.floor(seconds / 60)).padStart(2, '0');
        const s = String(seconds % 60).padStart(2, '0');
        return toDevanagariDigits(`${m}:${s}`);
    };

    return (
        <div>
            {/* Centered Header Bar */}
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr auto 1fr', 
                alignItems: 'center', 
                borderBottom: '1px solid var(--border)', 
                paddingBottom: '16px', 
                marginBottom: '24px' 
            }}>
                <div />
                
                <div style={{ textAlign: 'center' }}>
                    <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800 }}>{t.consoleTitle}</h1>
                    <p className="text-muted" style={{ margin: '4px 0 0 0', fontSize: '13px' }}>{t.consoleSubtitle}</p>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <LanguageToggle />
                    <button className="btn-secondary" onClick={handleSignOut}>{t.signOut}</button>
                </div>
            </div>

            <div className="grid-3">
                {/* Current Speaker */}
                <div className="card card-active">
                    <div>
                        <div className="card-header">
                            <span>{t.currentSpeaker}</span>
                            <span className="badge badge-live">{t.badgeActive}</span>
                        </div>
                        {state.activeSpeaker ? (
                            <div>
                                <h2 className="text-green">{state.activeSpeaker.name}</h2>
                                <p className="text-muted" style={{ fontSize: '14px' }}>{state.activeSpeaker.position}</p>
                            </div>
                        ) : (
                            <p className="text-muted" style={{ margin: 0 }}>{t.noSpeaker}</p>
                        )}
                    </div>
                    <div className="btn-group">
                        <button className="btn-success flex-1" onClick={() => socket.emit('nextSpeaker')}>{t.nextSpeaker}</button>
                        <button className="btn-secondary" onClick={handleManualClear}>{t.clear}</button>
                    </div>
                </div>

                {/* Interruptions Requested */}
                <div className="card card-interrupt">
                    <div>
                        <div className="card-header">
                            <span>{t.interruptionsTitle}</span>
                            <span className="badge badge-alert">{t.badgePointOfOrder}</span>
                        </div>
                        <ul>
                            {state.interruptions.map((item, idx) => (
                                <li key={idx} className="interrupt-item">
                                    <div>
                                        <strong className="text-red">{item.name}</strong>
                                        <div className="text-muted">{item.reason}</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        <button className="btn-success" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => socket.emit('allowInterruption', idx)}>{t.allow}</button>
                                        <button className="btn-danger" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => socket.emit('dismissInterruption', idx)}>{t.dismiss}</button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                {/* Queue */}
                <div className="card">
                    <div>
                        <div className="card-header">
                            <span>{t.queueTitle}</span>
                            <span style={{ color: 'var(--accent-blue)', fontWeight: 800 }}>{toDevanagariDigits(state.queue.length)}</span>
                        </div>
                        <ul>
                            {state.queue.map((item, idx) => (
                                <li key={idx}>
                                    <div>
                                        <strong style={{ fontSize: '13px' }}>#{toDevanagariDigits(idx + 1)} {item.name}</strong>
                                        <div className="text-muted">{item.position}</div>
                                    </div>
                                    <span className="text-muted" style={{ fontWeight: 600, fontSize: '11px' }}>{toDevanagariDigits(item.timestamp)}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            {/* Bottom Timer Controls */}
            <div className="timer-control-panel">
                <div>
                    <div className="text-muted" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                        {t.activeFloorTimer} {state.floorTimer.isPaused && <span style={{ color: 'var(--accent-yellow)' }}>{t.paused}</span>}
                    </div>
                    <div className="timer-display">{formatClock(remainingSecs)}</div>
                </div>

                <div className="controls-row">
                    <button className="btn-secondary" onClick={() => { setCustomMins('1'); setCustomSecs(''); }}>{t.oneMin}</button>
                    <button className="btn-secondary" onClick={() => { setCustomMins('3'); setCustomSecs(''); }}>{t.threeMin}</button>
                    <button className="btn-secondary" onClick={() => { setCustomMins('5'); setCustomSecs(''); }}>{t.fiveMin}</button>

                    {/* Placeholder Inputs */}
                    <div className="input-group">
                        <input 
                            type="number" 
                            placeholder="0" 
                            min="0"
                            value={customMins} 
                            onChange={(e) => setCustomMins(e.target.value)} 
                        />
                        <span>m</span>
                        <input 
                            type="number" 
                            placeholder="0" 
                            min="0"
                            max="59"
                            value={customSecs} 
                            onChange={(e) => setCustomSecs(e.target.value)} 
                        />
                        <span>s</span>
                    </div>

                    <button className="btn-success" onClick={handleStart}>{t.start}</button>
                    <button className="btn-warning" onClick={() => state.floorTimer.isPaused ? socket.emit('resumeTimer') : socket.emit('pauseTimer')}>
                        {state.floorTimer.isPaused ? t.resume : t.pause}
                    </button>
                    <button className="btn-danger" onClick={handleReset}>{t.reset}</button>
                </div>
            </div>

            {/* Modal */}
            <TimerModal 
                isOpen={isModalOpen}
                onClose={() => {
                    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
                    setIsModalOpen(false);
                }}
                activeSpeaker={displaySpeaker}
                remainingSecs={remainingSecs}
                isPaused={state.floorTimer.isPaused}
                queue={state.queue}
                onPauseToggle={() => state.floorTimer.isPaused ? socket.emit('resumeTimer') : socket.emit('pauseTimer')}
                onReset={handleReset}
                onNextSpeaker={() => socket.emit('nextSpeaker')}
            />
        </div>
    );
}