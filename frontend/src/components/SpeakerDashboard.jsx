import React, { useState, useEffect } from 'react';
import { socket } from '../socket';
import { useLanguage } from '../context/LanguageContext';
import LanguageToggle from './LanguageToggle';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

export default function SpeakerDashboard() {
    const { t, toDevanagariDigits } = useLanguage();
    const [speaker, setSpeaker] = useState(() => {
        return JSON.parse(localStorage.getItem('activeSpeaker') || 'null');
    });

    const [name, setName] = useState('');
    const [position, setPosition] = useState('');
    const [isSignUp, setIsSignUp] = useState(true);
    const [interruptReason, setInterruptReason] = useState('Point of Order');
    const [queueData, setQueueData] = useState({ queue: [], activeSpeaker: null, floorTimer: {} });
    const [remainingSecs, setRemainingSecs] = useState(0);

    useEffect(() => {
        socket.on('queueUpdated', (data) => {
            setQueueData(data);
        });
        return () => socket.off('queueUpdated');
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

    const handleLogin = async () => {
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

    const isActive = speaker && queueData.activeSpeaker?.name.toLowerCase() === speaker.name.toLowerCase();
    const queueIdx = speaker ? queueData.queue.findIndex(s => s.name.toLowerCase() === speaker.name.toLowerCase()) : -1;

    // View 1: Auth Screen
    if (!speaker) {
        return (
            <div style={{ maxWidth: '400px', margin: '40px auto', background: '#fff', padding: '32px', borderRadius: '16px', border: '1px solid var(--border)', textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
                    <LanguageToggle />
                </div>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>🏛️</div>
                <h2 style={{ margin: '0 0 6px 0', fontSize: '20px' }}>{t.speakerPortal}</h2>
                <p className="text-muted" style={{ margin: '0 0 24px 0' }}>{t.biometricSubtitle}</p>

                {isSignUp ? (
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
                        <p style={{ marginTop: '16px', fontSize: '13px', cursor: 'pointer', color: 'var(--accent-blue)' }} onClick={() => setIsSignUp(false)}>
                            {t.alreadyRegistered}
                        </p>
                    </div>
                ) : (
                    <div>
                        <button className="btn-success" style={{ width: '100%', padding: '12px' }} onClick={handleLogin}>
                            {t.scanBio}
                        </button>
                        <p style={{ marginTop: '16px', fontSize: '13px', cursor: 'pointer', color: 'var(--accent-blue)' }} onClick={() => setIsSignUp(true)}>
                            {t.newMember}
                        </p>
                    </div>
                )}
            </div>
        );
    }

    // View 2: Mobile Floor Dashboard
    return (
        <div style={{ maxWidth: '420px', margin: '40px auto', background: '#fff', padding: '32px', borderRadius: '16px', border: '1px solid var(--border)', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span className="badge badge-live" style={{ fontSize: '12px', padding: '6px 14px' }}>
                    {speaker.name} • {speaker.position}
                </span>
                <LanguageToggle />
            </div>

            {isActive ? (
                <div style={{ background: '#f0fdf4', border: '2px solid #bbf7d0', borderRadius: '12px', padding: '20px', margin: '24px 0' }}>
                    <div style={{ color: '#166534', fontWeight: 800, fontSize: '14px', textTransform: 'uppercase' }}>{t.youHaveTheFloor}</div>
                    <div style={{ fontSize: '48px', fontWeight: 900, fontFamily: 'monospace', color: remainingSecs <= 60 ? '#854d0e' : '#166534' }}>
                        {remainingSecs <= 0 ? t.expired : toDevanagariDigits(`${String(Math.floor(remainingSecs / 60)).padStart(2, '0')}:${String(remainingSecs % 60).padStart(2, '0')}`)}
                    </div>
                </div>
            ) : queueIdx !== -1 ? (
                <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', margin: '24px 0' }}>
                    <div style={{ fontWeight: 700, color: 'var(--accent-blue)' }}>{t.inQueueForFloor}</div>
                    <div className="text-muted" style={{ marginTop: '4px' }}>{t.positionInLine}: #{toDevanagariDigits(queueIdx + 1)}</div>
                </div>
            ) : (
                <button className="btn-success" style={{ width: '100%', padding: '14px', margin: '24px 0', fontSize: '15px' }} onClick={() => socket.emit('requestFloor', speaker)}>
                    {t.requestFloor}
                </button>
            )}

            <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '20px 0' }} />

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
            <button className="btn-danger" style={{ width: '100%', padding: '12px' }} onClick={() => socket.emit('raiseInterruption', { speaker, reason: interruptReason })}>
                {t.raiseInterruption}
            </button>

            <button className="btn-secondary" style={{ width: '100%', marginTop: '20px' }} onClick={handleLogout}>
                {t.signOut}
            </button>
        </div>
    );
}