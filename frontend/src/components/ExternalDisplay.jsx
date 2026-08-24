import React, { useState, useEffect } from 'react';
import { socket } from '../socket';
import { useLanguage } from '../context/LanguageContext';

export default function Display() {
    const { t, toDevanagariDigits, getLocalizedText } = useLanguage();

    const [state, setState] = useState({
        activeSpeaker: null,
        floorTimer: { duration: 0, endsAt: null, remainingSeconds: 0, isPaused: false },
        activeInterruption: null,
        savedFloorSpeaker: null,
        queues: { sunya: [], aakasmik: [], bishesh: [] },
        interruptions: []
    });

    const [remainingSecs, setRemainingSecs] = useState(0);

    useEffect(() => {
        const handleQueueUpdate = (data) => {
            if (data) {
                setState({
                    activeSpeaker: data.activeSpeaker || null,
                    floorTimer: data.floorTimer || { duration: 0, endsAt: null, remainingSeconds: 0, isPaused: false },
                    activeInterruption: data.activeInterruption || null,
                    savedFloorSpeaker: data.savedFloorSpeaker || null,
                    queues: data.queues || { sunya: [], aakasmik: [], bishesh: [] },
                    interruptions: data.interruptions || []
                });
            }
        };

        socket.on('queueUpdated', handleQueueUpdate);
        socket.emit('requestStateSync');

        return () => socket.off('queueUpdated', handleQueueUpdate);
    }, []);

    // 50ms sub-second polling loop
    useEffect(() => {
        const timer = state.floorTimer || {};
        const { endsAt, isPaused, remainingSeconds } = timer;

        if (isPaused) {
            setRemainingSecs(remainingSeconds || 0);
            return;
        }

        if (!endsAt) {
            setRemainingSecs(0);
            return;
        }

        const updateClock = () => {
            const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
            setRemainingSecs(left);
        };

        updateClock();
        const interval = setInterval(updateClock, 50);

        return () => clearInterval(interval);
    }, [state.floorTimer]);

    const formatClock = (seconds) => {
        const total = Math.max(0, parseInt(seconds || 0, 10));
        const m = String(Math.floor(total / 60)).padStart(2, '0');
        const s = String(total % 60).padStart(2, '0');
        const clockStr = `${m}:${s}`;
        return toDevanagariDigits ? toDevanagariDigits(clockStr) : clockStr;
    };

    const isInterruption = Boolean(state.activeInterruption);
    const speaker = isInterruption ? state.activeInterruption.speaker : state.activeSpeaker;

    const isCritical = remainingSecs <= 30 && remainingSecs > 0;
    const isOneMinuteWarning = remainingSecs <= 60 && remainingSecs > 30;
    const isExpired = remainingSecs <= 0 && Boolean(state.floorTimer?.endsAt);

    const theme = isInterruption || isCritical
        ? { bg: '#fef2f2', border: '#ef4444', text: '#dc2626', badgeBg: '#fee2e2', badgeText: '#b91c1c', borderBadge: '#f87171' }
        : isOneMinuteWarning
        ? { bg: '#fffbeb', border: '#f59e0b', text: '#d97706', badgeBg: '#fef3c7', badgeText: '#b45309', borderBadge: '#fcd34d' }
        : { bg: '#f0fdf4', border: '#22c55e', text: '#166534', badgeBg: '#dcfce7', badgeText: '#166534', borderBadge: '#86efac' };

    const getSafeText = (spk, field) => {
        if (!spk) return '';
        if (getLocalizedText) return getLocalizedText(spk, field);
        return spk[field] || '';
    };

    const sectionConfig = {
        sunya: { name: 'सुन्ने समय', icon: '⏳', color: '#d97706', bg: '#fef3c7' },
        aakasmik: { name: 'आकस्मिक समय', icon: '🚨', color: '#dc2626', bg: '#fee2e2' },
        bishesh: { name: 'विशेष समय', icon: '🌟', color: '#059669', bg: '#d1fae5' }
    };

    const aggregatedQueue = [];
    ['sunya', 'aakasmik', 'bishesh'].forEach(secKey => {
        const list = Array.isArray(state.queues?.[secKey]) ? state.queues[secKey] : [];
        list.forEach(item => {
            aggregatedQueue.push({
                ...item,
                cfg: sectionConfig[secKey] || sectionConfig.sunya
            });
        });
    });

    const interruptionsList = Array.isArray(state.interruptions) ? state.interruptions : [];

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            background: '#090d16',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            boxSizing: 'border-box',
            overflow: 'hidden',
            fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
            <div style={{
                width: '100%',
                maxWidth: '1600px',
                height: '92vh',
                display: 'grid',
                gridTemplateColumns: '1.7fr 1fr',
                gap: '24px',
                boxSizing: 'border-box'
            }}>
                {/* Left Card: Active Rostrum & Giant Timer */}
                <div style={{
                    backgroundColor: theme.bg,
                    border: `8px solid ${theme.border}`,
                    borderRadius: '32px',
                    padding: '36px 32px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    textAlign: 'center',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                    boxSizing: 'border-box',
                    minHeight: 0,
                    transition: 'background-color 0.25s ease, border-color 0.25s ease'
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                            display: 'inline-block',
                            padding: '10px 28px',
                            borderRadius: '9999px',
                            backgroundColor: theme.badgeBg,
                            color: theme.badgeText,
                            border: `2px solid ${theme.borderBadge}`,
                            fontSize: '18px',
                            fontWeight: 900,
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase'
                        }}>
                            {isInterruption
                                ? (t?.interruptionActiveBadge || '🚨 विशेष नियमापत्ति सक्रिय')
                                : (speaker ? (t?.floorSessionActive || 'संसद बैठक सक्रिय') : (t?.noSpeaker || 'हाल कुनै वक्ता छैनन्'))}
                        </span>

                        {/* Preserved Paused Original Speaker Sub-banner */}
                        {isInterruption && state.savedFloorSpeaker?.speaker && (
                            <div style={{
                                background: '#fffbeb',
                                color: '#b45309',
                                border: '1.5px solid #fde68a',
                                padding: '6px 18px',
                                borderRadius: '12px',
                                fontSize: '15px',
                                fontWeight: 800,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                ⏸️ मूल वक्ता रोकिएको: <strong>{getSafeText(state.savedFloorSpeaker.speaker, 'name')}</strong> 
                                (बाँकी समय: {formatClock(state.savedFloorSpeaker.remainingSeconds)})
                            </div>
                        )}
                    </div>

                    <div style={{ width: '100%', padding: '0 16px' }}>
                        {speaker ? (
                            <>
                                <h1 style={{
                                    margin: 0,
                                    fontSize: '68px',
                                    fontWeight: 900,
                                    color: theme.text,
                                    letterSpacing: '-0.02em',
                                    lineHeight: 1.15
                                }}>
                                    {getSafeText(speaker, 'name')}
                                </h1>
                                <h3 style={{
                                    margin: '10px 0 0 0',
                                    fontSize: '24px',
                                    fontWeight: 700,
                                    color: '#475569'
                                }}>
                                    {getSafeText(speaker, 'position')}
                                </h3>

                                {getSafeText(speaker, 'topic') && (
                                    <div style={{
                                        marginTop: '16px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '10px 24px',
                                        borderRadius: '14px',
                                        backgroundColor: '#ffffff',
                                        border: `2px solid ${theme.borderBadge}`,
                                        fontSize: '22px',
                                        fontWeight: 800,
                                        color: '#0f172a',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.04)'
                                    }}>
                                        📌 विषय: {getSafeText(speaker, 'topic')}
                                    </div>
                                )}
                            </>
                        ) : (
                            <h2 style={{ fontSize: '36px', color: '#64748b', fontWeight: 800, margin: 0 }}>
                                {t?.noSpeaker || 'हाल कुनै वक्ता छैनन्'}
                            </h2>
                        )}
                    </div>

                    <div>
                        <div style={{
                            fontSize: '160px',
                            fontWeight: 900,
                            fontFamily: 'monospace',
                            color: isExpired ? '#dc2626' : theme.text,
                            lineHeight: 1,
                            letterSpacing: '-0.03em',
                            transition: 'color 0.25s ease'
                        }}>
                            {isExpired ? (t?.expired || 'समय समाप्त') : formatClock(remainingSecs)}
                        </div>

                        {state.floorTimer?.isPaused && (
                            <div style={{ fontSize: '22px', fontWeight: 900, color: '#d97706', marginTop: '8px' }}>
                                ⏸️ {t?.paused || '(रोकिएको)'}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column: Priority Interruptions + Upcoming Queues */}
                <div style={{ display: 'grid', gridTemplateRows: '1fr 1.6fr', gap: '20px', minHeight: 0 }}>
                    <div style={{
                        background: '#151d2e',
                        border: '1.5px solid #1e293b',
                        borderRadius: '24px',
                        padding: '20px 24px',
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: 0,
                        boxSizing: 'border-box'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <span style={{ fontSize: '15px', fontWeight: 900, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                ⚠️ {t?.interruptionsTitle || 'हस्तक्षेप / नियमापत्ति अनुरोध'}
                            </span>
                            <span style={{
                                background: '#1e293b',
                                color: '#94a3b8',
                                fontSize: '12px',
                                fontWeight: 900,
                                padding: '3px 10px',
                                borderRadius: '9999px'
                            }}>
                                {toDevanagariDigits ? toDevanagariDigits(interruptionsList.length) : interruptionsList.length}
                            </span>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                            {interruptionsList.length === 0 ? (
                                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '13px', fontWeight: 600 }}>
                                    No active point of order requests
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {interruptionsList.map((item, idx) => (
                                        <div key={idx} style={{
                                            background: '#1e293b',
                                            border: '1px solid #334155',
                                            borderRadius: '12px',
                                            padding: '10px 14px',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <div>
                                                <div style={{ fontWeight: 900, color: '#f87171', fontSize: '15px' }}>
                                                    {getSafeText(item, 'name')}
                                                </div>
                                                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                                                    {item.reason} • {toDevanagariDigits(item.uniqueId || '')}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{
                        background: '#151d2e',
                        border: '1.5px solid #1e293b',
                        borderRadius: '24px',
                        padding: '20px 24px',
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: 0,
                        boxSizing: 'border-box'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <span style={{ fontSize: '15px', fontWeight: 900, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                📋 {t?.upcomingQueue || 'आगामी वक्ता सूची'}
                            </span>
                            <span style={{
                                background: '#1e293b',
                                color: '#94a3b8',
                                fontSize: '12px',
                                fontWeight: 900,
                                padding: '3px 10px',
                                borderRadius: '9999px'
                            }}>
                                {toDevanagariDigits ? toDevanagariDigits(aggregatedQueue.length) : aggregatedQueue.length}
                            </span>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                            {aggregatedQueue.length === 0 ? (
                                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '13px', fontWeight: 600 }}>
                                    No members waiting in queue
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {aggregatedQueue.map((item, idx) => (
                                        <div key={idx} style={{
                                            background: '#1e293b',
                                            border: '1.5px solid #334155',
                                            borderRadius: '12px',
                                            padding: '10px 14px',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    <span style={{ fontWeight: 900, fontSize: '15px', color: '#f8fafc' }}>
                                                        #{toDevanagariDigits ? toDevanagariDigits(idx + 1) : idx + 1} {getSafeText(item, 'name')}
                                                    </span>
                                                    <span style={{ background: item.cfg.bg, color: item.cfg.color, fontSize: '11px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>
                                                        {item.cfg.icon} {item.cfg.name}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                                                        {getSafeText(item, 'position')}
                                                    </span>
                                                    {getSafeText(item, 'topic') && (
                                                        <span style={{ background: '#0f172a', color: '#38bdf8', border: '1px solid #1e293b', padding: '1px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                                                            📌 {getSafeText(item, 'topic')}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {item.requestedMinutes && (
                                                <span style={{ background: '#0f172a', border: '1px solid #334155', color: '#cbd5e1', fontSize: '12px', fontWeight: 800, padding: '4px 8px', borderRadius: '6px' }}>
                                                    ⏱️ {toDevanagariDigits ? toDevanagariDigits(item.requestedMinutes) : item.requestedMinutes}m
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}