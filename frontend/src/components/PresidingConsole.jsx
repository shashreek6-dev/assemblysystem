import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { useLanguage } from '../context/LanguageContext';
import LanguageToggle from './LanguageToggle';
import TimerModal from './TimerModal';
import InterruptionModal from './InterruptionModal';
import ExcelImportTab from './ExcelImportTab';
import MemberDirectoryTab from './MemberDirectoryTab';

export default function PresidingConsole() {
    const navigate = useNavigate();
    const { t, toDevanagariDigits, getLocalizedText } = useLanguage();
    const closeTimeoutRef = useRef(null);
    const isExpiringRef = useRef(false);

    // Active tab state: 'console', 'directory', 'import', 'speaking_time', 'topic_clerk', 'analytics'
    const [activeTab, setActiveTab] = useState('console');

    const [state, setState] = useState({
        activeSection: 'sunya',
        queues: { sunya: [], aakasmik: [], bishesh: [] },
        queue: [],
        interruptions: [],
        activeSpeaker: null,
        floorTimer: { duration: 0, endsAt: null, remainingSeconds: 0, isPaused: false },
        savedFloorSpeaker: null,
        activeInterruption: null,
        aakasmikSpokenMembers: []
    });

    const [speakerStats, setSpeakerStats] = useState([]);
    const [displaySpeaker, setDisplaySpeaker] = useState(null);

    const [customMins, setCustomMins] = useState('');
    const [customSecs, setCustomSecs] = useState('');
    const [remainingSecs, setRemainingSecs] = useState(0);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Topic Clerk state
    const [clerkSearch, setClerkSearch] = useState('');
    const [selectedClerkMember, setSelectedClerkMember] = useState(null);
    const [clerkTopic, setClerkTopic] = useState('');
    const [clerkTopicNe, setClerkTopicNe] = useState('');
    const [directoryMembers, setDirectoryMembers] = useState([]);

    const fetchSpeakerStats = async () => {
        try {
            const res = await fetch('/api/speaker-stats');
            if (res.ok) {
                const data = await res.json();
                setSpeakerStats(data);
            }
        } catch (err) {
            console.error('Error loading speaker stats:', err);
        }
    };

    const fetchDirectory = async () => {
        try {
            const res = await fetch('/api/permanent-members');
            if (res.ok) {
                const data = await res.json();
                setDirectoryMembers(data);
            }
        } catch (err) {
            console.error('Error fetching directory:', err);
        }
    };

    useEffect(() => {
        const token = localStorage.getItem('adminToken');
        if (!token) navigate('/admin/login');
        fetchSpeakerStats();
        fetchDirectory();
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
        socket.on('queueUpdated', (data) => {
            setState(data);
            if (data.activeSpeaker) {
                setDisplaySpeaker(data.activeSpeaker);
            } else {
                fetchSpeakerStats();
            }
        });
        return () => socket.off('queueUpdated');
    }, []);

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
                    fetchSpeakerStats();
                }, 5000);
            }
        }, 250);

        return () => clearInterval(interval);
    }, [state.floorTimer]);

    const handleStart = (presetMins = null, presetSecs = null) => {
        if (!state.activeSpeaker) return alert(t.assignSpeakerAlert);
        
        let mins = presetMins !== null ? presetMins : parseInt(customMins || '0', 10);
        let secs = presetSecs !== null ? presetSecs : parseInt(customSecs || '0', 10);

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
        fetchSpeakerStats();
    };

    const handleManualClear = () => {
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        isExpiringRef.current = false;
        socket.emit('clearActive');
        setIsModalOpen(false);
        fetchSpeakerStats();
    };

    const formatClock = (seconds) => {
        const m = String(Math.floor(seconds / 60)).padStart(2, '0');
        const s = String(seconds % 60).padStart(2, '0');
        return toDevanagariDigits(`${m}:${s}`);
    };

    const formatDurationReadable = (totalSecs) => {
        const m = Math.floor(totalSecs / 60);
        const s = totalSecs % 60;
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

    // AD Date to Numeric Bikram Sambat (YYYY-MM-DD)
    const convertToNumericBSDate = (adDateString) => {
        if (!adDateString) return '--';
        const date = new Date(adDateString);
        if (isNaN(date.getTime())) return '--';

        const refAd = new Date('2026-01-01T00:00:00Z');
        const diffDays = Math.floor((date.getTime() - refAd.getTime()) / (1000 * 60 * 60 * 24));
        const monthDaysTable = [31, 31, 32, 31, 31, 30, 30, 29, 30, 29, 30, 30];

        let curYear = 2082;
        let curMonth = 8; // Poush
        let curDay = 17;
        let remainingDays = diffDays;

        if (remainingDays >= 0) {
            while (remainingDays > 0) {
                const daysInCurMonth = monthDaysTable[curMonth];
                const daysLeft = daysInCurMonth - curDay;
                if (remainingDays <= daysLeft) {
                    curDay += remainingDays;
                    remainingDays = 0;
                } else {
                    remainingDays -= (daysLeft + 1);
                    curDay = 1;
                    curMonth++;
                    if (curMonth > 11) {
                        curMonth = 0;
                        curYear++;
                    }
                }
            }
        } else {
            while (remainingDays < 0) {
                if (Math.abs(remainingDays) < curDay) {
                    curDay += remainingDays;
                    remainingDays = 0;
                } else {
                    remainingDays += curDay;
                    curMonth--;
                    if (curMonth < 0) {
                        curMonth = 11;
                        curYear--;
                    }
                    curDay = monthDaysTable[curMonth];
                }
            }
        }

        const formattedMonth = String(curMonth + 1).padStart(2, '0');
        const formattedDay = String(curDay).padStart(2, '0');

        return toDevanagariDigits(`${curYear}-${formattedMonth}-${formattedDay}`);
    };

    const handleClerkSaveTopic = (e) => {
        e.preventDefault();
        if (!selectedClerkMember) return alert('Select a member first.');
        if (!clerkTopic.trim() && !clerkTopicNe.trim()) return alert('Enter a topic.');

        socket.emit('clerkUpdateTopic', {
            uniqueId: selectedClerkMember.unique_id || selectedClerkMember.uniqueId,
            name: selectedClerkMember.name,
            topic: clerkTopic.trim() || clerkTopicNe.trim(),
            topic_ne: clerkTopicNe.trim() || clerkTopic.trim()
        });

        alert(`Topic updated for ${selectedClerkMember.name}`);
        setClerkTopic('');
        setClerkTopicNe('');
        setSelectedClerkMember(null);
    };

    const currentActiveQueue = state.queues[state.activeSection] || [];

    return (
        <div>
            {/* Header Bar */}
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr auto 1fr', 
                alignItems: 'center', 
                borderBottom: '1px solid var(--border)', 
                paddingBottom: '16px', 
                marginBottom: '20px' 
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

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <button 
                    onClick={() => setActiveTab('console')}
                    style={{
                        padding: '10px 18px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        background: activeTab === 'console' ? 'var(--accent-blue, #2563eb)' : '#fff',
                        color: activeTab === 'console' ? '#fff' : '#475569',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    🏛️ {t.tabConsole || 'Floor Console'}
                </button>

                <button 
                    onClick={() => setActiveTab('directory')}
                    style={{
                        padding: '10px 18px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        background: activeTab === 'directory' ? 'var(--accent-blue, #2563eb)' : '#fff',
                        color: activeTab === 'directory' ? '#fff' : '#475569',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    📇 {t.tabDirectory || 'Member Directory'}
                </button>

                <button 
                    onClick={() => setActiveTab('import')}
                    style={{
                        padding: '10px 18px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        background: activeTab === 'import' ? 'var(--accent-blue, #2563eb)' : '#fff',
                        color: activeTab === 'import' ? '#fff' : '#475569',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    📥 {t.tabImport || 'Import Roster'}
                </button>

                <button 
                    onClick={() => setActiveTab('speaking_time')}
                    style={{
                        padding: '10px 18px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        background: activeTab === 'speaking_time' ? 'var(--accent-blue, #2563eb)' : '#fff',
                        color: activeTab === 'speaking_time' ? '#fff' : '#475569',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    ⏱️ {t.tabSpeakingTime || 'Speaking Time'}
                </button>

                <button 
                    onClick={() => setActiveTab('topic_clerk')}
                    style={{
                        padding: '10px 18px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        background: activeTab === 'topic_clerk' ? 'var(--accent-blue, #2563eb)' : '#fff',
                        color: activeTab === 'topic_clerk' ? '#fff' : '#475569',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    ✍️ {t.tabTopicClerk || 'Topic Clerk'}
                </button>

                <button 
                    onClick={() => { setActiveTab('analytics'); fetchSpeakerStats(); }}
                    style={{
                        padding: '10px 18px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        background: activeTab === 'analytics' ? 'var(--accent-blue, #2563eb)' : '#fff',
                        color: activeTab === 'analytics' ? '#fff' : '#475569',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    📊 {t.tabAnalytics || 'Speaker Records'}
                </button>
            </div>

            {/* TAB 1: MAIN FLOOR CONSOLE */}
            {activeTab === 'console' && (
                <>
                    {/* Parliamentary Slot Selector Pill Bar */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f1f5f9', padding: '8px 12px', borderRadius: '10px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                className="btn-secondary"
                                style={{
                                    padding: '6px 14px',
                                    fontSize: '12px',
                                    fontWeight: 800,
                                    background: state.activeSection === 'sunya' ? '#2563eb' : '#fff',
                                    color: state.activeSection === 'sunya' ? '#fff' : '#1e293b'
                                }}
                                onClick={() => socket.emit('switchSection', 'sunya')}
                            >
                                ⏳ {t.sunyaSamaya} ({toDevanagariDigits(state.queues.sunya.length)})
                            </button>
                            <button
                                className="btn-secondary"
                                style={{
                                    padding: '6px 14px',
                                    fontSize: '12px',
                                    fontWeight: 800,
                                    background: state.activeSection === 'aakasmik' ? '#dc2626' : '#fff',
                                    color: state.activeSection === 'aakasmik' ? '#fff' : '#1e293b'
                                }}
                                onClick={() => socket.emit('switchSection', 'aakasmik')}
                            >
                                🚨 {t.aakasmikSamaya} ({toDevanagariDigits(state.queues.aakasmik.length)})
                            </button>
                            <button
                                className="btn-secondary"
                                style={{
                                    padding: '6px 14px',
                                    fontSize: '12px',
                                    fontWeight: 800,
                                    background: state.activeSection === 'bishesh' ? '#7c3aed' : '#fff',
                                    color: state.activeSection === 'bishesh' ? '#fff' : '#1e293b'
                                }}
                                onClick={() => socket.emit('switchSection', 'bishesh')}
                            >
                                🌟 {t.bisheshSamaya} ({toDevanagariDigits(state.queues.bishesh.length)})
                            </button>
                        </div>

                        {state.activeSection === 'aakasmik' && (
                            <button 
                                className="btn-secondary" 
                                style={{ fontSize: '11px', padding: '4px 10px', color: '#b91c1c' }}
                                onClick={() => socket.emit('resetAakasmikLockout')}
                            >
                                🔄 {t.resetAakasmikBtn}
                            </button>
                        )}
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
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <h2 className="text-green" style={{ margin: 0 }}>
                                                {getLocalizedText(state.activeSpeaker, 'name')}
                                            </h2>
                                            {formatRequestedTimeBadge(state.activeSpeaker) && (
                                                <span style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', fontSize: '11px', fontWeight: 700, padding: '2px 6px', borderRadius: '6px' }}>
                                                    ⏱️ {formatRequestedTimeBadge(state.activeSpeaker)}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-muted" style={{ fontSize: '14px', margin: '4px 0' }}>
                                            {getLocalizedText(state.activeSpeaker, 'position')}
                                        </p>
                                        {getLocalizedText(state.activeSpeaker, 'topic') && (
                                            <div style={{ fontSize: '12px', background: '#f8fafc', padding: '4px 8px', borderRadius: '6px', color: '#0f172a', marginTop: '6px', border: '1px solid var(--border)' }}>
                                                📌 <strong>{t.topic}:</strong> {getLocalizedText(state.activeSpeaker, 'topic')}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-muted" style={{ margin: 0 }}>{t.noSpeaker}</p>
                                )}
                            </div>
                            <div className="btn-group">
                                <button className="btn-success flex-1" onClick={() => socket.emit('nextSpeaker', state.activeSection)}>{t.nextSpeaker}</button>
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
                                                <strong className="text-red">{getLocalizedText(item, 'name')}</strong>
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

                        {/* Active Queue */}
                        <div className="card">
                            <div>
                                <div className="card-header">
                                    <span>{t.queueTitle} ({t[state.activeSection === 'sunya' ? 'sunyaSamaya' : state.activeSection === 'aakasmik' ? 'aakasmikSamaya' : 'bisheshSamaya']})</span>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <span style={{ color: 'var(--accent-blue)', fontWeight: 800 }}>{toDevanagariDigits(currentActiveQueue.length)}</span>
                                        {currentActiveQueue.length > 0 && (
                                            <button className="btn-secondary" style={{ padding: '2px 6px', fontSize: '10px' }} onClick={() => socket.emit('clearSectionQueue', state.activeSection)}>
                                                {t.clear}
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <ul>
                                    {currentActiveQueue.map((item, idx) => {
                                        const displayName = getLocalizedText(item, 'name');
                                        const displayPosition = getLocalizedText(item, 'position');
                                        const displayTopic = getLocalizedText(item, 'topic');

                                        return (
                                            <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <strong style={{ fontSize: '13px' }}>#{toDevanagariDigits(idx + 1)} {displayName}</strong>
                                                        {formatRequestedTimeBadge(item) && (
                                                            <span style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', fontSize: '10px', fontWeight: 700, padding: '1px 4px', borderRadius: '4px' }}>
                                                                ⏱️ {formatRequestedTimeBadge(item)}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-muted" style={{ fontSize: '11px' }}>
                                                        {displayPosition} {displayTopic ? `• ${displayTopic}` : ''}
                                                    </div>
                                                </div>
                                                <span className="text-muted" style={{ fontWeight: 600, fontSize: '11px' }}>{toDevanagariDigits(item.timestamp)}</span>
                                            </li>
                                        );
                                    })}
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
                            <button className="btn-secondary" onClick={() => handleStart(1, 0)}>{t.oneMin}</button>
                            <button className="btn-secondary" onClick={() => handleStart(3, 0)}>{t.threeMin}</button>
                            <button className="btn-secondary" onClick={() => handleStart(5, 0)}>{t.fiveMin}</button>

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

                            <button className="btn-success" onClick={() => handleStart()}>{t.start}</button>
                            <button className="btn-warning" onClick={() => state.floorTimer.isPaused ? socket.emit('resumeTimer') : socket.emit('pauseTimer')}>
                                {state.floorTimer.isPaused ? t.resume : t.pause}
                            </button>
                            <button className="btn-danger" onClick={handleReset}>{t.reset}</button>
                        </div>
                    </div>
                </>
            )}

            {/* TAB 2: MEMBER DIRECTORY TAB */}
            {activeTab === 'directory' && (
                <MemberDirectoryTab />
            )}

            {/* TAB 3: EXCEL IMPORT TAB */}
            {activeTab === 'import' && (
                <ExcelImportTab onImportSuccess={() => setActiveTab('console')} />
            )}

            {/* TAB 4: SPEAKING TIME (THREE DEDICATED QUEUE COLUMNS) */}
            {activeTab === 'speaking_time' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>⏱️ {t.tabSpeakingTime || 'Speaking Time Management'}</h3>
                            <p className="text-muted" style={{ margin: '4px 0 0 0', fontSize: '13px' }}>Live segmented parliamentary queues for Sunya, Aakasmik, and Bishesh Samaya</p>
                        </div>
                        <button 
                            className="btn-danger" 
                            style={{ padding: '6px 12px', fontSize: '12px' }}
                            onClick={() => socket.emit('resetAakasmikLockout')}
                        >
                            🔄 {t.resetAakasmikBtn}
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                        {/* Section 1: Sunya Samaya */}
                        <div className="card" style={{ background: '#fff', borderTop: '4px solid #2563eb' }}>
                            <div className="card-header">
                                <span style={{ fontWeight: 800, color: '#2563eb' }}>⏳ {t.sunyaSamaya}</span>
                                <span className="badge" style={{ background: '#eff6ff', color: '#2563eb' }}>{toDevanagariDigits(state.queues.sunya.length)}</span>
                            </div>
                            <ul style={{ minHeight: '300px', maxHeight: '420px', overflowY: 'auto' }}>
                                {state.queues.sunya.length === 0 ? (
                                    <p className="text-muted" style={{ textAlign: 'center', margin: '30px 0', fontSize: '12px' }}>No members queued</p>
                                ) : (
                                    state.queues.sunya.map((item, idx) => (
                                        <li key={idx} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                                            <div style={{ fontWeight: 700 }}>#{toDevanagariDigits(idx + 1)} {getLocalizedText(item, 'name')}</div>
                                            <div className="text-muted" style={{ fontSize: '11px' }}>{getLocalizedText(item, 'position')} • ⏱️ {item.requestedMinutes}m</div>
                                            {item.topic && <div style={{ fontSize: '11px', color: '#1e293b', marginTop: '2px' }}>📌 {getLocalizedText(item, 'topic')}</div>}
                                        </li>
                                    ))
                                )}
                            </ul>
                            <button 
                                className="btn-success" 
                                style={{ width: '100%', marginTop: '12px', fontSize: '12px' }}
                                onClick={() => { socket.emit('switchSection', 'sunya'); socket.emit('nextSpeaker', 'sunya'); }}
                            >
                                {t.nextSpeaker} (Sunya)
                            </button>
                        </div>

                        {/* Section 2: Aakasmik Samaya */}
                        <div className="card" style={{ background: '#fff', borderTop: '4px solid #dc2626' }}>
                            <div className="card-header">
                                <span style={{ fontWeight: 800, color: '#dc2626' }}>🚨 {t.aakasmikSamaya}</span>
                                <span className="badge" style={{ background: '#fef2f2', color: '#dc2626' }}>{toDevanagariDigits(state.queues.aakasmik.length)}</span>
                            </div>
                            <ul style={{ minHeight: '300px', maxHeight: '420px', overflowY: 'auto' }}>
                                {state.queues.aakasmik.length === 0 ? (
                                    <p className="text-muted" style={{ textAlign: 'center', margin: '30px 0', fontSize: '12px' }}>No members queued</p>
                                ) : (
                                    state.queues.aakasmik.map((item, idx) => (
                                        <li key={idx} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                                            <div style={{ fontWeight: 700, color: '#b91c1c' }}>#{toDevanagariDigits(idx + 1)} {getLocalizedText(item, 'name')}</div>
                                            <div className="text-muted" style={{ fontSize: '11px' }}>{getLocalizedText(item, 'position')} • ⏱️ {item.requestedMinutes}m</div>
                                            {item.topic && <div style={{ fontSize: '11px', color: '#1e293b', marginTop: '2px' }}>📌 {getLocalizedText(item, 'topic')}</div>}
                                        </li>
                                    ))
                                )}
                            </ul>
                            <button 
                                className="btn-danger" 
                                style={{ width: '100%', marginTop: '12px', fontSize: '12px' }}
                                onClick={() => { socket.emit('switchSection', 'aakasmik'); socket.emit('nextSpeaker', 'aakasmik'); }}
                            >
                                {t.nextSpeaker} (Aakasmik)
                            </button>
                        </div>

                        {/* Section 3: Bishesh Samaya */}
                        <div className="card" style={{ background: '#fff', borderTop: '4px solid #7c3aed' }}>
                            <div className="card-header">
                                <span style={{ fontWeight: 800, color: '#7c3aed' }}>🌟 {t.bisheshSamaya}</span>
                                <span className="badge" style={{ background: '#f5f3ff', color: '#7c3aed' }}>{toDevanagariDigits(state.queues.bishesh.length)}</span>
                            </div>
                            <ul style={{ minHeight: '300px', maxHeight: '420px', overflowY: 'auto' }}>
                                {state.queues.bishesh.length === 0 ? (
                                    <p className="text-muted" style={{ textAlign: 'center', margin: '30px 0', fontSize: '12px' }}>No members queued</p>
                                ) : (
                                    state.queues.bishesh.map((item, idx) => (
                                        <li key={idx} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                                            <div style={{ fontWeight: 700 }}>#{toDevanagariDigits(idx + 1)} {getLocalizedText(item, 'name')}</div>
                                            <div className="text-muted" style={{ fontSize: '11px' }}>{getLocalizedText(item, 'position')} • ⏱️ {item.requestedMinutes}m</div>
                                            {item.topic && <div style={{ fontSize: '11px', color: '#1e293b', marginTop: '2px' }}>📌 {getLocalizedText(item, 'topic')}</div>}
                                        </li>
                                    ))
                                )}
                            </ul>
                            <button 
                                className="btn-success" 
                                style={{ width: '100%', marginTop: '12px', fontSize: '12px', background: '#7c3aed' }}
                                onClick={() => { socket.emit('switchSection', 'bishesh'); socket.emit('nextSpeaker', 'bishesh'); }}
                            >
                                {t.nextSpeaker} (Bishesh)
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 5: TOPIC CLERK CONSOLE */}
            {activeTab === 'topic_clerk' && (
                <div className="card" style={{ background: '#fff', padding: '24px' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>✍️ {t.topicClerkTitle || 'Topic Clerk Console'}</h3>
                        <p className="text-muted" style={{ margin: '4px 0 16px 0', fontSize: '13px' }}>
                            {t.topicClerkSubtitle || 'Live manual topic entry & Devanagari translation assignment for members'}
                        </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        {/* Member Search & Select */}
                        <div>
                            <input 
                                type="text"
                                placeholder="🔍 Search member by ID or Name..."
                                value={clerkSearch}
                                onChange={(e) => setClerkSearch(e.target.value)}
                                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '12px' }}
                            />
                            <div style={{ maxHeight: '360px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
                                {directoryMembers
                                    .filter(m => m.name.toLowerCase().includes(clerkSearch.toLowerCase()) || m.unique_id.toLowerCase().includes(clerkSearch.toLowerCase()))
                                    .map((member, idx) => (
                                        <div 
                                            key={idx}
                                            onClick={() => {
                                                setSelectedClerkMember(member);
                                                setClerkTopic(member.topic || '');
                                                setClerkTopicNe(member.topic_ne || '');
                                            }}
                                            style={{
                                                padding: '10px 14px',
                                                borderBottom: '1px solid var(--border)',
                                                cursor: 'pointer',
                                                background: selectedClerkMember?.unique_id === member.unique_id ? '#eff6ff' : '#fff'
                                            }}
                                        >
                                            <div style={{ fontWeight: 700, fontSize: '13px' }}>{member.name} ({member.unique_id})</div>
                                            <div className="text-muted" style={{ fontSize: '11px' }}>{member.position}</div>
                                        </div>
                                    ))}
                            </div>
                        </div>

                        {/* Topic Input Form */}
                        <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                            <h4 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 800 }}>
                                {selectedClerkMember ? `Assigning for: ${selectedClerkMember.name} (${selectedClerkMember.unique_id})` : 'Select a member from the left list'}
                            </h4>

                            <form onSubmit={handleClerkSaveTopic}>
                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Topic (English)</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. Healthcare Modernization & Emergency Response"
                                        value={clerkTopic}
                                        onChange={(e) => setClerkTopic(e.target.value)}
                                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                                    />
                                </div>

                                <div style={{ marginBottom: '16px' }}>
                                    <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>विषय (नेपाली)</label>
                                    <input 
                                        type="text" 
                                        placeholder="उदा. स्वास्थ्य सेवा आधुनिकीकरण तथा आपतकालीन कार्यविधि"
                                        value={clerkTopicNe}
                                        onChange={(e) => setClerkTopicNe(e.target.value)}
                                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #86efac', fontWeight: 700 }}
                                    />
                                </div>

                                <button 
                                    type="submit" 
                                    className="btn-success" 
                                    style={{ width: '100%', padding: '12px', fontWeight: 800 }}
                                    disabled={!selectedClerkMember}
                                >
                                    💾 {t.saveTopicBtn}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 6: SPEAKER ANALYTICS (NUMERIC BIKRAM SAMBAT DATES) */}
            {activeTab === 'analytics' && (
                <div className="card" style={{ background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>📊 {t.speakingAnalytics}</h3>
                        <button className="btn-secondary" style={{ padding: '8px 16px', fontSize: '12px' }} onClick={fetchSpeakerStats}>
                            🔄 {t.refreshRecords}
                        </button>
                    </div>

                    {speakerStats.length === 0 ? (
                        <p className="text-muted" style={{ margin: '32px 0', textAlign: 'center', fontSize: '14px' }}>
                            {t.noRecordsFound}
                        </p>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border)', color: '#64748b' }}>
                                        <th style={{ padding: '12px 16px' }}>#</th>
                                        <th style={{ padding: '12px 16px' }}>{t.memberName}</th>
                                        <th style={{ padding: '12px 16px' }}>{t.designation}</th>
                                        <th style={{ padding: '12px 16px' }}>{t.totalSpokenTime}</th>
                                        <th style={{ padding: '12px 16px' }}>{t.turnsTaken}</th>
                                        <th style={{ padding: '12px 16px' }}>📅 {t.spokenDate || "Date Spoken (B.S.)"}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {speakerStats.map((row, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '12px 16px', fontWeight: 700 }}>{toDevanagariDigits(idx + 1)}</td>
                                            <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--accent-blue, #2563eb)' }}>
                                                {getLocalizedText(row, 'name')}
                                            </td>
                                            <td style={{ padding: '12px 16px', color: '#64748b' }}>
                                                {getLocalizedText(row, 'position')}
                                            </td>
                                            <td style={{ padding: '12px 16px', fontWeight: 800, color: '#16a34a' }}>
                                                {formatDurationReadable(row.total_seconds)}
                                            </td>
                                            <td style={{ padding: '12px 16px' }}>{toDevanagariDigits(row.session_count)}</td>
                                            <td style={{ padding: '12px 16px', color: '#0f172a', fontWeight: 800 }}>
                                                {convertToNumericBSDate(row.session_date || row.last_spoken_at)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Standard Floor Session Modal */}
            <TimerModal 
                isOpen={isModalOpen && !state.activeInterruption}
                onClose={() => {
                    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
                    setIsModalOpen(false);
                }}
                activeSpeaker={displaySpeaker}
                remainingSecs={remainingSecs}
                isPaused={state.floorTimer.isPaused}
                queue={currentActiveQueue}
                interruptions={state.interruptions}
                onPauseToggle={() => state.floorTimer.isPaused ? socket.emit('resumeTimer') : socket.emit('pauseTimer')}
                onReset={handleReset}
                onNextSpeaker={() => socket.emit('nextSpeaker', state.activeSection)}
                onAllowInterruption={(idx) => socket.emit('allowInterruption', idx)}
                onDismissInterruption={(idx) => socket.emit('dismissInterruption', idx)}
                onSetTime={(payload) => {
                    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
                    isExpiringRef.current = false;
                    socket.emit('setSpeakingTime', payload);
                }}
            />

            {/* Dedicated Interruption Overlay Modal */}
            <InterruptionModal
                isOpen={Boolean(state.activeInterruption)}
                activeInterruption={state.activeInterruption}
                savedFloorSpeaker={state.savedFloorSpeaker}
                remainingSecs={remainingSecs}
                isPaused={state.floorTimer.isPaused}
                onFinishInterruption={() => socket.emit('finishInterruption')}
                onPauseToggle={() => state.floorTimer.isPaused ? socket.emit('resumeTimer') : socket.emit('pauseTimer')}
                onSetTime={(payload) => socket.emit('setSpeakingTime', payload)}
            />
        </div>
    );
}