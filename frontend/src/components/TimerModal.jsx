import React from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function TimerModal({
    isOpen,
    onClose,
    activeSpeaker,
    remainingSecs,
    isPaused,
    queues = {},
    activeSection = 'sunya',
    interruptions = [],
    onPauseToggle,
    onReset,
    onNextSpeaker,
    onAllowQueuedSpeaker,
    onAllowInterruption,
    onDismissInterruption
}) {
    const { t, toDevanagariDigits, getLocalizedText } = useLanguage();

    if (!isOpen) return null;

    const formatClock = (seconds) => {
        const total = Math.max(0, parseInt(seconds || 0, 10));
        const m = String(Math.floor(total / 60)).padStart(2, '0');
        const s = String(total % 60).padStart(2, '0');
        return toDevanagariDigits(`${m}:${s}`);
    };

    const isWarning = remainingSecs <= 30 && remainingSecs > 0;
    const isExpired = remainingSecs <= 0;
    const timerColor = isExpired ? '#dc2626' : (isWarning ? '#ea580c' : '#166534');

    const interruptionsList = Array.isArray(interruptions) ? interruptions : [];

    // Aggregate all queued speakers across sections with section tags
    const sectionConfig = {
        sunya: { name: 'Sunya', icon: '⏳', color: '#2563eb', bg: '#eff6ff' },
        aakasmik: { name: 'Aakasmik', icon: '🚨', color: '#dc2626', bg: '#fef2f2' },
        bishesh: { name: 'Bishesh', icon: '🌟', color: '#7c3aed', bg: '#f5f3ff' }
    };

    const aggregatedQueue = [];
    ['sunya', 'aakasmik', 'bishesh'].forEach(secKey => {
        const list = Array.isArray(queues[secKey]) ? queues[secKey] : [];
        list.forEach((item, originalIndex) => {
            aggregatedQueue.push({
                ...item,
                sectionKey: secKey,
                originalIndex,
                cfg: sectionConfig[secKey] || sectionConfig.sunya
            });
        });
    });

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            backdropFilter: 'blur(6px)',
            padding: '20px'
        }}>
            <div style={{
                background: '#ffffff',
                borderRadius: '24px',
                padding: '32px',
                width: '100%',
                maxWidth: '980px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                display: 'grid',
                gridTemplateColumns: '1.4fr 1fr',
                gap: '24px',
                position: 'relative'
            }}>
                {/* Close Button */}
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '16px',
                        right: '16px',
                        background: '#f1f5f9',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: 800,
                        color: '#475569',
                        cursor: 'pointer'
                    }}
                >
                    {t?.closeOverlay || 'Close Overlay'}
                </button>

                {/* Left: Active Speaker Card */}
                <div style={{
                    background: '#f0fdf4',
                    border: '2px solid #86efac',
                    borderRadius: '20px',
                    padding: '32px 24px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    textAlign: 'center'
                }}>
                    <div>
                        <span style={{
                            background: '#dcfce7',
                            color: '#166534',
                            fontSize: '11px',
                            fontWeight: 900,
                            padding: '4px 12px',
                            borderRadius: '9999px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                        }}>
                            {t?.floorSessionActive || 'FLOOR SESSION ACTIVE'}
                        </span>

                        <div style={{ marginTop: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 900, color: '#166534' }}>
                                    {activeSpeaker ? getLocalizedText(activeSpeaker, 'name') : (t?.noSpeaker || 'No Speaker')}
                                </h1>
                                {activeSpeaker && activeSpeaker.requestedMinutes && (
                                    <span style={{ background: '#dbeafe', color: '#1e40af', fontSize: '12px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>
                                        ⏱️ {toDevanagariDigits(activeSpeaker.requestedMinutes)}m
                                    </span>
                                )}
                            </div>
                            <p style={{ margin: '4px 0 0 0', fontSize: '15px', color: '#475569', fontWeight: 600 }}>
                                {activeSpeaker ? getLocalizedText(activeSpeaker, 'position') : '--'}
                            </p>
                            {activeSpeaker && getLocalizedText(activeSpeaker, 'topic') && (
                                <div style={{ marginTop: '10px', fontSize: '13px', background: '#ffffff', padding: '4px 12px', borderRadius: '8px', border: '1px solid #bbf7d0', color: '#0f172a', fontWeight: 800 }}>
                                    📌 {getLocalizedText(activeSpeaker, 'topic')}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Clock Display */}
                    <div style={{
                        fontSize: '96px',
                        fontWeight: 900,
                        fontFamily: 'monospace',
                        color: timerColor,
                        lineHeight: 1,
                        margin: '24px 0'
                    }}>
                        {isExpired ? (t?.expired || 'EXPIRED') : formatClock(remainingSecs)}
                    </div>

                    {/* Controls */}
                    <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                        <button
                            onClick={onNextSpeaker}
                            style={{
                                flex: 1.2,
                                padding: '14px',
                                borderRadius: '10px',
                                border: 'none',
                                background: '#16a34a',
                                color: '#ffffff',
                                fontWeight: 900,
                                fontSize: '14px',
                                cursor: 'pointer'
                            }}
                        >
                            {t?.nextSpeaker || 'Next Speaker'}
                        </button>
                        <button
                            onClick={onPauseToggle}
                            style={{
                                flex: 0.8,
                                padding: '14px',
                                borderRadius: '10px',
                                border: '1.5px solid #fde047',
                                background: '#fef9c3',
                                color: '#854d0e',
                                fontWeight: 900,
                                fontSize: '14px',
                                cursor: 'pointer'
                            }}
                        >
                            {isPaused ? (t?.resume || 'Resume') : (t?.pause || 'Pause')}
                        </button>
                        <button
                            onClick={onReset}
                            style={{
                                flex: 1,
                                padding: '14px',
                                borderRadius: '10px',
                                border: 'none',
                                background: '#dc2626',
                                color: '#ffffff',
                                fontWeight: 900,
                                fontSize: '14px',
                                cursor: 'pointer'
                            }}
                        >
                            {t?.stopAndReset || 'Stop & Reset'}
                        </button>
                    </div>
                </div>

                {/* Right: Live Sidebars */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Interruptions Box */}
                    <div style={{
                        flex: 1,
                        background: interruptionsList.length > 0 ? '#fff5f5' : '#ffffff',
                        border: interruptionsList.length > 0 ? '1.5px solid #fca5a5' : '1.5px solid #e2e8f0',
                        borderRadius: '16px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 900, color: '#dc2626' }}>
                                ⚠️ {t?.interruptionsTitle || 'INTERRUPTIONS REQUESTED'}
                            </span>
                            <span style={{ background: '#fee2e2', color: '#b91c1c', fontSize: '11px', fontWeight: 900, padding: '2px 8px', borderRadius: '9999px' }}>
                                {toDevanagariDigits(interruptionsList.length)}
                            </span>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', maxHeight: '140px' }}>
                            {interruptionsList.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>
                                    No active interruptions
                                </div>
                            ) : (
                                interruptionsList.map((item, idx) => (
                                    <div key={idx} style={{ background: '#ffffff', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                        <div>
                                            <div style={{ fontWeight: 800, color: '#991b1b', fontSize: '13px' }}>{getLocalizedText(item, 'name')}</div>
                                            <div style={{ fontSize: '11px', color: '#64748b' }}>{item.reason}</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <button onClick={() => onAllowInterruption(idx)} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>
                                                {t?.allow || 'Allow'}
                                            </button>
                                            <button onClick={() => onDismissInterruption(idx)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', padding: '4px 6px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>
                                                {t?.dismiss || 'Dismiss'}
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Upcoming Queue Box (Real-time Live Sync across all slots) */}
                    <div style={{
                        flex: 1,
                        background: '#ffffff',
                        border: '1.5px solid #e2e8f0',
                        borderRadius: '16px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 900, color: '#334155' }}>
                                📋 {t?.upcomingQueue || 'UPCOMING FLOOR QUEUE'}
                            </span>
                            <span style={{ background: '#f1f5f9', color: '#475569', fontSize: '11px', fontWeight: 900, padding: '2px 8px', borderRadius: '9999px' }}>
                                {toDevanagariDigits(aggregatedQueue.length)}
                            </span>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', maxHeight: '140px' }}>
                            {aggregatedQueue.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>
                                    No members in queue
                                </div>
                            ) : (
                                aggregatedQueue.map((item, idx) => (
                                    <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ fontWeight: 800, fontSize: '13px', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    #{toDevanagariDigits(idx + 1)} {getLocalizedText(item, 'name')}
                                                </span>
                                                <span style={{ background: item.cfg.bg, color: item.cfg.color, fontSize: '10px', fontWeight: 800, padding: '1px 5px', borderRadius: '4px' }}>
                                                    {item.cfg.icon} {item.cfg.name}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                                {getLocalizedText(item, 'position')}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            {item.requestedMinutes && (
                                                <span style={{ background: '#ffffff', border: '1px solid #cbd5e1', fontSize: '10px', fontWeight: 800, padding: '2px 5px', borderRadius: '4px', color: '#475569' }}>
                                                    ⏱️ {toDevanagariDigits(item.requestedMinutes)}m
                                                </span>
                                            )}
                                            {onAllowQueuedSpeaker && (
                                                <button
                                                    onClick={() => onAllowQueuedSpeaker(item.sectionKey, item.originalIndex)}
                                                    style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}
                                                >
                                                    ✓ {t?.allow || 'Allow'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}