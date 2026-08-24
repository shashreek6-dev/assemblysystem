import React, { useState, useEffect, useCallback } from 'react';
import { socket } from '../socket';
import { useLanguage } from '../context/LanguageContext';
import LanguageToggle from './LanguageToggle';
import ExcelImportTab from './ExcelImportTab';
import MemberDirectoryTab from './MemberDirectoryTab';

export default function WorkerConsole() {
    const { t, toDevanagariDigits, getLocalizedText } = useLanguage();
    
    const [activeTab, setActiveTab] = useState('topics');

    const [state, setState] = useState({
        activeSection: 'sunya',
        queues: { sunya: [], aakasmik: [], bishesh: [] },
        activeSpeaker: null,
        floorTimer: {},
        spokenMembers: { sunya: [], aakasmik: [], bishesh: [] }
    });

    const [directoryMembers, setDirectoryMembers] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [timeMemberFilter, setTimeMemberFilter] = useState('all');
    const [selectedMember, setSelectedMember] = useState(null);

    // Topic form inputs
    const [topicInput, setTopicInput] = useState('');
    const [topicNeInput, setTopicNeInput] = useState('');

    // Time form inputs
    const [minsInput, setMinsInput] = useState(3);
    const [secsInput, setSecsInput] = useState(0);
    const [timeSaveStatus, setTimeSaveStatus] = useState('');

    const getApiBase = () => {
        if (typeof window === 'undefined') return 'http://localhost:3000';
        const host = window.location.hostname;
        if (host.includes('devtunnels.ms')) {
            return window.location.origin.replace('-5173.', '-3000.');
        }
        return `http://${host}:3000`;
    };

    const fetchDirectory = useCallback(async () => {
        try {
            const res = await fetch(`${getApiBase()}/api/permanent-members`);
            if (res.ok) {
                const data = await res.json();
                setDirectoryMembers(Array.isArray(data) ? data : []);
            } else {
                setDirectoryMembers([]);
            }
        } catch (err) {
            console.error('Error loading directory in Worker console:', err);
            setDirectoryMembers([]);
        }
    }, []);

    useEffect(() => {
        fetchDirectory();
        
        const handleQueueUpdate = (data) => {
            if (data) {
                setState({
                    activeSection: data.activeSection || 'sunya',
                    queues: data.queues || { sunya: [], aakasmik: [], bishesh: [] },
                    activeSpeaker: data.activeSpeaker || null,
                    floorTimer: data.floorTimer || {},
                    spokenMembers: data.spokenMembers || { sunya: [], aakasmik: [], bishesh: [] }
                });
            }
        };

        const handleTopicUpdated = () => {
            fetchDirectory();
        };

        socket.on('queueUpdated', handleQueueUpdate);
        socket.on('speakerTopicUpdated', handleTopicUpdated);
        socket.on('directoryUpdated', fetchDirectory);

        return () => {
            socket.off('queueUpdated', handleQueueUpdate);
            socket.off('speakerTopicUpdated', handleTopicUpdated);
            socket.off('directoryUpdated', fetchDirectory);
        };
    }, [fetchDirectory]);

    // Real-time Neural Auto Translation for Topic Input
    useEffect(() => {
        if (!topicInput || !topicInput.trim()) return;

        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`${getApiBase()}/api/translate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: topicInput.trim() })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.translated) {
                        setTopicNeInput(data.translated);
                    }
                }
            } catch (err) {
                console.error('Auto translation failed:', err);
            }
        }, 400);

        return () => clearTimeout(timer);
    }, [topicInput]);

    const handleSelectMember = (member) => {
        if (!member) return;
        setSelectedMember(member);
        setTopicInput(member.topic || '');
        setTopicNeInput(member.topic_ne || '');
        setMinsInput(member.requestedMinutes !== undefined ? member.requestedMinutes : 3);
        setSecsInput(member.requestedSeconds !== undefined ? member.requestedSeconds : 0);
    };

    const handleSaveTopic = async (e) => {
        e.preventDefault();
        if (!selectedMember) return alert(t?.selectMemberFirstAlert || 'Select a member first.');

        const cleanTopic = (topicInput || '').trim();
        let cleanTopicNe = (topicNeInput || '').trim();

        if (!cleanTopicNe || cleanTopicNe === 'सदन वक्तव्य' || cleanTopicNe === 'सदनको वक्तव्य') {
            try {
                const res = await fetch(`${getApiBase()}/api/translate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: cleanTopic })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.translated) {
                        cleanTopicNe = data.translated;
                        setTopicNeInput(cleanTopicNe);
                    }
                }
            } catch (err) {
                console.error('Translation sync error:', err);
            }
        }

        const memberId = selectedMember.unique_id || selectedMember.uniqueId;

        socket.emit('workerUpdateSpeaker', {
            uniqueId: memberId,
            name: selectedMember.name,
            topic: cleanTopic,
            topic_ne: cleanTopicNe,
            minutes: selectedMember.requestedMinutes || 3,
            seconds: selectedMember.requestedSeconds || 0
        });

        setSelectedMember(prev => ({
            ...prev,
            topic: cleanTopic,
            topic_ne: cleanTopicNe
        }));

        fetchDirectory();
        alert(`✅ ${t?.topicUpdatedAlert || 'Topic updated:'} ${getLocalizedText(selectedMember, 'name')} (${cleanTopic})`);
    };

    const handleSaveTime = (e) => {
        if (e) e.preventDefault();
        if (!selectedMember) return alert(t?.selectMemberFirstAlert || 'Select a member first.');

        const minutes = parseInt(minsInput || 0, 10);
        const seconds = parseInt(secsInput || 0, 10);

        socket.emit('workerUpdateSpeaker', {
            uniqueId: selectedMember.unique_id || selectedMember.uniqueId,
            name: selectedMember.name,
            topic: selectedMember.topic || '',
            topic_ne: selectedMember.topic_ne || '',
            minutes,
            seconds
        });

        setSelectedMember(prev => ({
            ...prev,
            requestedMinutes: minutes,
            requestedSeconds: seconds
        }));

        setTimeSaveStatus('✅ सुरक्षित भयो');
        setTimeout(() => setTimeSaveStatus(''), 2500);
    };

    const handleAllowToSpeak = (member, targetSection = null) => {
        if (!member) return;
        const section = targetSection || member.sourceSection || state.activeSection || 'sunya';
        const validSection = ['sunya', 'aakasmik', 'bishesh'].includes(section) ? section : 'sunya';

        const currentQueue = state.queues?.[validSection] || [];
        const indexInQueue = currentQueue.findIndex(q => 
            (q.uniqueId && (q.uniqueId === member.uniqueId || q.uniqueId === member.unique_id)) ||
            (q.name && q.name.toLowerCase() === member.name?.toLowerCase())
        );

        if (indexInQueue !== -1) {
            socket.emit('allowQueuedSpeaker', { section: validSection, index: indexInQueue });
        } else {
            socket.emit('requestFloor', {
                speaker: member,
                sectionCategory: validSection,
                requestedMinutes: member.requestedMinutes !== undefined ? member.requestedMinutes : parseInt(minsInput || 3, 10),
                requestedSeconds: member.requestedSeconds !== undefined ? member.requestedSeconds : parseInt(secsInput || 0, 10),
                topic: member.topic || 'Assembly Debate',
                topic_ne: member.topic_ne || 'सदन छलफल'
            });

            setTimeout(() => {
                socket.emit('nextSpeaker', validSection);
            }, 300);
        }
    };

    const handleApplyLiveTime = (m, s) => {
        if (!state.activeSpeaker) return alert(t?.assignSpeakerAlert || 'No active speaker.');
        socket.emit('setSpeakingTime', { minutes: m, seconds: s });
    };

    const handleResetSectionLockout = (sectionKey) => {
        const labels = { 
            sunya: t?.sunyaSamaya || 'Sunne Samaya (Listening Time)', 
            aakasmik: t?.aakasmikSamaya || 'Aakasmik Samaya (Urgent Hour)', 
            bishesh: t?.bisheshSamaya || 'Bishesh Samaya (Special Hour)' 
        };
        if (window.confirm(`${t?.confirmResetLockout || 'Reset lockout for'} (${labels[sectionKey]})?`)) {
            socket.emit('resetSectionLockout', sectionKey);
        }
    };

    const handleResetAllLockouts = () => {
        if (window.confirm(t?.confirmResetAllLockouts || 'Reset lockouts for all sections?')) {
            socket.emit('resetAllLockouts');
        }
    };

    const buildTimeMemberList = () => {
        const rawQueues = state.queues || {};
        const qSunya = (rawQueues.sunya || []).map((m, idx) => ({ ...m, sourceSection: 'sunya', queueIndex: idx, sourceLabel: '⏳ सुन्ने समय' }));
        const qAakasmik = (rawQueues.aakasmik || []).map((m, idx) => ({ ...m, sourceSection: 'aakasmik', queueIndex: idx, sourceLabel: '🚨 आकस्मिक समय' }));
        const qBishesh = (rawQueues.bishesh || []).map((m, idx) => ({ ...m, sourceSection: 'bishesh', queueIndex: idx, sourceLabel: '🌟 विशेष समय' }));
        const allQueued = [...qSunya, ...qAakasmik, ...qBishesh];

        let baseList = [];
        if (timeMemberFilter === 'all') {
            const queuedIds = new Set(allQueued.map(m => String(m.uniqueId || m.unique_id).toLowerCase()));
            const directoryRest = (directoryMembers || [])
                .filter(m => !queuedIds.has(String(m.unique_id || m.uniqueId).toLowerCase()))
                .map(m => ({ ...m, sourceSection: 'directory', sourceLabel: '📇 स्थायी अभिलेख' }));
            baseList = [...allQueued, ...directoryRest];
        } else if (timeMemberFilter === 'sunya') {
            baseList = qSunya;
        } else if (timeMemberFilter === 'aakasmik') {
            baseList = qAakasmik;
        } else if (timeMemberFilter === 'bishesh') {
            baseList = qBishesh;
        } else if (timeMemberFilter === 'directory') {
            baseList = (directoryMembers || []).map(m => ({ ...m, sourceSection: 'directory', sourceLabel: '📇 स्थायी अभिलेख' }));
        }

        const q = (searchQuery || '').toLowerCase().trim();
        if (!q) return baseList;

        return baseList.filter(m => {
            const nameMatch = m.name && m.name.toLowerCase().includes(q);
            const nameNeMatch = m.name_ne && m.name_ne.includes(q);
            const idMatch = (m.unique_id || m.uniqueId) && String(m.unique_id || m.uniqueId).toLowerCase().includes(q);
            return nameMatch || nameNeMatch || idMatch;
        });
    };

    const timeListToRender = buildTimeMemberList();

    const safeMembers = Array.isArray(directoryMembers) ? directoryMembers : [];
    const query = (searchQuery || '').toLowerCase().trim();
    const filteredTopicMembers = safeMembers.filter(m => {
        if (!m) return false;
        const nameMatch = m.name && m.name.toLowerCase().includes(query);
        const nameNeMatch = m.name_ne && m.name_ne.includes(query);
        const idMatch = (m.unique_id || m.uniqueId) && String(m.unique_id || m.uniqueId).toLowerCase().includes(query);
        return nameMatch || nameNeMatch || idMatch;
    });

    const spokenCount = {
        sunya: state.spokenMembers?.sunya?.length || 0,
        aakasmik: state.spokenMembers?.aakasmik?.length || 0,
        bishesh: state.spokenMembers?.bishesh?.length || 0
    };

    return (
        <div style={{ maxWidth: '1360px', margin: '0 auto', padding: '24px 20px', color: '#0f172a', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            {/* Top Toolbar */}
            <div style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '20px 26px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                border: '1.5px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
            }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>
                        🏛️ {t?.workerConsoleTitle || 'Parliamentary Operational Console'}
                    </h1>
                    <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#64748b', fontWeight: 600 }}>
                        {t?.workerConsoleSubtitle || 'Set speaker topics, configure time slots, and manage session lockouts'}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <LanguageToggle />
                </div>
            </div>

            {/* Pinned Public Hall Screen Banner */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#0f172a',
                borderRadius: '14px',
                padding: '12px 20px',
                marginBottom: '18px',
                boxShadow: '0 4px 14px rgba(15, 23, 42, 0.25)',
                border: '1.5px solid #334155'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '22px' }}>🖥️</span>
                    <div>
                        <div style={{ fontSize: '14px', fontWeight: 900, color: '#f8fafc' }}>
                            {t?.hallScreen || 'Public Hall Projector Display'}
                        </div>
                        <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                            {t?.hallScreenSubtitle || 'Open this clean view on the secondary screen or public hall projector'}
                        </div>
                    </div>
                </div>
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
                        padding: '9px 18px',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 8px rgba(37, 99, 235, 0.4)'
                    }}
                >
                    🌐 {t?.openHallScreen || 'Open Projector Display'} ↗
                </a>
            </div>

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '22px', flexWrap: 'wrap' }}>
                <button
                    onClick={() => setActiveTab('topics')}
                    style={{
                        padding: '12px 20px',
                        borderRadius: '10px',
                        border: activeTab === 'topics' ? 'none' : '1.5px solid #e2e8f0',
                        background: activeTab === 'topics' ? '#0284c7' : '#ffffff',
                        color: activeTab === 'topics' ? '#ffffff' : '#64748b',
                        fontWeight: 900,
                        fontSize: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    ✍️ {t?.tabSetTopics || 'Set Topics'}
                </button>
                <button
                    onClick={() => setActiveTab('time')}
                    style={{
                        padding: '12px 20px',
                        borderRadius: '10px',
                        border: activeTab === 'time' ? 'none' : '1.5px solid #e2e8f0',
                        background: activeTab === 'time' ? '#0284c7' : '#ffffff',
                        color: activeTab === 'time' ? '#ffffff' : '#64748b',
                        fontWeight: 900,
                        fontSize: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    ⏱️ {t?.tabSetTime || 'Set Allocated Time'}
                </button>
                <button
                    onClick={() => setActiveTab('directory')}
                    style={{
                        padding: '12px 20px',
                        borderRadius: '10px',
                        border: activeTab === 'directory' ? 'none' : '1.5px solid #e2e8f0',
                        background: activeTab === 'directory' ? '#0284c7' : '#ffffff',
                        color: activeTab === 'directory' ? '#ffffff' : '#64748b',
                        fontWeight: 900,
                        fontSize: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    📇 {t?.tabDirectory || 'Member Directory'}
                </button>
                <button
                    onClick={() => setActiveTab('session_control')}
                    style={{
                        padding: '12px 20px',
                        borderRadius: '10px',
                        border: activeTab === 'session_control' ? 'none' : '1.5px solid #e2e8f0',
                        background: activeTab === 'session_control' ? '#0284c7' : '#ffffff',
                        color: activeTab === 'session_control' ? '#ffffff' : '#64748b',
                        fontWeight: 900,
                        fontSize: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    🔄 {t?.tabSessionControl || 'Session & Lockout Resets'}
                </button>
                <button
                    onClick={() => setActiveTab('import')}
                    style={{
                        padding: '12px 20px',
                        borderRadius: '10px',
                        border: activeTab === 'import' ? 'none' : '1.5px solid #e2e8f0',
                        background: activeTab === 'import' ? '#0284c7' : '#ffffff',
                        color: activeTab === 'import' ? '#ffffff' : '#64748b',
                        fontWeight: 900,
                        fontSize: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    📥 {t?.tabImportRoster || 'Import Roster (Excel / CSV)'}
                </button>
            </div>

            {/* TAB 1: TOPIC MANAGEMENT */}
            {activeTab === 'topics' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '22px' }}>
                    <div style={{ background: '#ffffff', borderRadius: '16px', border: '1.5px solid #e2e8f0', padding: '22px', boxShadow: '0 4px 14px rgba(0,0,0,0.02)' }}>
                        <h3 style={{ margin: '0 0 14px 0', fontSize: '17px', fontWeight: 900, color: '#0f172a' }}>
                            📋 {t?.selectMemberTopic || 'Select Member to Assign Topic'}
                        </h3>

                        <input
                            type="text"
                            placeholder={`🔍 ${t?.filterPlaceholder || 'Filter by Name or ID...'}`}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ width: '100%', padding: '12px 14px', borderRadius: '8px', border: '1.5px solid #cbd5e1', marginBottom: '14px', fontSize: '14px', fontWeight: 600, boxSizing: 'border-box' }}
                        />

                        {state.activeSpeaker && (
                            <div 
                                onClick={() => handleSelectMember(state.activeSpeaker)}
                                style={{
                                    background: '#f0fdf4',
                                    border: '2px solid #86efac',
                                    borderRadius: '12px',
                                    padding: '14px',
                                    marginBottom: '14px',
                                    cursor: 'pointer'
                                }}
                            >
                                <span style={{ background: '#dcfce7', color: '#166534', fontSize: '11px', fontWeight: 900, padding: '3px 8px', borderRadius: '9999px' }}>
                                    ● {t?.currentFloorSpeakerBadge || 'CURRENT FLOOR SPEAKER'}
                                </span>
                                <div style={{ fontWeight: 900, fontSize: '16px', marginTop: '6px', color: '#166534' }}>
                                    {getLocalizedText(state.activeSpeaker, 'name')} ({getLocalizedText(state.activeSpeaker, 'position')})
                                </div>
                                <div style={{ fontSize: '13px', color: '#15803d', marginTop: '3px', fontWeight: 700 }}>
                                    📌 {t?.topic || 'Topic'}: <strong>{getLocalizedText(state.activeSpeaker, 'topic') || (t?.notSet || 'Not set')}</strong>
                                </div>
                            </div>
                        )}

                        <div style={{ maxHeight: '460px', overflowY: 'auto', border: '1.5px solid #e2e8f0', borderRadius: '10px' }}>
                            {filteredTopicMembers.length === 0 ? (
                                <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', fontWeight: 600 }}>
                                    No members found
                                </div>
                            ) : (
                                filteredTopicMembers.map((member, idx) => {
                                    const isSelected = (selectedMember?.unique_id || selectedMember?.uniqueId) === (member.unique_id || member.uniqueId);
                                    return (
                                        <div
                                            key={idx}
                                            onClick={() => handleSelectMember(member)}
                                            style={{
                                                padding: '12px 16px',
                                                borderBottom: '1px solid #f1f5f9',
                                                cursor: 'pointer',
                                                background: isSelected ? '#eff6ff' : '#ffffff'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ fontWeight: 900, fontSize: '15px', color: isSelected ? '#1d4ed8' : '#0f172a' }}>
                                                    {getLocalizedText(member, 'name')}
                                                </div>
                                                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 900 }}>
                                                    {toDevanagariDigits(member.unique_id || member.uniqueId)}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', fontWeight: 600 }}>
                                                {getLocalizedText(member, 'position')}
                                            </div>
                                            {member.topic && (
                                                <div style={{ fontSize: '12px', color: '#0284c7', marginTop: '4px', fontWeight: 800 }}>
                                                    📌 {getLocalizedText(member, 'topic')}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <div style={{ background: '#ffffff', borderRadius: '16px', border: '1.5px solid #e2e8f0', padding: '22px', boxShadow: '0 4px 14px rgba(0,0,0,0.02)' }}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '17px', fontWeight: 900, color: '#0f172a' }}>
                            {selectedMember ? `${t?.editingTopicFor || 'Editing Topic for'}: ${getLocalizedText(selectedMember, 'name')}` : (t?.selectMemberLeftPrompt || 'Select a member on the left')}
                        </h3>

                        <form onSubmit={handleSaveTopic}>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 900, display: 'block', marginBottom: '6px', color: '#334155' }}>
                                    {t?.topicEnglishLabel || 'Topic for Speaking (English)'}
                                </label>
                                <input
                                    type="text"
                                    placeholder={t?.topicEnglishPlaceholder || 'e.g. Budget Allocation for Digital Governance'}
                                    value={topicInput}
                                    onChange={(e) => setTopicInput(e.target.value)}
                                    style={{ width: '100%', padding: '12px 14px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '14px', fontWeight: 600, boxSizing: 'border-box' }}
                                />
                            </div>

                            <div style={{ marginBottom: '22px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 900, display: 'block', marginBottom: '6px', color: '#166534' }}>
                                    {t?.topicNepaliLabel || 'वक्तव्य विषय (नेपाली)'}
                                </label>
                                <input
                                    type="text"
                                    placeholder={t?.topicNepaliPlaceholder || 'उदा. डिजिटल सुशासनको लागि बजेट विनियोजन'}
                                    value={topicNeInput}
                                    onChange={(e) => setTopicNeInput(e.target.value)}
                                    style={{ width: '100%', padding: '12px 14px', borderRadius: '8px', border: '2px solid #86efac', fontWeight: 800, fontSize: '15px', boxSizing: 'border-box' }}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={!selectedMember}
                                style={{
                                    width: '100%',
                                    padding: '14px',
                                    borderRadius: '10px',
                                    border: 'none',
                                    background: selectedMember ? '#0284c7' : '#cbd5e1',
                                    color: '#ffffff',
                                    fontWeight: 900,
                                    fontSize: '15px',
                                    cursor: selectedMember ? 'pointer' : 'not-allowed'
                                }}
                            >
                                💾 {t?.saveSyncTopicBtn || 'Save & Sync Topic'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* TAB 2: TIME ALLOCATION & ALLOW TO SPEAK */}
            {activeTab === 'time' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: '22px' }}>
                    {/* Left Member List */}
                    <div style={{ background: '#ffffff', borderRadius: '16px', border: '1.5px solid #e2e8f0', padding: '22px', boxShadow: '0 4px 14px rgba(0,0,0,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: '#0f172a' }}>
                                📋 {t?.selectMemberTime || 'Select Member to Allocate Time'}
                            </h3>
                            <span style={{ fontSize: '12px', fontWeight: 900, background: '#f1f5f9', padding: '4px 10px', borderRadius: '9999px', color: '#475569' }}>
                                {toDevanagariDigits(timeListToRender.length)} Total
                            </span>
                        </div>

                        {/* Filter Buttons */}
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
                            {[
                                { key: 'all', label: 'All Active & Queued' },
                                { key: 'sunya', label: '⏳ Sunne Queue' },
                                { key: 'aakasmik', label: '🚨 Aakasmik Queue' },
                                { key: 'bishesh', label: '🌟 Bishesh Queue' },
                                { key: 'directory', label: '📇 Directory' }
                            ].map(filter => (
                                <button
                                    key={filter.key}
                                    onClick={() => setTimeMemberFilter(filter.key)}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '8px',
                                        border: timeMemberFilter === filter.key ? 'none' : '1.5px solid #cbd5e1',
                                        background: timeMemberFilter === filter.key ? '#0f172a' : '#f8fafc',
                                        color: timeMemberFilter === filter.key ? '#ffffff' : '#475569',
                                        fontWeight: 800,
                                        fontSize: '12px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {filter.label}
                                </button>
                            ))}
                        </div>

                        <input
                            type="text"
                            placeholder={`🔍 ${t?.filterPlaceholder || 'Filter by Name or ID...'}`}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #cbd5e1', marginBottom: '14px', fontSize: '13px', fontWeight: 600, boxSizing: 'border-box' }}
                        />

                        {/* Current Floor Speaker Highlight */}
                        {state.activeSpeaker && (
                            <div 
                                onClick={() => handleSelectMember(state.activeSpeaker)}
                                style={{
                                    background: '#f0fdf4',
                                    border: '2px solid #86efac',
                                    borderRadius: '12px',
                                    padding: '14px',
                                    marginBottom: '14px',
                                    cursor: 'pointer'
                                }}
                            >
                                <span style={{ background: '#dcfce7', color: '#166534', fontSize: '11px', fontWeight: 900, padding: '3px 8px', borderRadius: '9999px' }}>
                                    ● {t?.currentFloorSpeakerBadge || 'CURRENT FLOOR SPEAKER'}
                                </span>
                                <div style={{ fontWeight: 900, fontSize: '16px', marginTop: '6px', color: '#166534' }}>
                                    {getLocalizedText(state.activeSpeaker, 'name')} ({getLocalizedText(state.activeSpeaker, 'position')})
                                </div>
                                <div style={{ fontSize: '13px', color: '#15803d', marginTop: '3px', fontWeight: 800 }}>
                                    ⏱️ Time: {toDevanagariDigits(state.activeSpeaker.requestedMinutes || 3)}m {toDevanagariDigits(state.activeSpeaker.requestedSeconds || 0)}s
                                </div>
                            </div>
                        )}

                        {/* Member List Grid with Allow to Speak */}
                        <div style={{ maxHeight: '460px', overflowY: 'auto', border: '1.5px solid #e2e8f0', borderRadius: '10px' }}>
                            {timeListToRender.length === 0 ? (
                                <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', fontWeight: 600 }}>
                                    No members found in this category
                                </div>
                            ) : (
                                timeListToRender.map((member, idx) => {
                                    const isSelected = (selectedMember?.unique_id || selectedMember?.uniqueId) === (member.unique_id || member.uniqueId);
                                    const mins = member.requestedMinutes !== undefined ? member.requestedMinutes : 3;
                                    const secs = member.requestedSeconds !== undefined ? member.requestedSeconds : 0;

                                    return (
                                        <div
                                            key={idx}
                                            onClick={() => handleSelectMember(member)}
                                            style={{
                                                padding: '12px 14px',
                                                borderBottom: '1px solid #f1f5f9',
                                                cursor: 'pointer',
                                                background: isSelected ? '#eff6ff' : '#ffffff',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                gap: '10px'
                                            }}
                                        >
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                    <span style={{ fontWeight: 900, fontSize: '14px', color: isSelected ? '#1d4ed8' : '#0f172a' }}>
                                                        {getLocalizedText(member, 'name')}
                                                    </span>
                                                    <span style={{ fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px', background: member.sourceSection === 'directory' ? '#f1f5f9' : '#e0f2fe', color: member.sourceSection === 'directory' ? '#64748b' : '#0369a1' }}>
                                                        {member.sourceLabel || 'Queue'}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', fontWeight: 600 }}>
                                                    {getLocalizedText(member, 'position')} • {toDevanagariDigits(member.unique_id || member.uniqueId)}
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                                <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 900, background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '4px 8px', borderRadius: '6px' }}>
                                                    ⏱️ {toDevanagariDigits(mins)}m {secs ? `${toDevanagariDigits(secs)}s` : ''}
                                                </span>
                                                {member.sourceSection !== 'directory' && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleAllowToSpeak(member);
                                                        }}
                                                        style={{
                                                            background: '#16a34a',
                                                            color: '#ffffff',
                                                            border: 'none',
                                                            borderRadius: '6px',
                                                            padding: '6px 12px',
                                                            fontSize: '11px',
                                                            fontWeight: 900,
                                                            cursor: 'pointer',
                                                            boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)'
                                                        }}
                                                    >
                                                        🎤 पालो दिनुहोस्
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Right Control & Settings Panel */}
                    <div style={{ background: '#ffffff', borderRadius: '16px', border: '1.5px solid #e2e8f0', padding: '22px', boxShadow: '0 4px 14px rgba(0,0,0,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: '#0f172a' }}>
                                {selectedMember ? `${t?.allocatingTimeFor || 'Allocating Time for'}: ${getLocalizedText(selectedMember, 'name')} (${toDevanagariDigits(selectedMember.unique_id || selectedMember.uniqueId || '')})` : (t?.selectMemberLeftPrompt || 'Select a member on the left')}
                            </h3>
                            {timeSaveStatus && (
                                <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 800, background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: '6px' }}>
                                    {timeSaveStatus}
                                </span>
                            )}
                        </div>

                        <form onSubmit={handleSaveTime}>
                            <label style={{ fontSize: '13px', fontWeight: 900, display: 'block', marginBottom: '8px', color: '#334155' }}>
                                {t?.quickPresetsLabel || 'Quick Presets'}
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '18px' }}>
                                {[1, 3, 5, 10].map((presetMins) => (
                                    <button
                                        key={presetMins}
                                        type="button"
                                        style={{
                                            padding: '12px',
                                            fontWeight: 900,
                                            fontSize: '14px',
                                            borderRadius: '8px',
                                            border: (minsInput === presetMins && secsInput === 0) ? 'none' : '1.5px solid #cbd5e1',
                                            background: (minsInput === presetMins && secsInput === 0) ? '#0284c7' : '#ffffff',
                                            color: (minsInput === presetMins && secsInput === 0) ? '#ffffff' : '#334155',
                                            cursor: 'pointer'
                                        }}
                                        onClick={() => { setMinsInput(presetMins); setSecsInput(0); }}
                                    >
                                        {toDevanagariDigits(presetMins)} {t?.minutesLabel || 'Min'}
                                    </button>
                                ))}
                            </div>

                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 900, display: 'block', marginBottom: '8px', color: '#334155' }}>
                                    {t?.exactDurationLabel || 'Exact Speaking Duration'}
                                </label>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <div style={{ flex: 1 }}>
                                        <input
                                            type="number"
                                            min="0"
                                            value={minsInput}
                                            onChange={(e) => setMinsInput(e.target.value)}
                                            style={{ width: '100%', padding: '12px', textAlign: 'center', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '18px', fontWeight: 900, boxSizing: 'border-box' }}
                                        />
                                        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 800, display: 'block', textAlign: 'center', marginTop: '4px' }}>{t?.minutesLabel || 'Minutes'}</span>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <input
                                            type="number"
                                            min="0"
                                            max="59"
                                            value={secsInput}
                                            onChange={(e) => setSecsInput(e.target.value)}
                                            style={{ width: '100%', padding: '12px', textAlign: 'center', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '18px', fontWeight: 900, boxSizing: 'border-box' }}
                                        />
                                        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 800, display: 'block', textAlign: 'center', marginTop: '4px' }}>{t?.secondsLabel || 'Seconds'}</span>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                                <button
                                    type="submit"
                                    disabled={!selectedMember}
                                    style={{
                                        flex: 1,
                                        padding: '14px',
                                        borderRadius: '10px',
                                        border: 'none',
                                        background: selectedMember ? '#0284c7' : '#cbd5e1',
                                        color: '#ffffff',
                                        fontWeight: 900,
                                        fontSize: '14px',
                                        cursor: selectedMember ? 'pointer' : 'not-allowed'
                                    }}
                                >
                                    ⏱️ {t?.saveSyncTimeBtn || 'Save & Sync Allocated Time'}
                                </button>
                                
                                <button
                                    type="button"
                                    disabled={!selectedMember}
                                    onClick={() => handleAllowToSpeak(selectedMember)}
                                    style={{
                                        padding: '14px 20px',
                                        borderRadius: '10px',
                                        border: 'none',
                                        background: selectedMember ? '#16a34a' : '#cbd5e1',
                                        color: '#ffffff',
                                        fontWeight: 900,
                                        fontSize: '14px',
                                        cursor: selectedMember ? 'pointer' : 'not-allowed',
                                        boxShadow: selectedMember ? '0 4px 12px rgba(22,163,74,0.25)' : 'none'
                                    }}
                                >
                                    🎤 प्रत्यक्ष पालो दिनुहोस्
                                </button>
                            </div>
                        </form>

                        {/* Real-time active speaker live adjustment */}
                        {state.activeSpeaker && (
                            <div style={{ marginTop: '20px', paddingTop: '18px', borderTop: '1.5px solid #e2e8f0' }}>
                                <label style={{ fontSize: '12px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                                    ⚡ {t?.realtimeFloorOverride || 'Real-Time Floor Override'}
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                                    <button onClick={() => handleApplyLiveTime(1, 0)} style={{ padding: '8px', borderRadius: '6px', border: '1.5px solid #cbd5e1', background: '#f8fafc', fontWeight: 900, fontSize: '12px', cursor: 'pointer' }}>{toDevanagariDigits(1)}m</button>
                                    <button onClick={() => handleApplyLiveTime(3, 0)} style={{ padding: '8px', borderRadius: '6px', border: '1.5px solid #cbd5e1', background: '#f8fafc', fontWeight: 900, fontSize: '12px', cursor: 'pointer' }}>{toDevanagariDigits(3)}m</button>
                                    <button onClick={() => handleApplyLiveTime(5, 0)} style={{ padding: '8px', borderRadius: '6px', border: '1.5px solid #cbd5e1', background: '#f8fafc', fontWeight: 900, fontSize: '12px', cursor: 'pointer' }}>{toDevanagariDigits(5)}m</button>
                                    <button onClick={() => handleApplyLiveTime(10, 0)} style={{ padding: '8px', borderRadius: '6px', border: '1.5px solid #cbd5e1', background: '#f8fafc', fontWeight: 900, fontSize: '12px', cursor: 'pointer' }}>{toDevanagariDigits(10)}m</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 3: MEMBER DIRECTORY */}
            {activeTab === 'directory' && (
                <MemberDirectoryTab />
            )}

            {/* TAB 4: SESSION CONTROLS & LOCKOUT RESETS */}
            {activeTab === 'session_control' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ background: '#ffffff', borderRadius: '16px', border: '1.5px solid #e2e8f0', padding: '26px', boxShadow: '0 4px 14px rgba(0,0,0,0.02)' }}>
                        <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>
                            🔄 {t?.sectionLockoutTitle || 'Section Lockout Management'}
                        </h2>
                        <p style={{ margin: '0 0 22px 0', fontSize: '14px', color: '#64748b', fontWeight: 500 }}>
                            {t?.sectionLockoutSubtitle || 'Manage each section lockout.'}
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px', marginBottom: '24px' }}>
                            <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '12px', padding: '18px', textAlign: 'center' }}>
                                <div style={{ fontSize: '32px', marginBottom: '6px' }}>⏳</div>
                                <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 900, color: '#d97706' }}>{t?.sunyaSamaya || 'Sunne Samaya (Listening Time)'}</h3>
                                <p style={{ fontSize: '13px', margin: '0 0 14px 0', color: '#64748b', fontWeight: 700 }}>
                                    {toDevanagariDigits(spokenCount.sunya)} {t?.membersLockedOutText || 'members locked out'}
                                </p>
                                <button
                                    onClick={() => handleResetSectionLockout('sunya')}
                                    style={{ width: '100%', padding: '10px 14px', background: '#fffbeb', color: '#d97706', border: '1.5px solid #fde68a', borderRadius: '8px', fontWeight: 900, fontSize: '13px', cursor: 'pointer' }}
                                >
                                    🔄 {t?.resetSunyaLockoutsBtn || 'Reset Sunne'}
                                </button>
                            </div>

                            <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '12px', padding: '18px', textAlign: 'center' }}>
                                <div style={{ fontSize: '32px', marginBottom: '6px' }}>🚨</div>
                                <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 900, color: '#dc2626' }}>{t?.aakasmikSamaya || 'Aakasmik Samaya (Urgent Hour)'}</h3>
                                <p style={{ fontSize: '13px', margin: '0 0 14px 0', color: '#64748b', fontWeight: 700 }}>
                                    {toDevanagariDigits(spokenCount.aakasmik)} {t?.membersLockedOutText || 'members locked out'}
                                </p>
                                <button
                                    onClick={() => handleResetSectionLockout('aakasmik')}
                                    style={{ width: '100%', padding: '10px 14px', background: '#fee2e2', color: '#dc2626', border: '1.5px solid #fecaca', borderRadius: '8px', fontWeight: 900, fontSize: '13px', cursor: 'pointer' }}
                                >
                                    🔄 {t?.resetAakasmikLockoutsBtn || 'Reset Aakasmik'}
                                </button>
                            </div>

                            <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '12px', padding: '18px', textAlign: 'center' }}>
                                <div style={{ fontSize: '32px', marginBottom: '6px' }}>🌟</div>
                                <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 900, color: '#059669' }}>{t?.bisheshSamaya || 'Bishesh Samaya (Special Hour)'}</h3>
                                <p style={{ fontSize: '13px', margin: '0 0 14px 0', color: '#64748b', fontWeight: 700 }}>
                                    {toDevanagariDigits(spokenCount.bishesh)} {t?.membersLockedOutText || 'members locked out'}
                                </p>
                                <button
                                    onClick={() => handleResetSectionLockout('bishesh')}
                                    style={{ width: '100%', padding: '10px 14px', background: '#ecfdf5', color: '#059669', border: '1.5px solid #a7f3d0', borderRadius: '8px', fontWeight: 900, fontSize: '13px', cursor: 'pointer' }}
                                >
                                    🔄 {t?.resetBisheshLockoutsBtn || 'Reset Bishesh'}
                                </button>
                            </div>
                        </div>

                        <div style={{ borderTop: '1.5px solid #e2e8f0', paddingTop: '18px', textAlign: 'center' }}>
                            <button
                                onClick={handleResetAllLockouts}
                                style={{ padding: '14px 28px', background: '#dc2626', color: '#ffffff', border: 'none', borderRadius: '10px', fontWeight: 900, fontSize: '15px', cursor: 'pointer', boxShadow: '0 4px 16px rgba(220,38,38,0.25)' }}
                            >
                                ⚠️ {t?.resetAllThreeLockoutsBtn || 'Reset All Sections'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 5: SPREADSHEET IMPORT */}
            {activeTab === 'import' && (
                <ExcelImportTab onImportSuccess={() => { fetchDirectory(); setActiveTab('topics'); }} />
            )}
        </div>
    );
}