import React, { useState, useEffect } from 'react';
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
    const [selectedMember, setSelectedMember] = useState(null);

    // Topic form inputs
    const [topicInput, setTopicInput] = useState('');
    const [topicNeInput, setTopicNeInput] = useState('');

    // Time form inputs
    const [minsInput, setMinsInput] = useState(3);
    const [secsInput, setSecsInput] = useState(0);

    const fetchDirectory = async () => {
        try {
            const res = await fetch('/api/permanent-members');
            if (res.ok) {
                const data = await res.json();
                setDirectoryMembers(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error('Error loading directory in Worker console:', err);
            setDirectoryMembers([]);
        }
    };

    useEffect(() => {
        fetchDirectory();
        
        const handleQueueUpdate = (data) => {
            if (data) {
                setState(prev => ({
                    ...prev,
                    ...data,
                    spokenMembers: data.spokenMembers || { sunya: [], aakasmik: [], bishesh: [] }
                }));
            }
        };

        socket.on('queueUpdated', handleQueueUpdate);
        socket.on('directoryUpdated', fetchDirectory);

        return () => {
            socket.off('queueUpdated', handleQueueUpdate);
            socket.off('directoryUpdated', fetchDirectory);
        };
    }, []);

    const handleSelectMember = (member) => {
        if (!member) return;
        setSelectedMember(member);
        setTopicInput(member.topic || '');
        setTopicNeInput(member.topic_ne || '');
        setMinsInput(member.requestedMinutes || 3);
        setSecsInput(member.requestedSeconds || 0);
    };

    const handleSaveTopic = (e) => {
        e.preventDefault();
        if (!selectedMember) return alert(t?.selectMemberFirstAlert || 'Select a member first.');

        socket.emit('workerUpdateSpeaker', {
            uniqueId: selectedMember.unique_id || selectedMember.uniqueId,
            name: selectedMember.name,
            topic: (topicInput || '').trim(),
            topic_ne: (topicNeInput || '').trim(),
            minutes: selectedMember.requestedMinutes || 3,
            seconds: selectedMember.requestedSeconds || 0
        });

        alert(`✅ ${t?.topicUpdatedAlert || 'Topic updated:'} ${getLocalizedText(selectedMember, 'name')}`);
    };

    const handleSaveTime = (e) => {
        e.preventDefault();
        if (!selectedMember) return alert(t?.selectMemberFirstAlert || 'Select a member first.');

        socket.emit('workerUpdateSpeaker', {
            uniqueId: selectedMember.unique_id || selectedMember.uniqueId,
            name: selectedMember.name,
            topic: selectedMember.topic || '',
            topic_ne: selectedMember.topic_ne || '',
            minutes: parseInt(minsInput || 0, 10),
            seconds: parseInt(secsInput || 0, 10)
        });

        alert(`✅ ${t?.timeUpdatedAlert || 'Time updated:'} ${getLocalizedText(selectedMember, 'name')} (${toDevanagariDigits(minsInput)}m ${toDevanagariDigits(secsInput)}s)`);
    };

    const handleApplyLiveTime = (m, s) => {
        if (!state.activeSpeaker) return alert(t?.assignSpeakerAlert || 'No active speaker.');
        socket.emit('setSpeakingTime', { minutes: m, seconds: s });
    };

    const handleResetSectionLockout = (sectionKey) => {
        const labels = { 
            sunya: t?.sunyaSamaya || 'Sunya Samaya', 
            aakasmik: t?.aakasmikSamaya || 'Aakasmik Samaya', 
            bishesh: t?.bisheshSamaya || 'Bishesh Samaya' 
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

    const safeMembers = Array.isArray(directoryMembers) ? directoryMembers : [];
    const query = (searchQuery || '').toLowerCase().trim();

    const filteredMembers = safeMembers.filter(m => {
        if (!m) return false;
        const nameMatch = m.name && m.name.toLowerCase().includes(query);
        const nameNeMatch = m.name_ne && m.name_ne.includes(query);
        const idMatch = m.unique_id && String(m.unique_id).toLowerCase().includes(query);
        return nameMatch || nameNeMatch || idMatch;
    });

    const spokenCount = {
        sunya: state.spokenMembers?.sunya?.length || 0,
        aakasmik: state.spokenMembers?.aakasmik?.length || 0,
        bishesh: state.spokenMembers?.bishesh?.length || 0
    };

    return (
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '28px 24px', color: '#0f172a' }}>
            {/* Header Toolbar */}
            <div style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '24px 28px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                border: '1.5px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '26px'
            }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>
                        🏛️ {t?.workerConsoleTitle || 'Parliamentary Operational Console'}
                    </h1>
                    <p style={{ margin: '4px 0 0 0', fontSize: '15px', color: '#64748b', fontWeight: 600 }}>
                        {t?.workerConsoleSubtitle || 'Set speaker topics, configure time slots, and manage session lockouts'}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <LanguageToggle />
                </div>
            </div>

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '26px', flexWrap: 'wrap' }}>
                <button
                    onClick={() => setActiveTab('topics')}
                    style={{
                        padding: '14px 24px',
                        borderRadius: '12px',
                        border: activeTab === 'topics' ? 'none' : '1.5px solid #e2e8f0',
                        background: activeTab === 'topics' ? '#0284c7' : '#ffffff',
                        color: activeTab === 'topics' ? '#ffffff' : '#64748b',
                        fontWeight: 900,
                        fontSize: '15px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: activeTab === 'topics' ? '0 4px 14px rgba(2,132,199,0.3)' : 'none'
                    }}
                >
                    ✍️ {t?.tabSetTopics || 'Set Topics'}
                </button>
                <button
                    onClick={() => setActiveTab('time')}
                    style={{
                        padding: '14px 24px',
                        borderRadius: '12px',
                        border: activeTab === 'time' ? 'none' : '1.5px solid #e2e8f0',
                        background: activeTab === 'time' ? '#0284c7' : '#ffffff',
                        color: activeTab === 'time' ? '#ffffff' : '#64748b',
                        fontWeight: 900,
                        fontSize: '15px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: activeTab === 'time' ? '0 4px 14px rgba(2,132,199,0.3)' : 'none'
                    }}
                >
                    ⏱️ {t?.tabSetTime || 'Set Allocated Time'}
                </button>
                <button
                    onClick={() => setActiveTab('directory')}
                    style={{
                        padding: '14px 24px',
                        borderRadius: '12px',
                        border: activeTab === 'directory' ? 'none' : '1.5px solid #e2e8f0',
                        background: activeTab === 'directory' ? '#0284c7' : '#ffffff',
                        color: activeTab === 'directory' ? '#ffffff' : '#64748b',
                        fontWeight: 900,
                        fontSize: '15px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: activeTab === 'directory' ? '0 4px 14px rgba(2,132,199,0.3)' : 'none'
                    }}
                >
                    📇 {t?.tabDirectory || 'Member Directory'}
                </button>
                <button
                    onClick={() => setActiveTab('session_control')}
                    style={{
                        padding: '14px 24px',
                        borderRadius: '12px',
                        border: activeTab === 'session_control' ? 'none' : '1.5px solid #e2e8f0',
                        background: activeTab === 'session_control' ? '#0284c7' : '#ffffff',
                        color: activeTab === 'session_control' ? '#ffffff' : '#64748b',
                        fontWeight: 900,
                        fontSize: '15px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: activeTab === 'session_control' ? '0 4px 14px rgba(2,132,199,0.3)' : 'none'
                    }}
                >
                    🔄 {t?.tabSessionControl || 'Session & Lockout Resets'}
                </button>
                <button
                    onClick={() => setActiveTab('import')}
                    style={{
                        padding: '14px 24px',
                        borderRadius: '12px',
                        border: activeTab === 'import' ? 'none' : '1.5px solid #e2e8f0',
                        background: activeTab === 'import' ? '#0284c7' : '#ffffff',
                        color: activeTab === 'import' ? '#ffffff' : '#64748b',
                        fontWeight: 900,
                        fontSize: '15px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: activeTab === 'import' ? '0 4px 14px rgba(2,132,199,0.3)' : 'none'
                    }}
                >
                    📥 {t?.tabImportRoster || 'Import Roster (Excel / CSV)'}
                </button>
            </div>

            {/* TAB 1: TOPIC MANAGEMENT */}
            {activeTab === 'topics' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '26px' }}>
                    {/* Left: Member Selection */}
                    <div style={{ background: '#ffffff', borderRadius: '16px', border: '1.5px solid #e2e8f0', padding: '26px', boxShadow: '0 4px 14px rgba(0,0,0,0.02)' }}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>
                            📋 {t?.selectMemberTopic || 'Select Member to Assign Topic'}
                        </h3>

                        <input
                            type="text"
                            placeholder={`🔍 ${t?.filterPlaceholder || 'Filter by Name or ID...'}`}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1.5px solid #cbd5e1', marginBottom: '18px', fontSize: '15px', fontWeight: 600 }}
                        />

                        {state.activeSpeaker && (
                            <div 
                                onClick={() => handleSelectMember(state.activeSpeaker)}
                                style={{
                                    background: '#f0fdf4',
                                    border: '2px solid #86efac',
                                    borderRadius: '12px',
                                    padding: '16px 18px',
                                    marginBottom: '18px',
                                    cursor: 'pointer'
                                }}
                            >
                                <span style={{ background: '#dcfce7', color: '#166534', fontSize: '11px', fontWeight: 900, padding: '4px 10px', borderRadius: '9999px' }}>
                                    ● {t?.currentFloorSpeakerBadge || 'CURRENT FLOOR SPEAKER'}
                                </span>
                                <div style={{ fontWeight: 900, fontSize: '18px', marginTop: '8px', color: '#166534' }}>
                                    {getLocalizedText(state.activeSpeaker, 'name')} ({getLocalizedText(state.activeSpeaker, 'position')})
                                </div>
                                <div style={{ fontSize: '14px', color: '#15803d', marginTop: '4px', fontWeight: 700 }}>
                                    📌 {t?.topic || 'Topic'}: <strong>{getLocalizedText(state.activeSpeaker, 'topic') || (t?.notSet || 'Not set')}</strong>
                                </div>
                            </div>
                        )}

                        <div style={{ maxHeight: '460px', overflowY: 'auto', border: '1.5px solid #e2e8f0', borderRadius: '12px' }}>
                            {filteredMembers.length === 0 ? (
                                <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '14px', fontWeight: 600 }}>
                                    No members found
                                </div>
                            ) : (
                                filteredMembers.map((member, idx) => {
                                    const isSelected = selectedMember?.unique_id === member.unique_id;
                                    return (
                                        <div
                                            key={idx}
                                            onClick={() => handleSelectMember(member)}
                                            style={{
                                                padding: '14px 18px',
                                                borderBottom: '1px solid #f1f5f9',
                                                cursor: 'pointer',
                                                background: isSelected ? '#eff6ff' : '#ffffff',
                                                transition: 'background 0.15s'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ fontWeight: 900, fontSize: '16px', color: isSelected ? '#1d4ed8' : '#0f172a' }}>
                                                    {getLocalizedText(member, 'name')}
                                                </div>
                                                <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 900 }}>
                                                    {toDevanagariDigits(member.unique_id)}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px', fontWeight: 600 }}>
                                                {getLocalizedText(member, 'position')}
                                            </div>
                                            {member.topic && (
                                                <div style={{ fontSize: '13px', color: '#0284c7', marginTop: '6px', fontWeight: 800 }}>
                                                    📌 {getLocalizedText(member, 'topic')}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Right: Topic Editor Form */}
                    <div style={{ background: '#ffffff', borderRadius: '16px', border: '1.5px solid #e2e8f0', padding: '26px', boxShadow: '0 4px 14px rgba(0,0,0,0.02)' }}>
                        <h3 style={{ margin: '0 0 18px 0', fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>
                            {selectedMember ? `${t?.editingTopicFor || 'Editing Topic for'}: ${getLocalizedText(selectedMember, 'name')} (${toDevanagariDigits(selectedMember.unique_id || '')})` : (t?.selectMemberLeftPrompt || 'Select a member on the left')}
                        </h3>

                        <form onSubmit={handleSaveTopic}>
                            <div style={{ marginBottom: '18px' }}>
                                <label style={{ fontSize: '14px', fontWeight: 900, display: 'block', marginBottom: '8px', color: '#334155' }}>
                                    {t?.topicEnglishLabel || 'Topic for Speaking (English)'}
                                </label>
                                <input
                                    type="text"
                                    placeholder={t?.topicEnglishPlaceholder || 'e.g. Budget Allocation'}
                                    value={topicInput}
                                    onChange={(e) => setTopicInput(e.target.value)}
                                    style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '15px', fontWeight: 600 }}
                                />
                            </div>

                            <div style={{ marginBottom: '26px' }}>
                                <label style={{ fontSize: '14px', fontWeight: 900, display: 'block', marginBottom: '8px', color: '#166534' }}>
                                    {t?.topicNepaliLabel || 'वक्तव्य विषय (नेपाली)'}
                                </label>
                                <input
                                    type="text"
                                    placeholder={t?.topicNepaliPlaceholder || 'उदा. बजेट विनियोजन'}
                                    value={topicNeInput}
                                    onChange={(e) => setTopicNeInput(e.target.value)}
                                    style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '2px solid #86efac', fontWeight: 800, fontSize: '16px' }}
                                />
                                <small style={{ fontSize: '13px', color: '#64748b', marginTop: '6px', display: 'block', fontWeight: 500 }}>
                                    {t?.topicAutoTransHelper || 'Leave blank to auto-transliterate.'}
                                </small>
                            </div>

                            <button
                                type="submit"
                                disabled={!selectedMember}
                                style={{
                                    width: '100%',
                                    padding: '16px',
                                    borderRadius: '12px',
                                    border: 'none',
                                    background: selectedMember ? '#0284c7' : '#cbd5e1',
                                    color: '#ffffff',
                                    fontWeight: 900,
                                    fontSize: '16px',
                                    cursor: selectedMember ? 'pointer' : 'not-allowed',
                                    boxShadow: selectedMember ? '0 4px 14px rgba(2,132,199,0.3)' : 'none'
                                }}
                            >
                                💾 {t?.saveSyncTopicBtn || 'Save & Sync Topic'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* TAB 2: TIME ALLOCATION MANAGEMENT */}
            {activeTab === 'time' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '26px' }}>
                    {/* Left: Member Selection */}
                    <div style={{ background: '#ffffff', borderRadius: '16px', border: '1.5px solid #e2e8f0', padding: '26px', boxShadow: '0 4px 14px rgba(0,0,0,0.02)' }}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>
                            📋 {t?.selectMemberTime || 'Select Member to Allocate Time'}
                        </h3>

                        <input
                            type="text"
                            placeholder={`🔍 ${t?.filterPlaceholder || 'Filter by Name or ID...'}`}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1.5px solid #cbd5e1', marginBottom: '18px', fontSize: '15px', fontWeight: 600 }}
                        />

                        {state.activeSpeaker && (
                            <div 
                                onClick={() => handleSelectMember(state.activeSpeaker)}
                                style={{
                                    background: '#f0fdf4',
                                    border: '2px solid #86efac',
                                    borderRadius: '12px',
                                    padding: '16px 18px',
                                    marginBottom: '18px',
                                    cursor: 'pointer'
                                }}
                            >
                                <span style={{ background: '#dcfce7', color: '#166534', fontSize: '11px', fontWeight: 900, padding: '4px 10px', borderRadius: '9999px' }}>
                                    ● {t?.currentFloorSpeakerBadge || 'CURRENT FLOOR SPEAKER'}
                                </span>
                                <div style={{ fontWeight: 900, fontSize: '18px', marginTop: '8px', color: '#166534' }}>
                                    {getLocalizedText(state.activeSpeaker, 'name')} ({getLocalizedText(state.activeSpeaker, 'position')})
                                </div>
                                <div style={{ fontSize: '14px', color: '#15803d', marginTop: '4px', fontWeight: 800 }}>
                                    ⏱️ {t?.exactDurationLabel || 'Duration'}: {toDevanagariDigits(state.activeSpeaker.requestedMinutes || 3)} {t?.minutesLabel || 'Minutes'} {toDevanagariDigits(state.activeSpeaker.requestedSeconds || 0)} {t?.secondsLabel || 'Seconds'}
                                </div>
                            </div>
                        )}

                        <div style={{ maxHeight: '460px', overflowY: 'auto', border: '1.5px solid #e2e8f0', borderRadius: '12px' }}>
                            {filteredMembers.length === 0 ? (
                                <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '14px', fontWeight: 600 }}>
                                    No members found
                                </div>
                            ) : (
                                filteredMembers.map((member, idx) => {
                                    const isSelected = selectedMember?.unique_id === member.unique_id;
                                    return (
                                        <div
                                            key={idx}
                                            onClick={() => handleSelectMember(member)}
                                            style={{
                                                padding: '14px 18px',
                                                borderBottom: '1px solid #f1f5f9',
                                                cursor: 'pointer',
                                                background: isSelected ? '#eff6ff' : '#ffffff',
                                                transition: 'background 0.15s'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ fontWeight: 900, fontSize: '16px', color: isSelected ? '#1d4ed8' : '#0f172a' }}>
                                                    {getLocalizedText(member, 'name')}
                                                </div>
                                                <span style={{ fontSize: '13px', color: '#16a34a', fontWeight: 900, background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '3px 10px', borderRadius: '6px' }}>
                                                    ⏱️ {toDevanagariDigits(member.requestedMinutes || 3)}m {member.requestedSeconds ? `${toDevanagariDigits(member.requestedSeconds)}s` : ''}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px', fontWeight: 600 }}>
                                                {getLocalizedText(member, 'position')} • {toDevanagariDigits(member.unique_id)}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Right: Time Allocation Form */}
                    <div style={{ background: '#ffffff', borderRadius: '16px', border: '1.5px solid #e2e8f0', padding: '26px', boxShadow: '0 4px 14px rgba(0,0,0,0.02)' }}>
                        <h3 style={{ margin: '0 0 18px 0', fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>
                            {selectedMember ? `${t?.allocatingTimeFor || 'Allocating Time for'}: ${getLocalizedText(selectedMember, 'name')} (${toDevanagariDigits(selectedMember.unique_id || '')})` : (t?.selectMemberLeftPrompt || 'Select a member on the left')}
                        </h3>

                        <form onSubmit={handleSaveTime}>
                            <label style={{ fontSize: '14px', fontWeight: 900, display: 'block', marginBottom: '10px', color: '#334155' }}>
                                {t?.quickPresetsLabel || 'Quick Presets'}
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '22px' }}>
                                {[1, 3, 5, 10].map((presetMins) => (
                                    <button
                                        key={presetMins}
                                        type="button"
                                        style={{
                                            padding: '14px',
                                            fontWeight: 900,
                                            fontSize: '15px',
                                            borderRadius: '10px',
                                            border: (minsInput === presetMins && secsInput === 0) ? 'none' : '1.5px solid #cbd5e1',
                                            background: (minsInput === presetMins && secsInput === 0) ? '#0284c7' : '#ffffff',
                                            color: (minsInput === presetMins && secsInput === 0) ? '#ffffff' : '#334155',
                                            cursor: 'pointer',
                                            boxShadow: (minsInput === presetMins && secsInput === 0) ? '0 4px 10px rgba(2,132,199,0.2)' : 'none'
                                        }}
                                        onClick={() => { setMinsInput(presetMins); setSecsInput(0); }}
                                    >
                                        {toDevanagariDigits(presetMins)} {t?.minutesLabel || 'Minutes'}
                                    </button>
                                ))}
                            </div>

                            <div style={{ marginBottom: '26px' }}>
                                <label style={{ fontSize: '14px', fontWeight: 900, display: 'block', marginBottom: '10px', color: '#334155' }}>
                                    {t?.exactDurationLabel || 'Exact Speaking Duration'}
                                </label>
                                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                    <div style={{ flex: 1 }}>
                                        <input
                                            type="number"
                                            min="0"
                                            value={minsInput}
                                            onChange={(e) => setMinsInput(e.target.value)}
                                            style={{ width: '100%', padding: '14px', textAlign: 'center', border: '1.5px solid #cbd5e1', borderRadius: '10px', fontSize: '20px', fontWeight: 900 }}
                                        />
                                        <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 800, display: 'block', textAlign: 'center', marginTop: '6px' }}>{t?.minutesLabel || 'Minutes'}</span>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <input
                                            type="number"
                                            min="0"
                                            max="59"
                                            value={secsInput}
                                            onChange={(e) => setSecsInput(e.target.value)}
                                            style={{ width: '100%', padding: '14px', textAlign: 'center', border: '1.5px solid #cbd5e1', borderRadius: '10px', fontSize: '20px', fontWeight: 900 }}
                                        />
                                        <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 800, display: 'block', textAlign: 'center', marginTop: '6px' }}>{t?.secondsLabel || 'Seconds'}</span>
                                    </div>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={!selectedMember}
                                style={{
                                    width: '100%',
                                    padding: '16px',
                                    borderRadius: '12px',
                                    border: 'none',
                                    background: selectedMember ? '#0284c7' : '#cbd5e1',
                                    color: '#ffffff',
                                    fontWeight: 900,
                                    fontSize: '16px',
                                    cursor: selectedMember ? 'pointer' : 'not-allowed',
                                    boxShadow: selectedMember ? '0 4px 14px rgba(2,132,199,0.3)' : 'none'
                                }}
                            >
                                ⏱️ {t?.saveSyncTimeBtn || 'Save & Sync Allocated Time'}
                            </button>
                        </form>

                        {/* Live Override Trigger */}
                        {state.activeSpeaker && (
                            <div style={{ marginTop: '30px', paddingTop: '22px', borderTop: '1.5px solid #e2e8f0' }}>
                                <label style={{ fontSize: '13px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '10px' }}>
                                    ⚡ {t?.realtimeFloorOverride || 'Real-Time Floor Override'}
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                                    <button onClick={() => handleApplyLiveTime(1, 0)} style={{ padding: '10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', background: '#f8fafc', fontWeight: 900, fontSize: '13px', cursor: 'pointer' }}>{toDevanagariDigits(1)}m</button>
                                    <button onClick={() => handleApplyLiveTime(3, 0)} style={{ padding: '10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', background: '#f8fafc', fontWeight: 900, fontSize: '13px', cursor: 'pointer' }}>{toDevanagariDigits(3)}m</button>
                                    <button onClick={() => handleApplyLiveTime(5, 0)} style={{ padding: '10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', background: '#f8fafc', fontWeight: 900, fontSize: '13px', cursor: 'pointer' }}>{toDevanagariDigits(5)}m</button>
                                    <button onClick={() => handleApplyLiveTime(10, 0)} style={{ padding: '10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', background: '#f8fafc', fontWeight: 900, fontSize: '13px', cursor: 'pointer' }}>{toDevanagariDigits(10)}m</button>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div style={{ background: '#ffffff', borderRadius: '16px', border: '1.5px solid #e2e8f0', padding: '30px', boxShadow: '0 4px 14px rgba(0,0,0,0.02)' }}>
                        <h2 style={{ margin: '0 0 8px 0', fontSize: '22px', fontWeight: 900, color: '#0f172a' }}>
                            🔄 {t?.sectionLockoutTitle || 'Section Lockout Management'}
                        </h2>
                        <p style={{ margin: '0 0 26px 0', fontSize: '15px', color: '#64748b', fontWeight: 500 }}>
                            {t?.sectionLockoutSubtitle || 'Manage each section lockout.'}
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '22px', marginBottom: '30px' }}>
                            {/* Sunya Lockout Card */}
                            <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '14px', padding: '22px', textAlign: 'center' }}>
                                <div style={{ fontSize: '36px', marginBottom: '8px' }}>⏳</div>
                                <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 900, color: '#2563eb' }}>{t?.sunyaSamaya || 'Sunya Samaya'}</h3>
                                <p style={{ fontSize: '14px', margin: '0 0 18px 0', color: '#64748b', fontWeight: 700 }}>
                                    {toDevanagariDigits(spokenCount.sunya)} {t?.membersLockedOutText || 'members locked out'}
                                </p>
                                <button
                                    onClick={() => handleResetSectionLockout('sunya')}
                                    style={{
                                        width: '100%',
                                        padding: '12px 16px',
                                        background: '#eff6ff',
                                        color: '#2563eb',
                                        border: '1.5px solid #bfdbfe',
                                        borderRadius: '8px',
                                        fontWeight: 900,
                                        fontSize: '14px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    🔄 {t?.resetSunyaLockoutsBtn || 'Reset Sunya'}
                                </button>
                            </div>

                            {/* Aakasmik Lockout Card */}
                            <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '14px', padding: '22px', textAlign: 'center' }}>
                                <div style={{ fontSize: '36px', marginBottom: '8px' }}>🚨</div>
                                <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 900, color: '#dc2626' }}>{t?.aakasmikSamaya || 'Aakasmik Samaya'}</h3>
                                <p style={{ fontSize: '14px', margin: '0 0 18px 0', color: '#64748b', fontWeight: 700 }}>
                                    {toDevanagariDigits(spokenCount.aakasmik)} {t?.membersLockedOutText || 'members locked out'}
                                </p>
                                <button
                                    onClick={() => handleResetSectionLockout('aakasmik')}
                                    style={{
                                        width: '100%',
                                        padding: '12px 16px',
                                        background: '#fee2e2',
                                        color: '#dc2626',
                                        border: '1.5px solid #fecaca',
                                        borderRadius: '8px',
                                        fontWeight: 900,
                                        fontSize: '14px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    🔄 {t?.resetAakasmikLockoutsBtn || 'Reset Aakasmik'}
                                </button>
                            </div>

                            {/* Bishesh Lockout Card */}
                            <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '14px', padding: '22px', textAlign: 'center' }}>
                                <div style={{ fontSize: '36px', marginBottom: '8px' }}>🌟</div>
                                <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 900, color: '#7c3aed' }}>{t?.bisheshSamaya || 'Bishesh Samaya'}</h3>
                                <p style={{ fontSize: '14px', margin: '0 0 18px 0', color: '#64748b', fontWeight: 700 }}>
                                    {toDevanagariDigits(spokenCount.bishesh)} {t?.membersLockedOutText || 'members locked out'}
                                </p>
                                <button
                                    onClick={() => handleResetSectionLockout('bishesh')}
                                    style={{
                                        width: '100%',
                                        padding: '12px 16px',
                                        background: '#f5f3ff',
                                        color: '#7c3aed',
                                        border: '1.5px solid #ddd6fe',
                                        borderRadius: '8px',
                                        fontWeight: 900,
                                        fontSize: '14px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    🔄 {t?.resetBisheshLockoutsBtn || 'Reset Bishesh'}
                                </button>
                            </div>
                        </div>

                        {/* Master Reset All */}
                        <div style={{ borderTop: '1.5px solid #e2e8f0', paddingTop: '22px', textAlign: 'center' }}>
                            <button
                                onClick={handleResetAllLockouts}
                                style={{
                                    padding: '16px 32px',
                                    background: '#dc2626',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '12px',
                                    fontWeight: 900,
                                    fontSize: '16px',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 16px rgba(220,38,38,0.3)'
                                }}
                            >
                                ⚠️ {t?.resetAllThreeLockoutsBtn || 'Reset All Sections'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 5: SPREADSHEET IMPORT */}
            {activeTab === 'import' && (
                <ExcelImportTab onImportSuccess={() => setActiveTab('topics')} />
            )}
        </div>
    );
}