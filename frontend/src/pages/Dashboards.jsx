import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Building2, Stethoscope, User, LogOut, UserPlus, CheckCircle, AlertCircle } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const DashboardBase = ({ title, icon, roleName }) => {
    const { currentUser, logout } = useAuth();

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {icon}
                    <h2>{title}</h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{currentUser?.email}</span>
                    <span style={{ background: 'rgba(255,255,255,0.1)', padding: '0.25rem 0.75rem', borderRadius: '20px', fontSize: '0.85rem' }}>
                        {roleName}
                    </span>
                    <button onClick={logout} className="btn-primary" style={{ padding: '0.5rem 1rem', width: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <LogOut size={16} /> Sign Out
                    </button>
                </div>
            </header>

            <div className="glass-panel" style={{ minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--text-main)' }}>Welcome to your Dashboard</h3>
                    <p>MedAxis AI features for {roleName}s will appear here.</p>
                </div>
            </div>
        </div>
    );
};

export const DoctorDashboard = () => {
    const { currentUser, logout } = useAuth();
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [commentData, setCommentData] = useState({});

    useEffect(() => {
        const fetchReports = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/doctor/reports?doctor_uid=${currentUser.uid}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Failed to fetch reports');
                setReports(data.reports);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchReports();
    }, [currentUser.uid]);

    const handleCommentChange = (reportId, value) => {
        setCommentData(prev => ({ ...prev, [reportId]: value }));
    };

    const submitComment = async (patientUid, reportId) => {
        const comment = commentData[reportId];
        if (!comment || !comment.trim()) return;

        try {
            const res = await fetch(`${API_BASE_URL}/doctor/add-comment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    doctor_uid: currentUser.uid,
                    patient_uid: patientUid,
                    report_id: reportId,
                    comment: comment
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed to submit comment');

            // Optimistically update the UI
            setReports(reports.map(rep => {
                if (rep.id === reportId) {
                    const updatedNotes = [...(rep.note || []), data.note];
                    return { ...rep, note: updatedNotes };
                }
                return rep;
            }));

            // Clear input
            setCommentData(prev => ({ ...prev, [reportId]: "" }));

        } catch (err) {
            alert(err.message);
        }
    };

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Stethoscope size={32} color="#34d399" />
                    <h2>Doctor Workspace</h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{currentUser?.email}</span>
                    <button onClick={logout} className="btn-primary" style={{ padding: '0.5rem 1rem', width: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <LogOut size={16} /> Sign Out
                    </button>
                </div>
            </header>

            {error && <div style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</div>}
            {loading ? <p style={{ color: 'var(--text-muted)' }}>Loading patient reports...</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {reports.length === 0 ? (
                        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            No diagnostic reports available.
                        </div>
                    ) : (
                        reports.map(report => (
                            <div key={report.id} className="glass-panel" style={{ padding: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <h3 style={{ margin: 0, color: 'var(--text-main)' }}>Diagnostic Report: {report.id}</h3>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Patient UID: {report.patient_uid}</span>
                                </div>

                                {report.presentedForm && report.presentedForm.length > 0 && (
                                    <div style={{ marginBottom: '1rem' }}>
                                        <a href={report.presentedForm[0].url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.9rem' }}>
                                            &rarr; View Original Blood Report PDF
                                        </a>
                                    </div>
                                )}

                                <div style={{ background: 'var(--input-bg)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '1rem' }}>
                                    <h4 style={{ color: 'var(--text-main)', marginBottom: '0.5rem' }}>Notes & Analysis</h4>
                                    {(!report.note || report.note.length === 0) ? (
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>No analysis or notes attached.</p>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            {report.note.map((n, i) => (
                                                <div key={i} style={{
                                                    padding: '0.75rem',
                                                    borderRadius: '6px',
                                                    background: n.type === 'doctor_comment' ? 'rgba(52, 211, 153, 0.05)' : 'rgba(16, 185, 129, 0.05)',
                                                    borderLeft: n.type === 'doctor_comment' ? '3px solid #34d399' : '3px solid #10b981'
                                                }}>
                                                    {n.type === 'doctor_comment' ? (
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                            <span>Dr. {n.author.substring(0, 5)}...</span>
                                                            <span>{new Date(n.timestamp).toLocaleString()}</span>
                                                        </div>
                                                    ) : (
                                                        <div style={{ marginBottom: '0.5rem', fontSize: '0.8rem', color: '#10b981', fontWeight: 600 }}>AI Clinical Analysis</div>
                                                    )}
                                                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', color: 'var(--text-main)' }}>{n.text}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Add a clinical comment..."
                                        value={commentData[report.id] || ''}
                                        onChange={(e) => handleCommentChange(report.id, e.target.value)}
                                        style={{ margin: 0, flex: 1 }}
                                    />
                                    <button
                                        onClick={() => submitComment(report.patient_uid, report.id)}
                                        className="btn-primary"
                                        style={{ margin: 0, width: 'auto' }}
                                    >
                                        Post Comment
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export const HospitalDashboard = () => {
    const { currentUser, logout } = useAuth();
    const [stats, setStats] = useState(null);
    const [doctors, setDoctors] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [patients, setPatients] = useState([]);

    // Role Assignment State
    const [assignUid, setAssignUid] = useState('');
    const [assignRole, setAssignRole] = useState('doctor');
    const [assignLoading, setAssignLoading] = useState(false);
    const [assignMessage, setAssignMessage] = useState(null);

    // Patient Assignment State
    const [assignDocUid, setAssignDocUid] = useState('');
    const [assignPatUid, setAssignPatUid] = useState('');
    const [patAssignLoading, setPatAssignLoading] = useState(false);
    const [patAssignMessage, setPatAssignMessage] = useState(null);

    const fetchDashboardData = async () => {
        if (!currentUser) return;
        try {
            // Get fresh token to pass in Authorization header
            const token = await currentUser.getIdToken();
            const headers = { 'Authorization': `Bearer ${token}` };

            // Fetch stats, doctors, and audit logs in parallel
            const [statsRes, doctorsRes, logsRes, patientsRes] = await Promise.all([
                fetch(`${API_BASE_URL}/hospital/stats`, { headers }),
                fetch(`${API_BASE_URL}/hospital/doctors`, { headers }),
                fetch(`${API_BASE_URL}/hospital/audit-logs`, { headers }),
                fetch(`${API_BASE_URL}/hospital/patients`, { headers })
            ]);

            if (!statsRes.ok || !doctorsRes.ok || !logsRes.ok || !patientsRes.ok) {
                throw new Error("Failed to fetch hospital dashboard data. Ensure your account has the 'hospital' role.");
            }

            const statsData = await statsRes.json();
            const doctorsData = await doctorsRes.json();
            const logsData = await logsRes.json();
            const patientsData = await patientsRes.json();

            setStats(statsData);
            setDoctors(doctorsData.doctors || []);
            setAuditLogs(logsData.audit_logs || []);
            setPatients(patientsData.patients || []);

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboardData();
    }, [currentUser]);

    const handleAssignPatient = async (e) => {
        e.preventDefault();
        if (!assignDocUid || !assignPatUid) return;

        setPatAssignLoading(true);
        setPatAssignMessage(null);
        try {
            const token = await currentUser.getIdToken();
            const res = await fetch(`${API_BASE_URL}/hospital/assign-patient`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    hospital_uid: currentUser.uid,
                    doctor_uid: assignDocUid,
                    patient_uid: assignPatUid
                })
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.detail || 'Failed to assign patient.');

            setPatAssignMessage({ type: 'success', text: `Patient successfully assigned.` });
            setAssignDocUid('');
            setAssignPatUid('');

            // Refresh data seamlessly
            fetchDashboardData();
        } catch (err) {
            setPatAssignMessage({ type: 'error', text: err.message });
        } finally {
            setPatAssignLoading(false);
        }
    };

    const handleAssignRole = async (e) => {
        e.preventDefault();
        if (!assignUid.trim()) return;

        // Prevent duplicate doctors (basic UI check)
        if (assignRole === 'doctor' && doctors.some(d => d.uid === assignUid.trim())) {
            setAssignMessage({ type: 'error', text: 'User is already registered as a doctor.' });
            return;
        }

        setAssignLoading(true);
        setAssignMessage(null);
        try {
            const token = await currentUser.getIdToken();
            const res = await fetch(`${API_BASE_URL}/admin/assign-role`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    assigner_uid: currentUser.uid,
                    target_uid: assignUid.trim(),
                    role: assignRole
                })
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.detail || 'Failed to assign role.');

            setAssignMessage({ type: 'success', text: `Successfully updated user role to ${assignRole}.` });
            setAssignUid('');

            // Refresh data seamlessly
            fetchDashboardData();
        } catch (err) {
            setAssignMessage({ type: 'error', text: err.message });
        } finally {
            setAssignLoading(false);
        }
    };

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Building2 size={32} color="#f472b6" />
                    <h2>Hospital Administration</h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{currentUser?.email}</span>
                    <button onClick={logout} className="btn-primary" style={{ padding: '0.5rem 1rem', width: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <LogOut size={16} /> Sign Out
                    </button>
                </div>
            </header>

            {error && <div style={{ color: '#ef4444', marginBottom: '1rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>{error}</div>}

            {loading ? (
                <p style={{ color: 'var(--text-muted)' }}>Loading hospital statistics...</p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {/* Stats Grid */}
                    {stats && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                            <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center' }}>
                                <h4 style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Total Patients</h4>
                                <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#60a5fa' }}>{stats.total_patients}</div>
                            </div>
                            <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center' }}>
                                <h4 style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Registered Doctors</h4>
                                <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#34d399' }}>{stats.total_doctors}</div>
                            </div>
                            <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center' }}>
                                <h4 style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Total Reports</h4>
                                <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#c084fc' }}>{stats.total_reports}</div>
                            </div>
                            <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center', border: stats.high_risk_reports > 0 ? '1px solid rgba(239, 68, 68, 0.3)' : undefined }}>
                                <h4 style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>High Risk Alerts</h4>
                                <div style={{ fontSize: '2.5rem', fontWeight: 700, color: stats.high_risk_reports > 0 ? '#ef4444' : '#9ca3af' }}>{stats.high_risk_reports}</div>
                            </div>
                        </div>
                    )}

                    {/* Management Forms Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>

                        {/* Role Assignment Form */}
                        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <h3 style={{ margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <UserPlus size={20} color="var(--primary)" /> Assign System Roles
                            </h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                                Grant doctor or hospital access to an existing Firebase User via their UID.
                            </p>

                            <form onSubmit={handleAssignRole} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Target Firebase UID"
                                    value={assignUid}
                                    onChange={(e) => setAssignUid(e.target.value)}
                                    style={{ flex: '1', minWidth: '200px', margin: 0 }}
                                    required
                                />
                                <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
                                    <select
                                        className="form-input"
                                        value={assignRole}
                                        onChange={(e) => setAssignRole(e.target.value)}
                                        style={{ flex: 1, margin: 0 }}
                                    >
                                        <option value="doctor">Doctor</option>
                                        <option value="hospital">Hospital Admin</option>
                                    </select>
                                    <button type="submit" className="btn-primary" disabled={assignLoading} style={{ margin: 0, width: 'auto', whiteSpace: 'nowrap' }}>
                                        {assignLoading ? 'Assigning...' : 'Assign Role'}
                                    </button>
                                </div>
                            </form>

                            {assignMessage && (
                                <div style={{ padding: '0.75rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', background: assignMessage.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: assignMessage.type === 'success' ? '#10b981' : '#ef4444', border: `1px solid ${assignMessage.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}` }}>
                                    {assignMessage.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                                    {assignMessage.text}
                                </div>
                            )}
                        </div>

                        {/* Patient Assignment Form */}
                        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <h3 style={{ margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Stethoscope size={20} color="#34d399" /> Assign Patient to Doctor
                            </h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                                Link a patient to a doctor so the doctor can review their medical reports.
                            </p>

                            <form onSubmit={handleAssignPatient} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <select
                                    className="form-input"
                                    value={assignDocUid}
                                    onChange={(e) => setAssignDocUid(e.target.value)}
                                    style={{ margin: 0 }}
                                    required
                                >
                                    <option value="" disabled>Select Doctor</option>
                                    {doctors.map(d => (
                                        <option key={d.uid} value={d.uid}>Dr. {d.name || d.email}</option>
                                    ))}
                                </select>
                                <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
                                    <select
                                        className="form-input"
                                        value={assignPatUid}
                                        onChange={(e) => setAssignPatUid(e.target.value)}
                                        style={{ flex: 1, margin: 0 }}
                                        required
                                    >
                                        <option value="" disabled>Select Patient</option>
                                        {patients.map(p => (
                                            <option key={p.uid} value={p.uid}>{p.name || p.email}</option>
                                        ))}
                                    </select>
                                    <button type="submit" className="btn-primary" disabled={patAssignLoading} style={{ margin: 0, width: 'auto', whiteSpace: 'nowrap' }}>
                                        {patAssignLoading ? 'Linking...' : 'Link Patient'}
                                    </button>
                                </div>
                            </form>

                            {patAssignMessage && (
                                <div style={{ padding: '0.75rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', background: patAssignMessage.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: patAssignMessage.type === 'success' ? '#10b981' : '#ef4444', border: `1px solid ${patAssignMessage.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}` }}>
                                    {patAssignMessage.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                                    {patAssignMessage.text}
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
                        {/* Doctors List */}
                        <div className="glass-panel" style={{ padding: '1.5rem' }}>
                            <h3 style={{ marginBottom: '1.5rem', color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Registered Doctors</h3>
                            {doctors.length === 0 ? (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No doctors found.</p>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                                                <th style={{ padding: '0.75rem 0.5rem' }}>Doctor Details</th>
                                                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>Assigned Patients</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {doctors.map(doc => (
                                                <tr key={doc.uid} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <td style={{ padding: '1rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                        <div style={{ background: 'rgba(52, 211, 153, 0.1)', padding: '0.4rem', borderRadius: '50%' }}>
                                                            <User size={16} color="#34d399" />
                                                        </div>
                                                        <div>
                                                            <div style={{ color: 'var(--text-main)', fontWeight: 500 }}>{doc.name || 'Unnamed Doctor'}</div>
                                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{doc.email}</div>
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '1rem 0.5rem', textAlign: 'center' }}>
                                                        <span style={{ background: 'rgba(255,255,255,0.05)', padding: '0.3rem 0.8rem', borderRadius: '20px', color: 'var(--text-main)', fontWeight: '600' }}>
                                                            {doc.patient_count || 0}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Audit Logs */}
                        <div className="glass-panel" style={{ padding: '1.5rem' }}>
                            <h3 style={{ marginBottom: '1.5rem', color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Recent Audit Logs</h3>
                            {auditLogs.length === 0 ? (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No audit logs found.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '400px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                                    {auditLogs.map((log, i) => (
                                        <div key={i} style={{ background: 'var(--input-bg)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                                <span style={{ color: '#60a5fa', fontWeight: 600, fontSize: '0.85rem' }}>{log.action}</span>
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                                    {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'Unknown Time'}
                                                </span>
                                            </div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                <div><strong style={{ color: 'var(--text-main)' }}>Actor UID:</strong> {log.doctor_uid || log.assigner_uid}</div>
                                                {log.patient_uid && <div><strong style={{ color: 'var(--text-main)' }}>Target Patient:</strong> {log.patient_uid}</div>}
                                                {log.target_uid && <div><strong style={{ color: 'var(--text-main)' }}>Target User:</strong> {log.target_uid}</div>}
                                                {log.assigned_role && <div><strong style={{ color: 'var(--text-main)' }}>Role Assigned:</strong> <span style={{ color: '#34d399' }}>{log.assigned_role}</span></div>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
