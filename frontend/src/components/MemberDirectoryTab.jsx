import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { socket } from '../socket';
import { useLanguage } from '../context/LanguageContext';

export default function MemberDirectoryTab() {
    const { t, toDevanagariDigits, getLocalizedText } = useLanguage();
    const fileInputRef = useRef(null);

    const [members, setMembers] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [importLoading, setImportLoading] = useState(false);
    const [statusMsg, setStatusMsg] = useState(null);

    // Modal state for manual add/edit
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMember, setEditingMember] = useState(null);
    const [formData, setFormData] = useState({
        uniqueId: '',
        name: '',
        name_ne: '',
        position: 'Member of Parliament',
        position_ne: 'माननीय संसद सदस्य',
        topic: '',
        topic_ne: ''
    });

    const getApiBase = () => {
        if (typeof window === 'undefined') return 'http://localhost:3000';
        const host = window.location.hostname;
        if (host.includes('devtunnels.ms')) {
            return window.location.origin.replace('-5173.', '-3000.');
        }
        return `http://${host}:3000`;
    };

    const fetchDirectory = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${getApiBase()}/api/permanent-members`);
            if (res.ok) {
                const data = await res.json();
                setMembers(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error('Error fetching directory:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDirectory();
        socket.on('directoryUpdated', fetchDirectory);
        return () => socket.off('directoryUpdated', fetchDirectory);
    }, [fetchDirectory]);

    // Handle Excel File Upload
    const handleFileUpload = async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        setImportLoading(true);
        setStatusMsg(null);

        const formDataObj = new FormData();
        formDataObj.append('file', file);

        try {
            const res = await fetch(`${getApiBase()}/api/import-permanent-members`, {
                method: 'POST',
                body: formDataObj
            });
            const data = await res.json();

            if (res.ok && data.success) {
                setStatusMsg({ type: 'success', text: `✅ Successfully imported and updated ${data.count} members in database!` });
                fetchDirectory();
            } else {
                setStatusMsg({ type: 'error', text: data.error || 'Failed to import Excel file.' });
            }
        } catch (err) {
            console.error('Error uploading file:', err);
            setStatusMsg({ type: 'error', text: 'Network error uploading Excel file.' });
        } finally {
            setImportLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            setTimeout(() => setStatusMsg(null), 5000);
        }
    };

    // Export ALL current database members into an Excel file
    const downloadFullDirectoryTemplate = () => {
        let exportRows = [];

        if (members && members.length > 0) {
            // Exports ALL database records (including those without topics)
            exportRows = members.map((m, idx) => ({
                "Unique ID": m.unique_id || m.uniqueId || `MP-${100 + idx + 1}`,
                "Name": m.name || '',
                "Name (Nepali)": m.name_ne || '',
                "Position": m.position || 'Member of Parliament',
                "Position (Nepali)": m.position_ne || 'माननीय संसद सदस्य',
                "Topic": m.topic || '',
                "Topic (Nepali)": m.topic_ne || ''
            }));
        } else {
            // Fallback default sample if the table is completely empty
            exportRows = [
                {
                    "Unique ID": "MP-101",
                    "Name": "Sample Member",
                    "Name (Nepali)": "नमुना सदस्य",
                    "Position": "Member of Parliament",
                    "Position (Nepali)": "माननीय संसद सदस्य",
                    "Topic": "",
                    "Topic (Nepali)": ""
                }
            ];
        }

        const ws = XLSX.utils.json_to_sheet(exportRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Members Directory");
        XLSX.writeFile(wb, `Assembly_Full_Directory_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const handleOpenModal = (member = null) => {
        if (member) {
            setEditingMember(member);
            setFormData({
                uniqueId: member.unique_id || member.uniqueId || '',
                name: member.name || '',
                name_ne: member.name_ne || '',
                position: member.position || 'Member of Parliament',
                position_ne: member.position_ne || 'माननीय संसद सदस्य',
                topic: member.topic || '',
                topic_ne: member.topic_ne || ''
            });
        } else {
            setEditingMember(null);
            setFormData({
                uniqueId: `MP-${100 + members.length + 1}`,
                name: '',
                name_ne: '',
                position: 'Member of Parliament',
                position_ne: 'माननीय संसद सदस्य',
                topic: '',
                topic_ne: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        const url = editingMember
            ? `${getApiBase()}/api/permanent-members/${editingMember.id || editingMember.unique_id}`
            : `${getApiBase()}/api/permanent-members`;

        const method = editingMember ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                setIsModalOpen(false);
                fetchDirectory();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to save member record.');
            }
        } catch (err) {
            console.error('Error saving member:', err);
            alert('Network error saving member record.');
        }
    };

    const handleDelete = async (id, name) => {
        if (!window.confirm(`Are you sure you want to remove "${name}" from permanent directory?`)) return;
        try {
            const res = await fetch(`${getApiBase()}/api/permanent-members/${id}`, { method: 'DELETE' });
            if (res.ok) {
                fetchDirectory();
            } else {
                alert('Failed to delete member.');
            }
        } catch (err) {
            console.error('Error deleting member:', err);
        }
    };

    const filteredMembers = members.filter(m => {
        const q = (searchQuery || '').toLowerCase().trim();
        if (!q) return true;
        const nameMatch = m.name && m.name.toLowerCase().includes(q);
        const nameNeMatch = m.name_ne && m.name_ne.includes(q);
        const idMatch = (m.unique_id || m.uniqueId) && String(m.unique_id || m.uniqueId).toLowerCase().includes(q);
        const topicMatch = m.topic && m.topic.toLowerCase().includes(q);
        return nameMatch || nameNeMatch || idMatch || topicMatch;
    });

    return (
        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1.5px solid #e2e8f0', padding: '24px', boxShadow: '0 4px 14px rgba(0,0,0,0.02)' }}>
            {/* Header Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        📇 {t?.permanentRegistry || 'Permanent Assembly Member Directory'}
                    </h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                        Permanent database registry ({toDevanagariDigits(members.length)} Total Members). Search, add, edit, or batch-import from Excel.
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Hidden Excel File Input */}
                    <input
                        type="file"
                        ref={fileInputRef}
                        accept=".xlsx, .xls, .csv"
                        onChange={handleFileUpload}
                        style={{ display: 'none' }}
                    />

                    {/* Download Full Directory Template */}
                    <button
                        type="button"
                        onClick={downloadFullDirectoryTemplate}
                        style={{
                            padding: '10px 14px',
                            background: '#f8fafc',
                            color: '#0f172a',
                            border: '1.5px solid #cbd5e1',
                            borderRadius: '8px',
                            fontWeight: 800,
                            fontSize: '13px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        📑 Export / Template ({toDevanagariDigits(members.length)})
                    </button>

                    {/* Batch Import Excel Button */}
                    <button
                        type="button"
                        disabled={importLoading}
                        onClick={() => fileInputRef.current && fileInputRef.current.click()}
                        style={{
                            padding: '10px 16px',
                            background: '#0284c7',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 900,
                            fontSize: '13px',
                            cursor: importLoading ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)'
                        }}
                    >
                        📥 {importLoading ? 'Importing...' : 'Import Excel / CSV'}
                    </button>

                    {/* Add Single Member */}
                    <button
                        type="button"
                        onClick={() => handleOpenModal()}
                        style={{
                            padding: '10px 16px',
                            background: '#16a34a',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 900,
                            fontSize: '13px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 2px 8px rgba(22, 163, 74, 0.3)'
                        }}
                    >
                        ➕ Add New Member
                    </button>
                </div>
            </div>

            {/* Import Status Alert Banner */}
            {statusMsg && (
                <div style={{
                    padding: '12px 16px',
                    borderRadius: '10px',
                    marginBottom: '16px',
                    fontSize: '13px',
                    fontWeight: 800,
                    background: statusMsg.type === 'success' ? '#f0fdf4' : '#fef2f2',
                    color: statusMsg.type === 'success' ? '#166534' : '#dc2626',
                    border: `1.5px solid ${statusMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}`
                }}>
                    {statusMsg.text}
                </div>
            )}

            {/* Search Input */}
            <div style={{ marginBottom: '16px' }}>
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="🔍 Search by Unique ID, Member Name, or Topic..."
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

            {/* Directory Table */}
            <div style={{ overflowX: 'auto', border: '1.5px solid #e2e8f0', borderRadius: '12px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#64748b' }}>
                            <th style={{ padding: '12px 14px', width: '50px' }}>#</th>
                            <th style={{ padding: '12px 14px' }}>Unique ID</th>
                            <th style={{ padding: '12px 14px' }}>Member Name</th>
                            <th style={{ padding: '12px 14px' }}>Designation</th>
                            <th style={{ padding: '12px 14px' }}>Topic</th>
                            <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan="6" style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>Loading directory...</td>
                            </tr>
                        ) : filteredMembers.length === 0 ? (
                            <tr>
                                <td colSpan="6" style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>No member records found.</td>
                            </tr>
                        ) : (
                            filteredMembers.map((row, idx) => (
                                <tr key={row.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 800 }}>
                                        {toDevanagariDigits(idx + 1)}
                                    </td>
                                    <td style={{ padding: '12px 14px', fontWeight: 900, color: '#0f172a' }}>
                                        {row.unique_id || row.uniqueId}
                                    </td>
                                    <td style={{ padding: '12px 14px' }}>
                                        <div style={{ fontWeight: 900, color: '#1d4ed8', fontSize: '14px' }}>
                                            {row.name}
                                        </div>
                                        {row.name_ne && (
                                            <div style={{ fontSize: '12px', color: '#16a34a', fontWeight: 700 }}>
                                                {row.name_ne}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '12px 14px', color: '#475569', fontWeight: 600 }}>
                                        {getLocalizedText(row, 'position')}
                                    </td>
                                    <td style={{ padding: '12px 14px' }}>
                                        {row.topic ? (
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '4px 10px', borderRadius: '6px', fontWeight: 800, fontSize: '12px' }}>
                                                📌 {getLocalizedText(row, 'topic')}
                                            </div>
                                        ) : (
                                            <span style={{ color: '#94a3b8' }}>--</span>
                                        )}
                                    </td>
                                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                                            <button
                                                onClick={() => handleOpenModal(row)}
                                                style={{
                                                    background: '#eff6ff',
                                                    color: '#2563eb',
                                                    border: '1px solid #bfdbfe',
                                                    padding: '6px 12px',
                                                    borderRadius: '6px',
                                                    fontSize: '12px',
                                                    fontWeight: 800,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                ✏️ Edit
                                            </button>
                                            <button
                                                onClick={() => handleDelete(row.id || row.unique_id, row.name)}
                                                style={{
                                                    background: '#fee2e2',
                                                    color: '#dc2626',
                                                    border: '1px solid #fecaca',
                                                    padding: '6px 12px',
                                                    borderRadius: '6px',
                                                    fontSize: '12px',
                                                    fontWeight: 800,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                🗑️ Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Add / Edit Member Modal */}
            {isModalOpen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(15, 23, 42, 0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '20px'
                }}>
                    <div style={{
                        background: '#ffffff',
                        borderRadius: '20px',
                        padding: '28px',
                        width: '100%',
                        maxWidth: '520px',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                        boxSizing: 'border-box'
                    }}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>
                            {editingMember ? '✏️ Edit Member Registry' : '➕ Add Permanent Member'}
                        </h3>

                        <form onSubmit={handleFormSubmit}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 800, display: 'block', marginBottom: '4px', color: '#475569' }}>Unique ID</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.uniqueId}
                                        onChange={(e) => setFormData({ ...formData, uniqueId: e.target.value })}
                                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontWeight: 800, boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 800, display: 'block', marginBottom: '4px', color: '#475569' }}>Full Name (English)</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontWeight: 700, boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>

                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 800, display: 'block', marginBottom: '4px', color: '#166534' }}>Full Name (नेपाली - ऐच्छिक)</label>
                                <input
                                    type="text"
                                    value={formData.name_ne}
                                    placeholder="उदा. शश्रीक नेपाल"
                                    onChange={(e) => setFormData({ ...formData, name_ne: e.target.value })}
                                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid #86efac', fontWeight: 700, boxSizing: 'border-box' }}
                                />
                            </div>

                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 800, display: 'block', marginBottom: '4px', color: '#475569' }}>Designation / Position</label>
                                <input
                                    type="text"
                                    value={formData.position}
                                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontWeight: 600, boxSizing: 'border-box' }}
                                />
                            </div>

                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 800, display: 'block', marginBottom: '4px', color: '#475569' }}>Default Topic (English)</label>
                                <input
                                    type="text"
                                    value={formData.topic}
                                    placeholder="e.g. Health Sector Reform"
                                    onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontWeight: 600, boxSizing: 'border-box' }}
                                />
                            </div>

                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 800, display: 'block', marginBottom: '4px', color: '#166534' }}>Default Topic (नेपाली)</label>
                                <input
                                    type="text"
                                    value={formData.topic_ne}
                                    placeholder="उदा. स्वास्थ्य क्षेत्र सुधार"
                                    onChange={(e) => setFormData({ ...formData, topic_ne: e.target.value })}
                                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid #86efac', fontWeight: 700, boxSizing: 'border-box' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    style={{ padding: '10px 18px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    style={{ padding: '10px 20px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: 900, cursor: 'pointer' }}
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