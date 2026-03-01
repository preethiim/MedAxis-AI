import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, Users, FileText, Activity, LogOut, Search, AlertTriangle, Award } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const SuperAdminDashboard = () => {
    const { currentUser, logout } = useAuth();
    const [activeTab, setActiveTab] = useState('stats');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [stats, setStats] = useState(null);
    const [users, setUsers] = useState({ patients: [], doctors: [], hospitals: [], superadmins: [] });
    const [reports, setReports] = useState([]);
    const [searchId, setSearchId] = useState('');
    const [searchResult, setSearchResult] = useState(null);
    const [searchError, setSearchError] = useState('');

    useEffect(() => {
        fetchData();
    }, [currentUser]);

    const fetchData = async () => {
        if (!currentUser) return;
        setLoading(true);
        try {
            const token = await currentUser.getIdToken();
            const headers = { 'Authorization': `Bearer ${token}` };

            const [statsRes, usersRes, reportsRes] = await Promise.all([
                fetch(`${API_BASE_URL}/superadmin/platform-stats`, { headers }),
                fetch(`${API_BASE_URL}/superadmin/all-users`, { headers }),
                fetch(`${API_BASE_URL}/superadmin/all-reports`, { headers })
            ]);

            if (statsRes.ok) setStats(await statsRes.json());
            if (usersRes.ok) setUsers(await usersRes.json());
            if (reportsRes.ok) {
                const rd = await reportsRes.json();
                setReports(rd.reports || []);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async () => {
        if (!searchId.trim()) return;
        setSearchError('');
        setSearchResult(null);
        try {
            const res = await fetch(`${API_BASE_URL}/patient/lookup?health_id=${searchId.trim()}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Patient not found');
            setSearchResult(data);
        } catch (err) {
            setSearchError(err.message);
        }
    };

    const tabs = ['stats', 'users', 'reports', 'lookup'];

    const cardStyle = {
        background: 'rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '12px',
        border: '1px solid var(--border-color)', textAlign: 'center'
    };

    const statValue = { fontSize: '2.5rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '0.25rem' };

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Shield size={32} color="#f59e0b" />
                    <h2>Super Admin Console</h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{currentUser?.email}</span>
                    <span style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b', padding: '0.25rem 0.75rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600 }}>SUPER ADMIN</span>
                    <button onClick={logout} className="btn-primary" style={{ padding: '0.5rem 1rem', width: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <LogOut size={16} /> Sign Out
                    </button>
                </div>
            </header>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', marginBottom: '2rem', overflowX: 'auto' }}>
                {tabs.map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                        style={{
                            background: 'none', border: 'none', padding: '0.75rem 1.5rem',
                            color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)',
                            borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                            cursor: 'pointer', fontWeight: 600, textTransform: 'capitalize', whiteSpace: 'nowrap'
                        }}
                    >{tab === 'lookup' ? '🔍 Patient Lookup' : tab === 'stats' ? '📊 Platform Stats' : tab === 'users' ? '👥 All Users' : '📋 All Reports'}</button>
                ))}
            </div>

            {error && <div style={{ color: '#ef4444', marginBottom: '1rem', padding: '1rem', background: 'rgba(239,68,68,0.1)', borderRadius: '8px' }}>{error}</div>}
            {loading ? <p style={{ color: 'var(--text-muted)' }}>Loading platform data...</p> : (
                <>
                    {/* Stats Tab */}
                    {activeTab === 'stats' && stats && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.5rem' }}>
                            <div style={cardStyle}><div style={statValue}>{stats.total_patients}</div><div style={{ color: 'var(--text-muted)' }}>Patients</div></div>
                            <div style={cardStyle}><div style={statValue}>{stats.total_doctors}</div><div style={{ color: 'var(--text-muted)' }}>Doctors</div></div>
                            <div style={cardStyle}><div style={statValue}>{stats.total_hospitals}</div><div style={{ color: 'var(--text-muted)' }}>Hospitals</div></div>
                            <div style={cardStyle}><div style={statValue}>{stats.total_reports}</div><div style={{ color: 'var(--text-muted)' }}>Reports</div></div>
                            <div style={cardStyle}><div style={{ ...statValue, color: stats.unresolved_alerts > 0 ? '#ef4444' : '#10b981' }}>{stats.unresolved_alerts}</div><div style={{ color: 'var(--text-muted)' }}>Unresolved Alerts</div></div>
                            <div style={cardStyle}><div style={statValue}>{stats.total_users}</div><div style={{ color: 'var(--text-muted)' }}>Total Users</div></div>
                        </div>
                    )}

                    {/* Users Tab */}
                    {activeTab === 'users' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            {[
                                { title: 'Patients', data: users.patients, color: '#60a5fa', icon: <Users size={20} /> },
                                { title: 'Doctors', data: users.doctors, color: '#34d399', icon: <Activity size={20} /> },
                                { title: 'Hospitals', data: users.hospitals, color: '#f472b6', icon: <Shield size={20} /> }
                            ].map(group => (
                                <div key={group.title} className="glass-panel" style={{ padding: '1.5rem' }}>
                                    <h3 style={{ color: group.color, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {group.icon} {group.title} ({group.data.length})
                                    </h3>
                                    {group.data.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No {group.title.toLowerCase()} registered yet.</p> : (
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                        <th style={{ textAlign: 'left', padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Name</th>
                                                        <th style={{ textAlign: 'left', padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Email</th>
                                                        <th style={{ textAlign: 'left', padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>ID</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {group.data.map((u, i) => (
                                                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                            <td style={{ padding: '0.75rem', color: 'var(--text-main)' }}>{u.name || '—'}</td>
                                                            <td style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{u.email}</td>
                                                            <td style={{ padding: '0.75rem' }}>
                                                                <span style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                                                                    {u.healthId || u.doctorId || u.employeeId || u.uid?.substring(0, 8)}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Reports Tab */}
                    {activeTab === 'reports' && (
                        <div className="glass-panel" style={{ padding: '1.5rem' }}>
                            <h3 style={{ marginBottom: '1rem' }}><FileText size={20} style={{ display: 'inline', marginRight: '0.5rem' }} /> All Diagnostic Reports ({reports.length})</h3>
                            {reports.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No reports in the system yet.</p> : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {reports.map((r, i) => (
                                        <div key={i} style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{r.patient_name} ({r.patient_email})</span>
                                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Report: {r.id}</span>
                                            </div>
                                            {r.presentedForm?.[0]?.url && (
                                                <a href={r.presentedForm[0].url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontSize: '0.9rem' }}>→ View PDF</a>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Lookup Tab */}
                    {activeTab === 'lookup' && (
                        <div className="glass-panel" style={{ padding: '1.5rem' }}>
                            <h3 style={{ marginBottom: '1rem' }}><Search size={20} style={{ display: 'inline', marginRight: '0.5rem' }} /> Search Patient by Health ID</h3>
                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                                <input type="text" className="form-input" placeholder="e.g. PAT-A1B2C3" value={searchId} onChange={e => setSearchId(e.target.value)} style={{ margin: 0, flex: 1 }} />
                                <button onClick={handleSearch} className="btn-primary" style={{ margin: 0, width: 'auto' }}>Search</button>
                            </div>
                            {searchError && <div style={{ color: '#ef4444', marginBottom: '1rem' }}>{searchError}</div>}
                            {searchResult && (
                                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                    <h4 style={{ color: '#34d399', marginBottom: '1rem' }}>✓ Patient Found</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.9rem' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Name:</span><span>{searchResult.patient.name}</span>
                                        <span style={{ color: 'var(--text-muted)' }}>Email:</span><span>{searchResult.patient.email}</span>
                                        <span style={{ color: 'var(--text-muted)' }}>Health ID:</span><span style={{ fontFamily: 'monospace', color: '#60a5fa' }}>{searchResult.patient.healthId}</span>
                                        <span style={{ color: 'var(--text-muted)' }}>Height:</span><span>{searchResult.patient.height || '—'} cm</span>
                                        <span style={{ color: 'var(--text-muted)' }}>Weight:</span><span>{searchResult.patient.weight || '—'} kg</span>
                                        <span style={{ color: 'var(--text-muted)' }}>BMI:</span><span>{searchResult.patient.bmi || '—'}</span>
                                    </div>
                                    <h4 style={{ marginBottom: '0.5rem' }}>Reports ({searchResult.reports.length})</h4>
                                    {searchResult.reports.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No reports found for this patient.</p> : (
                                        searchResult.reports.map((r, i) => (
                                            <div key={i} style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '6px', marginBottom: '0.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                <span style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>Report: {r.id}</span>
                                                {r.presentedForm?.[0]?.url && (
                                                    <a href={r.presentedForm[0].url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontSize: '0.85rem', marginLeft: '1rem' }}>View PDF →</a>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default SuperAdminDashboard;
