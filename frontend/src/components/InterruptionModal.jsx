import React from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function InterruptionModal({ 
    isOpen, 
    activeInterruption, 
    savedFloorSpeaker, 
    remainingSecs, 
    isPaused, 
    onFinishInterruption,
    onPauseToggle,
    onSetTime
}) {
    const { t, toDevanagariDigits, getLocalizedText } = useLanguage();
    if (!isOpen || !activeInterruption) return null;

    const mins = String(Math.floor(remainingSecs / 60)).padStart(2, '0');
    const secs = String(remainingSecs % 60).padStart(2, '0');

    const savedMins = Math.floor((savedFloorSpeaker?.remainingSeconds || 0) / 60);
    const savedSecs = (savedFloorSpeaker?.remainingSeconds || 0) % 60;

    return (
        <div className="timer-modal-overlay">
            <div className="timer-modal-container" style={{ maxWidth: '640px', width: '90%', border: '2px solid #ef4444' }}>
                <div className="big-timer-card state-red" style={{ background: '#fff5f5' }}>
                    <span className="badge badge-alert" style={{ alignSelf: 'center', fontSize: '13px', padding: '6px 14px' }}>
                        ⚠️ {t.interruptionActiveBadge || "PRIORITY INTERRUPTION ACTIVE"}
                    </span>

                    <div style={{ fontSize: '26px', fontWeight: 800, color: '#b91c1c', marginTop: '14px' }}>
                        {getLocalizedText(activeInterruption.speaker, 'name')}
                    </div>
                    <div style={{ fontSize: '14px', color: '#64748b', fontWeight: 600 }}>
                        {getLocalizedText(activeInterruption.speaker, 'position')} • <span style={{ color: '#ef4444' }}>{activeInterruption.reason}</span>
                    </div>

                    <div className="big-timer-clock" style={{ color: '#b91c1c', margin: '14px 0' }}>
                        {remainingSecs <= 0 ? t.expired : toDevanagariDigits(`${mins}:${secs}`)}
                    </div>

                    {/* Quick Adjustments */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}>
                        <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => onSetTime({ minutes: 1, seconds: 0 })}>+ 1m</button>
                        <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => onSetTime({ minutes: 2, seconds: 0 })}>+ 2m</button>
                        <button className="btn-warning" style={{ padding: '6px 14px', fontSize: '12px' }} onClick={onPauseToggle}>
                            {isPaused ? t.resume : t.pause}
                        </button>
                    </div>

                    {/* Original Speaker On-Hold Notice Box */}
                    {savedFloorSpeaker && (
                        <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '10px', padding: '12px 16px', margin: '10px 0 16px 0', textAlign: 'left' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                                ⏸️ {t.interruptedSpeakerNotice || "Paused Original Speaker"}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                                <span style={{ fontWeight: 800, fontSize: '15px', color: '#1e293b' }}>
                                    {getLocalizedText(savedFloorSpeaker.speaker, 'name')} ({getLocalizedText(savedFloorSpeaker.speaker, 'position')})
                                </span>
                                <span style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontSize: '12px', fontWeight: 800, padding: '2px 8px', borderRadius: '6px' }}>
                                    {toDevanagariDigits(savedMins)}m {toDevanagariDigits(savedSecs)}s {t.remainingFloorTime || "Saved"}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Finish Interruption and Restore */}
                    <button 
                        className="btn-success" 
                        style={{ width: '100%', padding: '14px', fontSize: '15px', fontWeight: 800, background: '#16a34a' }}
                        onClick={onFinishInterruption}
                    >
                        ✅ {t.finishInterruptionBtn || "Finish Interruption & Return Floor"}
                    </button>
                </div>
            </div>
        </div>
    );
}