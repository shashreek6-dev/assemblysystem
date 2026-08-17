import React from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function TimerModal({ 
    isOpen, 
    onClose, 
    activeSpeaker, 
    remainingSecs, 
    isPaused, 
    queue, 
    onPauseToggle, 
    onReset, 
    onNextSpeaker 
}) {
    const { t, toDevanagariDigits } = useLanguage();
    if (!isOpen) return null;

    let stateClass = "state-green";
    if (remainingSecs <= 0) {
        stateClass = "state-red";
    } else if (remainingSecs <= 60) {
        stateClass = "state-yellow";
    }

    const mins = String(Math.floor(remainingSecs / 60)).padStart(2, '0');
    const secs = String(remainingSecs % 60).padStart(2, '0');

    return (
        <div className="timer-modal-overlay">
            <div className="timer-modal-container">
                <button className="btn-close-modal" onClick={onClose}>{t.closeOverlay}</button>

                {/* Main Timer Display Card */}
                <div className={`big-timer-card ${stateClass}`}>
                    <span className="badge badge-live" style={{ alignSelf: 'center' }}>{t.floorSessionActive}</span>
                    <div style={{ fontSize: '28px', fontWeight: 800, color: '#16a34a', marginTop: '16px' }}>
                        {activeSpeaker?.name || '--'}
                    </div>
                    <div style={{ fontSize: '16px', color: '#64748b' }}>{activeSpeaker?.position || '--'}</div>
                    <div className="big-timer-clock">
                        {remainingSecs <= 0 ? t.expired : toDevanagariDigits(`${mins}:${secs}`)}
                    </div>
                    
                    {/* Modal Controls */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <button className="btn-success" style={{ padding: '12px 20px', fontSize: '14px' }} onClick={onNextSpeaker}>
                            {t.nextSpeaker}
                        </button>
                        <button className="btn-warning" style={{ padding: '12px 20px', fontSize: '14px' }} onClick={onPauseToggle}>
                            {isPaused ? t.resume : t.pause}
                        </button>
                        <button className="btn-danger" style={{ padding: '12px 20px', fontSize: '14px' }} onClick={onReset}>
                            {t.stopAndReset}
                        </button>
                    </div>
                </div>

                {/* Upcoming Queue Card */}
                <div className="modal-queue-card">
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>{t.upcomingQueue}</h3>
                    <ul style={{ maxHeight: '380px', overflowY: 'auto' }}>
                        {queue.length === 0 ? (
                            <p className="text-muted" style={{ margin: '16px 0', textAlign: 'center' }}>No members in queue</p>
                        ) : (
                            queue.map((item, index) => (
                                <li key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <strong style={{ fontSize: '13px' }}>#{toDevanagariDigits(index + 1)} {item.name}</strong>
                                        <div className="text-muted" style={{ fontSize: '11px' }}>{item.position} • {toDevanagariDigits(item.timestamp)}</div>
                                    </div>
                                    {index === 0 && (
                                        <button 
                                            className="btn-success" 
                                            style={{ padding: '6px 12px', fontSize: '11px', whiteSpace: 'nowrap' }} 
                                            onClick={onNextSpeaker}
                                        >
                                            {t.assignFloor || t.nextSpeaker}
                                        </button>
                                    )}
                                </li>
                            ))
                        )}
                    </ul>
                </div>
            </div>
        </div>
    );
}