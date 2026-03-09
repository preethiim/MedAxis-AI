



import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../firebase/firebaseConfig';
import { User, Activity, FileText, CheckCircle, AlertCircle, TrendingUp, Upload, Footprints, RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { ProfileImageUpload } from '../components/ProfileImageUpload';

const FASTAPI_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const PatientDashboard = () => {
    const { currentUser, logout } = useAuth();
    const [activeTab, setActiveTab] = useState('my reports');

    const [profile, setProfile] = useState({ firstName: '', lastName: '', gender: '', birthDate: '' });
    const [vitals, setVitals] = useState({ height_cm: '', weight_kg: '', heartRate: '', oxygen: '' });
    const [reportFile, setReportFile] = useState(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [results, setResults] = useState({ profile: null, vitals: null, labs: null, reportAnalysis: null });

    const [fetchedReports, setFetchedReports] = useState([]);
    const [fetchingReports, setFetchingReports] = useState(false);
    const [bmiData, setBmiData] = useState([]);
    const [fetchingTrends, setFetchingTrends] = useState(false);

    const [stepInput, setStepInput] = useState('');
    const [stepRewards, setStepRewards] = useState({ daily_steps: {}, total_points: 0 });
    const [stepLoading, setStepLoading] = useState(false);
    const [stepMsg, setStepMsg] = useState(null);
    const [syncLoading, setSyncLoading] = useState(false);
    const [healthId, setHealthId] = useState('');
    const [profileImage, setProfileImage] = useState(null);

    useEffect(() => {
        const fetchDashboardData = async () => {
            if (!currentUser) return;
            setFetchingReports(true);
            setFetchingTrends(true);
            try {
                const token = await currentUser.getIdToken();
                const headers = { 'Authorization': `Bearer ${token}` };
                const [reportsRes, vitalsRes, stepsRes] = await Promise.all([
                    fetch(`${FASTAPI_URL}/patient/reports`, { headers }),
                    fetch(`${FASTAPI_URL}/patient/vitals`, { headers }),
                    fetch(`${FASTAPI_URL}/patient/step-rewards`, { headers })
                ]);
                const reportsData = await reportsRes.json();
                if (reportsRes.ok) setFetchedReports(reportsData.reports || []);

                const vitalsData = await vitalsRes.json();
                if (vitalsRes.ok && vitalsData.vitals) {
                    const mappedData = {};
                    vitalsData.vitals.forEach(obs => {
                        const dateStr = new Date(obs.effectiveDateTime).toLocaleDateString();
                        const timeMs = new Date(obs.effectiveDateTime).getTime();
                        if (!mappedData[dateStr]) mappedData[dateStr] = { date: dateStr, timestamp: timeMs };

                        const code = obs?.code?.coding?.[0]?.code;
                        const val = obs?.valueQuantity?.value;
                        if (code === "39156-5") mappedData[dateStr].BMI = val;
                        if (code === "8867-4") mappedData[dateStr].heartRate = val;
                        if (code === "2708-6") mappedData[dateStr].oxygen = val;
                    });
                    const trendArray = Object.values(mappedData).sort((a, b) => a.timestamp - b.timestamp);
                    setBmiData(trendArray);
                }

                const stepsData = await stepsRes.json();
                if (stepsRes.ok) setStepRewards(stepsData);
            } catch (err) { console.error("Error fetching:", err); }
            finally { setFetchingReports(false); setFetchingTrends(false); }
        };
        fetchDashboardData();

        const fetchProfile = async () => {
            if (!currentUser) return;
            try {
                const token = await currentUser.getIdToken();
                const res = await fetch(`${FASTAPI_URL}/patient/me`, { headers: { 'Authorization': `Bearer ${token}` } });
                if (res.ok) {
                    const data = await res.json();
                    setHealthId(data.healthId || '');
                    setProfileImage(data.profileImage || null);
                    setProfile({
                        firstName: data.firstName || '',
                        lastName: data.lastName || '',
                        gender: data.gender || '',
                        birthDate: data.birthDate || ''
                    });
                }
            } catch (err) { console.error('Failed to fetch patient profile:', err); }
        };
        fetchProfile();
    }, [currentUser]);

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Good morning";
        if (hour < 18) return "Good afternoon";
        return "Good evening";
    };

    const handleLogout = async () => { try { await logout(); } catch (e) { console.error(e); } };

    const submitProfile = async (e) => {
        e.preventDefault(); setLoading(true); setError(null);
        try {
            const res = await fetch(`${FASTAPI_URL}/fhir/patient`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: currentUser.uid, ...profile }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed');
            setResults(p => ({ ...p, profile: data.data }));
        } catch (err) { setError(err.message); } finally { setLoading(false); }
    };

    const submitVitals = async (e) => {
        e.preventDefault(); setLoading(true); setError(null);
        try {
            const payload = {
                uid: currentUser.uid,
                height_cm: vitals.height_cm ? parseFloat(vitals.height_cm) : null,
                weight_kg: vitals.weight_kg ? parseFloat(vitals.weight_kg) : null,
                heartRate: vitals.heartRate ? parseFloat(vitals.heartRate) : null,
                oxygen: vitals.oxygen ? parseFloat(vitals.oxygen) : null
            };
            const res = await fetch(`${FASTAPI_URL}/fhir/observation/vitals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed');
            setResults(p => ({ ...p, vitals: data.data }));
        } catch (err) { setError(err.message); } finally { setLoading(false); }
    };


    const handleGoogleFitSync = async () => {
        setSyncLoading(true);
        setStepMsg(null);
        try {
            let googleAccessToken = localStorage.getItem('googleAccessToken');

            if (!googleAccessToken) {
                // If not available, prompt the user to sign in with Google to grant the scope
                const provider = new GoogleAuthProvider();
                provider.addScope('https://www.googleapis.com/auth/fitness.activity.read');
                const result = await signInWithPopup(auth, provider);
                const credential = GoogleAuthProvider.credentialFromResult(result);
                if (credential && credential.accessToken) {
                    googleAccessToken = credential.accessToken;
                    localStorage.setItem('googleAccessToken', googleAccessToken);
                } else {
                    throw new Error('Failed to retrieve Google Access Token.');
                }
            }

            const token = await currentUser.getIdToken();
            const res = await fetch(`${FASTAPI_URL}/patient/sync-steps`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ google_access_token: googleAccessToken })
            });

            const data = await res.json();
            if (!res.ok) {
                if (res.status === 401 && data.detail && data.detail.includes('Google Access Token expired')) {
                    // Clear the token so next click triggers a re-auth
                    localStorage.removeItem('googleAccessToken');
                    throw new Error('Google Auth Expired. Please click sync again to re-authenticate.');
                }
                throw new Error(data.detail || 'Google Fit sync failed');
            }

            setStepMsg({ type: 'success', text: `Successfully synced ${data.steps_synced} steps from Google Fit! Total Points: ${data.total_points}` });
            setStepRewards(prev => ({
                ...prev,
                total_points: data.total_points,
                daily_steps: {
                    ...prev.daily_steps,
                    [new Date().toISOString().split('T')[0]]: data.steps_synced
                }
            }));
        } catch (err) {
            setStepMsg({ type: 'error', text: err.message });
        } finally {
            setSyncLoading(false);
        }
    };

    const uploadReport = async (e) => {
        e.preventDefault();
        if (!reportFile) return;
        setLoading(true); setError(null);
        const formData = new FormData();
        formData.append("uid", currentUser.uid);
        formData.append("file", reportFile);
        try {
            const res = await fetch(`${FASTAPI_URL}/upload/blood-report`, { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed to upload report');
            setResults(p => ({ ...p, reportAnalysis: data }));
            // Auto-switch to My Reports and refresh
            const token = await currentUser.getIdToken();
            const reportsRes = await fetch(`${FASTAPI_URL}/patient/reports`, { headers: { 'Authorization': `Bearer ${token}` } });
            const reportsData = await reportsRes.json();
            if (reportsRes.ok) setFetchedReports(reportsData.reports || []);
            setActiveTab('my reports');
        } catch (err) { setError(err.message); } finally { setLoading(false); }
    };

    const tabs = [
        { id: 'my reports', label: '📋 Reports', icon: <FileText size={14} /> },
        { id: 'upload pdf', label: '📄 Upload', icon: <Upload size={14} /> },
        { id: 'steps', label: '🏃 Steps', icon: <Footprints size={14} /> },
        { id: 'trends', label: '📈 Trends', icon: <TrendingUp size={14} /> },
        { id: 'profile', label: '👤 Profile', icon: <User size={14} /> },
        { id: 'vitals', label: '💓 Vitals', icon: <Activity size={14} /> }
    ];

    return (
        <div className="dashboard">
            {/* Header */}
            <div className="dashboard-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: profileImage ? 'none' : 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {profileImage ? <img src={profileImage} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <User size={20} color="white" />}
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{getGreeting()}!</h2>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{currentUser?.email}</span>
                        {healthId && (
                            <div style={{ marginTop: '0.2rem' }}>
                                <span style={{ fontSize: '0.75rem', background: 'rgba(96,165,250,0.15)', color: '#60a5fa', padding: '2px 8px', borderRadius: '4px', fontFamily: 'monospace', letterSpacing: '0.03em' }}>
                                    🪪 {healthId}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
                <button onClick={handleLogout} className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    Sign Out
                </button>
            </div>

            {/* Main Grid */}
            <div className="dashboard-grid">
                {/* Sidebar */}
                <div className="sidebar">
                    <div className="glass-panel" style={{ padding: '1rem' }}>
                        <div className="tab-list" style={{ flexDirection: 'column', borderBottom: 'none' }}>
                            {tabs.map(tab => (
                                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                    className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                                    style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', justifyContent: 'flex-start' }}
                                >{tab.label}</button>
                            ))}
                        </div>

                        {/* Quick Stats */}
                        <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--gradient-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Step Points</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--warning)' }}>{stepRewards.total_points || 0} pts</div>
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <div className="glass-panel" style={{ overflow: 'auto', maxHeight: '85vh' }}>

                    {/* Mobile tab bar */}
                    <div className="tab-list" style={{ display: 'none' }}>
                        {tabs.map(tab => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}>{tab.label}</button>
                        ))}
                    </div>

                    {error && <div className="error-msg"><AlertCircle size={16} /> {error}</div>}

                    {/* MY REPORTS */}
                    {activeTab === 'my reports' && (
                        <div>
                            <h3 style={{ fontSize: '1.15rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <FileText size={20} /> My Diagnostic Reports
                            </h3>
                            {fetchingReports ? (
                                <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
                                    <span className="loader" style={{ marginBottom: '1rem', display: 'block', marginLeft: 'auto', marginRight: 'auto' }}></span>
                                    Loading reports...
                                </div>
                            ) : fetchedReports.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
                                    <Activity size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                                    <p>No diagnostic reports found.</p>
                                    <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Upload a PDF or Image in the "Upload" tab to get your first AI analysis.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    {fetchedReports.map((report, idx) => {
                                        let riskLevel = "Unknown", clinicalSummary = "No AI summary available.", recommendations = [];
                                        const aiNote = report.note?.find(n => !n.type || n.type !== 'doctor_comment');
                                        if (aiNote) {
                                            const text = aiNote.text || "";
                                            const riskMatch = text.match(/AI Risk Level:\s*(.+)/);
                                            if (riskMatch) riskLevel = riskMatch[1].trim();
                                            const parts = text.split("Recommendations:");
                                            if (parts.length > 0) clinicalSummary = parts[0].replace(/AI Risk Level:.*\n*/, '').replace(/Clinical Summary:\s*/, '').trim();
                                            if (parts.length > 1) recommendations = parts[1].split('\n').filter(r => r.trim().startsWith('-')).map(r => r.replace('-', '').trim());
                                        }
                                        const doctorComments = report.note?.filter(n => n.type === 'doctor_comment') || [];
                                        const pdfUrl = report.presentedForm?.[0]?.url || null;
                                        const badgeClass = riskLevel === 'High' ? 'badge-risk-high' : riskLevel === 'Moderate' ? 'badge-risk-moderate' : riskLevel === 'Low' ? 'badge-risk-low' : 'badge-role';

                                        return (
                                            <div key={report.id || idx} className="report-card">
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                    <div>
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>ID: {report.id}</span>
                                                        {report.issued && <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginLeft: '1rem' }}>📅 {new Date(report.issued).toLocaleString()}</span>}
                                                        <h4 style={{ margin: '0.25rem 0 0', fontSize: '1rem' }}>Blood Work Analysis</h4>
                                                    </div>
                                                    <span className={`badge ${badgeClass}`}>Risk: {riskLevel}</span>
                                                </div>

                                                <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--text-main)', marginBottom: '1rem' }}>{clinicalSummary}</p>

                                                {recommendations.length > 0 && (
                                                    <div style={{ background: 'rgba(16,185,129,0.05)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', borderLeft: '3px solid var(--success)' }}>
                                                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--success)', marginBottom: '0.4rem' }}>Recommendations</div>
                                                        {recommendations.map((r, i) => <div key={i} style={{ fontSize: '0.85rem', color: 'var(--text-main)', paddingLeft: '0.5rem', marginBottom: '0.2rem' }}>• {r}</div>)}
                                                    </div>
                                                )}

                                                {pdfUrl && <a href={pdfUrl} target="_blank" rel="noreferrer" className="link" style={{ fontSize: '0.85rem' }}>→ View Original Document</a>}

                                                {doctorComments.length > 0 && (
                                                    <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                                                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent)', marginBottom: '0.5rem' }}>Doctor Comments</div>
                                                        {doctorComments.map((c, i) => (
                                                            <div key={i} style={{ padding: '0.5rem 0.75rem', marginBottom: '0.4rem', borderLeft: '2px solid var(--accent)', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                                                                {c.text}
                                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>{c.timestamp ? new Date(c.timestamp).toLocaleString() : ''}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* UPLOAD PDF */}
                    {activeTab === 'upload pdf' && (
                        <div>
                            <h3 style={{ fontSize: '1.15rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Upload size={20} /> Upload Blood Report</h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                                Upload a blood work PDF or Image. Our AI will extract key metrics, analyze risk levels, and provide clinical recommendations.
                            </p>
                            <form onSubmit={uploadReport}>
                                <div style={{ border: '2px dashed var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '2rem', textAlign: 'center', marginBottom: '1rem', background: 'var(--input-bg)', transition: 'var(--transition)' }}>
                                    <Upload size={32} style={{ color: 'var(--text-dim)', marginBottom: '0.75rem' }} />
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>{reportFile ? `📄 ${reportFile.name}` : 'Drag & drop or click to select a PDF or Image'}</p>
                                    <input type="file" accept="application/pdf, image/png, image/jpeg, .pdf, .png, .jpg, .jpeg" onChange={e => setReportFile(e.target.files[0])} style={{ opacity: 0, position: 'absolute', width: 0 }} id="pdf-upload" />
                                    <label htmlFor="pdf-upload" className="btn-outline" style={{ cursor: 'pointer', display: 'inline-block' }}>Choose File</label>
                                </div>
                                <button type="submit" className="btn-primary" disabled={loading || !reportFile} style={{ width: '100%' }}>
                                    {loading ? '⏳ Analyzing with AI...' : '🚀 Upload & Analyze'}
                                </button>
                            </form>
                            {results.reportAnalysis && (
                                <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(16,185,129,0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(16,185,129,0.2)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', fontWeight: 600, marginBottom: '0.5rem' }}><CheckCircle size={16} /> Analysis Complete!</div>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Your report has been analyzed. Switch to "Reports" to see the detailed AI summary.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* STEPS */}
                    {activeTab === 'steps' && (
                        <div>
                            <h3 style={{ fontSize: '1.15rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>🏃 Steps & Rewards</h3>
                            <div style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(139,92,246,0.08))', padding: '1.5rem', borderRadius: 'var(--radius-lg)', marginBottom: '1.5rem', textAlign: 'center', border: '1px solid rgba(245,158,11,0.15)' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Reward Points</div>
                                <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--warning)' }}>{stepRewards.total_points || 0}</div>
                            </div>

                            <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}>
                                <button
                                    onClick={handleGoogleFitSync}
                                    disabled={syncLoading}
                                    className="btn-outline"
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', justifyContent: 'center', borderColor: '#4285F4', color: '#4285F4' }}
                                >
                                    {syncLoading ? <span className="loader"></span> : <RefreshCw size={18} />}
                                    {syncLoading ? "Syncing with Google Fit..." : "Sync Daily Steps with Google Fit"}
                                </button>
                            </div>

                            <div className="search-bar" style={{ marginBottom: '1rem' }}>
                                <input type="number" className="form-input" placeholder="Enter today's steps" value={stepInput} onChange={e => setStepInput(e.target.value)} style={{ margin: 0, flex: 1 }} />
                                <button className="btn-primary" style={{ margin: 0, width: 'auto' }} disabled={stepLoading || !stepInput}
                                    onClick={async () => {
                                        setStepLoading(true); setStepMsg(null);
                                        try {
                                            const token = await currentUser.getIdToken();
                                            const res = await fetch(`${FASTAPI_URL}/patient/log-steps`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ steps: parseInt(stepInput) }) });
                                            const data = await res.json(); if (!res.ok) throw new Error(data.detail);
                                            setStepMsg({ type: 'success', text: `+${data.points_earned} pts! Total: ${data.total_points}` });
                                            setStepRewards(prev => ({ ...prev, total_points: data.total_points, daily_steps: { ...prev.daily_steps, [new Date().toISOString().split('T')[0]]: parseInt(stepInput) } }));
                                            setStepInput('');
                                        } catch (err) { setStepMsg({ type: 'error', text: err.message }); } finally { setStepLoading(false); }
                                    }}>{stepLoading ? '...' : 'Log Steps'}</button>
                            </div>
                            {stepMsg && <div style={{ color: stepMsg.type === 'success' ? 'var(--success)' : 'var(--danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>{stepMsg.text}</div>}

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                {[['🥉 5K+', '10 pts'], ['🥈 10K+', '25 pts'], ['🥇 15K+', '50 pts']].map(([tier, pts], i) => (
                                    <div key={i} className="stat-card" style={{ padding: '0.75rem' }}>
                                        <div style={{ fontSize: '0.9rem' }}>{tier}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--warning)', fontWeight: 600 }}>{pts}</div>
                                    </div>
                                ))}
                            </div>

                            {stepRewards.daily_steps && Object.keys(stepRewards.daily_steps).length > 0 && (
                                <div>
                                    <h4 style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>Recent History</h4>
                                    <ResponsiveContainer width="100%" height={200}>
                                        <BarChart data={Object.entries(stepRewards.daily_steps).sort((a, b) => a[0].localeCompare(b[0])).slice(-7).map(([date, steps]) => ({ date: date.substring(5), steps }))}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                            <XAxis dataKey="date" stroke="var(--text-dim)" fontSize={11} />
                                            <YAxis stroke="var(--text-dim)" fontSize={11} />
                                            <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.85rem' }} />
                                            <Bar dataKey="steps" fill="var(--warning)" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TRENDS */}
                    {activeTab === 'trends' && (
                        <div>
                            <h3 style={{ fontSize: '1.15rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><TrendingUp size={20} /> Health Trends</h3>
                            {bmiData.length > 0 ? (
                                <div>
                                    <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>BMI Over Time</h4>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <LineChart data={bmiData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                            <XAxis dataKey="date" stroke="var(--text-dim)" fontSize={11} />
                                            <YAxis yAxisId="left" stroke="var(--text-dim)" fontSize={11} domain={['auto', 'auto']} />
                                            <YAxis yAxisId="right" orientation="right" stroke="var(--text-dim)" fontSize={11} domain={['auto', 'auto']} />
                                            <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                                            <Line yAxisId="left" type="monotone" dataKey="BMI" stroke="var(--primary)" strokeWidth={2} dot={{ fill: 'var(--primary)', r: 4 }} name="BMI" />
                                            <Line yAxisId="left" type="monotone" dataKey="heartRate" stroke="var(--warning)" strokeWidth={2} dot={{ fill: 'var(--warning)', r: 4 }} name="Heart Rate (bpm)" />
                                            <Line yAxisId="right" type="monotone" dataKey="oxygen" stroke="var(--accent)" strokeWidth={2} dot={{ fill: 'var(--accent)', r: 4 }} name="Oxygen (%)" />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
                                    <TrendingUp size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                                    <p>No vitals data yet. Submit your height & weight in the "Vitals" tab to start tracking BMI.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* PROFILE */}
                    {activeTab === 'profile' && (
                        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                            <div className="glass-panel" style={{ padding: '2rem', flex: '1 1 250px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <ProfileImageUpload
                                    currentImage={profileImage}
                                    onImageUpdate={url => setProfileImage(url)}
                                />
                                <h4 style={{ marginTop: '1rem', marginBottom: '0.25rem' }}>{profile.firstName} {profile.lastName}</h4>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{currentUser?.email}</span>
                            </div>
                            <form onSubmit={submitProfile} className="glass-panel" style={{ flex: '2 1 400px' }}>
                                <h3 style={{ fontSize: '1.15rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><User size={20} /> Personal Information</h3>
                                <div className="form-group"><label className="form-label">First Name</label><input className="form-input" placeholder="Enter first name" value={profile.firstName} onChange={e => setProfile({ ...profile, firstName: e.target.value })} required /></div>
                                <div className="form-group"><label className="form-label">Last Name</label><input className="form-input" placeholder="Enter last name" value={profile.lastName} onChange={e => setProfile({ ...profile, lastName: e.target.value })} required /></div>
                                <div className="form-group"><label className="form-label">Gender</label>
                                    <select className="form-input" value={profile.gender} onChange={e => setProfile({ ...profile, gender: e.target.value })} required>
                                        <option value="" disabled>Select Gender</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                                    </select>
                                </div>
                                <div className="form-group"><label className="form-label">Date of Birth</label><input className="form-input" type="date" value={profile.birthDate} onChange={e => setProfile({ ...profile, birthDate: e.target.value })} required /></div>
                                <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Saving...' : 'Save Profile'}</button>
                                {results.profile && <div style={{ marginTop: '1rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}><CheckCircle size={16} /> Saved Successfully</div>}
                            </form>
                        </div>
                    )}

                    {/* VITALS */}
                    {activeTab === 'vitals' && (
                        <form onSubmit={submitVitals}>
                            <h3 style={{ fontSize: '1.15rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Activity size={20} /> Submit Vitals</h3>
                            <div className="form-group"><label className="form-label">Height (cm)</label><input className="form-input" type="number" step="0.1" placeholder="e.g. 175.5" value={vitals.height_cm} onChange={e => setVitals({ ...vitals, height_cm: e.target.value })} /></div>
                            <div className="form-group"><label className="form-label">Weight (kg)</label><input className="form-input" type="number" step="0.1" placeholder="e.g. 70.2" value={vitals.weight_kg} onChange={e => setVitals({ ...vitals, weight_kg: e.target.value })} /></div>
                            <div className="form-group"><label className="form-label">Heart Rate (bpm)</label><input className="form-input" type="number" placeholder="e.g. 72" value={vitals.heartRate} onChange={e => setVitals({ ...vitals, heartRate: e.target.value })} /></div>
                            <div className="form-group"><label className="form-label">Oxygen SpO2 (%)</label><input className="form-input" type="number" placeholder="e.g. 98" value={vitals.oxygen} onChange={e => setVitals({ ...vitals, oxygen: e.target.value })} /></div>
                            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Saving...' : 'Calculate & Save Vitals'}</button>
                            {results.vitals && <div style={{ marginTop: '1rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}><CheckCircle size={16} /> Saved Successfully</div>}
                        </form>
                    )}

                </div>
            </div>
        </div>
    );
};

export default PatientDashboard;
