import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { useLanguage } from '../context/LanguageContext';
import LanguageToggle from './LanguageToggle';

export default function SpeakerDashboard() {
    const navigate = useNavigate();
    const { t, toDevanagariDigits, getLocalizedText } = useLanguage();

    const [speaker, setSpeaker] = useState(null);
    const [state, setState] = useState({
        activeSection: 'sunya',
        queues: { sunya: [], aakasmik: [], bishesh: [] },
        queue: [],
        interruptions: [],
        activeSpeaker: null,
        floorTimer: { duration: 0, endsAt: null, remainingSeconds: 0, isPaused: false },
        savedFloorSpeaker: null,
        activeInterruption: null,
        spokenMembers: { sunya: [], aakasmik: [], bishesh: [] }
    });

    const [selectedCategory, setSelectedCategory] = useState('sunya');
    const [selectedMinutes, setSelectedMinutes] = useState(3);
    const [selectedSeconds, setSelectedSeconds] = useState(0);
    const [aakasmikTopicNe, setAakasmikTopicNe] = useState('');
    const [interruptionReason, setInterruptionReason] = useState('Point of Order');
    const [remainingSecs, setRemainingSecs] = useState(0);
    const [statusMessage, setStatusMessage] = useState('');

    useEffect(() => {
        const stored = localStorage.getItem('currentSpeaker');
        if (!stored) {
            navigate('/login');
            return;
        }
        try {
            const parsed = JSON.parse(stored);
            setSpeaker(parsed);
        } catch (e) {
            navigate('/login');
        }
    }, [navigate]);

    useEffect(() => {
        const handleQueueUpdate = (data) => {
            if (data) {
                setState(prev => ({
                    ...prev,
                    ...data,
                    queues: data.queues || { sunya: [], aakasmik: [], bishesh: [] },
                    interruptions: data.interruptions || [],
                    floorTimer: data.floorTimer || { duration: 0, endsAt: null, remainingSeconds: 0, isPaused: false },
                    savedFloorSpeaker: data.savedFloorSpeaker || null,
                    activeInterruption: data.activeInterruption || null,
                    spokenMembers: data.spokenMembers || { sunya: [], aakasmik: [], bishesh: [] }
                }));
            }
        };

        const handleRejected = (data) => {
            if (data && data.reason) {
                alert(`⚠️ ${data.reason}`);
            }
        };

        socket.on('queueUpdated', handleQueueUpdate);
        socket.on('requestRejected', handleRejected);

        return () => {
            socket.off('queueUpdated', handleQueueUpdate);
            socket.off('requestRejected', handleRejected);
        };
    }, []);

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
            const diffMs = endsAt - Date.now();
            const left = Math.max(0, Math.ceil(diffMs / 1000));
            setRemainingSecs(left);
        };

        updateClock();
        const interval = setInterval(updateClock, 50);

        return () => clearInterval(interval);
    }, [state.floorTimer]);

    const handleSignOut = () => {
        localStorage.removeItem('currentSpeaker');
        navigate('/login');
    };

    const isMatch = (spk1, spk2) => {
        if (!spk1 || !spk2) return false;
        const id1 = String(spk1.uniqueId || spk1.unique_id || '').toLowerCase().trim();
        const id2 = String(spk2.uniqueId || spk2.unique_id || '').toLowerCase().trim();
        if (id1 && id2 && id1 === id2) return true;
        const n1 = String(spk1.name || '').toLowerCase().trim();
        const n2 = String(spk2.name || '').toLowerCase().trim();
        return Boolean(n1 && n2 && n1 === n2);
    };

    const isLockedOut = (section) => {
        if (!speaker) return false;
        const list = state.spokenMembers?.[section] || [];
        const idKey = String(speaker.uniqueId || speaker.unique_id || '').toLowerCase().trim();
        const nameKey = String(speaker.name || '').toLowerCase().trim();
        return (Boolean(idKey) && list.includes(idKey)) || (Boolean(nameKey) && list.includes(nameKey));
    };

    const isFloorActive = state.activeSpeaker && isMatch(state.activeSpeaker, speaker);
    const isInterruptionActive = state.activeInterruption && isMatch(state.activeInterruption.speaker, speaker);
    const isPausedByInterruption = state.savedFloorSpeaker && isMatch(state.savedFloorSpeaker.speaker, speaker);

    const currentQueue = state.queues?.[selectedCategory] || [];
    const queueIndex = currentQueue.findIndex(item => isMatch(item, speaker));
    const isQueued = queueIndex !== -1;
    const isInterruptionRequested = (state.interruptions || []).some(item => isMatch(item, speaker));

    const handleRequestFloor = (e) => {
        e.preventDefault();
        if (!speaker) return;

        if (isLockedOut(selectedCategory)) {
            return alert(t?.aakasmikLimitReached || 'तपाईंले यस स्लटमा बोलिसक्नु भएको छ।');
        }

        const customTopic = (selectedCategory === 'aakasmik' && aakasmikTopicNe.trim())
            ? aakasmikTopicNe.trim()
            : (speaker.topic_ne || speaker.topic || 'आकस्मिक विषय');

        socket.emit('requestFloor', {
            speaker,
            sectionCategory: selectedCategory,
            requestedMinutes: selectedMinutes,
            requestedSeconds: selectedSeconds,
            topic: customTopic,
            topic_ne: customTopic
        });

        setStatusMessage('✅ तपाईंको बोल्ने अनुरोध दर्ता भयो।');
        setTimeout(() => setStatusMessage(''), 4000);
    };

    const handleRaiseInterruption = (e) => {
        e.preventDefault();
        if (!speaker) return;

        if (isLockedOut('aakasmik')) {
            return alert(t?.aakasmikLimitReached || 'तपाईंले आकस्मिक समयमा भाग लिइसक्नु भएको छ।');
        }

        socket.emit('raiseInterruption', {
            speaker,
            reason: interruptionReason
        });

        setStatusMessage('🚨 नियमापत्ति अनुरोध दर्ता भयो।');
        setTimeout(() => setStatusMessage(''), 4000);
    };

    const formatClock = (seconds) => {
        const total = Math.max(0, parseInt(seconds || 0, 10));
        const m = String(Math.floor(total / 60)).padStart(2, '0');
        const s = String(total % 60).padStart(2, '0');
        return toDevanagariDigits(`${m}:${s}`);
    };

    if (!speaker) return null;

    const slots = [
        { key: 'sunya', label: 'सुन्ने समय', enLabel: 'Sunne Samaya', icon: '⏳' },
        { key: 'aakasmik', label: 'आकस्मिक समय', enLabel: 'Aakasmik', icon: '🚨' },
        { key: 'bishesh', label: 'विशेष समय', enLabel: 'Bishesh', icon: '🌟' }
    ];

    const activeTopicDisplay = state.activeSpeaker?.topic_ne || state.activeSpeaker?.topic || speaker?.topic_ne || speaker?.topic;

    const getMobileTimerColor = () => {
        if (remainingSecs <= 30 && remainingSecs > 0) return '#dc2626';
        if (remainingSecs <= 60 && remainingSecs > 30) return '#d97706';
        return '#166534';
    };

    return (
        <div style={{
            minHeight: '100vh',
            width: '100%',
            maxWidth: '100vw',
            background: '#f8fafc',
            color: '#0f172a',
            padding: '12px',
            margin: '0 auto',
            boxSizing: 'border-box',
            overflowX: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
            {/* Header */}
            <div style={{
                background: '#ffffff',
                borderRadius: '14px',
                padding: '12px 14px',
                border: '1.5px solid #e2e8f0',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                boxSizing: 'border-box'
            }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                    <h2 style={{
                        margin: 0,
                        fontSize: '16px',
                        fontWeight: 900,
                        color: '#0f172a',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                    }}>
                        {getLocalizedText(speaker, 'name')}
                    </h2>
                    <span style={{
                        fontSize: '11px',
                        color: '#64748b',
                        fontWeight: 700,
                        display: 'block',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                    }}>
                        {getLocalizedText(speaker, 'position')} • {toDevanagariDigits(speaker.uniqueId || speaker.unique_id || '')}
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                    <LanguageToggle />
                    <button
                        onClick={handleSignOut}
                        style={{
                            background: '#fee2e2',
                            color: '#dc2626',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            fontSize: '11px',
                            fontWeight: 800,
                            cursor: 'pointer'
                        }}
                    >
                        {t?.signOut || 'Sign Out'}
                    </button>
                </div>
            </div>

            {/* Paused by Priority Interruption Card */}
            {isPausedByInterruption && (
                <div style={{
                    background: '#fffbeb',
                    border: '2.5px solid #f59e0b',
                    borderRadius: '16px',
                    padding: '20px 12px',
                    textAlign: 'center',
                    boxShadow: '0 4px 16px rgba(245, 158, 11, 0.15)',
                    width: '100%',
                    boxSizing: 'border-box'
                }}>
                    <span style={{
                        background: '#fef3c7',
                        color: '#b45309',
                        fontSize: '11px',
                        fontWeight: 900,
                        padding: '4px 12px',
                        borderRadius: '9999px'
                    }}>
                        ⏸️ नियमापत्तिका कारण तपाईंको समय अस्थायी रोकिएको छ
                    </span>
                    <div style={{ fontSize: '56px', fontWeight: 900, fontFamily: 'monospace', color: '#b45309', margin: '10px 0', lineHeight: 1 }}>
                        {formatClock(state.savedFloorSpeaker.remainingSeconds)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#92400e', fontWeight: 800 }}>
                        सदनको नियमापत्ति समाप्त हुनासाथ तपाईंको बाँकी समय पुनः सुरु हुनेछ।
                    </div>
                </div>
            )}

            {/* Active Floor Speaker Card */}
            {isFloorActive && !isPausedByInterruption && (
                <div style={{
                    background: remainingSecs <= 30 ? '#fef2f2' : (remainingSecs <= 60 ? '#fffbeb' : '#f0fdf4'),
                    border: `2.5px solid ${remainingSecs <= 30 ? '#f87171' : (remainingSecs <= 60 ? '#f59e0b' : '#86efac')}`,
                    borderRadius: '16px',
                    padding: '20px 12px',
                    textAlign: 'center',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                    width: '100%',
                    boxSizing: 'border-box'
                }}>
                    <span style={{
                        background: remainingSecs <= 30 ? '#fee2e2' : (remainingSecs <= 60 ? '#fef3c7' : '#dcfce7'),
                        color: remainingSecs <= 30 ? '#dc2626' : (remainingSecs <= 60 ? '#b45309' : '#166534'),
                        fontSize: '11px',
                        fontWeight: 900,
                        padding: '4px 12px',
                        borderRadius: '9999px'
                    }}>
                        🎤 {t?.youHaveTheFloor || 'तपाईंको बोल्ने पालो आएको छ'}
                    </span>
                    <div style={{ fontSize: '56px', fontWeight: 900, fontFamily: 'monospace', color: getMobileTimerColor(), margin: '10px 0', lineHeight: 1 }}>
                        {formatClock(remainingSecs)}
                    </div>
                    {activeTopicDisplay && (
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', background: '#ffffff', padding: '4px 10px', borderRadius: '8px', display: 'inline-block', border: '1px solid #cbd5e1', maxWidth: '90%', wordBreak: 'break-word' }}>
                            📌 {activeTopicDisplay}
                        </div>
                    )}
                </div>
            )}

            {/* Priority Interrupter Active Card */}
            {isInterruptionActive && (
                <div style={{
                    background: '#fff5f5',
                    border: '2.5px solid #fca5a5',
                    borderRadius: '16px',
                    padding: '20px 12px',
                    textAlign: 'center',
                    boxShadow: '0 4px 16px rgba(220,38,38,0.15)',
                    width: '100%',
                    boxSizing: 'border-box'
                }}>
                    <span style={{ background: '#fee2e2', color: '#b91c1c', fontSize: '11px', fontWeight: 900, padding: '4px 12px', borderRadius: '9999px' }}>
                        🚨 {t?.interruptionActiveBadge || 'विशेष नियमापत्ति / हस्तक्षेप सक्रिय'}
                    </span>
                    <div style={{ fontSize: '56px', fontWeight: 900, fontFamily: 'monospace', color: '#dc2626', margin: '10px 0', lineHeight: 1 }}>
                        {formatClock(remainingSecs)}
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: '#991b1b' }}>
                        {state.activeInterruption?.reason || 'Point of Order'}
                    </div>
                </div>
            )}

            {/* Queue Position */}
            {isQueued && !isFloorActive && !isPausedByInterruption && (
                <div style={{
                    background: '#eff6ff',
                    border: '1.5px solid #bfdbfe',
                    borderRadius: '14px',
                    padding: '14px',
                    textAlign: 'center',
                    width: '100%',
                    boxSizing: 'border-box'
                }}>
                    <span style={{ color: '#1d4ed8', fontSize: '11px', fontWeight: 900 }}>
                        ⏳ {t?.inQueueForFloor || 'पालो सूचीमा दर्ता भएको छ'}
                    </span>
                    <h3 style={{ margin: '4px 0 0 0', fontSize: '18px', fontWeight: 900, color: '#1e40af' }}>
                        {t?.positionInLine || 'पालो क्रम'}: #{toDevanagariDigits(queueIndex + 1)}
                    </h3>
                </div>
            )}

            {statusMessage && (
                <div style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '10px', borderRadius: '8px', textAlign: 'center', fontSize: '12px', fontWeight: 800 }}>
                    {statusMessage}
                </div>
            )}

            {/* Request Floor Card */}
            <div style={{
                background: '#ffffff',
                borderRadius: '16px',
                border: '1.5px solid #e2e8f0',
                padding: '16px 14px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                width: '100%',
                boxSizing: 'border-box'
            }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>
                    🙋 {t?.requestFloor || 'बोल्नको लागि पालो माग्नुहोस्'}
                </h3>

                <form onSubmit={handleRequestFloor}>
                    <div style={{ marginBottom: '14px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
                            {t?.selectSessionCategory || 'संसदको समय स्लट छान्नुहोस्'}
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', width: '100%', boxSizing: 'border-box' }}>
                            {slots.map(cat => {
                                const locked = isLockedOut(cat.key);
                                const isSelected = selectedCategory === cat.key;
                                return (
                                    <button
                                        key={cat.key}
                                        type="button"
                                        disabled={locked}
                                        onClick={() => setSelectedCategory(cat.key)}
                                        style={{
                                            padding: '8px 4px',
                                            borderRadius: '8px',
                                            border: isSelected ? '2px solid #2563eb' : '1px solid #cbd5e1',
                                            background: isSelected ? '#eff6ff' : (locked ? '#f1f5f9' : '#ffffff'),
                                            color: locked ? '#94a3b8' : (isSelected ? '#1d4ed8' : '#334155'),
                                            fontWeight: 800,
                                            fontSize: '11px',
                                            cursor: locked ? 'not-allowed' : 'pointer',
                                            textAlign: 'center',
                                            boxSizing: 'border-box',
                                            minWidth: 0
                                        }}
                                    >
                                        <div style={{ fontSize: '16px' }}>{cat.icon}</div>
                                        <div style={{ marginTop: '2px', lineHeight: 1.1, wordBreak: 'break-word', fontSize: '11px' }}>
                                            {cat.label}
                                        </div>
                                        {locked && <span style={{ fontSize: '9px', color: '#dc2626', display: 'block', marginTop: '2px' }}>बोलिसकेको</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {selectedCategory === 'aakasmik' && (
                        <div style={{
                            marginBottom: '14px',
                            background: '#fef2f2',
                            border: '1.5px solid #fecaca',
                            borderRadius: '10px',
                            padding: '10px 12px'
                        }}>
                            <label style={{
                                fontSize: '12px',
                                fontWeight: 900,
                                color: '#991b1b',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                marginBottom: '6px'
                            }}>
                                ✍️ आकस्मिक वक्तव्य विषय (नेपालीमा प्रविष्ट गर्नुहोस्):
                            </label>
                            <input
                                type="text"
                                value={aakasmikTopicNe}
                                onChange={(e) => setAakasmikTopicNe(e.target.value)}
                                placeholder="उदा. बाढी पहिरोको क्षति र उद्धार सम्बन्धमा..."
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    borderRadius: '8px',
                                    border: '1.5px solid #f87171',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    color: '#0f172a',
                                    background: '#ffffff',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>
                    )}

                    <div style={{ marginBottom: '14px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
                            {t?.requestedTime || 'माग गरिएको समय'}
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', width: '100%', boxSizing: 'border-box' }}>
                            {[1, 3, 5].map(mins => (
                                <button
                                    key={mins}
                                    type="button"
                                    onClick={() => { setSelectedMinutes(mins); setSelectedSeconds(0); }}
                                    style={{
                                        padding: '10px 4px',
                                        borderRadius: '8px',
                                        border: (selectedMinutes === mins && selectedSeconds === 0) ? '2px solid #16a34a' : '1px solid #cbd5e1',
                                        background: (selectedMinutes === mins && selectedSeconds === 0) ? '#f0fdf4' : '#ffffff',
                                        color: (selectedMinutes === mins && selectedSeconds === 0) ? '#15803d' : '#334155',
                                        fontWeight: 900,
                                        fontSize: '13px',
                                        cursor: 'pointer',
                                        boxSizing: 'border-box'
                                    }}
                                >
                                    {toDevanagariDigits(mins)} {t?.minutesLabel || 'मिनेट'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLockedOut(selectedCategory) || isQueued || isFloorActive}
                        style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '10px',
                            border: 'none',
                            background: (isLockedOut(selectedCategory) || isQueued || isFloorActive) ? '#cbd5e1' : '#2563eb',
                            color: '#ffffff',
                            fontWeight: 900,
                            fontSize: '14px',
                            cursor: (isLockedOut(selectedCategory) || isQueued || isFloorActive) ? 'not-allowed' : 'pointer',
                            boxSizing: 'border-box'
                        }}
                    >
                        {isQueued ? `✓ ${t?.inQueueForFloor || 'पालोमा दर्ता भइसकेको'}` : (t?.requestFloor || 'बोल्नको लागि पालो माग्नुहोस्')}
                    </button>
                </form>
            </div>

            {/* Interruption Card */}
            <div style={{
                background: '#ffffff',
                borderRadius: '16px',
                border: '1.5px solid #fee2e2',
                padding: '16px 14px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                width: '100%',
                boxSizing: 'border-box'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 900, color: '#dc2626' }}>
                        🚨 {t?.raiseInterruption || 'नियमापत्ति दर्ता गर्नुहोस्'}
                    </h3>
                    <span style={{ fontSize: '10px', fontWeight: 800, background: '#fee2e2', color: '#b91c1c', padding: '2px 6px', borderRadius: '4px' }}>
                        १ मिनेट सीमा
                    </span>
                </div>

                <form onSubmit={handleRaiseInterruption}>
                    <div style={{ marginBottom: '12px' }}>
                        <select
                            value={interruptionReason}
                            onChange={(e) => setInterruptionReason(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '10px 8px',
                                borderRadius: '8px',
                                border: '1.5px solid #fca5a5',
                                fontSize: '12px',
                                fontWeight: 700,
                                background: '#ffffff',
                                color: '#991b1b',
                                boxSizing: 'border-box'
                            }}
                        >
                            <option value="Point of Order">⚠️ {t?.pointOfOrder || 'नियमापत्ति (Point of Order)'}</option>
                            <option value="Direct Rebuttal / Argument">⚡ {t?.directRebuttal || 'प्रत्यक्ष खण्डन / प्रतिवाद'}</option>
                            <option value="Point of Information">ℹ️ {t?.pointOfInfo || 'जानकारीको विषय (Point of Information)'}</option>
                        </select>
                    </div>

                    <button
                        type="submit"
                        disabled={isLockedOut('aakasmik') || isInterruptionRequested || isInterruptionActive}
                        style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '10px',
                            border: 'none',
                            background: (isLockedOut('aakasmik') || isInterruptionRequested || isInterruptionActive) ? '#cbd5e1' : '#dc2626',
                            color: '#ffffff',
                            fontWeight: 900,
                            fontSize: '13px',
                            cursor: (isLockedOut('aakasmik') || isInterruptionRequested || isInterruptionActive) ? 'not-allowed' : 'pointer',
                            boxSizing: 'border-box'
                        }}
                    >
                        {isInterruptionRequested ? '🚨 नियमापत्ति स्वीकृतिको प्रतीक्षामा' : (t?.raiseInterruption || 'नियमापत्ति दर्ता गर्नुहोस्')}
                    </button>
                </form>
            </div>
        </div>
    );
}