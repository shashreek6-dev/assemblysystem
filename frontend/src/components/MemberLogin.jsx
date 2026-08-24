import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { useLanguage } from '../context/LanguageContext';
import LanguageToggle from './LanguageToggle';

export default function MemberLogin() {
    const navigate = useNavigate();
    const { t } = useLanguage();

    const [memberId, setMemberId] = useState('');
    const [isBiometricMode, setIsBiometricMode] = useState(false);
    const [isRegisteringBio, setIsRegisteringBio] = useState(false);
    const [bioName, setBioName] = useState('');
    const [bioPosition, setBioPosition] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const getApiBase = () => {
        if (typeof window === 'undefined') return 'http://localhost:3000';
        const host = window.location.hostname;
        if (host.includes('devtunnels.ms')) {
            return window.location.origin.replace('-5173.', '-3000.');
        }
        return `http://${host}:3000`;
    };

    const handleMemberIdLogin = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        if (!memberId.trim()) {
            setErrorMsg('Please enter your Unique Member ID.');
            return;
        }

        setIsLoading(true);

        try {
            const res = await fetch(`${getApiBase()}/api/speaker-id-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uniqueId: memberId.trim() })
            });

            const data = await res.json();
            if (res.ok && data.success && data.speaker) {
                localStorage.setItem('currentSpeaker', JSON.stringify(data.speaker));
                navigate('/speaker');
            } else {
                setErrorMsg(data.error || 'Unique Member ID not found in roster.');
            }
        } catch (err) {
            console.error('MP ID Login Error:', err);
            setErrorMsg(t?.connError || 'Connection error. Ensure backend server is active on port 3000.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleBiometricAuth = async () => {
        setErrorMsg('');
        setIsLoading(true);

        try {
            const optRes = await fetch(`${getApiBase()}/api/auth-options`);
            if (!optRes.ok) throw new Error('Failed to retrieve authentication challenge.');
            const options = await optRes.json();

            const authResp = await startAuthentication(options);

            const verifyRes = await fetch(`${getApiBase()}/api/verify-auth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(authResp)
            });

            const verifyData = await verifyRes.json();
            if (verifyRes.ok && verifyData.verified && verifyData.speaker) {
                localStorage.setItem('currentSpeaker', JSON.stringify(verifyData.speaker));
                navigate('/speaker');
            } else {
                setErrorMsg('Biometric authentication failed. Please try again.');
            }
        } catch (err) {
            console.error('Biometric Auth Error:', err);
            setErrorMsg(err.message || 'Biometric scan failed or was cancelled.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleBiometricRegister = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        if (!bioName.trim() || !bioPosition.trim()) {
            setErrorMsg(t?.fillNameAndDesig || 'Please enter full name and designation.');
            return;
        }

        setIsLoading(true);

        try {
            const optRes = await fetch(`${getApiBase()}/api/register-options`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: bioName.trim(), position: bioPosition.trim() })
            });

            if (!optRes.ok) throw new Error('Failed to generate biometric options.');
            const options = await optRes.json();

            const regResp = await startRegistration(options);

            const verifyRes = await fetch(`${getApiBase()}/api/verify-registration`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body: regResp })
            });

            const verifyData = await verifyRes.json();
            if (verifyRes.ok && verifyData.verified) {
                localStorage.setItem('currentSpeaker', JSON.stringify({
                    name: verifyData.name,
                    position: verifyData.position,
                    uniqueId: `BIO-${Date.now()}`
                }));
                navigate('/speaker');
            } else {
                setErrorMsg('Biometric registration could not be verified.');
            }
        } catch (err) {
            console.error('Biometric Reg Error:', err);
            setErrorMsg(err.message || 'Device biometric registration failed.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            boxSizing: 'border-box'
        }}>
            <div style={{
                background: '#ffffff',
                borderRadius: '24px',
                padding: '36px 32px',
                width: '100%',
                maxWidth: '440px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                boxSizing: 'border-box'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 900, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        📱 Member Portal
                    </span>
                    <LanguageToggle />
                </div>

                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <div style={{ fontSize: '40px', marginBottom: '8px' }}>🙋</div>
                    <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 900, color: '#0f172a' }}>
                        {t?.speakerPortal || 'Member Speaker Portal'}
                    </h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                        {isBiometricMode ? (t?.biometricSubtitle || 'Biometric Verification & Floor Access') : 'Enter your registered Member Unique ID'}
                    </p>
                </div>

                {errorMsg && (
                    <div style={{
                        background: '#fef2f2',
                        border: '1.5px solid #fca5a5',
                        color: '#dc2626',
                        padding: '12px 14px',
                        borderRadius: '10px',
                        fontSize: '13px',
                        fontWeight: 700,
                        marginBottom: '20px',
                        textAlign: 'center'
                    }}>
                        {errorMsg}
                    </div>
                )}

                {/* ID Mode */}
                {!isBiometricMode ? (
                    <div>
                        <form onSubmit={handleMemberIdLogin}>
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                                    {t?.uniqueId || 'Unique ID'}
                                </label>
                                <input
                                    type="text"
                                    placeholder={t?.enterUniqueId || 'e.g. MP-101'}
                                    value={memberId}
                                    onChange={(e) => setMemberId(e.target.value)}
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '14px',
                                        borderRadius: '10px',
                                        border: '1.5px solid #cbd5e1',
                                        fontSize: '16px',
                                        fontWeight: 800,
                                        boxSizing: 'border-box',
                                        textTransform: 'uppercase'
                                    }}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                style={{
                                    width: '100%',
                                    padding: '14px',
                                    borderRadius: '10px',
                                    border: 'none',
                                    background: '#2563eb',
                                    color: '#ffffff',
                                    fontWeight: 900,
                                    fontSize: '15px',
                                    cursor: isLoading ? 'not-allowed' : 'pointer',
                                    boxShadow: '0 4px 14px rgba(37,99,235,0.3)'
                                }}
                            >
                                {isLoading ? 'Authenticating...' : (t?.loginBtn || 'Access Member Floor')}
                            </button>
                        </form>

                        <div style={{ textAlign: 'center', marginTop: '20px' }}>
                            <button
                                type="button"
                                onClick={() => { setIsBiometricMode(true); setErrorMsg(''); }}
                                style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}
                            >
                                🔒 {t?.switchBio || 'Use Biometrics / Face ID'}
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Biometric Mode */
                    <div>
                        {!isRegisteringBio ? (
                            <div>
                                <button
                                    onClick={handleBiometricAuth}
                                    disabled={isLoading}
                                    style={{
                                        width: '100%',
                                        padding: '16px',
                                        borderRadius: '12px',
                                        border: 'none',
                                        background: '#16a34a',
                                        color: '#ffffff',
                                        fontWeight: 900,
                                        fontSize: '15px',
                                        cursor: isLoading ? 'not-allowed' : 'pointer',
                                        boxShadow: '0 4px 14px rgba(22,163,74,0.3)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px',
                                        marginBottom: '16px'
                                    }}
                                >
                                    👆 {isLoading ? 'Scanning...' : (t?.scanBio || 'Scan Face ID / Fingerprint')}
                                </button>

                                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setIsRegisteringBio(true)}
                                        style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}
                                    >
                                        ➕ {t?.newMember || 'New member? Register profile'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setIsBiometricMode(false); setErrorMsg(''); }}
                                        style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}
                                    >
                                        📇 {t?.switchId || 'Have a Member ID? Login with ID'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleBiometricRegister}>
                                <div style={{ marginBottom: '14px' }}>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                                        {t?.fullNamePlaceholder || 'Full Name'}
                                    </label>
                                    <input
                                        type="text"
                                        value={bioName}
                                        onChange={(e) => setBioName(e.target.value)}
                                        required
                                        style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                                    />
                                </div>

                                <div style={{ marginBottom: '18px' }}>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                                        {t?.designationPlaceholder || 'Designation'}
                                    </label>
                                    <input
                                        type="text"
                                        value={bioPosition}
                                        onChange={(e) => setBioPosition(e.target.value)}
                                        required
                                        style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    style={{
                                        width: '100%',
                                        padding: '14px',
                                        borderRadius: '10px',
                                        border: 'none',
                                        background: '#0284c7',
                                        color: '#ffffff',
                                        fontWeight: 900,
                                        fontSize: '15px',
                                        cursor: isLoading ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    {isLoading ? 'Registering...' : (t?.registerBio || 'Register Device Biometrics')}
                                </button>

                                <div style={{ textAlign: 'center', marginTop: '14px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setIsRegisteringBio(false)}
                                        style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}
                                    >
                                        ← {t?.alreadyRegistered || 'Already registered? Scan to log in'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}