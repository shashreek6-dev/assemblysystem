import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import LanguageToggle from './LanguageToggle';

export default function SpeakerLogin() {
    const navigate = useNavigate();
    const { t, getLocalizedText } = useLanguage();
    const [uniqueId, setUniqueId] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const getApiBase = () => {
        if (typeof window === 'undefined') return 'http://localhost:3000';
        const host = window.location.hostname;
        if (host.includes('devtunnels.ms')) {
            return window.location.origin.replace('-5173.', '-3000.');
        }
        return `http://${host}:3000`;
    };

    const handleIdLogin = async (e) => {
        e.preventDefault();
        if (!uniqueId.trim()) return;

        setLoading(true);
        setError('');

        try {
            const res = await fetch(`${getApiBase()}/api/speaker-id-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uniqueId: uniqueId.trim() })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                localStorage.setItem('currentSpeaker', JSON.stringify(data.speaker));
                navigate('/speaker');
            } else {
                setError(data.error || 'Invalid Unique ID');
            }
        } catch (err) {
            console.error('Login network error:', err);
            setError(t?.connError || 'Connection error. Ensure backend server is active.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            width: '100vw',
            background: '#090d16',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            boxSizing: 'border-box',
            fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
            <div style={{
                background: '#ffffff',
                borderRadius: '24px',
                padding: '36px 30px',
                width: '100%',
                maxWidth: '440px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
                boxSizing: 'border-box'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <span style={{ fontSize: '28px' }}>🏛️</span>
                    <LanguageToggle />
                </div>

                <h2 style={{ margin: '0 0 6px 0', fontSize: '22px', fontWeight: 900, color: '#0f172a' }}>
                    {t?.speakerPortal || 'Member Speaker Portal'}
                </h2>
                <p style={{ margin: '0 0 24px 0', fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                    {t?.biometricSubtitle || 'Biometric Verification & Floor Access'}
                </p>

                {error && (
                    <div style={{
                        background: '#fef2f2',
                        border: '1.5px solid #fecaca',
                        color: '#dc2626',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        fontSize: '13px',
                        fontWeight: 700,
                        marginBottom: '16px'
                    }}>
                        ⚠️ {error}
                    </div>
                )}

                <form onSubmit={handleIdLogin}>
                    <div style={{ marginBottom: '18px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '8px' }}>
                            {t?.enterUniqueId || 'Enter your Unique Member ID (e.g. MP-101)'}
                        </label>
                        <input
                            type="text"
                            value={uniqueId}
                            onChange={(e) => setUniqueId(e.target.value)}
                            placeholder="MP-101"
                            required
                            style={{
                                width: '100%',
                                padding: '14px 16px',
                                borderRadius: '10px',
                                border: '1.5px solid #cbd5e1',
                                fontSize: '16px',
                                fontWeight: 800,
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            width: '100%',
                            padding: '14px',
                            borderRadius: '10px',
                            border: 'none',
                            background: '#2563eb',
                            color: '#ffffff',
                            fontWeight: 900,
                            fontSize: '15px',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
                        }}
                    >
                        {loading ? 'Authenticating...' : (t?.loginBtn || 'Access Member Floor')}
                    </button>
                </form>
            </div>
        </div>
    );
}