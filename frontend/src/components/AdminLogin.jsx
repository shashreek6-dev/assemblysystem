import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import LanguageToggle from './LanguageToggle';

export default function AdminLogin() {
    const navigate = useNavigate();
    const { t } = useLanguage();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
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

    const handleAdminLogin = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        setIsLoading(true);

        try {
            const res = await fetch(`${getApiBase()}/api/head-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username.trim(), password: password.trim() })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                localStorage.setItem('adminToken', data.token || `HEAD-TOKEN-${Date.now()}`);
                navigate('/head');
            } else {
                setErrorMsg(data.error || t?.authError || 'Invalid Presiding Officer credentials.');
            }
        } catch (err) {
            console.error('Admin Login Error:', err);
            setErrorMsg(t?.connError || 'Connection error. Ensure backend server is active on port 3000.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
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
                    <span style={{ fontSize: '12px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        🛡️ Official Access
                    </span>
                    <LanguageToggle />
                </div>

                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <div style={{ fontSize: '40px', marginBottom: '8px' }}>🏛️</div>
                    <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 900, color: '#0f172a' }}>
                        {t?.presidingOfficer || 'Presiding Officer'}
                    </h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                        {t?.authSubtitle || 'Session Control Console Authentication'}
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

                <form onSubmit={handleAdminLogin}>
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                            {t?.adminUserPlaceholder || 'Admin Username'}
                        </label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            placeholder="e.g. admin"
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                borderRadius: '8px',
                                border: '1.5px solid #cbd5e1',
                                fontSize: '14px',
                                fontWeight: 700,
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                            {t?.passwordPlaceholder || 'Password'}
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            placeholder="••••••••"
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                borderRadius: '8px',
                                border: '1.5px solid #cbd5e1',
                                fontSize: '14px',
                                fontWeight: 700,
                                boxSizing: 'border-box'
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
                            background: '#0f172a',
                            color: '#ffffff',
                            fontWeight: 900,
                            fontSize: '15px',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            boxShadow: '0 4px 14px rgba(15,23,42,0.3)'
                        }}
                    >
                        {isLoading ? 'Authenticating...' : (t?.authSession || 'Authenticate Session')}
                    </button>
                </form>
            </div>
        </div>
    );
}