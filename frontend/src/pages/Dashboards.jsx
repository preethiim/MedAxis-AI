import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Building2, Stethoscope, User, LogOut, UserPlus, CheckCircle, AlertCircle, Search, FileText, Activity } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// ─── Doctor Dashboard ──────────────────────────────────────────────────────

export const DoctorDashboard = () => {
    const { currentUser, logout } = useAuth();
    const [activeTab, setActiveTab] = useState('patients');
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [commentData, setCommentData] = useState({});

    const [searchId, setSearchId] = useState('');
    const [searchResult, setSearchResult] = useState(null);
    const [searchError, setSearchError] = useState('');
    const [searchLoading, setSearchLoading] = useState(false);

    useEffect(() => {
        const fetchReports = async () => {
            try {
                const token = await currentUser.getIdToken();
                const res = await fetch(`${API_BASE_URL}/doctor/reports?doctor_uid=${currentUser.uid}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (res.ok) setReports(data.reports || []);
            } catch (err) { setError(err.message); }
            finally { setLoading(false); }
        };
        fetchReports();
    }, [currentUser]);

    const handleCommentChange = (reportId, value) => {
        setCommentData(prev => ({ ...prev, [reportId]: value }));
    };

    const submitComment = async (patientUid, reportId) => {
        const comment = commentData[reportId];
        if (!comment || !comment.trim()) return;
        try {
            const token = await currentUser.getIdToken();
            const res = await fetch(`${API_BASE_URL}/doctor/add-comment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ doctor_uid: currentUser.uid, patient_uid: patientUid, report_id: reportId, comment })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed');
            setReports(reports.map(rep => {
                if (rep.id === reportId) return { ...rep, note: [...(rep.note || []), data.note] };
                return rep;
            }));
            setCommentData(prev => ({ ...prev, [reportId]: "" }));
        } catch (err) { alert(err.message); }
    };

    const handleSearch = async () => {
        if (!searchId.trim()) return;
        setSearchLoading(true); setSearchError(''); setSearchResult(null);
        try {
            const res = await fetch(`${API_BASE_URL}/patient/lookup?health_id=${searchId.trim()}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Not found');
            setSearchResult(data);
        } catch (err) { setSearchError(err.message); }
        finally { setSearchLoading(false); }
    };

    const tabs = [
        { id: 'patients', label: '🔍 Search Patient' },
        { id: 'reports', label: '📋 My Patients' },
    ];

    return (
        <div className="dashboard">
            <div className="dashboard-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #10b981, #34d399)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Stethoscope size={20} color="white" />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Doctor Workspace</h2>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{currentUser?.email}</span>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span className="badge badge-success">Doctor</span>
                    <button onClick={logout} className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><LogOut size={14} /> Sign Out</button>
                </div>
            </div>

            {/* Tabs */}
            <div className="tab-list">
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}>{tab.label}</button>
                ))}
            </div>

            {error && <div className="error-msg"><AlertCircle size={16} /> {error}</div>}

            {/* Patient Search Tab */}
            {activeTab === 'patients' && (
                <div className="glass-panel">
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Search size={20} /> Search Patient by Health ID</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>Search for any patient across all hospitals. Enter their Health ID to view records.</p>
                    <div className="search-bar" style={{ marginBottom: '1rem' }}>
                        <input type="text" className="form-input" placeholder="e.g. PAT-A1B2C3" value={searchId} onChange={e => setSearchId(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} style={{ margin: 0, flex: 1 }} />
                        <button className="btn-primary" style={{ margin: 0, width: 'auto' }} onClick={handleSearch} disabled={searchLoading}>{searchLoading ? '...' : 'Search'}</button>
                    </div>
                    {searchError && <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>{searchError}</div>}

                    {searchResult && (
                        <div style={{ marginTop: '1rem' }}>
                            <div className="report-card" style={{ marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                                    <CheckCircle size={18} color="var(--success)" />
                                    <h4 style={{ color: 'var(--success)' }}>Patient Found</h4>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
                                    {[
                                        ['Name', searchResult.patient.name],
                                        ['Health ID', searchResult.patient.healthId],
                                        ['Email', searchResult.patient.email],
                                        ['BMI', searchResult.patient.bmi || '—'],
                                    ].map(([label, value], i) => (
                                        <div key={i} style={{ padding: '0.6rem', background: 'var(--input-bg)', borderRadius: 'var(--radius-sm)' }}>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                                            <div style={{ fontSize: '0.9rem', fontWeight: 500, marginTop: '0.15rem', fontFamily: label === 'Health ID' ? 'monospace' : 'inherit', color: label === 'Health ID' ? 'var(--primary)' : 'var(--text-main)' }}>{value}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {searchResult.reports.length > 0 && (
                                <div>
                                    <h4 style={{ fontSize: '0.95rem', marginBottom: '0.75rem' }}>Reports ({searchResult.reports.length})</h4>
                                    {searchResult.reports.map((r, i) => {
                                        let aiText = '';
                                        const aiNote = r.note?.find(n => !n.type || n.type !== 'doctor_comment');
                                        if (aiNote) aiText = aiNote.text || '';
                                        return (
                                            <div key={i} className="report-card" style={{ marginBottom: '0.75rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Report: {r.id}</span>
                                                    {r.presentedForm?.[0]?.url && <a href={r.presentedForm[0].url} target="_blank" rel="noreferrer" className="link" style={{ fontSize: '0.8rem' }}>View PDF →</a>}
                                                </div>
                                                {aiText && <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap', lineHeight: 1.6, borderLeft: '3px solid var(--success)', paddingLeft: '0.75rem', margin: '0.5rem 0' }}>{aiText}</p>}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* My Patients Reports Tab */}
            {activeTab === 'reports' && (
                <div>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            <span className="loader" style={{ display: 'block', margin: '0 auto 1rem' }}></span>Loading reports...
                        </div>
                    ) : reports.length === 0 ? (
                        <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            <FileText size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                            <p>No patient reports assigned to you yet.</p>
                            <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Use the "Search Patient" tab to find patients by their Health ID.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {reports.map(report => (
                                <div key={report.id} className="glass-panel">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        <h4 style={{ fontSize: '1rem' }}>Report: {report.id}</h4>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Patient: {report.patient_uid?.substring(0, 8)}...</span>
                                    </div>

                                    {report.presentedForm?.[0]?.url && (
                                        <a href={report.presentedForm[0].url} target="_blank" rel="noreferrer" className="link" style={{ fontSize: '0.85rem', display: 'inline-block', marginBottom: '1rem' }}>→ View Blood Report PDF</a>
                                    )}

                                    {/* Notes & Analysis */}
                                    <div style={{ marginBottom: '1rem' }}>
                                        {report.note?.map((n, i) => (
                                            <div key={i} style={{ padding: '0.75rem', marginBottom: '0.5rem', borderRadius: 'var(--radius-sm)', background: n.type === 'doctor_comment' ? 'rgba(139,92,246,0.05)' : 'rgba(16,185,129,0.05)', borderLeft: `3px solid ${n.type === 'doctor_comment' ? 'var(--accent)' : 'var(--success)'}` }}>
                                                <div style={{ fontSize: '0.75rem', color: n.type === 'doctor_comment' ? 'var(--accent)' : 'var(--success)', fontWeight: 600, marginBottom: '0.3rem' }}>
                                                    {n.type === 'doctor_comment' ? `Dr. Comment` : 'AI Analysis'}
                                                </div>
                                                <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', lineHeight: 1.6 }}>{n.text}</div>
                                                {n.timestamp && <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.3rem' }}>{new Date(n.timestamp).toLocaleString()}</div>}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Add Comment */}
                                    <div className="search-bar">
                                        <input type="text" className="form-input" placeholder="Add a clinical comment..." value={commentData[report.id] || ''} onChange={e => handleCommentChange(report.id, e.target.value)} style={{ margin: 0, flex: 1 }} />
                                        <button onClick={() => submitComment(report.patient_uid, report.id)} className="btn-primary" style={{ margin: 0, width: 'auto' }}>Post</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── Hospital Dashboard ────────────────────────────────────────────────────

export const HospitalDashboard = () => {
    const { currentUser, logout } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('lookup');

    const [searchId, setSearchId] = useState('');
    const [searchResult, setSearchResult] = useState(null);
    const [searchError, setSearchError] = useState('');

    const [assignUid, setAssignUid] = useState('');
    const [assignRole, setAssignRole] = useState('doctor');
    const [assignLoading, setAssignLoading] = useState(false);
    const [assignMessage, setAssignMessage] = useState(null);

    useEffect(() => { setLoading(false); }, []);

    const handleSearch = async () => {
        if (!searchId.trim()) return;
        setSearchError(''); setSearchResult(null);
        try {
            const res = await fetch(`${API_BASE_URL}/patient/lookup?health_id=${searchId.trim()}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Not found');
            setSearchResult(data);
        } catch (err) { setSearchError(err.message); }
    };

    const handleAssignRole = async () => {
        if (!assignUid.trim()) return;
        setAssignLoading(true); setAssignMessage(null);
        try {
            const token = await currentUser.getIdToken();
            const res = await fetch(`${API_BASE_URL}/admin/assign-role`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ uid: assignUid, role: assignRole })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed');
            setAssignMessage({ type: 'success', text: data.message || 'Role assigned!' });
            setAssignUid('');
        } catch (err) { setAssignMessage({ type: 'error', text: err.message }); }
        finally { setAssignLoading(false); }
    };

    const tabs = [
        { id: 'lookup', label: '🔍 Patient Lookup' },
        { id: 'manage', label: '👥 Manage Staff' },
    ];

    return (
        <div className="dashboard">
            <div className="dashboard-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #ec4899, #f472b6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Building2 size={20} color="white" />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Hospital Admin</h2>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{currentUser?.email}</span>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span className="badge" style={{ background: 'rgba(236,72,153,0.15)', color: '#ec4899' }}>Hospital</span>
                    <button onClick={logout} className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><LogOut size={14} /> Sign Out</button>
                </div>
            </div>

            <div className="tab-list">
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}>{tab.label}</button>
                ))}
            </div>

            {/* Patient Lookup */}
            {activeTab === 'lookup' && (
                <div className="glass-panel">
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Search size={20} /> Centralized Patient Lookup</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>Search any patient from any hospital by their Health ID.</p>
                    <div className="search-bar" style={{ marginBottom: '1rem' }}>
                        <input type="text" className="form-input" placeholder="e.g. PAT-A1B2C3" value={searchId} onChange={e => setSearchId(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} style={{ margin: 0, flex: 1 }} />
                        <button className="btn-primary" style={{ margin: 0, width: 'auto' }} onClick={handleSearch}>Search</button>
                    </div>
                    {searchError && <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>{searchError}</div>}
                    {searchResult && (
                        <div className="report-card">
                            <h4 style={{ color: 'var(--success)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><CheckCircle size={16} /> Patient Found</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.5rem', marginBottom: '1rem' }}>
                                {[['Name', searchResult.patient.name], ['Health ID', searchResult.patient.healthId], ['Email', searchResult.patient.email], ['BMI', searchResult.patient.bmi || '—']].map(([l, v], i) => (
                                    <div key={i} style={{ padding: '0.5rem', background: 'var(--input-bg)', borderRadius: 'var(--radius-sm)' }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>{l}</div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{v}</div>
                                    </div>
                                ))}
                            </div>
                            {searchResult.reports.length > 0 && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{searchResult.reports.length} report(s) on file</div>}
                        </div>
                    )}
                </div>
            )}

            {/* Manage Staff */}
            {activeTab === 'manage' && (
                <div className="glass-panel">
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><UserPlus size={20} /> Assign Role</h3>
                    <div className="form-group"><label className="form-label">User UID</label><input className="form-input" placeholder="Enter user UID" value={assignUid} onChange={e => setAssignUid(e.target.value)} /></div>
                    <div className="form-group"><label className="form-label">Role</label>
                        <select className="form-input" value={assignRole} onChange={e => setAssignRole(e.target.value)}>
                            <option value="doctor">Doctor</option><option value="patient">Patient</option><option value="hospital">Hospital</option>
                        </select>
                    </div>
                    <button className="btn-primary" onClick={handleAssignRole} disabled={assignLoading}>{assignLoading ? 'Assigning...' : 'Assign Role'}</button>
                    {assignMessage && <div style={{ marginTop: '0.75rem', color: assignMessage.type === 'success' ? 'var(--success)' : 'var(--danger)', fontSize: '0.85rem' }}>{assignMessage.text}</div>}
                </div>
            )}
        </div>
    );
};
