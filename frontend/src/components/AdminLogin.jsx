import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import LanguageToggle from './LanguageToggle';

export default function AdminLogin() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const { t } = useLanguage();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');

        try {
            const res = await fetch('/api/head-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                localStorage.setItem('adminToken', data.token);
                navigate('/admin/console');
            } else {
                setError(data.error || t.authError);
            }
        } catch (err) {
            setError(t.connError);
        }
    };

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '16px', padding: '40px', maxWidth: '380px', width: '100%', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', position: 'relative' }}>
                <div style={{ position: 'absolute', top: '16px', right: '16px' }}>
                    <LanguageToggle />
                </div>
                <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', textAlign: 'center' }}>{t.presidingOfficer}</h2>
                <p className="text-muted" style={{ margin: '0 0 24px 0', textAlign: 'center', fontSize: '13px' }}>{t.authSubtitle}</p>

                {error && <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '10px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px', textAlign: 'center' }}>{error}</div>}

                <form onSubmit={handleLogin}>
                    <input 
                        type="text" 
                        placeholder={t.adminUserPlaceholder} 
                        value={username} 
                        onChange={(e) => setUsername(e.target.value)}
                        style={{ width: '100%', padding: '12px', marginBottom: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                        required
                    />
                    <input 
                        type="password" 
                        placeholder={t.passwordPlaceholder} 
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)}
                        style={{ width: '100%', padding: '12px', marginBottom: '20px', borderRadius: '8px', border: '1px solid var(--border)' }}
                        required
                    />
                    <button type="submit" className="btn-success" style={{ width: '100%', padding: '12px', fontSize: '14px' }}>
                        {t.authSession}
                    </button>
                </form>
            </div>
        </div>
    );
}