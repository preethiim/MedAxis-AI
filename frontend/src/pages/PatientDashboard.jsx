import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, Activity, FileText, CheckCircle, AlertCircle, TrendingUp, Award, Footprints } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

const FASTAPI_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const PatientDashboard = () => {
    const { currentUser, logout } = useAuth();
    const [activeTab, setActiveTab] = useState('profile');

    // Form States
    const [profile, setProfile] = useState({ firstName: '', lastName: '', gender: '', birthDate: '', healthId: '' });
    const [vitals, setVitals] = useState({ height_cm: '', weight_kg: '' });
    const [labs, setLabs] = useState({ hemoglobin: '', vitaminD: '', glucose: '' });
    const [pdfFile, setPdfFile] = useState(null);

    // Result States
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [results, setResults] = useState({ profile: null, vitals: null, labs: null, pdfAnalysis: null });

    // Fetched Reports & Trends State
    const [fetchedReports, setFetchedReports] = useState([]);
    const [fetchingReports, setFetchingReports] = useState(false);

    const [bmiData, setBmiData] = useState([]);
    const [fetchingTrends, setFetchingTrends] = useState(false);

    // Steps & Rewards State
    const [stepInput, setStepInput] = useState('');
    const [stepRewards, setStepRewards] = useState({ daily_steps: {}, total_points: 0 });
    const [stepLoading, setStepLoading] = useState(false);
    const [stepMsg, setStepMsg] = useState(null);

    useEffect(() => {
        const fetchDashboardData = async () => {
            if (!currentUser) return;
            setFetchingReports(true);
            setFetchingTrends(true);
            try {
                const token = await currentUser.getIdToken();
                const headers = { 'Authorization': `Bearer ${token}` };

                // Fetch reports and vitals in parallel
                const [reportsRes, vitalsRes, stepsRes] = await Promise.all([
                    fetch(`${FASTAPI_URL}/patient/reports`, { headers }),
                    fetch(`${FASTAPI_URL}/patient/vitals`, { headers }),
                    fetch(`${FASTAPI_URL}/patient/step-rewards`, { headers })
                ]);

                const reportsData = await reportsRes.json();
                if (!reportsRes.ok) throw new Error(reportsData.detail || 'Failed to fetch your reports');
                setFetchedReports(reportsData.reports || []);

                const vitalsData = await vitalsRes.json();
                if (vitalsRes.ok && vitalsData.vitals) {
                    // Filter and map only BMI observations
                    const bmiHistory = vitalsData.vitals
                        .filter(obs => obs?.code?.coding?.[0]?.code === "39156-5")
                        .map(obs => ({
                            date: new Date(obs.effectiveDateTime).toLocaleDateString(),
                            timestamp: new Date(obs.effectiveDateTime).getTime(),
                            BMI: obs.valueQuantity.value
                        }))
                        .sort((a, b) => a.timestamp - b.timestamp); // sort chronological

                    // eliminate exact duplicate timestamps for clean graph
                    const cleanBmiHistory = bmiHistory.filter((v, i, a) => a.findIndex(t => (t.timestamp === v.timestamp)) === i);
                    setBmiData(cleanBmiHistory);
                }

                const stepsData = await stepsRes.json();
                if (stepsRes.ok) setStepRewards(stepsData);


            } catch (err) {
                console.error("Error fetching patient records:", err);
            } finally {
                setFetchingReports(false);
                setFetchingTrends(false);
            }
        };
        fetchDashboardData();
    }, [currentUser]);

    const handleLogout = async () => {
        try { await logout(); } catch (err) { console.error(err); }
    };

    const submitProfile = async (e) => {
        e.preventDefault();
        setLoading(true); setError(null);
        try {
            const res = await fetch(`${FASTAPI_URL}/fhir/patient`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: currentUser.uid, ...profile })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed to create FHIR Profile');
            setResults(prev => ({ ...prev, profile: data.data }));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const submitVitals = async (e) => {
        e.preventDefault();
        setLoading(true); setError(null);
        try {
            const res = await fetch(`${FASTAPI_URL}/fhir/observation/vitals`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: currentUser.uid, height_cm: parseFloat(vitals.height_cm), weight_kg: parseFloat(vitals.weight_kg) })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed to submit Vitals');
            setResults(prev => ({ ...prev, vitals: data.data }));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const submitLabs = async (e) => {
        e.preventDefault();
        setLoading(true); setError(null);
        try {
            const payload = {
                uid: currentUser.uid,
                labValues: {
                    hemoglobin: labs.hemoglobin ? parseFloat(labs.hemoglobin) : null,
                    vitaminD: labs.vitaminD ? parseFloat(labs.vitaminD) : null,
                    glucose: labs.glucose ? parseFloat(labs.glucose) : null,
                }
            };
            const res = await fetch(`${FASTAPI_URL}/fhir/diagnostic-report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed to submit Lab Report');
            setResults(prev => ({ ...prev, labs: data.data }));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const uploadPdf = async (e) => {
        e.preventDefault();
        if (!pdfFile) return;

        setLoading(true); setError(null);
        const formData = new FormData();
        formData.append("uid", currentUser.uid);
        formData.append("file", pdfFile);

        try {
            const res = await fetch(`${FASTAPI_URL}/upload/blood-report`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed to upload PDF');
            setResults(prev => ({ ...prev, pdfAnalysis: data }));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <User size={32} color="var(--icon-color)" />
                    <h2>Patient Portal</h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{currentUser?.email}</span>
                    <button onClick={handleLogout} className="btn-primary" style={{ padding: '0.5rem 1rem', width: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        Sign Out
                    </button>
                </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '2rem' }}>

                {/* Left Column - Forms & Tabs */}
                <div className="glass-panel" style={{ padding: '1.5rem', alignSelf: 'start' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                        {['my reports', 'trends', 'upload pdf', 'steps', 'profile', 'vitals', 'labs'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                style={{
                                    background: 'none', border: 'none', padding: '0.5rem 1rem',
                                    color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)',
                                    borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                                    cursor: 'pointer', fontWeight: 600, textTransform: 'capitalize',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                {tab === 'upload pdf' ? '📄 Upload PDF' : tab === 'steps' ? '🏃 Steps' : tab}
                            </button>
                        ))}
                    </div>

                    {error && (
                        <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                            <AlertCircle size={16} /> {error}
                        </div>
                    )}

                    {activeTab === 'profile' && (
                        <form onSubmit={submitProfile}>
                            <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <User size={18} /> Create FHIR Patient
                            </h3>
                            <div className="form-group"><input className="form-input" placeholder="First Name" value={profile.firstName} onChange={e => setProfile({ ...profile, firstName: e.target.value })} required /></div>
                            <div className="form-group"><input className="form-input" placeholder="Last Name" value={profile.lastName} onChange={e => setProfile({ ...profile, lastName: e.target.value })} required /></div>
                            <div className="form-group">
                                <select className="form-input" value={profile.gender} onChange={e => setProfile({ ...profile, gender: e.target.value })} required>
                                    <option value="" disabled>Select Gender</option>
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                            <div className="form-group"><input className="form-input" type="date" value={profile.birthDate} onChange={e => setProfile({ ...profile, birthDate: e.target.value })} required /></div>
                            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Saving...' : 'Save Profile'}</button>
                            {results.profile && <div style={{ marginTop: '1rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}><CheckCircle size={16} /> Saved Successfully</div>}
                        </form>
                    )}

                    {activeTab === 'vitals' && (
                        <form onSubmit={submitVitals}>
                            <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Activity size={18} /> Submit Vitals
                            </h3>
                            <div className="form-group"><input className="form-input" type="number" step="0.1" placeholder="Height (cm)" value={vitals.height_cm} onChange={e => setVitals({ ...vitals, height_cm: e.target.value })} required /></div>
                            <div className="form-group"><input className="form-input" type="number" step="0.1" placeholder="Weight (kg)" value={vitals.weight_kg} onChange={e => setVitals({ ...vitals, weight_kg: e.target.value })} required /></div>
                            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Saving...' : 'Calculate & Save Vitals'}</button>
                            {results.vitals && <div style={{ marginTop: '1rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}><CheckCircle size={16} /> Saved Successfully</div>}
                        </form>
                    )}

                    {activeTab === 'labs' && (
                        <form onSubmit={submitLabs}>
                            <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <FileText size={18} /> Lab Results
                            </h3>
                            <div className="form-group"><input className="form-input" type="number" step="0.1" placeholder="Hemoglobin (g/dL)" value={labs.hemoglobin} onChange={e => setLabs({ ...labs, hemoglobin: e.target.value })} /></div>
                            <div className="form-group"><input className="form-input" type="number" step="0.1" placeholder="Vitamin D (ng/mL)" value={labs.vitaminD} onChange={e => setLabs({ ...labs, vitaminD: e.target.value })} /></div>
                            <div className="form-group"><input className="form-input" type="number" step="0.1" placeholder="Glucose (mg/dL)" value={labs.glucose} onChange={e => setLabs({ ...labs, glucose: e.target.value })} /></div>
                            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Saving...' : 'Generate Lab Report'}</button>
                            {results.labs && <div style={{ marginTop: '1rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}><CheckCircle size={16} /> Saved Successfully</div>}
                        </form>
                    )}

                    {activeTab === 'upload pdf' && (
                        <form onSubmit={uploadPdf}>
                            <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <FileText size={18} /> Upload PDF Report
                            </h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                                Upload a blood work PDF. Our AI will extract key metrics and provide a structured clinical summary.
                            </p>
                            <div className="form-group">
                                <input
                                    className="form-input"
                                    type="file"
                                    accept=".pdf"
                                    onChange={e => setPdfFile(e.target.files[0])}
                                    required
                                    style={{ padding: '0.65rem' }}
                                />
                            </div>
                            <button type="submit" className="btn-primary" disabled={loading || !pdfFile}>
                                {loading ? 'Analyzing with AI...' : 'Upload & Analyze'}
                            </button>
                            {results.pdfAnalysis && <div style={{ marginTop: '1rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}><CheckCircle size={16} /> Analyzed Successfully</div>}
                        </form>
                    )}

                    {activeTab === 'steps' && (
                        <div>
                            <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                🏃 Steps & Rewards
                            </h3>
                            <div style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(139,92,246,0.15))', padding: '1.25rem', borderRadius: '12px', marginBottom: '1.5rem', textAlign: 'center', border: '1px solid rgba(245,158,11,0.2)' }}>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Total Reward Points</div>
                                <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#f59e0b' }}>{stepRewards.total_points || 0}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                <input type="number" className="form-input" placeholder="Enter today's steps" value={stepInput} onChange={e => setStepInput(e.target.value)} style={{ margin: 0, flex: 1 }} />
                                <button className="btn-primary" style={{ margin: 0, width: 'auto' }} disabled={stepLoading || !stepInput}
                                    onClick={async () => {
                                        setStepLoading(true); setStepMsg(null);
                                        try {
                                            const token = await currentUser.getIdToken();
                                            const res = await fetch(`${FASTAPI_URL}/patient/log-steps`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                                body: JSON.stringify({ steps: parseInt(stepInput) })
                                            });
                                            const data = await res.json();
                                            if (!res.ok) throw new Error(data.detail);
                                            setStepMsg({ type: 'success', text: `+${data.points_earned} pts! Total: ${data.total_points}` });
                                            setStepRewards(prev => ({ ...prev, total_points: data.total_points, daily_steps: { ...prev.daily_steps, [new Date().toISOString().split('T')[0]]: parseInt(stepInput) } }));
                                            setStepInput('');
                                        } catch (err) { setStepMsg({ type: 'error', text: err.message }); }
                                        finally { setStepLoading(false); }
                                    }}
                                >{stepLoading ? '...' : 'Log Steps'}</button>
                            </div>
                            {stepMsg && <div style={{ color: stepMsg.type === 'success' ? '#10b981' : '#ef4444', fontSize: '0.85rem', marginBottom: '1rem' }}>{stepMsg.text}</div>}
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                                <strong>Reward Tiers:</strong>
                                <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    <span>🥉 5,000+ steps = <span style={{ color: '#f59e0b' }}>10 pts</span></span>
                                    <span>🥈 10,000+ steps = <span style={{ color: '#f59e0b' }}>25 pts</span></span>
                                    <span>🥇 15,000+ steps = <span style={{ color: '#f59e0b' }}>50 pts</span></span>
                                </div>
                            </div>
                            {stepRewards.daily_steps && Object.keys(stepRewards.daily_steps).length > 0 && (
                                <div style={{ marginTop: '1rem' }}>
                                    <h4 style={{ fontSize: '0.95rem', marginBottom: '0.75rem', color: 'var(--text-main)' }}>Recent Step History</h4>
                                    <ResponsiveContainer width="100%" height={200}>
                                        <BarChart data={Object.entries(stepRewards.daily_steps).sort((a, b) => a[0].localeCompare(b[0])).slice(-7).map(([date, steps]) => ({ date: date.substring(5), steps }))}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                            <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} />
                                            <YAxis stroke="var(--text-muted)" fontSize={12} />
                                            <Tooltip contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                                            <Bar dataKey="steps" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Right Column - Results Display */}
                <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', overflow: 'auto', maxHeight: '80vh' }}>

                    {activeTab === 'my reports' ? (
                        <>
                            <h3 style={{ fontSize: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>My Diagnostic Reports</h3>

                            {fetchingReports ? (
                                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem 0' }}>
                                    <span className="loader" style={{ display: 'inline-block', marginBottom: '1rem', borderTopColor: 'var(--primary)' }}></span>
                                    <p>Loading your medical records securely...</p>
                                </div>
                            ) : fetchedReports.length === 0 ? (
                                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem 0' }}>
                                    <Activity size={48} color="rgba(255,255,255,0.1)" style={{ marginBottom: '1rem' }} />
                                    <p>No diagnostic reports found.</p>
                                    <p style={{ fontSize: '0.85rem' }}>Upload a PDF report in the "Upload PDF" tab to generate your first AI analysis.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    {fetchedReports.map((report, idx) => {
                                        // Find AI Risk Level inside notes natively
                                        let riskLevel = "Unknown";
                                        let clinicalSummary = "No AI summary available.";
                                        let recommendations = [];
                                        const aiNote = report.note?.find(n => !n.type || n.type !== 'doctor_comment');

                                        if (aiNote) {
                                            const text = aiNote.text || "";
                                            const riskMatch = text.match(/AI Risk Level:\s*(.+)/);
                                            if (riskMatch) riskLevel = riskMatch[1].trim();

                                            // Split text block heuristically
                                            const parts = text.split("Recommendations:");
                                            if (parts.length > 0) {
                                                clinicalSummary = parts[0].replace(/AI Risk Level:.*\n*/, '').replace(/Clinical Summary:\s*/, '').trim();
                                            }
                                            if (parts.length > 1) {
                                                recommendations = parts[1].split('\n').filter(r => r.trim().startsWith('-')).map(r => r.replace('-', '').trim());
                                            }
                                        }

                                        const doctorComments = report.note?.filter(n => n.type === 'doctor_comment') || [];
                                        const pdfUrl = (report.presentedForm && report.presentedForm.length > 0) ? report.presentedForm[0].url : null;

                                        return (
                                            <div key={report.id || idx} style={{ background: 'var(--input-bg)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                                                    <div>
                                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Report ID: {report.id}</span>
                                                        <h4 style={{ color: 'var(--text-main)', margin: '0.25rem 0 0 0' }}>Blood Work Analysis</h4>
                                                    </div>
                                                    <span style={{
                                                        padding: '0.25rem 0.75rem',
                                                        borderRadius: '20px',
                                                        fontSize: '0.85rem',
                                                        fontWeight: 600,
                                                        background: riskLevel === 'High' ? 'rgba(239, 68, 68, 0.2)' :
                                                            riskLevel === 'Moderate' ? 'rgba(245, 158, 11, 0.2)' :
                                                                riskLevel === 'Low' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.1)',
                                                        color: riskLevel === 'High' ? '#ef4444' :
                                                            riskLevel === 'Moderate' ? '#f59e0b' :
                                                                riskLevel === 'Low' ? '#10b981' : 'var(--text-muted)'
                                                    }}>
                                                        Risk: {riskLevel}
                                                    </span>
                                                </div>

                                                <p style={{ color: 'var(--text-main)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '1rem' }}>
                                                    {clinicalSummary}
                                                </p>

                                                {recommendations.length > 0 && (
                                                    <div style={{ marginBottom: '1rem' }}>
                                                        <h5 style={{ color: 'var(--text-main)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Lifestyle Suggestions</h5>
                                                        <ul style={{ margin: 0, paddingLeft: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                            {recommendations.map((rec, i) => <li key={i}>{rec}</li>)}
                                                        </ul>
                                                    </div>
                                                )}

                                                {doctorComments.length > 0 && (
                                                    <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px dashed var(--border-color)' }}>
                                                        <h5 style={{ color: '#34d399', marginBottom: '0.75rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            <CheckCircle size={14} /> Doctor Comments
                                                        </h5>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                            {doctorComments.map((dc, i) => (
                                                                <div key={i} style={{ background: 'rgba(52, 211, 153, 0.05)', padding: '0.75rem', borderRadius: '6px', borderLeft: '3px solid #34d399' }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                                        <span>Dr. {dc.author.substring(0, 5)}...</span>
                                                                        <span>{new Date(dc.timestamp).toLocaleString()}</span>
                                                                    </div>
                                                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>{dc.text}</div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {pdfUrl && (
                                                    <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                                                        <a href={pdfUrl} target="_blank" rel="noreferrer" className="btn-primary" style={{ textDecoration: 'none', padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', width: 'auto', margin: 0, background: 'rgba(255,255,255,0.1)' }}>
                                                            <FileText size={14} /> View Original PDF
                                                        </a>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    ) : activeTab === 'trends' ? (
                        <>
                            <h3 style={{ fontSize: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <TrendingUp size={24} color="var(--primary)" /> BMI Health Trends
                            </h3>

                            {fetchingTrends ? (
                                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem 0' }}>
                                    <span className="loader" style={{ display: 'inline-block', marginBottom: '1rem', borderTopColor: 'var(--primary)' }}></span>
                                    <p>Loading historical trend data...</p>
                                </div>
                            ) : bmiData.length === 0 ? (
                                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem 0' }}>
                                    <TrendingUp size={48} color="rgba(255,255,255,0.1)" style={{ marginBottom: '1rem' }} />
                                    <p>Insufficient historical data for a trend graph.</p>
                                    <p style={{ fontSize: '0.85rem' }}>Submit multiple Vitals records over time to see your BMI progression.</p>
                                </div>
                            ) : (
                                <div className="glass-panel" style={{ padding: '1.5rem', height: '400px', display: 'flex', flexDirection: 'column' }}>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                                        This chart visualizes your Body Mass Index (BMI) records over time derived from your submitted FHIR Vitals observations.
                                    </p>
                                    <div style={{ flex: 1, minHeight: 0 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={bmiData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                                                <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} tickMargin={10} />
                                                <YAxis domain={['auto', 'auto']} stroke="var(--text-muted)" fontSize={12} />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--border-color)', borderRadius: '8px' }}
                                                    itemStyle={{ color: 'var(--primary)', fontWeight: 600 }}
                                                    labelStyle={{ color: 'var(--text-muted)', marginBottom: '4px' }}
                                                />
                                                <Line
                                                    type="monotone"
                                                    dataKey="BMI"
                                                    stroke="var(--primary)"
                                                    strokeWidth={3}
                                                    dot={{ fill: 'var(--app-bg)', stroke: 'var(--primary)', strokeWidth: 2, r: 4 }}
                                                    activeDot={{ r: 6, fill: 'var(--primary)', stroke: 'white', strokeWidth: 2 }}
                                                />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <h3 style={{ fontSize: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                                {activeTab === 'pdf' ? 'AI Analysis Results' : 'FHIR Records Viewer'}
                            </h3>

                            {!results.profile && !results.vitals && !results.labs && !results.pdfAnalysis && (
                                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem 0' }}>
                                    {activeTab === 'pdf'
                                        ? "Upload a PDF to see the AI's clinical summary and the extracted values."
                                        : "Submit data using the forms to generate and view structured FHIR JSON objects."}
                                </div>
                            )}
                        </>
                    )}

                    {/* AI Analysis View */}
                    {activeTab === 'pdf' && results.pdfAnalysis && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div style={{ background: 'var(--input-bg)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                    <h4 style={{ color: 'var(--primary)', margin: 0 }}>AI Clinical Summary</h4>
                                    <span style={{
                                        padding: '0.25rem 0.75rem',
                                        borderRadius: '20px',
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        background: results.pdfAnalysis.ai_analysis.risk_level === 'High' ? 'rgba(239, 68, 68, 0.2)' :
                                            results.pdfAnalysis.ai_analysis.risk_level === 'Moderate' ? 'rgba(245, 158, 11, 0.2)' :
                                                'rgba(16, 185, 129, 0.2)',
                                        color: results.pdfAnalysis.ai_analysis.risk_level === 'High' ? '#ef4444' :
                                            results.pdfAnalysis.ai_analysis.risk_level === 'Moderate' ? '#f59e0b' :
                                                '#10b981'
                                    }}>
                                        Risk: {results.pdfAnalysis.ai_analysis.risk_level}
                                    </span>
                                </div>
                                <p style={{ color: 'var(--text-main)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                                    {results.pdfAnalysis.ai_analysis.clinical_summary}
                                </p>

                                <h4 style={{ color: 'var(--text-main)', marginBottom: '0.75rem', fontSize: '0.95rem' }}>Lifestyle Suggestions</h4>
                                <ul style={{ margin: 0, paddingLeft: '1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {results.pdfAnalysis.ai_analysis.lifestyle_recommendations.map((rec, i) => (
                                        <li key={i}>{rec}</li>
                                    ))}
                                </ul>
                            </div>

                            <div>
                                <h4 style={{ color: 'var(--text-main)', marginBottom: '0.5rem', fontSize: '0.95rem', display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Extracted Lab Values</span>
                                    <a href={results.pdfAnalysis.pdf_url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontSize: '0.85rem', textDecoration: 'none' }}>View Original PDF &rarr;</a>
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem' }}>
                                    {Object.entries(results.pdfAnalysis.extracted_labs).map(([key, val]) => (
                                        <div key={key} style={{ background: 'var(--input-bg)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'capitalize', marginBottom: '0.25rem' }}>{key.replace(/([A-Z])/g, ' $1')}</div>
                                            <div style={{ color: 'var(--text-main)', fontSize: '1.25rem', fontWeight: 600 }}>{val || '--'}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Standard FHIR Views */}
                    {activeTab !== 'pdf' && results.profile && (
                        <div>
                            <h4 style={{ color: 'var(--primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <User size={16} /> Patient Resource
                            </h4>
                            <pre style={{ background: 'var(--input-bg)', padding: '1rem', borderRadius: '8px', fontSize: '0.85rem', overflowX: 'auto', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}>
                                {JSON.stringify(results.profile, null, 2)}
                            </pre>
                        </div>
                    )}

                    {activeTab !== 'pdf' && results.vitals && (
                        <div>
                            <h4 style={{ color: 'var(--primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Activity size={16} /> Vitals Observations (Including BMI)
                            </h4>
                            <pre style={{ background: 'var(--input-bg)', padding: '1rem', borderRadius: '8px', fontSize: '0.85rem', overflowX: 'auto', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}>
                                {JSON.stringify(results.vitals, null, 2)}
                            </pre>
                        </div>
                    )}

                    {activeTab !== 'pdf' && results.labs && (
                        <div>
                            <h4 style={{ color: 'var(--primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <FileText size={16} /> Diagnostic Report
                            </h4>
                            <pre style={{ background: 'var(--input-bg)', padding: '1rem', borderRadius: '8px', fontSize: '0.85rem', overflowX: 'auto', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}>
                                {JSON.stringify(results.labs, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PatientDashboard;
