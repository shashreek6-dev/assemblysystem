import React, { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function TimerModal({ 
    isOpen, 
    onClose, 
    activeSpeaker, 
    remainingSecs, 
    isPaused, 
    queue, 
    interruptions = [],
    onPauseToggle, 
    onReset, 
    onNextSpeaker,
    onAllowInterruption,
    onDismissInterruption,
    onSetTime
}) {
    const { t, toDevanagariDigits, getLocalizedText } = useLanguage();
    const [customMins, setCustomMins] = useState('');
    const [customSecs, setCustomSecs] = useState('');

    if (!isOpen) return null;

    let stateClass = "state-green";
    if (remainingSecs <= 0) {
        stateClass = "state-red";
    } else if (remainingSecs <= 60) {
        stateClass = "state-yellow";
    }

    const mins = String(Math.floor(remainingSecs / 60)).padStart(2, '0');
    const secs = String(remainingSecs % 60).padStart(2, '0');

    const handleApplyCustomTime = () => {
        const m = parseInt(customMins || '0', 10);
        const s = parseInt(customSecs || '0', 10);
        if (m === 0 && s === 0) return;
        onSetTime({ minutes: m, seconds: s });
        setCustomMins('');
        setCustomSecs('');
    };

    const formatRequestedTimeBadge = (item) => {
        const m = item?.requestedMinutes || 0;
        const s = item?.requestedSeconds || 0;
        if (m === 0 && s === 0) return null;
        if (s === 0) return `${toDevanagariDigits(m)}m`;
        return `${toDevanagariDigits(m)}m ${toDevanagariDigits(s)}s`;
    };

    return (
        <div className="timer-modal-overlay">
            <div className="timer-modal-container" style={{ maxWidth: '960px', width: '95%' }}>
                <button className="btn-close-modal" onClick={onClose}>{t.closeOverlay}</button>

                {/* Main Timer Display Card */}
                <div className={`big-timer-card ${stateClass}`}>
                    <span className="badge badge-live" style={{ alignSelf: 'center' }}>{t.floorSessionActive}</span>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '12px' }}>
                        <div style={{ fontSize: '28px', fontWeight: 800, color: '#16a34a' }}>
                            {getLocalizedText(activeSpeaker, 'name') || '--'}
                        </div>
                        {formatRequestedTimeBadge(activeSpeaker) && (
                            <span style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', fontSize: '11px', fontWeight: 700, padding: '2px 6px', borderRadius: '6px' }}>
                                ⏱️ {formatRequestedTimeBadge(activeSpeaker)}
                            </span>
                        )}
                    </div>
                    <div style={{ fontSize: '15px', color: '#64748b' }}>
                        {getLocalizedText(activeSpeaker, 'position') || '--'}
                    </div>
                    {getLocalizedText(activeSpeaker, 'topic') && (
                        <div style={{ fontSize: '12px', color: '#1e293b', marginTop: '4px', fontWeight: 600 }}>
                            📌 {getLocalizedText(activeSpeaker, 'topic')}
                        </div>
                    )}
                    <div className="big-timer-clock">
                        {remainingSecs <= 0 ? t.expired : toDevanagariDigits(`${mins}:${secs}`)}
                    </div>
                    
                    {/* Primary Action Buttons */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                        <button className="btn-success" style={{ padding: '10px 16px', fontSize: '13px' }} onClick={onNextSpeaker}>
                            {t.nextSpeaker}
                        </button>
                        <button className="btn-warning" style={{ padding: '10px 16px', fontSize: '13px' }} onClick={onPauseToggle}>
                            {isPaused ? t.resume : t.pause}
                        </button>
                        <button className="btn-danger" style={{ padding: '10px 16px', fontSize: '13px' }} onClick={onReset}>
                            {t.stopAndReset}
                        </button>
                    </div>

                    {/* Quick Timer Setting Controls */}
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', flexWrap: 'wrap', paddingTop: '10px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                        <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => onSetTime({ minutes: 1, seconds: 0 })}>{t.oneMin}</button>
                        <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => onSetTime({ minutes: 3, seconds: 0 })}>{t.threeMin}</button>
                        <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => onSetTime({ minutes: 5, seconds: 0 })}>{t.fiveMin}</button>
                        
                        <div className="input-group" style={{ margin: 0, padding: '2px 6px' }}>
                            <input 
                                type="number" 
                                placeholder="0" 
                                min="0"
                                value={customMins} 
                                onChange={(e) => setCustomMins(e.target.value)} 
                                style={{ width: '36px', padding: '4px' }}
                            />
                            <span style={{ fontSize: '11px' }}>m</span>
                            <input 
                                type="number" 
                                placeholder="0" 
                                min="0"
                                max="59"
                                value={customSecs} 
                                onChange={(e) => setCustomSecs(e.target.value)} 
                                style={{ width: '36px', padding: '4px' }}
                            />
                            <span style={{ fontSize: '11px' }}>s</span>
                        </div>
                        <button className="btn-success" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={handleApplyCustomTime}>{t.start}</button>
                    </div>
                </div>

                {/* Right Side: Interruptions & Queue Sidebars */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Interruptions Panel */}
                    <div className="card card-interrupt" style={{ padding: '16px', background: '#fff', border: '1px solid #fecdd3' }}>
                        <div className="card-header" style={{ marginBottom: '8px' }}>
                            <span style={{ fontSize: '14px', fontWeight: 800 }}>⚠️ {t.interruptionsTitle}</span>
                            <span className="badge badge-alert">{toDevanagariDigits(interruptions.length)}</span>
                        </div>
                        <ul style={{ maxHeight: '140px', overflowY: 'auto' }}>
                            {interruptions.length === 0 ? (
                                <p className="text-muted" style={{ margin: '8px 0', fontSize: '12px', textAlign: 'center' }}>No active interruptions</p>
                            ) : (
                                interruptions.map((item, idx) => (
                                    <li key={idx} className="interrupt-item" style={{ padding: '6px 0' }}>
                                        <div>
                                            <strong className="text-red" style={{ fontSize: '12px' }}>{getLocalizedText(item, 'name')}</strong>
                                            <div className="text-muted" style={{ fontSize: '11px' }}>{item.reason}</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <button className="btn-success" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => onAllowInterruption(idx)}>{t.allow}</button>
                                            <button className="btn-danger" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => onDismissInterruption(idx)}>{t.dismiss}</button>
                                        </div>
                                    </li>
                                ))
                            )}
                        </ul>
                    </div>

                    {/* Upcoming Queue Panel */}
                    <div className="modal-queue-card" style={{ padding: '16px', background: '#fff', border: '1px solid var(--border)', borderRadius: '12px' }}>
                        <div className="card-header" style={{ marginBottom: '8px' }}>
                            <span style={{ fontSize: '14px', fontWeight: 800 }}>📋 {t.upcomingQueue}</span>
                            <span style={{ color: 'var(--accent-blue)', fontWeight: 800 }}>{toDevanagariDigits(queue.length)}</span>
                        </div>
                        <ul style={{ maxHeight: '160px', overflowY: 'auto' }}>
                            {queue.length === 0 ? (
                                <p className="text-muted" style={{ margin: '8px 0', fontSize: '12px', textAlign: 'center' }}>No members in queue</p>
                            ) : (
                                queue.map((item, index) => (
                                    <li key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <strong style={{ fontSize: '12px' }}>#{toDevanagariDigits(index + 1)} {getLocalizedText(item, 'name')}</strong>
                                                {formatRequestedTimeBadge(item) && (
                                                    <span style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', fontSize: '10px', fontWeight: 700, padding: '1px 4px', borderRadius: '4px' }}>
                                                        ⏱️ {formatRequestedTimeBadge(item)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-muted" style={{ fontSize: '11px' }}>
                                                {getLocalizedText(item, 'position')} • {toDevanagariDigits(item.timestamp)}
                                            </div>
                                        </div>
                                        {index === 0 && (
                                            <button 
                                                className="btn-success" 
                                                style={{ padding: '4px 8px', fontSize: '11px', whiteSpace: 'nowrap' }} 
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
        </div>
    );
}