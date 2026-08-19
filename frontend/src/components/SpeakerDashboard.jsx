import React, { useState, useEffect } from 'react';
import { socket } from '../socket';
import { useLanguage } from '../context/LanguageContext';
import LanguageToggle from './LanguageToggle';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

export default function SpeakerDashboard() {
    const { t, toDevanagariDigits, getLocalizedText } = useLanguage();
    const [speaker, setSpeaker] = useState(() => {
        return JSON.parse(localStorage.getItem('activeSpeaker') || 'null');
    });

    const [authMode, setAuthMode] = useState('id');
    const [uniqueIdInput, setUniqueIdInput] = useState('');
    const [name, setName] = useState('');
    const [position, setPosition] = useState('');
    const [interruptReason, setInterruptReason] = useState('Point of Order');
    
    // Active session tab selector: 'sunya' | 'aakasmik' | 'bishesh'
    const [activeTab, setActiveTab] = useState('sunya');

    // Individual duration states for each session
    const [sessionDurations, setSessionDurations] = useState({
        sunya: { preset: 3, customMins: '', customSecs: '' },
        aakasmik: { preset: 3, customMins: '', customSecs: '' },
        bishesh: { preset: 3, customMins: '', customSecs: '' }
    });

    const [queueData, setQueueData] = useState({ 
        activeSection: 'sunya',
        queues: { sunya: [], aakasmik: [], bishesh: [] }, 
        activeSpeaker: null, 
        floorTimer: {},
        spokenMembers: { sunya: [], aakasmik: [], bishesh: [] }
    });
    const [remainingSecs, setRemainingSecs] = useState(0);

    useEffect(() => {
        socket.on('queueUpdated', (data) => {
            setQueueData(data);
        });

        // Listen for live topic updates submitted from Worker console
        socket.on('speakerTopicUpdated', ({ uniqueId, name: updatedName, topic, topic_ne }) => {
            setSpeaker(prev => {
                if (!prev) return prev;
                const matchId = uniqueId && (prev.uniqueId === uniqueId || prev.unique_id === uniqueId);
                const matchName = updatedName && prev.name?.toLowerCase() === updatedName.toLowerCase();
                
                if (matchId || matchName) {
                    const updated = { ...prev, topic, topic_ne };
                    localStorage.setItem('activeSpeaker', JSON.stringify(updated));
                    return updated;
                }
                return prev;
            });
        });

        socket.on('requestRejected', (data) => {
            alert(`⚠️ ${data.reason}`);
        });

        return () => {
            socket.off('queueUpdated');
            socket.off('speakerTopicUpdated');
            socket.off('requestRejected');
        };
    }, []);

    useEffect(() => {
        const timer = queueData.floorTimer;
        if (!timer || !timer.endsAt || timer.isPaused) {
            setRemainingSecs(timer?.remainingSeconds || 0);
            return;
        }

        const interval = setInterval(() => {
            const left = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
            setRemainingSecs(left);
            if (left <= 0) clearInterval(interval);
        }, 500);

        return () => clearInterval(interval);
    }, [queueData.floorTimer]);

    const handleUniqueIdLogin = async () => {
        if (!uniqueIdInput.trim()) return alert(t.enterUniqueId);

        try {
            const res = await fetch('/api/speaker-id-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uniqueId: uniqueIdInput })
            });
            const data = await res.json();

            if (res.ok && data.success) {
                localStorage.setItem('activeSpeaker', JSON.stringify(data.speaker));
                setSpeaker(data.speaker);
            } else {
                alert(data.error || 'Member ID not found.');
            }
        } catch (err) {
            alert('Server connection error.');
        }
    };

    const handleRegister = async () => {
        if (!name || !position) return alert(t.fillNameAndDesig);
        try {
            const res = await fetch('/api/register-options', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, position })
            });
            const options = await res.json();
            const attResp = await startRegistration({ optionsJSON: options });

            const verifyRes = await fetch('/api/verify-registration', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body: attResp })
            });
            const result = await verifyRes.json();

            if (result.verified) {
                const profile = { name, position };
                localStorage.setItem('activeSpeaker', JSON.stringify(profile));
                setSpeaker(profile);
            }
        } catch (err) {
            alert('Biometric registration error: ' + err.message);
        }
    };

    const handleBiometricLogin = async () => {
        try {
            const res = await fetch('/api/auth-options');
            const options = await res.json();
            const asseResp = await startAuthentication({ optionsJSON: options });

            const verifyRes = await fetch('/api/verify-auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body: asseResp })
            });
            const result = await verifyRes.json();

            if (result.verified) {
                localStorage.setItem('activeSpeaker', JSON.stringify(result.speaker));
                setSpeaker(result.speaker);
            }
        } catch (err) {
            alert('Biometric authentication failed: ' + err.message);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('activeSpeaker');
        setSpeaker(null);
    };

    const handleRequestFloor = (category) => {
        const dur = sessionDurations[category];
        let mins = dur.preset;
        let secs = 0;

        if (dur.preset === 'custom') {
            mins = parseInt(dur.customMins || '0', 10);
            secs = parseInt(dur.customSecs || '0', 10);
            if (mins === 0 && secs === 0) return alert(t.selectDurationAlert);
        }

        socket.emit('requestFloor', {
            speaker,
            sectionCategory: category,
            requestedMinutes: mins,
            requestedSeconds: secs,
            topic: speaker.topic || 'Floor Statement',
            topic_ne: speaker.topic_ne || 'सदन वक्तव्य'
        });
    };

    const setPresetTime = (category, mins) => {
        setSessionDurations(prev => ({
            ...prev,
            [category]: { ...prev[category], preset: mins }
        }));
    };

    const setCustomMins = (category, val) => {
        setSessionDurations(prev => ({
            ...prev,
            [category]: { ...prev[category], customMins: val }
        }));
    };

    const setCustomSecs = (category, val) => {
        setSessionDurations(prev => ({
            ...prev,
            [category]: { ...prev[category], customSecs: val }
        }));
    };

    const speakerIdentifier = speaker ? (speaker.uniqueId || speaker.unique_id || speaker.name).toLowerCase().trim() : '';

    // Check lockout per section
    const hasSpokenIn = (cat) => {
        return queueData.spokenMembers?.[cat]?.includes(speakerIdentifier);
    };

    const isActive = speaker && queueData.activeSpeaker?.name.toLowerCase() === speaker.name.toLowerCase();

    const getQueuePosition = (cat) => {
        if (!speaker || !queueData.queues || !queueData.queues[cat]) return -1;
        return queueData.queues[cat].findIndex(s => (s.uniqueId && s.uniqueId === (speaker.uniqueId || speaker.unique_id)) || s.name.toLowerCase() === speaker.name.toLowerCase());
    };

    const sunyaPos = getQueuePosition('sunya');
    const aakasmikPos = getQueuePosition('aakasmik');
    const bisheshPos = getQueuePosition('bishesh');

    // View 1: Auth Screen
    if (!speaker) {
        return (
            <div style={{ maxWidth: '420px', margin: '40px auto', background: '#fff', padding: '32px', borderRadius: '16px', border: '1px solid var(--border)', textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
                    <LanguageToggle />
                </div>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>🏛️</div>
                <h2 style={{ margin: '0 0 6px 0', fontSize: '20px' }}>{t.speakerPortal}</h2>
                <p className="text-muted" style={{ margin: '0 0 24px 0' }}>{t.biometricSubtitle}</p>

                {authMode === 'id' && (
                    <div>
                        <input 
                            type="text" 
                            placeholder={t.enterUniqueId} 
                            value={uniqueIdInput} 
                            onChange={(e) => setUniqueIdInput(e.target.value)}
                            style={{ width: '100%', padding: '12px', marginBottom: '16px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '15px', fontWeight: 600 }}
                        />
                        <button className="btn-success" style={{ width: '100%', padding: '12px', fontSize: '15px' }} onClick={handleUniqueIdLogin}>
                            🔑 {t.loginBtn}
                        </button>
                        <p style={{ marginTop: '16px', fontSize: '13px', cursor: 'pointer', color: 'var(--accent-blue)' }} onClick={() => setAuthMode('scan')}>
                            {t.switchBio}
                        </p>
                    </div>
                )}

                {authMode === 'scan' && (
                    <div>
                        <button className="btn-success" style={{ width: '100%', padding: '12px', fontSize: '15px' }} onClick={handleBiometricLogin}>
                            🧬 {t.scanBio}
                        </button>
                        <p style={{ marginTop: '12px', fontSize: '13px', cursor: 'pointer', color: 'var(--accent-blue)' }} onClick={() => setAuthMode('signup')}>
                            {t.newMember}
                        </p>
                        <p style={{ marginTop: '8px', fontSize: '13px', cursor: 'pointer', color: '#64748b' }} onClick={() => setAuthMode('id')}>
                            {t.switchId}
                        </p>
                    </div>
                )}

                {authMode === 'signup' && (
                    <div>
                        <input 
                            type="text" 
                            placeholder={t.fullNamePlaceholder} 
                            value={name} 
                            onChange={(e) => setName(e.target.value)}
                            style={{ width: '100%', padding: '12px', marginBottom: '12px', border: '1px solid var(--border)', borderRadius: '8px' }}
                        />
                        <input 
                            type="text" 
                            placeholder={t.designationPlaceholder} 
                            value={position} 
                            onChange={(e) => setPosition(e.target.value)}
                            style={{ width: '100%', padding: '12px', marginBottom: '16px', border: '1px solid var(--border)', borderRadius: '8px' }}
                        />
                        <button className="btn-success" style={{ width: '100%', padding: '12px' }} onClick={handleRegister}>
                            {t.registerBio}
                        </button>
                        <p style={{ marginTop: '16px', fontSize: '13px', cursor: 'pointer', color: 'var(--accent-blue)' }} onClick={() => setAuthMode('id')}>
                            {t.switchId}
                        </p>
                    </div>
                )}
            </div>
        );
    }

    const currentTabDuration = sessionDurations[activeTab];
    const currentTabQueuePos = getQueuePosition(activeTab);
    const isCurrentTabLockedOut = hasSpokenIn(activeTab);

    // View 2: Multi-Queue Floor Dashboard
    return (
        <div style={{ maxWidth: '440px', margin: '30px auto', background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid var(--border)', textAlign: 'center' }}>
            {/* Member Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span className="badge badge-live" style={{ fontSize: '12px', padding: '6px 14px' }}>
                    {getLocalizedText(speaker, 'name')} • {getLocalizedText(speaker, 'position')}
                </span>
                <LanguageToggle />
            </div>

            {/* Currently Active Parliamentary Session Indicator */}
            <div style={{
                background: '#f1f5f9',
                borderRadius: '8px',
                padding: '8px 12px',
                marginBottom: '12px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
            }}>
                <span>🏛️ Ongoing Floor Session:</span>
                <strong style={{
                    color: queueData.activeSection === 'sunya' ? '#2563eb' : queueData.activeSection === 'aakasmik' ? '#dc2626' : '#7c3aed'
                }}>
                    {queueData.activeSection === 'sunya' ? 'Sunya Samaya' : queueData.activeSection === 'aakasmik' ? 'Aakasmik Samaya' : 'Bishesh Samaya'}
                </strong>
            </div>

            {/* Topic Display Box */}
            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', fontSize: '13px', color: '#0f172a', marginBottom: '16px', border: '1px solid var(--border)', textAlign: 'left' }}>
                📌 <strong>{t.topic}:</strong>{' '}
                <span style={{ color: '#2563eb', fontWeight: 700 }}>
                    {getLocalizedText(speaker, 'topic') || 'Floor Statement'}
                </span>
            </div>

            {/* Active Live Speaking Banner */}
            {isActive && (
                <div style={{ background: '#f0fdf4', border: '2px solid #bbf7d0', borderRadius: '12px', padding: '16px', margin: '0 0 16px 0' }}>
                    <div style={{ color: '#166534', fontWeight: 800, fontSize: '13px', textTransform: 'uppercase' }}>
                        {t.youHaveTheFloor} ({queueData.activeSpeaker?.sessionCategory?.toUpperCase() || 'SESSION'})
                    </div>
                    <div style={{ fontSize: '44px', fontWeight: 900, fontFamily: 'monospace', color: remainingSecs <= 60 ? '#854d0e' : '#166534' }}>
                        {remainingSecs <= 0 ? t.expired : toDevanagariDigits(`${String(Math.floor(remainingSecs / 60)).padStart(2, '0')}:${String(remainingSecs % 60).padStart(2, '0')}`)}
                    </div>
                </div>
            )}

            {/* Status Across All 3 Sessions */}
            <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px', marginBottom: '16px', textAlign: 'left' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>
                    📋 Live Status Across All 3 Sessions
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                    {/* Sunya Status */}
                    <div 
                        onClick={() => setActiveTab('sunya')}
                        style={{ 
                            background: hasSpokenIn('sunya') ? '#f1f5f9' : sunyaPos !== -1 ? '#eff6ff' : '#fff', 
                            border: `2px solid ${activeTab === 'sunya' ? '#2563eb' : sunyaPos !== -1 ? '#93c5fd' : '#e2e8f0'}`, 
                            borderRadius: '8px', 
                            padding: '8px 4px', 
                            textAlign: 'center',
                            cursor: 'pointer'
                        }}
                    >
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb' }}>⏳ {t.sunyaSamaya?.split(' ')[0] || 'Sunya'}</div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: hasSpokenIn('sunya') ? '#64748b' : sunyaPos !== -1 ? '#1d4ed8' : '#94a3b8', marginTop: '2px' }}>
                            {hasSpokenIn('sunya') ? 'Spoken' : sunyaPos !== -1 ? `#${toDevanagariDigits(sunyaPos + 1)} in line` : 'Not Queued'}
                        </div>
                    </div>

                    {/* Aakasmik Status */}
                    <div 
                        onClick={() => setActiveTab('aakasmik')}
                        style={{ 
                            background: hasSpokenIn('aakasmik') ? '#f1f5f9' : aakasmikPos !== -1 ? '#fef2f2' : '#fff', 
                            border: `2px solid ${activeTab === 'aakasmik' ? '#dc2626' : aakasmikPos !== -1 ? '#fca5a5' : '#e2e8f0'}`, 
                            borderRadius: '8px', 
                            padding: '8px 4px', 
                            textAlign: 'center',
                            cursor: 'pointer'
                        }}
                    >
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#dc2626' }}>🚨 {t.aakasmikSamaya?.split(' ')[0] || 'Aakasmik'}</div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: hasSpokenIn('aakasmik') ? '#64748b' : aakasmikPos !== -1 ? '#b91c1c' : '#94a3b8', marginTop: '2px' }}>
                            {hasSpokenIn('aakasmik') ? 'Spoken' : aakasmikPos !== -1 ? `#${toDevanagariDigits(aakasmikPos + 1)} in line` : 'Not Queued'}
                        </div>
                    </div>

                    {/* Bishesh Status */}
                    <div 
                        onClick={() => setActiveTab('bishesh')}
                        style={{ 
                            background: hasSpokenIn('bishesh') ? '#f1f5f9' : bisheshPos !== -1 ? '#f5f3ff' : '#fff', 
                            border: `2px solid ${activeTab === 'bishesh' ? '#7c3aed' : bisheshPos !== -1 ? '#c4b5fd' : '#e2e8f0'}`, 
                            borderRadius: '8px', 
                            padding: '8px 4px', 
                            textAlign: 'center',
                            cursor: 'pointer'
                        }}
                    >
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#7c3aed' }}>🌟 {t.bisheshSamaya?.split(' ')[0] || 'Bishesh'}</div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: hasSpokenIn('bishesh') ? '#64748b' : bisheshPos !== -1 ? '#6d28d9' : '#94a3b8', marginTop: '2px' }}>
                            {hasSpokenIn('bishesh') ? 'Spoken' : bisheshPos !== -1 ? `#${toDevanagariDigits(bisheshPos + 1)} in line` : 'Not Queued'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Session Queue Card */}
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', marginBottom: '20px', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: activeTab === 'sunya' ? '#2563eb' : activeTab === 'aakasmik' ? '#dc2626' : '#7c3aed' }}>
                        {activeTab === 'sunya' ? `⏳ ${t.sunyaSamaya}` : activeTab === 'aakasmik' ? `🚨 ${t.aakasmikSamaya}` : `🌟 ${t.bisheshSamaya}`}
                    </h3>
                    {currentTabQueuePos !== -1 && (
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: '6px' }}>
                            ✓ Queued (#{toDevanagariDigits(currentTabQueuePos + 1)})
                        </span>
                    )}
                </div>

                {/* Lockout Notice if already spoken in this section */}
                {isCurrentTabLockedOut ? (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '12px', borderRadius: '8px', fontSize: '12px', textAlign: 'center' }}>
                        ⚠️ You have already spoken in this section during today's session.
                    </div>
                ) : currentTabQueuePos !== -1 ? (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
                        <div style={{ color: '#166534', fontWeight: 800, fontSize: '14px' }}>
                            {t.inQueueForFloor}
                        </div>
                        <div style={{ color: '#15803d', fontSize: '13px', marginTop: '4px' }}>
                            {t.positionInLine}: <strong>#{toDevanagariDigits(currentTabQueuePos + 1)}</strong>
                        </div>
                        <p className="text-muted" style={{ margin: '8px 0 0 0', fontSize: '11px' }}>
                            You are active in this queue. You can switch tabs to queue in other sessions as well.
                        </p>
                    </div>
                ) : (
                    <div>
                        <label className="text-muted" style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '11px' }}>
                            ⏱️ {t.selectTime}
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', margin: '6px 0 12px 0' }}>
                            {[1, 3, 5].map((mins) => (
                                <button
                                    key={mins}
                                    type="button"
                                    className="btn-secondary"
                                    style={{
                                        padding: '8px',
                                        fontWeight: 700,
                                        fontSize: '12px',
                                        background: currentTabDuration.preset === mins ? 'var(--accent-blue, #2563eb)' : '#fff',
                                        color: currentTabDuration.preset === mins ? '#fff' : 'inherit'
                                    }}
                                    onClick={() => setPresetTime(activeTab, mins)}
                                >
                                    {toDevanagariDigits(mins)} {t.oneMin?.replace(/[1१]/g, '').trim() || 'Min'}
                                </button>
                            ))}
                            <button
                                type="button"
                                className="btn-secondary"
                                style={{
                                    padding: '8px',
                                    fontWeight: 700,
                                    fontSize: '12px',
                                    background: currentTabDuration.preset === 'custom' ? 'var(--accent-blue, #2563eb)' : '#fff',
                                    color: currentTabDuration.preset === 'custom' ? '#fff' : 'inherit'
                                }}
                                onClick={() => setPresetTime(activeTab, 'custom')}
                            >
                                {t.customTime}
                            </button>
                        </div>

                        {currentTabDuration.preset === 'custom' && (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '14px' }}>
                                <input 
                                    type="number" 
                                    placeholder="0" 
                                    min="0" 
                                    value={currentTabDuration.customMins} 
                                    onChange={(e) => setCustomMins(activeTab, e.target.value)}
                                    style={{ width: '60px', padding: '8px', textAlign: 'center', border: '1px solid var(--border)', borderRadius: '6px' }}
                                />
                                <span style={{ fontSize: '12px', fontWeight: 600 }}>m</span>
                                <input 
                                    type="number" 
                                    placeholder="0" 
                                    min="0" 
                                    max="59" 
                                    value={currentTabDuration.customSecs} 
                                    onChange={(e) => setCustomSecs(activeTab, e.target.value)}
                                    style={{ width: '60px', padding: '8px', textAlign: 'center', border: '1px solid var(--border)', borderRadius: '6px' }}
                                />
                                <span style={{ fontSize: '12px', fontWeight: 600 }}>s</span>
                            </div>
                        )}

                        <button 
                            className="btn-success" 
                            style={{ 
                                width: '100%', 
                                padding: '12px', 
                                fontSize: '14px',
                                fontWeight: 800,
                                background: activeTab === 'sunya' ? '#2563eb' : activeTab === 'aakasmik' ? '#dc2626' : '#7c3aed'
                            }} 
                            onClick={() => handleRequestFloor(activeTab)}
                        >
                            ➕ {t.requestFloor} ({t[activeTab === 'sunya' ? 'sunyaSamaya' : activeTab === 'aakasmik' ? 'aakasmikSamaya' : 'bisheshSamaya']?.split(' ')[0]})
                        </button>
                    </div>
                )}
            </div>

            <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '16px 0' }} />

            {/* Interruption / Point of Order Panel */}
            <div style={{ textAlign: 'left', marginBottom: '12px' }}>
                <label className="text-muted" style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '11px' }}>{t.priorityReason}</label>
                <select 
                    value={interruptReason} 
                    onChange={(e) => setInterruptReason(e.target.value)}
                    style={{ width: '100%', padding: '10px', marginTop: '6px', border: '1px solid var(--border)', borderRadius: '8px' }}
                >
                    <option value="Point of Order">{t.pointOfOrder}</option>
                    <option value="Direct Rebuttal">{t.directRebuttal}</option>
                    <option value="Point of Information">{t.pointOfInfo}</option>
                </select>
            </div>
            <button 
                className="btn-danger" 
                style={{ width: '100%', padding: '12px' }} 
                disabled={hasSpokenIn('aakasmik')}
                onClick={() => socket.emit('raiseInterruption', { speaker, reason: interruptReason })}
            >
                {hasSpokenIn('aakasmik') ? 'आकस्मिक अवसर प्रयोग भइसकेको छ' : t.raiseInterruption}
            </button>

            <button className="btn-secondary" style={{ width: '100%', marginTop: '16px' }} onClick={handleLogout}>
                {t.signOut}
            </button>
        </div>
    );
}