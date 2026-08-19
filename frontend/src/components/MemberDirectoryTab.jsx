import React, { useState, useEffect } from 'react';
import { socket } from '../socket';
import { useLanguage } from '../context/LanguageContext';

export default function MemberDirectoryTab() {
    const { t, toDevanagariDigits, getLocalizedText } = useLanguage();
    const [members, setMembers] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMember, setEditingMember] = useState(null);

    const [formData, setFormData] = useState({
        uniqueId: '',
        name: '',
        name_ne: '',
        position: 'Member of Parliament',
        position_ne: '',
        topic: '',
        topic_ne: ''
    });

    const fetchDirectory = async () => {
        try {
            const url = searchQuery.trim() 
                ? `/api/permanent-members?query=${encodeURIComponent(searchQuery.trim())}` 
                : '/api/permanent-members';
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setMembers(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error('Failed to fetch directory:', err);
            setMembers([]);
        }
    };

    useEffect(() => {
        fetchDirectory();
    }, [searchQuery]);

    useEffect(() => {
        socket.on('directoryUpdated', fetchDirectory);
        return () => socket.off('directoryUpdated');
    }, []);

    const openAddModal = () => {
        setEditingMember(null);
        setFormData({
            uniqueId: `MP-${Date.now().toString().slice(-4)}`,
            name: '',
            name_ne: '',
            position: 'Member of Parliament',
            position_ne: '',
            topic: '',
            topic_ne: ''
        });
        setIsModalOpen(true);
    };

    const openEditModal = (member) => {
        setEditingMember(member);
        setFormData({
            uniqueId: member.unique_id || '',
            name: member.name || '',
            name_ne: member.name_ne || '',
            position: member.position || 'Member of Parliament',
            position_ne: member.position_ne || '',
            topic: member.topic || '',
            topic_ne: member.topic_ne || ''
        });
        setIsModalOpen(true);
    };

    const handleDelete = async (id, name) => {
        if (window.confirm(`Are you sure you want to delete member ${name}?`)) {
            try {
                const res = await fetch(`/api/permanent-members/${id}`, { method: 'DELETE' });
                if (res.ok) {
                    fetchDirectory();
                } else {
                    alert('Failed to delete member.');
                }
            } catch (err) {
                alert('Server error deleting member.');
            }
        }
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        if (!formData.uniqueId.trim() || !formData.name.trim()) {
            return alert('Unique ID and Member Name are required.');
        }

        try {
            const memberId = editingMember?.id || editingMember?.unique_id || formData.uniqueId;
            const url = editingMember 
                ? `/api/permanent-members/${encodeURIComponent(memberId)}` 
                : '/api/permanent-members';
            const method = editingMember ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const result = await res.json();

            if (res.ok && result.success) {
                setIsModalOpen(false);
                fetchDirectory();
            } else {
                alert(`Error: ${result.error || 'Failed to save member details.'}`);
            }
        } catch (err) {
            alert('Server network error saving member.');
        }
    };

    return (
        <div style={{ background: '#ffffff', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>
                        📇 {t?.directoryTitle || 'Permanent Assembly Member Directory'}
                    </h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                        {t?.directorySubtitle || 'Official parliamentary database registry with live add, edit, and deletion control'}
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        onClick={openAddModal}
                        style={{
                            padding: '10px 18px',
                            borderRadius: '8px',
                            border: 'none',
                            background: '#16a34a',
                            color: '#ffffff',
                            fontWeight: 800,
                            fontSize: '13px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 2px 6px rgba(22,163,74,0.2)'
                        }}
                    >
                        ➕ Add New Member
                    </button>
                </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
                <input
                    type="text"
                    placeholder={`🔍 ${t?.searchPlaceholder || 'Search by Unique ID or Member Name...'}`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: '10px',
                        border: '1.5px solid #cbd5e1',
                        fontSize: '14px',
                        fontWeight: 500
                    }}
                />
            </div>

            {members.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: '14px' }}>
                    {t?.noMembersMatch || 'No permanent members found matching your search.'}
                </div>
            ) : (
                <div style={{ overflowX: 'auto', border: '1px solid #f1f5f9', borderRadius: '12px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                                <th style={{ padding: '14px 16px', width: '50px' }}>#</th>
                                <th style={{ padding: '14px 16px', width: '140px' }}>{t?.memberIdCol || 'Unique ID'}</th>
                                <th style={{ padding: '14px 16px' }}>{t?.nameCol || 'Member Name'}</th>
                                <th style={{ padding: '14px 16px' }}>{t?.designation || 'Designation'}</th>
                                <th style={{ padding: '14px 16px' }}>{t?.topic || 'Assigned Topic'}</th>
                                <th style={{ padding: '14px 16px', textAlign: 'right', width: '160px' }}>{t?.actionsCol || 'Actions'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {members.map((row, idx) => (
                                <tr key={row.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '14px 16px', color: '#94a3b8', fontWeight: 700 }}>
                                        {toDevanagariDigits(idx + 1)}
                                    </td>
                                    <td style={{ padding: '14px 16px', fontWeight: 800, color: '#2563eb' }}>
                                        {toDevanagariDigits(row.unique_id)}
                                    </td>
                                    <td style={{ padding: '14px 16px', fontWeight: 800, color: '#0f172a' }}>
                                        {getLocalizedText(row, 'name')}
                                    </td>
                                    <td style={{ padding: '14px 16px', color: '#64748b' }}>
                                        {getLocalizedText(row, 'position')}
                                    </td>
                                    <td style={{ padding: '14px 16px', color: '#0284c7', fontWeight: 600 }}>
                                        {getLocalizedText(row, 'topic') ? `📌 ${getLocalizedText(row, 'topic')}` : '--'}
                                    </td>
                                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                            <button
                                                onClick={() => openEditModal(row)}
                                                style={{
                                                    padding: '6px 12px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #bfdbfe',
                                                    background: '#eff6ff',
                                                    color: '#2563eb',
                                                    fontWeight: 700,
                                                    fontSize: '11px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                ✏️ Edit
                                            </button>
                                            <button
                                                onClick={() => handleDelete(row.id || row.unique_id, row.name)}
                                                style={{
                                                    padding: '6px 12px',
                                                    borderRadius: '6px',
                                                    border: 'none',
                                                    background: '#dc2626',
                                                    color: '#ffffff',
                                                    fontWeight: 700,
                                                    fontSize: '11px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {isModalOpen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    backdropFilter: 'blur(4px)'
                }}>
                    <div style={{
                        background: '#ffffff',
                        borderRadius: '16px',
                        padding: '28px',
                        width: '100%',
                        maxWidth: '520px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                        border: '1px solid #e2e8f0'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>
                                {editingMember ? '✏️ Edit Member Profile' : '➕ Register Permanent Member'}
                            </h3>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8' }}
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleFormSubmit}>
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '6px' }}>
                                    Unique ID (e.g. MP-101) *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.uniqueId}
                                    onChange={(e) => setFormData({ ...formData, uniqueId: e.target.value })}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '14px', fontWeight: 700 }}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '6px' }}>
                                        Member Name (English) *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Full Name"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '14px' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 800, color: '#166534', display: 'block', marginBottom: '6px' }}>
                                        सदस्यको नाम (नेपाली)
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="नेपाली नाम"
                                        value={formData.name_ne}
                                        onChange={(e) => setFormData({ ...formData, name_ne: e.target.value })}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #86efac', fontSize: '14px' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '6px' }}>
                                        Designation (English)
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. MP, Minister"
                                        value={formData.position}
                                        onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '14px' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 800, color: '#166534', display: 'block', marginBottom: '6px' }}>
                                        पद / क्षेत्र (नेपाली)
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="उदा. माननीय सांसद"
                                        value={formData.position_ne}
                                        onChange={(e) => setFormData({ ...formData, position_ne: e.target.value })}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #86efac', fontSize: '14px' }}
                                    />
                                </div>
                            </div>

                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '6px' }}>
                                    Default Agenda Topic
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. Digital Governance & Fiscal Policy"
                                    value={formData.topic}
                                    onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '14px' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    style={{
                                        padding: '10px 18px',
                                        borderRadius: '8px',
                                        border: '1px solid #cbd5e1',
                                        background: '#ffffff',
                                        color: '#475569',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    style={{
                                        padding: '10px 20px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: '#0284c7',
                                        color: '#ffffff',
                                        fontWeight: 800,
                                        cursor: 'pointer'
                                    }}
                                >
                                    💾 Save Member
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}