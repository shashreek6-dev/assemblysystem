import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import * as XLSX from 'xlsx';

export default function ExcelImportTab({ onImportSuccess }) {
    const { t, toDevanagariDigits } = useLanguage();
    const fileInputRef = useRef(null);
    const [file, setFile] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);
    const [stagedRows, setStagedRows] = useState([]);
    const [speakersList, setSpeakersList] = useState([]);

    const fetchImportedSpeakers = async () => {
        try {
            const res = await fetch('/api/imported-speakers');
            if (res.ok) {
                const data = await res.json();
                setSpeakersList(data);
            }
        } catch (err) {
            console.error('Error fetching imported roster:', err);
        }
    };

    useEffect(() => {
        fetchImportedSpeakers();
    }, []);

    const processFile = (selectedFile) => {
        if (!selectedFile) return;

        setFile(selectedFile);
        const reader = new FileReader();

        reader.onload = (evt) => {
            try {
                const workbook = XLSX.read(evt.target.result, { type: 'binary' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rawData = XLSX.utils.sheet_to_json(sheet);

                const parsed = rawData.map((row, idx) => ({
                    uniqueId: String(row['Unique ID'] || row['ID'] || row['unique_id'] || `MP-${100 + idx + 1}`).trim(),
                    name: String(row['Name'] || row['Full Name'] || '').trim(),
                    name_ne: String(row['Name (Nepali)'] || row['Nepali Name'] || row['नाम'] || '').trim(),
                    position: String(row['Position'] || row['Designation'] || 'Member of Parliament').trim(),
                    position_ne: String(row['Position (Nepali)'] || row['पद'] || '').trim(),
                    topic: String(row['Topic'] || row['Topic for Speaking'] || 'Assembly Floor Session').trim(),
                    topic_ne: String(row['Topic (Nepali)'] || row['विषय'] || '').trim(),
                    requestedMinutes: parseInt(row['Requested Time (mins)'] || row['Requested Time'] || 3, 10)
                })).filter(r => r.name.length > 0);

                setStagedRows(parsed);
                setMessage({ type: 'success', text: `Loaded ${parsed.length} rows. Verify and edit Devanagari spellings below before submitting.` });
            } catch (err) {
                setMessage({ type: 'error', text: 'Failed to parse file format. Please upload a valid .xlsx, .xls, or .csv file.' });
            }
        };

        reader.readAsBinaryString(selectedFile);
    };

    const handleFileChange = (e) => {
        const selectedFile = e.target.files && e.target.files[0];
        processFile(selectedFile);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processFile(e.dataTransfer.files[0]);
        }
    };

    const handleCellChange = (index, field, value) => {
        setStagedRows(prev => {
            const updated = [...prev];
            updated[index][field] = value;
            return updated;
        });
    };

    const handleConfirmImport = async () => {
        if (stagedRows.length === 0) return alert('No valid data staged for import.');
        setLoading(true);
        setMessage(null);

        try {
            const res = await fetch('/api/import-roster-json', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ records: stagedRows })
            });
            const data = await res.json();

            if (res.ok && data.success) {
                setMessage({ type: 'success', text: `Successfully imported and queued ${data.count} members!` });
                setStagedRows([]);
                setFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
                fetchImportedSpeakers();
                if (onImportSuccess) onImportSuccess();
            } else {
                setMessage({ type: 'error', text: data.error || 'Import failed.' });
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Network error submitting verified records.' });
        } finally {
            setLoading(false);
        }
    };

    const handleClearRoster = async () => {
        if (!window.confirm('Are you sure you want to clear all imported speakers from the system?')) return;
        try {
            const res = await fetch('/api/imported-speakers', { method: 'DELETE' });
            if (res.ok) {
                setSpeakersList([]);
                setMessage({ type: 'success', text: 'All active imported records cleared from the system.' });
            } else {
                alert('Failed to clear records.');
            }
        } catch (err) {
            alert('Network error while clearing records.');
        }
    };

    const downloadSampleTemplate = () => {
        const sampleRows = [
            { 
                "Unique ID": "MP-101", 
                "Name": "Shashreek Shrestha", 
                "Name (Nepali)": "शश्रीक श्रेष्ठ", 
                "Position": "Member of Parliament", 
                "Position (Nepali)": "माननीय संसद सदस्य", 
                "Topic for Speaking": "Budget Allocation for Digital Governance", 
                "Topic (Nepali)": "डिजिटल सुशासनको लागि बजेट विनियोजन", 
                "Requested Time (mins)": 3 
            },
            { 
                "Unique ID": "MP-102", 
                "Name": "Mamita Shrestha", 
                "Name (Nepali)": "ममिता श्रेष्ठ", 
                "Position": "Opposition Leader", 
                "Position (Nepali)": "प्रमुख प्रतिपक्षी दलका नेता", 
                "Topic for Speaking": "Infrastructure Development Oversight", 
                "Topic (Nepali)": "पूर्वाधार विकास र अनुगमन सम्बन्धी", 
                "Requested Time (mins)": 5 
            }
        ];
        const ws = XLSX.utils.json_to_sheet(sampleRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Speaker Roster");
        XLSX.writeFile(wb, "Assembly_Bilingual_Roster_Template.xlsx");
    };

    return (
        <div className="card" style={{ background: '#fff', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>📥 {t.importTitle}</h3>
                    <p className="text-muted" style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
                        Upload spreadsheet and verify Nepali text in the review table to guarantee 100% translation accuracy.
                    </p>
                </div>
                <button className="btn-secondary" style={{ padding: '8px 14px', fontSize: '12px' }} onClick={downloadSampleTemplate}>
                    📑 Download Bilingual Template
                </button>
            </div>

            {message && (
                <div style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    fontSize: '13px',
                    background: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
                    color: message.type === 'success' ? '#166534' : '#b91c1c',
                    border: `1px solid ${message.type === 'success' ? '#bbf7d0' : '#fecaca'}`
                }}>
                    {message.text}
                </div>
            )}

            {/* Modern Drag and Drop Upload Area */}
            <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                style={{
                    border: `2px dashed ${isDragging ? 'var(--accent-blue, #2563eb)' : '#cbd5e1'}`,
                    borderRadius: '12px',
                    padding: '36px 20px',
                    textAlign: 'center',
                    background: isDragging ? '#eff6ff' : '#f8fafc',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    marginBottom: '20px'
                }}
            >
                <input 
                    ref={fileInputRef}
                    id="excelFileInput"
                    type="file" 
                    accept=".xlsx, .xls, .csv" 
                    onChange={handleFileChange} 
                    style={{ display: 'none' }}
                />
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📁</div>
                <div style={{ fontWeight: 700, fontSize: '15px', color: '#1e293b', marginBottom: '4px' }}>
                    {file ? file.name : "Click to upload or drag & drop spreadsheet"}
                </div>
                <p className="text-muted" style={{ margin: 0, fontSize: '12px' }}>
                    Supports .xlsx, .xls, and .csv files
                </p>
            </div>

            {/* Staged Review & Verification Grid */}
            {stagedRows.length > 0 && (
                <div style={{ marginBottom: '24px', background: '#f0fdf4', padding: '16px', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                        <h4 style={{ margin: 0, color: '#166534', fontSize: '15px', fontWeight: 800 }}>
                            ✍️ Verification Grid: Review & Edit Nepali Text Before Submitting
                        </h4>
                        <button 
                            className="btn-success" 
                            style={{ padding: '8px 20px', fontSize: '13px', fontWeight: 800 }}
                            onClick={handleConfirmImport}
                            disabled={loading}
                        >
                            {loading ? 'Processing...' : 'Confirm & Auto-Queue Roster'}
                        </button>
                    </div>

                    <div style={{ overflowX: 'auto', background: '#fff', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid var(--border)', textAlign: 'left', color: '#64748b' }}>
                                    <th style={{ padding: '8px' }}>ID</th>
                                    <th style={{ padding: '8px' }}>Name (English)</th>
                                    <th style={{ padding: '8px', color: '#16a34a' }}>Name (नेपाली - Editable)</th>
                                    <th style={{ padding: '8px' }}>Position</th>
                                    <th style={{ padding: '8px', color: '#16a34a' }}>Position (नेपाली)</th>
                                    <th style={{ padding: '8px' }}>Topic</th>
                                    <th style={{ padding: '8px', color: '#16a34a' }}>Topic (नेपाली)</th>
                                    <th style={{ padding: '8px' }}>Mins</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stagedRows.map((row, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '8px', fontWeight: 800 }}>{row.uniqueId}</td>
                                        <td style={{ padding: '8px' }}>{row.name}</td>
                                        <td style={{ padding: '4px 8px' }}>
                                            <input 
                                                type="text" 
                                                value={row.name_ne} 
                                                placeholder="e.g. शश्रीक श्रेष्ठ"
                                                onChange={(e) => handleCellChange(idx, 'name_ne', e.target.value)}
                                                style={{ width: '100%', padding: '6px', border: '1px solid #86efac', borderRadius: '4px', fontWeight: 700 }}
                                            />
                                        </td>
                                        <td style={{ padding: '8px', color: '#64748b' }}>{row.position}</td>
                                        <td style={{ padding: '4px 8px' }}>
                                            <input 
                                                type="text" 
                                                value={row.position_ne} 
                                                placeholder="e.g. सांसद"
                                                onChange={(e) => handleCellChange(idx, 'position_ne', e.target.value)}
                                                style={{ width: '100%', padding: '6px', border: '1px solid #86efac', borderRadius: '4px' }}
                                            />
                                        </td>
                                        <td style={{ padding: '8px', color: '#64748b' }}>{row.topic}</td>
                                        <td style={{ padding: '4px 8px' }}>
                                            <input 
                                                type="text" 
                                                value={row.topic_ne} 
                                                placeholder="e.g. बजेट विनियोजन"
                                                onChange={(e) => handleCellChange(idx, 'topic_ne', e.target.value)}
                                                style={{ width: '100%', padding: '6px', border: '1px solid #86efac', borderRadius: '4px' }}
                                            />
                                        </td>
                                        <td style={{ padding: '8px', fontWeight: 700 }}>{row.requestedMinutes}m</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Persistent Database Records Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>
                    📋 Active Roster in System ({toDevanagariDigits(speakersList.length)})
                </h4>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={fetchImportedSpeakers}>
                        🔄 Refresh
                    </button>
                    {speakersList.length > 0 && (
                        <button className="btn-danger" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={handleClearRoster}>
                            🗑️ Clear All
                        </button>
                    )}
                </div>
            </div>

            {speakersList.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--border)', color: '#64748b', fontSize: '13px' }}>
                    No speakers currently imported. Upload an Excel or CSV file above to populate.
                </div>
            ) : (
                <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid var(--border)', color: '#64748b' }}>
                                <th style={{ padding: '10px 12px' }}>#</th>
                                <th style={{ padding: '10px 12px' }}>Unique ID</th>
                                <th style={{ padding: '10px 12px' }}>Name (EN / NE)</th>
                                <th style={{ padding: '10px 12px' }}>Position</th>
                                <th style={{ padding: '10px 12px' }}>Topic</th>
                                <th style={{ padding: '10px 12px' }}>Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            {speakersList.map((row, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{toDevanagariDigits(idx + 1)}</td>
                                    <td style={{ padding: '10px 12px', fontWeight: 800, color: 'var(--accent-blue)' }}>{row.unique_id}</td>
                                    <td style={{ padding: '10px 12px' }}>
                                        <strong>{row.name}</strong> <span style={{ color: '#16a34a', fontWeight: 700 }}>({row.name_ne || '--'})</span>
                                    </td>
                                    <td style={{ padding: '10px 12px', color: '#64748b' }}>{row.position}</td>
                                    <td style={{ padding: '10px 12px' }}>{row.topic}</td>
                                    <td style={{ padding: '10px 12px', fontWeight: 800, color: '#16a34a' }}>{toDevanagariDigits(row.requested_minutes)}m</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}