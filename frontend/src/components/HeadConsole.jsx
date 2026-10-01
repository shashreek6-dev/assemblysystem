import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket, getEstimatedServerNow } from '../socket';
import { useLanguage } from '../context/LanguageContext';
import LanguageToggle from './LanguageToggle';
import MemberDirectoryTab from './MemberDirectoryTab';

export default function HeadConsole() {
    const navigate = useNavigate();
    const { t, toDevanagariDigits, getLocalizedText } = useLanguage();

    const [activeTab, setActiveTab] = useState('floor');

    const [state, setState] = useState({
        activeSection: 'sunya',
        queues: { sunya: [], aakasmik: [], bishesh: [] },
        interruptions: [],
        activeSpeaker: null,
        floorTimer: { duration: 0, endsAt: null, remainingSeconds: 0, isPaused: false },
        savedFloorSpeaker: null,
        activeInterruption: null
    });

    const [remainingSecs, setRemainingSecs] = useState(0);
    const [customMins, setCustomMins] = useState('');
    const [customSecs, setCustomSecs] = useState('');

    const [searchSunya, setSearchSunya] = useState('');
    const [searchAakasmik, setSearchAakasmik] = useState('');
    const [searchBishesh, setSearchBishesh] = useState('');

    const [speakerStats, setSpeakerStats] = useState([]);
    const [statsLoading, setStatsLoading] = useState(false);
    const [searchStats, setSearchStats] = useState('');

    const getApiBase = () => {
        if (typeof window === 'undefined') return 'http://localhost:3000';
        const host = window.location.hostname;
        if (host.includes('devtunnels.ms')) {
            return window.location.origin.replace('-5173.', '-3000.');
        }
        return `http://${host}:3000`;
    };

    const fetchSpeakerStats = useCallback(async () => {
        setStatsLoading(true);
        try {
            const res = await fetch(`${getApiBase()}/api/speaker-stats`);
            if (res.ok) {
                const data = await res.json();
                setSpeakerStats(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error('Error fetching speaker stats:', err);
        } finally {
            setStatsLoading(false);
        }
    }, []);

    useEffect(() => {
        const handleQueueUpdate = (data) => {
            if (data) {
                setState({
                    activeSection: data.activeSection || 'sunya',
                    queues: data.queues || { sunya: [], aakasmik: [], bishesh: [] },
                    interruptions: data.interruptions || [],
                    activeSpeaker: data.activeSpeaker || null,
                    floorTimer: data.floorTimer || { duration: 0, endsAt: null, remainingSeconds: 0, isPaused: false },
                    savedFloorSpeaker: data.savedFloorSpeaker || null,
                    activeInterruption: data.activeInterruption || null
                });
            }
        };

        socket.on('queueUpdated', handleQueueUpdate);
        socket.on('speakerStatsUpdated', fetchSpeakerStats);
        socket.emit('requestStateSync');

        return () => {
            socket.off('queueUpdated', handleQueueUpdate);
            socket.off('speakerStatsUpdated', fetchSpeakerStats);
        };
    }, [fetchSpeakerStats]);

    useEffect(() => {
        if (activeTab === 'records') {
            fetchSpeakerStats();
        }
    }, [activeTab, fetchSpeakerStats]);

    // Synchronized countdown using server-compensated timestamp
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
            const serverNow = getEstimatedServerNow();
            const diffMs = endsAt - serverNow;
            const left = Math.max(0, Math.ceil(diffMs / 1000));
            setRemainingSecs(left);
        };

        updateClock();
        const interval = setInterval(updateClock, 100);

        return () => clearInterval(interval);
    }, [state.floorTimer]);

    const formatClock = (seconds) => {
        const total = Math.max(0, parseInt(seconds || 0, 10));
        const m = String(Math.floor(total / 60)).padStart(2, '0');
        const s = String(total % 60).padStart(2, '0');
        return toDevanagariDigits(`${m}:${s}`);
    };

    const formatDuration = (totalSeconds) => {
        const mins = Math.floor((totalSeconds || 0) / 60);
        const secs = (totalSeconds || 0) % 60;
        return `${toDevanagariDigits(mins)}m ${toDevanagariDigits(secs)}s`;
    };

    const handleSignOut = async () => {
        try {
            await fetch(`${getApiBase()}/api/logout-clear-session`, { method: 'POST' });
        } catch (e) {
            console.error('Logout error:', e);
        }
        localStorage.removeItem('headToken');
        navigate('/head-login');
    };

    const handleNextSpeaker = (section) => {
        socket.emit('nextSpeaker', section);
    };

    const handleAllowQueued = (section, index) => {
        socket.emit('allowQueuedSpeaker', { section, index });
    };

    const handleDenyQueued = (section, index) => {
        socket.emit('denyQueuedSpeaker', { section, index });
    };

    const handleAllowInterruption = (index) => {
        socket.emit('allowInterruption', index);
    };

    const handleDismissInterruption = (index) => {
        socket.emit('dismissInterruption', index);
    };

    const handlePauseResume = () => {
        if (state.floorTimer.isPaused) {
            socket.emit('resumeTimer');
        } else {
            socket.emit('pauseTimer');
        }
    };

    const handleResetTimer = () => {
        socket.emit('resetTimer');
    };

    const handleSetTime = (minutes, seconds = 0) => {
        socket.emit('setSpeakingTime', { minutes, seconds });
    };

    const handleCustomTimeSubmit = (e) => {
        e.preventDefault();
        const m = parseInt(customMins || 0, 10);
        const s = parseInt(customSecs || 0, 10);
        if (m > 0 || s > 0) {
            handleSetTime(m, s);
            setCustomMins('');
            setCustomSecs('');
        }
    };

    const filterQueue = (list, query) => {
        const q = (query || '').toLowerCase().trim();
        if (!q) return list || [];
        return (list || []).filter(item => {
            const nameMatch = item.name && item.name.toLowerCase().includes(q);
            const nameNeMatch = item.name_ne && item.name_ne.includes(q);
            const idMatch = (item.uniqueId || item.unique_id) && String(item.uniqueId || item.unique_id).toLowerCase().includes(q);
            const topicMatch = item.topic && item.topic.toLowerCase().includes(q);
            return nameMatch || nameNeMatch || idMatch || topicMatch;
        });
    };

    const qSunya = filterQueue(state.queues?.sunya, searchSunya);
    const qAakasmik = filterQueue(state.queues?.aakasmik, searchAakasmik);
    const qBishesh = filterQueue(state.queues?.bishesh, searchBishesh);

    const filteredStats = speakerStats.filter(s => {
        const q = (searchStats || '').toLowerCase().trim();
        if (!q) return true;
        return (s.name && s.name.toLowerCase().includes(q)) || (s.position && s.position.toLowerCase().includes(q));
    });

    const isInterruption = Boolean(state.activeInterruption);
    const activeSpk = isInterruption ? state.activeInterruption.speaker : state.activeSpeaker;

    return (
        <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px 20px', color: '#0f172a', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            {/* Top Navigation Bar with Integrated Tabs */}
            <div style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '16px 24px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                border: '1.5px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px'
            }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button
                        onClick={() => setActiveTab('floor')}
                        style={{
                            background: activeTab === 'floor' ? '#0f172a' : '#ffffff',
                            color: activeTab === 'floor' ? '#ffffff' : '#475569',
                            border: activeTab === 'floor' ? 'none' : '1.5px solid #e2e8f0',
                            borderRadius: '8px',
                            padding: '10px 18px',
                            fontWeight: 900,
                            fontSize: '13px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        🏛️ {t?.tabFloorConsole || 'Floor Console'}
                    </button>
                    <button
                        onClick={() => setActiveTab('directory')}
                        style={{
                            background: activeTab === 'directory' ? '#0f172a' : '#ffffff',
                            color: activeTab === 'directory' ? '#ffffff' : '#475569',
                            border: activeTab === 'directory' ? 'none' : '1.5px solid #e2e8f0',
                            borderRadius: '8px',
                            padding: '10px 18px',
                            fontWeight: 800,
                            fontSize: '13px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        📇 {t?.tabDirectory || 'Member Directory'}
                    </button>
                    <button
                        onClick={() => setActiveTab('records')}
                        style={{
                            background: activeTab === 'records' ? '#0f172a' : '#ffffff',
                            color: activeTab === 'records' ? '#ffffff' : '#475569',
                            border: activeTab === 'records' ? 'none' : '1.5px solid #e2e8f0',
                            borderRadius: '8px',
                            padding: '10px 18px',
                            fontWeight: 800,
                            fontSize: '13px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        📊 {t?.speakerRecords || 'Speaker Records'}
                    </button>
                </div>

                <div style={{ textAlign: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>
                        {t?.presidingTitle || 'Presiding Officer Control Console'}
                    </h2>
                    <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                        {t?.presidingSubtitle || 'Legislative Assembly Session & Floor Management System'}
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <a
                        href="/display"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            background: '#2563eb',
                            color: '#ffffff',
                            textDecoration: 'none',
                            fontSize: '13px',
                            fontWeight: 900,
                            padding: '8px 14px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        🖥️ {t?.openHallScreen || 'Display'} ↗
                    </a>
                    <LanguageToggle />
                    <button
                        onClick={handleSignOut}
                        style={{
                            background: '#fee2e2',
                            color: '#dc2626',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 16px',
                            fontWeight: 800,
                            fontSize: '13px',
                            cursor: 'pointer'
                        }}
                    >
                        {t?.signOut || 'Sign Out'}
                    </button>
                </div>
            </div>

            {/* TAB 1: FLOOR CONSOLE */}
            {activeTab === 'floor' && (
                <>
                    {/* Active Interruption Alert Banner */}
                    {isInterruption && (
                        <div style={{
                            background: '#fff5f5',
                            border: '2px solid #f87171',
                            borderRadius: '14px',
                            padding: '14px 20px',
                            marginBottom: '16px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            boxShadow: '0 4px 12px rgba(220, 38, 38, 0.1)'
                        }}>
                            <div>
                                <div style={{ fontWeight: 900, color: '#dc2626', fontSize: '16px' }}>
                                    🚨 नियमापत्ति वक्ता: {getLocalizedText(state.activeInterruption.speaker, 'name')}
                                </div>
                                {state.savedFloorSpeaker?.speaker && (
                                    <div style={{ fontSize: '13px', color: '#7f1d1d', marginTop: '2px', fontWeight: 700 }}>
                                        ⏸️ रोकिएका मूल वक्ता: {getLocalizedText(state.savedFloorSpeaker.speaker, 'name')} (बाँकी समय: {formatClock(state.savedFloorSpeaker.remainingSeconds)})
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={() => socket.emit('finishInterruption')}
                                style={{
                                    background: '#dc2626',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '10px 18px',
                                    fontWeight: 900,
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 8px rgba(220, 38, 38, 0.3)'
                                }}
                            >
                                🛑 नियमापत्ति समाप्त गर्नुहोस् (Resume)
                            </button>
                        </div>
                    )}

                    {/* Active Floor Speaker & Interruptions Requested 2-Card Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', marginBottom: '20px' }}>
                        {/* Left: Active Floor Speaker */}
                        <div style={{
                            background: '#ffffff',
                            border: '1.5px solid #e2e8f0',
                            borderRadius: '16px',
                            padding: '20px 24px',
                            minHeight: '140px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                        }}>
                            <div>
                                <span style={{ background: '#f1f5f9', color: '#475569', fontSize: '11px', fontWeight: 800, padding: '3px 10px', borderRadius: '9999px' }}>
                                    {activeSpk ? (isInterruption ? '🚨 INTERRUPTION ACTIVE' : 'ACTIVE FLOOR SPEAKER') : (t?.noSpeaker || 'No speaker currently')}
                                </span>

                                {activeSpk ? (
                                    <div style={{ marginTop: '12px' }}>
                                        <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 900, color: '#0f172a' }}>
                                            {getLocalizedText(activeSpk, 'name')}
                                        </h2>
                                        <div style={{ fontSize: '14px', color: '#64748b', marginTop: '2px', fontWeight: 700 }}>
                                            {getLocalizedText(activeSpk, 'position')} • {toDevanagariDigits(activeSpk.uniqueId || activeSpk.unique_id || '')}
                                        </div>
                                        {getLocalizedText(activeSpk, 'topic') && (
                                            <div style={{ marginTop: '6px', fontSize: '13px', color: '#0284c7', fontWeight: 800 }}>
                                                📌 विषय: {getLocalizedText(activeSpk, 'topic')}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ margin: 'auto 0', color: '#94a3b8', fontWeight: 700, fontSize: '16px', paddingTop: '16px' }}>
                                        {t?.noSpeaker || 'No speaker currently'}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right: Priority Interruptions Requested */}
                        <div style={{
                            background: '#ffffff',
                            border: '1.5px solid #e2e8f0',
                            borderRadius: '16px',
                            padding: '20px 24px',
                            minHeight: '140px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span style={{ fontSize: '14px', fontWeight: 900, color: '#dc2626', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    🚨 {t?.interruptionsTitle || 'Interruptions Requested'}
                                </span>
                                <span style={{ background: '#fee2e2', color: '#b91c1c', fontSize: '12px', fontWeight: 900, padding: '2px 8px', borderRadius: '9999px' }}>
                                    {toDevanagariDigits(state.interruptions?.length || 0)}
                                </span>
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                {(!state.interruptions || state.interruptions.length === 0) ? (
                                    <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '13px', fontWeight: 600 }}>
                                        No pending interruption requests
                                    </div>
                                ) : (
                                    state.interruptions.map((item, idx) => (
                                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff5f5', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px 12px', marginBottom: '6px' }}>
                                            <div>
                                                <div style={{ fontWeight: 900, color: '#991b1b', fontSize: '14px' }}>{getLocalizedText(item, 'name')}</div>
                                                <div style={{ fontSize: '11px', color: '#b91c1c' }}>{item.reason}</div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                <button onClick={() => handleAllowInterruption(idx)} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: 900, cursor: 'pointer' }}>🎤 Allow</button>
                                                <button onClick={() => handleDismissInterruption(idx)} style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>✕</button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Middle Timer & Direct Adjust Bar */}
                    <div style={{
                        background: '#ffffff',
                        border: '1.5px solid #e2e8f0',
                        borderRadius: '16px',
                        padding: '16px 24px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '20px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{
                                fontSize: '44px',
                                fontWeight: 900,
                                fontFamily: 'monospace',
                                color: remainingSecs <= 30 && remainingSecs > 0 ? '#dc2626' : (remainingSecs <= 60 && remainingSecs > 30 ? '#d97706' : '#0f172a'),
                                lineHeight: 1
                            }}>
                                {formatClock(remainingSecs)}
                            </div>

                            <button
                                onClick={handlePauseResume}
                                style={{
                                    background: '#16a34a',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '10px 16px',
                                    fontWeight: 900,
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                {state.floorTimer.isPaused ? '▶ Resume' : '⏸ Pause'}
                            </button>

                            <button
                                onClick={handleResetTimer}
                                style={{
                                    background: '#fee2e2',
                                    color: '#dc2626',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '10px 16px',
                                    fontWeight: 900,
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                🔄 Reset
                            </button>
                        </div>

                        {/* Preset Time Buttons & Custom M / S Input */}
                        <form onSubmit={handleCustomTimeSubmit} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button type="button" onClick={() => handleSetTime(1)} style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '8px', padding: '10px 14px', fontWeight: 800, fontSize: '13px', cursor: 'pointer', color: '#0f172a' }}>
                                ⏱️ {toDevanagariDigits(1)} {t?.minutesLabel || 'Minutes'}
                            </button>
                            <button type="button" onClick={() => handleSetTime(3)} style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '8px', padding: '10px 14px', fontWeight: 800, fontSize: '13px', cursor: 'pointer', color: '#0f172a' }}>
                                ⏱️ {toDevanagariDigits(3)} {t?.minutesLabel || 'Minutes'}
                            </button>
                            <button type="button" onClick={() => handleSetTime(5)} style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '8px', padding: '10px 14px', fontWeight: 800, fontSize: '13px', cursor: 'pointer', color: '#0f172a' }}>
                                ⏱️ {toDevanagariDigits(5)} {t?.minutesLabel || 'Minutes'}
                            </button>

                            <input
                                type="number"
                                min="0"
                                placeholder="M"
                                value={customMins}
                                onChange={(e) => setCustomMins(e.target.value)}
                                style={{ width: '46px', padding: '9px', textAlign: 'center', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontWeight: 800, fontSize: '13px' }}
                            />
                            <input
                                type="number"
                                min="0"
                                max="59"
                                placeholder="S"
                                value={customSecs}
                                onChange={(e) => setCustomSecs(e.target.value)}
                                style={{ width: '46px', padding: '9px', textAlign: 'center', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontWeight: 800, fontSize: '13px' }}
                            />
                            <button
                                type="submit"
                                style={{
                                    background: '#0284c7',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '10px 16px',
                                    fontWeight: 900,
                                    fontSize: '13px',
                                    cursor: 'pointer'
                                }}
                            >
                                Set
                            </button>
                        </form>
                    </div>

                    {/* THREE EXTENDED SESSION QUEUE COLUMNS */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                        {/* 1. सुन्ने समय (Sunne Samaya) */}
                        <div style={{
                            background: '#fffdf5',
                            border: '2.5px solid #f59e0b',
                            borderRadius: '20px',
                            height: '480px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            padding: '18px',
                            boxSizing: 'border-box'
                        }}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <span style={{ fontSize: '16px', fontWeight: 900, color: '#d97706', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        ⏳ {t?.sunyaSamaya || 'Sunne Samaya (Listening Time)'}
                                    </span>
                                    <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', fontSize: '12px', fontWeight: 900, padding: '2px 10px', borderRadius: '9999px' }}>
                                        {toDevanagariDigits(state.queues?.sunya?.length || 0)}
                                    </span>
                                </div>

                                <input
                                    type="text"
                                    value={searchSunya}
                                    onChange={(e) => setSearchSunya(e.target.value)}
                                    placeholder="🔍 खोज्नुहोस् (नाम वा ID)..."
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        border: '1.5px solid #fde68a',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        background: '#ffffff',
                                        boxSizing: 'border-box',
                                        marginBottom: '12px'
                                    }}
                                />
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0 }}>
                                {qSunya.length === 0 ? (
                                    <div style={{ margin: 'auto', textAlign: 'center', color: '#b45309', opacity: 0.6, fontSize: '13px', fontWeight: 700 }}>
                                        <div style={{ fontSize: '32px', marginBottom: '4px' }}>📬</div>
                                        {searchSunya ? 'कुनै सदस्य भेटिएन' : 'कुनै सदस्य पालोमा छैनन्'}
                                    </div>
                                ) : (
                                    qSunya.map((item, idx) => {
                                        const realIdx = state.queues.sunya.findIndex(s => (s.uniqueId || s.unique_id) === (item.uniqueId || item.unique_id));
                                        return (
                                            <div key={idx} style={{ background: '#ffffff', border: '1.5px solid #fde68a', borderRadius: '12px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ minWidth: 0, flex: 1 }}>
                                                    <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        #{toDevanagariDigits(idx + 1)} {getLocalizedText(item, 'name')}
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>
                                                        {toDevanagariDigits(item.uniqueId || item.unique_id)} • ⏱️ {toDevanagariDigits(item.requestedMinutes || 3)}m
                                                    </div>
                                                    {getLocalizedText(item, 'topic') && (
                                                        <div style={{ fontSize: '11px', color: '#d97706', fontWeight: 700, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            📌 {getLocalizedText(item, 'topic')}
                                                        </div>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                                    <button onClick={() => handleAllowQueued('sunya', realIdx !== -1 ? realIdx : idx)} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', fontWeight: 900, cursor: 'pointer' }}>🎤</button>
                                                    <button onClick={() => handleDenyQueued('sunya', realIdx !== -1 ? realIdx : idx)} style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', padding: '5px 8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>✕</button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            <button
                                onClick={() => handleNextSpeaker('sunya')}
                                style={{
                                    marginTop: '12px',
                                    width: '100%',
                                    padding: '12px',
                                    background: '#d97706',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '10px',
                                    fontWeight: 900,
                                    fontSize: '14px',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 8px rgba(217, 119, 6, 0.3)'
                                }}
                            >
                                अर्को वक्ता ( ⏳ )
                            </button>
                        </div>

                        {/* 2. आकस्मिक समय (Aakasmik Samaya) */}
                        <div style={{
                            background: '#fff8f8',
                            border: '2.5px solid #ef4444',
                            borderRadius: '20px',
                            height: '480px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            padding: '18px',
                            boxSizing: 'border-box'
                        }}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <span style={{ fontSize: '16px', fontWeight: 900, color: '#dc2626', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        🚨 {t?.aakasmikSamaya || 'Aakasmik Samaya (Urgent Hour)'}
                                    </span>
                                    <span style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', fontSize: '12px', fontWeight: 900, padding: '2px 10px', borderRadius: '9999px' }}>
                                        {toDevanagariDigits(state.queues?.aakasmik?.length || 0)}
                                    </span>
                                </div>

                                <input
                                    type="text"
                                    value={searchAakasmik}
                                    onChange={(e) => setSearchAakasmik(e.target.value)}
                                    placeholder="🔍 खोज्नुहोस् (नाम वा ID)..."
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        border: '1.5px solid #fca5a5',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        background: '#ffffff',
                                        boxSizing: 'border-box',
                                        marginBottom: '12px'
                                    }}
                                />
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0 }}>
                                {qAakasmik.length === 0 ? (
                                    <div style={{ margin: 'auto', textAlign: 'center', color: '#b91c1c', opacity: 0.6, fontSize: '13px', fontWeight: 700 }}>
                                        <div style={{ fontSize: '32px', marginBottom: '4px' }}>📬</div>
                                        {searchAakasmik ? 'कुनै सदस्य भेटिएन' : 'कुनै सदस्य पालोमा छैनन्'}
                                    </div>
                                ) : (
                                    qAakasmik.map((item, idx) => {
                                        const realIdx = state.queues.aakasmik.findIndex(s => (s.uniqueId || s.unique_id) === (item.uniqueId || item.unique_id));
                                        return (
                                            <div key={idx} style={{ background: '#ffffff', border: '1.5px solid #fecaca', borderRadius: '12px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ minWidth: 0, flex: 1 }}>
                                                    <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        #{toDevanagariDigits(idx + 1)} {getLocalizedText(item, 'name')}
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>
                                                        {toDevanagariDigits(item.uniqueId || item.unique_id)} • ⏱️ {toDevanagariDigits(item.requestedMinutes || 3)}m
                                                    </div>
                                                    {getLocalizedText(item, 'topic') && (
                                                        <div style={{ fontSize: '11px', color: '#dc2626', fontWeight: 700, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            📌 {getLocalizedText(item, 'topic')}
                                                        </div>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                                    <button onClick={() => handleAllowQueued('aakasmik', realIdx !== -1 ? realIdx : idx)} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', fontWeight: 900, cursor: 'pointer' }}>🎤</button>
                                                    <button onClick={() => handleDenyQueued('aakasmik', realIdx !== -1 ? realIdx : idx)} style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', padding: '5px 8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>✕</button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            <button
                                onClick={() => handleNextSpeaker('aakasmik')}
                                style={{
                                    marginTop: '12px',
                                    width: '100%',
                                    padding: '12px',
                                    background: '#dc2626',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '10px',
                                    fontWeight: 900,
                                    fontSize: '14px',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 8px rgba(220, 38, 38, 0.3)'
                                }}
                            >
                                अर्को वक्ता ( 🚨 )
                            </button>
                        </div>

                        {/* 3. विशेष समय (Bishesh Samaya) */}
                        <div style={{
                            background: '#f6fdf9',
                            border: '2.5px solid #10b981',
                            borderRadius: '20px',
                            height: '480px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            padding: '18px',
                            boxSizing: 'border-box'
                        }}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <span style={{ fontSize: '16px', fontWeight: 900, color: '#059669', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        🌟 {t?.bisheshSamaya || 'Bishesh Samaya (Special Hour)'}
                                    </span>
                                    <span style={{ background: '#d1fae5', color: '#065f46', border: '1px solid #a7f3d0', fontSize: '12px', fontWeight: 900, padding: '2px 10px', borderRadius: '9999px' }}>
                                        {toDevanagariDigits(state.queues?.bishesh?.length || 0)}
                                    </span>
                                </div>

                                <input
                                    type="text"
                                    value={searchBishesh}
                                    onChange={(e) => setSearchBishesh(e.target.value)}
                                    placeholder="🔍 खोज्नुहोस् (नाम वा ID)..."
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        border: '1.5px solid #a7f3d0',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        background: '#ffffff',
                                        boxSizing: 'border-box',
                                        marginBottom: '12px'
                                    }}
                                />
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0 }}>
                                {qBishesh.length === 0 ? (
                                    <div style={{ margin: 'auto', textAlign: 'center', color: '#059669', opacity: 0.6, fontSize: '13px', fontWeight: 700 }}>
                                        <div style={{ fontSize: '32px', marginBottom: '4px' }}>📬</div>
                                        {searchBishesh ? 'कुनै सदस्य भेटिएन' : 'कुनै सदस्य पालोमा छैनन्'}
                                    </div>
                                ) : (
                                    qBishesh.map((item, idx) => {
                                        const realIdx = state.queues.bishesh.findIndex(s => (s.uniqueId || s.unique_id) === (item.uniqueId || item.unique_id));
                                        return (
                                            <div key={idx} style={{ background: '#ffffff', border: '1.5px solid #a7f3d0', borderRadius: '12px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ minWidth: 0, flex: 1 }}>
                                                    <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        #{toDevanagariDigits(idx + 1)} {getLocalizedText(item, 'name')}
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>
                                                        {toDevanagariDigits(item.uniqueId || item.unique_id)} • ⏱️ {toDevanagariDigits(item.requestedMinutes || 3)}m
                                                    </div>
                                                    {getLocalizedText(item, 'topic') && (
                                                        <div style={{ fontSize: '11px', color: '#059669', fontWeight: 700, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            📌 {getLocalizedText(item, 'topic')}
                                                        </div>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                                    <button onClick={() => handleAllowQueued('bishesh', realIdx !== -1 ? realIdx : idx)} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', fontWeight: 900, cursor: 'pointer' }}>🎤</button>
                                                    <button onClick={() => handleDenyQueued('bishesh', realIdx !== -1 ? realIdx : idx)} style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', padding: '5px 8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>✕</button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            <button
                                onClick={() => handleNextSpeaker('bishesh')}
                                style={{
                                    marginTop: '12px',
                                    width: '100%',
                                    padding: '12px',
                                    background: '#059669',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '10px',
                                    fontWeight: 900,
                                    fontSize: '14px',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 8px rgba(5, 150, 105, 0.3)'
                                }}
                            >
                                अर्को वक्ता ( 🌟 )
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* TAB 2: MEMBER DIRECTORY */}
            {activeTab === 'directory' && (
                <MemberDirectoryTab />
            )}

            {/* TAB 3: SPEAKER RECORDS & ANALYTICS */}
            {activeTab === 'records' && (
                <div style={{ background: '#ffffff', borderRadius: '16px', border: '1.5px solid #e2e8f0', padding: '24px', boxShadow: '0 4px 14px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>
                                📊 {t?.speakerRecords || 'Parliamentary Speaker Logs & Time Records'}
                            </h2>
                            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                                Live database logs of completed speeches, total consumed floor time, and session timestamps.
                            </p>
                        </div>
                        <button
                            onClick={fetchSpeakerStats}
                            style={{
                                padding: '8px 16px',
                                background: '#f8fafc',
                                border: '1.5px solid #cbd5e1',
                                borderRadius: '8px',
                                fontWeight: 800,
                                fontSize: '13px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            🔄 Refresh Logs
                        </button>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <input
                            type="text"
                            value={searchStats}
                            onChange={(e) => setSearchStats(e.target.value)}
                            placeholder="🔍 Filter records by speaker name or position..."
                            style={{
                                width: '100%',
                                padding: '12px 16px',
                                borderRadius: '10px',
                                border: '1.5px solid #cbd5e1',
                                fontSize: '14px',
                                fontWeight: 600,
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    <div style={{ overflowX: 'auto', border: '1.5px solid #e2e8f0', borderRadius: '12px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#64748b' }}>
                                    <th style={{ padding: '12px 14px' }}>#</th>
                                    <th style={{ padding: '12px 14px' }}>Member Name</th>
                                    <th style={{ padding: '12px 14px' }}>Position</th>
                                    <th style={{ padding: '12px 14px' }}>Total Speaking Time</th>
                                    <th style={{ padding: '12px 14px' }}>Session Turns</th>
                                    <th style={{ padding: '12px 14px' }}>Last Floor Access</th>
                                </tr>
                            </thead>
                            <tbody>
                                {statsLoading ? (
                                    <tr>
                                        <td colSpan="6" style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>Loading speaker records...</td>
                                    </tr>
                                ) : filteredStats.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>No recorded speaking history found for today's session.</td>
                                    </tr>
                                ) : (
                                    filteredStats.map((row, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 800 }}>
                                                {toDevanagariDigits(idx + 1)}
                                            </td>
                                            <td style={{ padding: '12px 14px', fontWeight: 900, color: '#0f172a' }}>
                                                {row.name}
                                            </td>
                                            <td style={{ padding: '12px 14px', color: '#475569', fontWeight: 600 }}>
                                                {row.position || 'Member of Parliament'}
                                            </td>
                                            <td style={{ padding: '12px 14px', fontWeight: 900, color: '#16a34a' }}>
                                                ⏱️ {formatDuration(row.total_seconds)}
                                            </td>
                                            <td style={{ padding: '12px 14px', fontWeight: 800, color: '#0284c7' }}>
                                                {toDevanagariDigits(row.session_count || 1)} turns
                                            </td>
                                            <td style={{ padding: '12px 14px', color: '#64748b', fontSize: '12px', fontWeight: 600 }}>
                                                {row.last_spoken_at || '--'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}