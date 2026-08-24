import React, { useState, useEffect, useCallback } from 'react';
import { socket } from '../socket';
import { useLanguage } from '../context/LanguageContext';

export default function SpeakingAnalyticsTab() {
    const { t, toDevanagariDigits, getLocalizedText } = useLanguage();
    const [stats, setStats] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const getApiBase = () => {
        if (typeof window === 'undefined') return 'http://localhost:3000';
        const host = window.location.hostname;
        if (host.includes('devtunnels.ms')) {
            return window.location.origin.replace('-5173.', '-3000.');
        }
        return `http://${host}:3000`;
    };

    const fetchStats = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${getApiBase()}/api/speaker-stats`);
            if (res.ok) {
                const data = await res.json();
                setStats(Array.isArray(data) ? data : []);
            } else {
                setStats([]);
            }
        } catch (err) {
            console.error('Error fetching speaking analytics:', err);
            setStats([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();
        const handleStatsUpdate = () => fetchStats();
        socket.on('speakerStatsUpdated', handleStatsUpdate);
        return () => socket.off('speakerStatsUpdated', handleStatsUpdate);
    }, [fetchStats]);

    const formatDuration = (totalSeconds) => {
        const secs = parseInt(totalSeconds || 0, 10);
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${toDevanagariDigits(m)}m ${toDevanagariDigits(s)}s`;
    };

    const filteredStats = stats.filter(row => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return true;
        const nameMatch = row.name && row.name.toLowerCase().includes(query);
        const posMatch = row.position && row.position.toLowerCase().includes(query);
        return nameMatch || posMatch;
    });

    return (
        <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            padding: '24px',
            border: '1.5px solid #e2e8f0',
            boxShadow: '0 2px 10px rgba(0,0,0,0.02)',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>
                        📊 {t?.speakingAnalytics || 'Speaker Time & Floor Records'}
                    </h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                        Aggregated floor speaking logs recorded by date and duration
                    </p>
                </div>
                <button
                    onClick={fetchStats}
                    style={{
                        background: '#0f172a',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '10px 16px',
                        fontSize: '13px',
                        fontWeight: 800,
                        cursor: 'pointer'
                    }}
                >
                    🔄 {t?.refreshRecords || 'Refresh Records'}
                </button>
            </div>

            <div>
                <input
                    type="text"
                    placeholder={`🔍 ${t?.searchPlaceholder || 'Filter by Member Name...'}`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
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
                        <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', color: '#64748b' }}>
                            <th style={{ padding: '12px 16px' }}>#</th>
                            <th style={{ padding: '12px 16px' }}>{t?.memberName || 'Member Name'}</th>
                            <th style={{ padding: '12px 16px' }}>{t?.designation || 'Designation'}</th>
                            <th style={{ padding: '12px 16px' }}>{t?.totalSpokenTime || 'Total Spoken Time'}</th>
                            <th style={{ padding: '12px 16px' }}>{t?.turnsTaken || 'Turns Taken'}</th>
                            <th style={{ padding: '12px 16px' }}>{t?.spokenDate || 'Session Date'}</th>
                            <th style={{ padding: '12px 16px' }}>{t?.lastSpoken || 'Last Spoken At'}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan="7" style={{ padding: '32px', textAlign: 'center', color: '#64748b', fontWeight: 700 }}>
                                    Loading analytics...
                                </td>
                            </tr>
                        ) : filteredStats.length === 0 ? (
                            <tr>
                                <td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>
                                    {t?.noRecordsFound || 'No floor speaking records found yet.'}
                                </td>
                            </tr>
                        ) : (
                            filteredStats.map((row, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '12px 16px', color: '#94a3b8', fontWeight: 800 }}>
                                        {toDevanagariDigits(idx + 1)}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontWeight: 900, color: '#0f172a' }}>
                                        {getLocalizedText(row, 'name')}
                                    </td>
                                    <td style={{ padding: '12px 16px', color: '#475569', fontWeight: 600 }}>
                                        {getLocalizedText(row, 'position')}
                                    </td>
                                    <td style={{ padding: '12px 16px', color: '#16a34a', fontWeight: 900 }}>
                                        ⏱️ {formatDuration(row.total_seconds)}
                                    </td>
                                    <td style={{ padding: '12px 16px', color: '#2563eb', fontWeight: 800 }}>
                                        {toDevanagariDigits(row.session_count)}
                                    </td>
                                    <td style={{ padding: '12px 16px', color: '#64748b', fontWeight: 700 }}>
                                        {toDevanagariDigits(row.session_date || '--')}
                                    </td>
                                    <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '12px' }}>
                                        {toDevanagariDigits(row.last_spoken_at || '--')}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}