import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { useLanguage } from '../context/LanguageContext';
import LanguageToggle from './LanguageToggle';
import TimerModal from './TimerModal';
import InterruptionModal from './InterruptionModal';
import MemberDirectoryTab from './MemberDirectoryTab';

export default function HeadConsole() {
    const navigate = useNavigate();
    const { t, toDevanagariDigits, getLocalizedText } = useLanguage();
    const closeTimeoutRef = useRef(null);
    const isExpiringRef = useRef(false);

    // Active Tab state: 'floor', 'directory', 'records'
    const [activeTab, setActiveTab] = useState('floor');

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

    const [speakerStats, setSpeakerStats] = useState([]);
    const [displaySpeaker, setDisplaySpeaker] = useState(null);
    const [remainingSecs, setRemainingSecs] = useState(0);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchSpeakerStats = async () => {
        try {
            const res = await fetch('/api/speaker-stats');
            if (res.ok) {
                const data = await res.json();
                setSpeakerStats(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error('Error loading speaker stats:', err);
        }
    };

    useEffect(() => {
        const token = localStorage.getItem('adminToken');
        if (!token) navigate('/admin/login');
        fetchSpeakerStats();
    }, [navigate]);

    const handleSignOut = async () => {
        try {
            await fetch('/api/logout-clear-session', { method: 'POST' });
        } catch (err) {
            console.error('Failed to purge session on logout:', err);
        } finally {
            localStorage.removeItem('adminToken');
            navigate('/admin/login');
        }
    };

    useEffect(() => {
        return () => {
            if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        };
    }, []);

    useEffect(() => {
        const handleQueueUpdate = (data) => {
            if (data) {
                setState(prev => ({
                    ...prev,
                    ...data,
                    queues: data.queues || { sunya: [], aakasmik: [], bishesh: [] },
                    interruptions: data.interruptions || [],
                    floorTimer: data.floorTimer || { duration: 0, endsAt: null, remainingSeconds: 0, isPaused: false },
                    spokenMembers: data.spokenMembers || { sunya: [], aakasmik: [], bishesh: [] }
                }));

                if (data.activeSpeaker) {
                    setDisplaySpeaker(data.activeSpeaker);
                } else {
                    fetchSpeakerStats();
                }
            }
        };

        socket.on('queueUpdated', handleQueueUpdate);
        socket.on('speakerStatsUpdated', fetchSpeakerStats);

        return () => {
            socket.off('queueUpdated', handleQueueUpdate);
            socket.off('speakerStatsUpdated', fetchSpeakerStats);
        };
    }, []);

    useEffect(() => {
        const timer = state.floorTimer || { duration: 0, endsAt: null, remainingSeconds: 0, isPaused: false };
        const { endsAt, isPaused, remainingSeconds } = timer;
        
        if (isPaused) {
            setRemainingSecs(remainingSeconds || 0);
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
                    fetchSpeakerStats();
                }, 5000);
            }
        }, 250);

        return () => clearInterval(interval);
    }, [state.floorTimer]);

    const handleManualClear = () => {
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        isExpiringRef.current = false;
        socket.emit('clearActive');
        setIsModalOpen(false);
        fetchSpeakerStats();
    };

    const formatClock = (seconds) => {
        const total = Math.max(0, parseInt(seconds || 0, 10));
        const m = String(Math.floor(total / 60)).padStart(2, '0');
        const s = String(total % 60).padStart(2, '0');
        return toDevanagariDigits(`${m}:${s}`);
    };

    const formatDurationReadable = (totalSecs) => {
        const total = Math.max(0, parseInt(totalSecs || 0, 10));
        const m = Math.floor(total / 60);
        const s = total % 60;
        if (m === 0) return `${toDevanagariDigits(s)}s`;
        return `${toDevanagariDigits(m)}m ${toDevanagariDigits(s)}s`;
    };

    const formatRequestedTimeBadge = (item) => {
        const mins = item?.requestedMinutes || 0;
        const secs = item?.requestedSeconds || 0;
        if (mins === 0 && secs === 0) return null;
        if (secs === 0) return `${toDevanagariDigits(mins)}m`;
        return `${toDevanagariDigits(mins)}m ${toDevanagariDigits(secs)}s`;
    };

    // Precise Bikram Sambat Date Converter
    const convertToNumericBSDate = (adDateString) => {
        if (!adDateString) return '--';
        
        const parts = String(adDateString).split(' ')[0].split('-');
        if (parts.length < 3) return '--';
        
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);

        const targetUtc = Date.UTC(year, month, day);
        const refUtc = Date.UTC(2026, 7, 17); // Aug 17, 2026 = 2083 Bhadra 1
        
        const diffDays = Math.round((targetUtc - refUtc) / (1000 * 60 * 60 * 24));
        const monthDays2083 = [31, 31, 32, 31, 31, 30, 30, 29, 30, 29, 30, 30];

        let curYear = 2083;
        let curMonth = 4;
        let curDay = 1;
        let remaining = diffDays;

        if (remaining >= 0) {
            while (remaining > 0) {
                const daysInMonth = monthDays2083[curMonth] || 30;
                const daysLeft = daysInMonth - curDay;

                if (remaining <= daysLeft) {
                    curDay += remaining;
                    remaining = 0;
                } else {
                    remaining -= (daysLeft + 1);
                    curDay = 1;
                    curMonth++;
                    if (curMonth > 11) {
                        curMonth = 0;
                        curYear++;
                    }
                }
            }
        } else {
            while (remaining < 0) {
                if (Math.abs(remaining) < curDay) {
                    curDay += remaining;
                    remaining = 0;
                } else {
                    remaining += curDay;
                    curMonth--;
                    if (curMonth < 0) {
                        curMonth = 11;
                        curYear--;
                    }
                    const daysInMonth = monthDays2083[curMonth] || 30;
                    curDay = daysInMonth;
                }
            }
        }

        const formattedMonth = String(curMonth + 1).padStart(2, '0');
        const formattedDay = String(curDay).padStart(2, '0');

        return toDevanagariDigits(`${curYear}-${formattedMonth}-${formattedDay}`);
    };

    const renderQueueColumn = (sectionKey, title, themeColor, bgBadge) => {
        const rawQueues = state.queues || {};
        const queueList = Array.isArray(rawQueues[sectionKey]) ? rawQueues[sectionKey] : [];

        return (
            <div style={{
                background: '#ffffff',
                borderRadius: '16px',
                border: '1.5px solid #e2e8f0',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                height: '100%',
                minHeight: 0
            }}>
                {/* Column Header */}
                <div style={{
                    padding: '12px 18px',
                    borderBottom: '1.5px solid #f1f5f9',
                    borderTop: `4px solid ${themeColor}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#f8fafc',
                    flexShrink: 0
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 900, fontSize: '15px', color: '#1e293b' }}>{title}</span>
                        <span style={{
                            fontSize: '12px',
                            fontWeight: 900,
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            background: bgBadge,
                            color: themeColor
                        }}>
                            {toDevanagariDigits(queueList.length)}
                        </span>
                    </div>

                    {queueList.length > 0 && (
                        <button
                            onClick={() => socket.emit('clearSectionQueue', sectionKey)}
                            style={{
                                border: 'none',
                                background: 'transparent',
                                color: '#94a3b8',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: 800,
                                padding: '4px 6px'
                            }}
                        >
                            {t?.clear || 'Clear'}
                        </button>
                    )}
                </div>

                {/* Column Items */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '10px 14px',
                    minHeight: 0
                }}>
                    {queueList.length === 0 ? (
                        <div style={{
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#94a3b8',
                            padding: '16px 0'
                        }}>
                            <div style={{ fontSize: '26px', marginBottom: '6px', opacity: 0.6 }}>📭</div>
                            <span style={{ fontSize: '13px', fontWeight: 700 }}>{t?.noMembersMatch || 'No members in queue'}</span>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {queueList.map((item, idx) => {
                                const displayName = getLocalizedText(item, 'name');
                                const displayPosition = getLocalizedText(item, 'position');
                                const displayTopic = getLocalizedText(item, 'topic');

                                return (
                                    <div
                                        key={idx}
                                        style={{
                                            padding: '10px 12px',
                                            borderRadius: '10px',
                                            background: '#f8fafc',
                                            border: '1px solid #e2e8f0',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}
                                    >
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ fontWeight: 900, fontSize: '14px', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    #{toDevanagariDigits(idx + 1)} {displayName}
                                                </span>
                                                {formatRequestedTimeBadge(item) && (
                                                    <span style={{
                                                        background: '#ffffff',
                                                        color: '#475569',
                                                        border: '1px solid #cbd5e1',
                                                        fontSize: '10px',
                                                        fontWeight: 800,
                                                        padding: '1px 5px',
                                                        borderRadius: '4px',
                                                        flexShrink: 0
                                                    }}>
                                                        ⏱️ {formatRequestedTimeBadge(item)}
                                                    </span>
                                                )}
                                            </div>
                                            
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', flexWrap: 'nowrap', overflow: 'hidden' }}>
                                                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                    {displayPosition}
                                                </span>
                                                {displayTopic && (
                                                    <span style={{
                                                        background: '#eff6ff',
                                                        color: '#2563eb',
                                                        border: '1px solid #bfdbfe',
                                                        borderRadius: '4px',
                                                        padding: '1px 6px',
                                                        fontSize: '11px',
                                                        fontWeight: 800,
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        maxWidth: '180px'
                                                    }}>
                                                        📌 {displayTopic}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                            <button
                                                onClick={() => {
                                                    socket.emit('allowQueuedSpeaker', { section: sectionKey, index: idx });
                                                    setIsModalOpen(true);
                                                }}
                                                style={{
                                                    background: '#16a34a',
                                                    color: '#fff',
                                                    border: 'none',
                                                    borderRadius: '6px',
                                                    padding: '6px 10px',
                                                    fontSize: '11px',
                                                    fontWeight: 800,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                ✓ {t?.allow || 'Allow'}
                                            </button>
                                            <button
                                                onClick={() => socket.emit('denyQueuedSpeaker', { section: sectionKey, index: idx })}
                                                style={{
                                                    background: '#fee2e2',
                                                    color: '#dc2626',
                                                    border: 'none',
                                                    borderRadius: '6px',
                                                    padding: '6px 8px',
                                                    fontSize: '11px',
                                                    fontWeight: 800,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Column Action Button */}
                <div style={{ padding: '8px 12px', background: '#f8fafc', borderTop: '1.5px solid #f1f5f9', flexShrink: 0 }}>
                    <button
                        onClick={() => {
                            socket.emit('switchSection', sectionKey);
                            socket.emit('nextSpeaker', sectionKey);
                            setIsModalOpen(true);
                        }}
                        style={{
                            width: '100%',
                            padding: '10px',
                            borderRadius: '8px',
                            background: themeColor,
                            color: '#ffffff',
                            border: 'none',
                            fontWeight: 900,
                            fontSize: '13px',
                            cursor: 'pointer',
                            boxShadow: `0 2px 8px ${themeColor}33`
                        }}
                    >
                        {t?.nextSpeaker || 'Next Speaker'} ({title.split(' ')[0]})
                    </button>
                </div>
            </div>
        );
    };

    const interruptionsList = Array.isArray(state.interruptions) ? state.interruptions : [];

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            overflow: 'hidden',
            background: '#f8fafc',
            padding: '12px 20px',
            color: '#0f172a',
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box'
        }}>
            {/* Header Toolbar */}
            <div style={{
                background: '#ffffff',
                borderRadius: '14px',
                padding: '10px 22px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                border: '1.5px solid #e2e8f0',
                display: 'grid',
                gridTemplateColumns: '1fr auto 1fr',
                alignItems: 'center',
                marginBottom: '10px',
                flexShrink: 0
            }}>
                <div />

                <div style={{ textAlign: 'center' }}>
                    <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>
                        {t?.consoleTitle || 'Presiding Officer Control Console'}
                    </h1>
                    <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                        {t?.consoleSubtitle || 'Legislative Assembly Session Management'}
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <LanguageToggle />
                    <button
                        onClick={handleSignOut}
                        style={{
                            background: '#ffffff',
                            color: '#475569',
                            border: '1.5px solid #cbd5e1',
                            padding: '6px 14px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 800,
                            cursor: 'pointer'
                        }}
                    >
                        {t?.signOut || 'Sign Out'}
                    </button>
                </div>
            </div>

            {/* Navigation Tabs Bar */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexShrink: 0 }}>
                <button
                    onClick={() => setActiveTab('floor')}
                    style={{
                        padding: '8px 18px',
                        borderRadius: '8px',
                        border: activeTab === 'floor' ? 'none' : '1.5px solid #e2e8f0',
                        background: activeTab === 'floor' ? '#2563eb' : '#ffffff',
                        color: activeTab === 'floor' ? '#ffffff' : '#64748b',
                        fontWeight: 800,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: activeTab === 'floor' ? '0 4px 10px rgba(37,99,235,0.25)' : 'none'
                    }}
                >
                    🏛️ {t?.tabConsole || 'Floor Console'}
                </button>

                <button
                    onClick={() => setActiveTab('directory')}
                    style={{
                        padding: '8px 18px',
                        borderRadius: '8px',
                        border: activeTab === 'directory' ? 'none' : '1.5px solid #e2e8f0',
                        background: activeTab === 'directory' ? '#2563eb' : '#ffffff',
                        color: activeTab === 'directory' ? '#ffffff' : '#64748b',
                        fontWeight: 800,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: activeTab === 'directory' ? '0 4px 10px rgba(37,99,235,0.25)' : 'none'
                    }}
                >
                    📇 {t?.tabDirectory || 'Member Directory'}
                </button>

                <button
                    onClick={() => { setActiveTab('records'); fetchSpeakerStats(); }}
                    style={{
                        padding: '8px 18px',
                        borderRadius: '8px',
                        border: activeTab === 'records' ? 'none' : '1.5px solid #e2e8f0',
                        background: activeTab === 'records' ? '#2563eb' : '#ffffff',
                        color: activeTab === 'records' ? '#ffffff' : '#64748b',
                        fontWeight: 800,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: activeTab === 'records' ? '0 4px 10px rgba(37,99,235,0.25)' : 'none'
                    }}
                >
                    📊 {t?.tabAnalytics || 'Speaker Records'}
                </button>
            </div>

            {/* Main Single-Screen Workspace */}
            {activeTab === 'floor' && (
                <div style={{
                    flex: 1,
                    display: 'grid',
                    gridTemplateRows: '165px 1fr',
                    gap: '10px',
                    minHeight: 0
                }}>
                    {/* Top Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px', minHeight: 0 }}>
                        {/* Current Floor Speaker */}
                        <div
                            onClick={() => state.activeSpeaker && setIsModalOpen(true)}
                            style={{
                                background: state.activeSpeaker ? '#f0fdf4' : '#ffffff',
                                borderRadius: '14px',
                                border: state.activeSpeaker ? '2px solid #86efac' : '1.5px solid #e2e8f0',
                                padding: '12px 18px',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                cursor: state.activeSpeaker ? 'pointer' : 'default',
                                minHeight: 0
                            }}
                        >
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                        {t?.currentSpeaker || 'Current Speaker'}
                                    </span>
                                    <span style={{
                                        fontSize: '11px',
                                        fontWeight: 900,
                                        padding: '2px 8px',
                                        borderRadius: '9999px',
                                        background: state.activeSpeaker ? '#dcfce7' : '#f1f5f9',
                                        color: state.activeSpeaker ? '#166534' : '#94a3b8'
                                    }}>
                                        {state.activeSpeaker ? '● ACTIVE ON FLOOR' : 'IDLE'}
                                    </span>
                                </div>

                                {state.activeSpeaker ? (
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#166534' }}>
                                                {getLocalizedText(state.activeSpeaker, 'name')}
                                            </h2>
                                            {formatRequestedTimeBadge(state.activeSpeaker) && (
                                                <span style={{ background: '#dbeafe', color: '#1e40af', fontSize: '11px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>
                                                    ⏱️ {formatRequestedTimeBadge(state.activeSpeaker)}
                                                </span>
                                            )}
                                        </div>
                                        <p style={{ margin: '2px 0', fontSize: '13px', color: '#475569', fontWeight: 600 }}>
                                            {getLocalizedText(state.activeSpeaker, 'position')}
                                        </p>
                                        {getLocalizedText(state.activeSpeaker, 'topic') && (
                                            <div style={{ fontSize: '12px', background: '#ffffff', padding: '3px 8px', borderRadius: '6px', color: '#0f172a', border: '1px solid #bbf7d0', display: 'inline-block', fontWeight: 700 }}>
                                                📌 <strong>{t?.topic || 'Topic'}:</strong> {getLocalizedText(state.activeSpeaker, 'topic')}
                                            </div>
                                        )}

                                        <div style={{
                                            fontSize: '32px',
                                            fontWeight: 900,
                                            fontFamily: 'monospace',
                                            color: remainingSecs <= 60 ? '#b91c1c' : '#166534',
                                            margin: '2px 0 0 0',
                                            lineHeight: 1
                                        }}>
                                            {remainingSecs <= 0 && state.floorTimer?.endsAt ? (t?.expired || 'EXPIRED') : formatClock(remainingSecs)}
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '6px 0' }}>
                                        <div style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 700 }}>{t?.noSpeaker || 'No speaker currently'}</div>
                                        <div style={{ fontSize: '32px', fontWeight: 900, fontFamily: 'monospace', color: '#e2e8f0', marginTop: '2px', lineHeight: 1 }}>
                                            00:00
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }} onClick={(e) => e.stopPropagation()}>
                                <button
                                    onClick={() => {
                                        socket.emit('nextSpeaker', state.activeSection);
                                        setIsModalOpen(true);
                                    }}
                                    style={{
                                        flex: 1,
                                        background: '#16a34a',
                                        color: '#ffffff',
                                        border: 'none',
                                        borderRadius: '8px',
                                        padding: '8px',
                                        fontWeight: 900,
                                        fontSize: '13px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {t?.nextSpeaker || 'Next Speaker'}
                                </button>
                                <button
                                    onClick={handleManualClear}
                                    style={{
                                        background: '#ffffff',
                                        color: '#475569',
                                        border: '1.5px solid #cbd5e1',
                                        borderRadius: '8px',
                                        padding: '8px 14px',
                                        fontWeight: 800,
                                        fontSize: '13px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {t?.clear || 'Clear'}
                                </button>
                            </div>
                        </div>

                        {/* Priority Interruptions */}
                        <div style={{
                            background: interruptionsList.length > 0 ? '#fff5f5' : '#ffffff',
                            borderRadius: '14px',
                            border: interruptionsList.length > 0 ? '2px solid #fca5a5' : '1.5px solid #e2e8f0',
                            padding: '12px 18px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            minHeight: 0
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 900, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                    {t?.interruptionsTitle || 'Interruptions Requested'}
                                </span>
                                <span style={{
                                    fontSize: '11px',
                                    fontWeight: 900,
                                    padding: '2px 8px',
                                    borderRadius: '9999px',
                                    background: interruptionsList.length > 0 ? '#fee2e2' : '#f1f5f9',
                                    color: interruptionsList.length > 0 ? '#b91c1c' : '#94a3b8'
                                }}>
                                    {t?.badgePointOfOrder || 'Point of Order'} ({toDevanagariDigits(interruptionsList.length)})
                                </span>
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                                {interruptionsList.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: '13px', fontWeight: 700 }}>
                                        No active point of order requests
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {interruptionsList.map((item, idx) => (
                                            <div
                                                key={idx}
                                                style={{
                                                    background: '#ffffff',
                                                    border: '1px solid #fecaca',
                                                    borderRadius: '8px',
                                                    padding: '6px 10px',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center'
                                                }}
                                            >
                                                <div>
                                                    <strong style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 800 }}>{getLocalizedText(item, 'name')}</strong>
                                                    <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600 }}>{item.reason}</div>
                                                </div>
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    <button
                                                        onClick={() => socket.emit('allowInterruption', idx)}
                                                        style={{
                                                            background: '#16a34a',
                                                            color: '#fff',
                                                            border: 'none',
                                                            borderRadius: '6px',
                                                            padding: '5px 10px',
                                                            fontSize: '11px',
                                                            fontWeight: 800,
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        {t?.allow || 'Allow'}
                                                    </button>
                                                    <button
                                                        onClick={() => socket.emit('dismissInterruption', idx)}
                                                        style={{
                                                            background: '#fee2e2',
                                                            color: '#dc2626',
                                                            border: 'none',
                                                            borderRadius: '6px',
                                                            padding: '5px 8px',
                                                            fontSize: '11px',
                                                            fontWeight: 800,
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        {t?.dismiss || 'Dismiss'}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Bottom Row */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '10px',
                        minHeight: 0
                    }}>
                        {renderQueueColumn('sunya', `⏳ ${t?.sunyaSamaya || 'Sunya Samaya'}`, '#2563eb', '#eff6ff')}
                        {renderQueueColumn('aakasmik', `🚨 ${t?.aakasmikSamaya || 'Aakasmik Samaya'}`, '#dc2626', '#fef2f2')}
                        {renderQueueColumn('bishesh', `🌟 ${t?.bisheshSamaya || 'Bishesh Samaya'}`, '#7c3aed', '#f5f3ff')}
                    </div>
                </div>
            )}

            {/* TAB 2: DIRECTORY */}
            {activeTab === 'directory' && (
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                    <MemberDirectoryTab />
                </div>
            )}

            {/* TAB 3: SPEAKER RECORDS */}
            {activeTab === 'records' && (
                <div style={{
                    flex: 1,
                    background: '#ffffff',
                    borderRadius: '16px',
                    padding: '16px',
                    border: '1.5px solid #e2e8f0',
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexShrink: 0 }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900 }}>📊 {t?.speakingAnalytics || 'Speaker Records'}</h3>
                            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Complete historical logs</p>
                        </div>
                        <button
                            onClick={fetchSpeakerStats}
                            style={{ padding: '6px 14px', borderRadius: '6px', border: '1.5px solid #cbd5e1', background: '#ffffff', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}
                        >
                            🔄 {t?.refreshRecords || 'Refresh Records'}
                        </button>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: '8px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', color: '#64748b' }}>
                                    <th style={{ padding: '10px 14px' }}>#</th>
                                    <th style={{ padding: '10px 14px' }}>{t?.memberName || 'Member Name'}</th>
                                    <th style={{ padding: '10px 14px' }}>{t?.designation || 'Designation'}</th>
                                    <th style={{ padding: '10px 14px' }}>{t?.totalSpokenTime || 'Total Spoken Time'}</th>
                                    <th style={{ padding: '10px 14px' }}>{t?.turnsTaken || 'Turns Taken'}</th>
                                    <th style={{ padding: '10px 14px' }}>📅 {t?.spokenDate || "Date Spoken (B.S.)"}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {speakerStats.map((row, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '10px 14px', color: '#94a3b8', fontWeight: 800 }}>{toDevanagariDigits(idx + 1)}</td>
                                        <td style={{ padding: '10px 14px', fontWeight: 900, color: '#2563eb' }}>
                                            {getLocalizedText(row, 'name')}
                                        </td>
                                        <td style={{ padding: '10px 14px', color: '#64748b', fontWeight: 600 }}>
                                            {getLocalizedText(row, 'position')}
                                        </td>
                                        <td style={{ padding: '10px 14px', fontWeight: 900, color: '#16a34a' }}>
                                            {formatDurationReadable(row.total_seconds)}
                                        </td>
                                        <td style={{ padding: '10px 14px', fontWeight: 800 }}>{toDevanagariDigits(row.session_count)}</td>
                                        <td style={{ padding: '10px 14px', color: '#0f172a', fontWeight: 900 }}>
                                            {convertToNumericBSDate(row.session_date || row.last_spoken_at)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <TimerModal 
                isOpen={isModalOpen && !state.activeInterruption}
                onClose={() => {
                    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
                    setIsModalOpen(false);
                }}
                activeSpeaker={displaySpeaker}
                remainingSecs={remainingSecs}
                isPaused={Boolean(state.floorTimer?.isPaused)}
                queue={state.queues?.[state.activeSection] || []}
                interruptions={state.interruptions || []}
                onPauseToggle={() => state.floorTimer?.isPaused ? socket.emit('resumeTimer') : socket.emit('pauseTimer')}
                onReset={handleManualClear}
                onNextSpeaker={() => socket.emit('nextSpeaker', state.activeSection)}
                onAllowInterruption={(idx) => socket.emit('allowInterruption', idx)}
                onDismissInterruption={(idx) => socket.emit('dismissInterruption', idx)}
                onSetTime={(payload) => {
                    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
                    isExpiringRef.current = false;
                    socket.emit('setSpeakingTime', payload);
                }}
            />

            <InterruptionModal
                isOpen={Boolean(state.activeInterruption)}
                activeInterruption={state.activeInterruption}
                savedFloorSpeaker={state.savedFloorSpeaker}
                remainingSecs={remainingSecs}
                isPaused={Boolean(state.floorTimer?.isPaused)}
                onFinishInterruption={() => socket.emit('finishInterruption')}
                onPauseToggle={() => state.floorTimer?.isPaused ? socket.emit('resumeTimer') : socket.emit('pauseTimer')}
                onSetTime={(payload) => socket.emit('setSpeakingTime', payload)}
            />
        </div>
    );
}