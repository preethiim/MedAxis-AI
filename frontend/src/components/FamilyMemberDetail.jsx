import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Upload, Pill, Calendar, FileText, AlertCircle, CheckCircle, DownloadCloud, Clock } from 'lucide-react';
import MedicineReminders from './MedicineReminders';
import CheckupTracker from './CheckupTracker';

const FASTAPI_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const severityClass = (s) =>
    s === 'High' ? 'badge-risk-high' : s === 'Moderate' ? 'badge-risk-moderate' : s === 'Low' ? 'badge-risk-low' : 'badge-role';

const FamilyMemberDetail = ({ member, uid, token, onBack, onMemberUpdated }) => {
    const [prescriptions, setPrescriptions] = useState([]);
    const [loadingRx, setLoadingRx] = useState(false);
    const [rxFile, setRxFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState(null);
    const [notes, setNotes] = useState(member.medicalNotes || '');
    const [checkup, setCheckup] = useState(member.lastCheckupDate || '');
    const [savingNotes, setSavingNotes] = useState(false);
    const [noteSaved, setNoteSaved] = useState(false);

    const headers = { Authorization: `Bearer ${token}` };

    // ── Load prescriptions ──────────────────────────────────────────────────
    const loadPrescriptions = useCallback(async () => {
        setLoadingRx(true);
        try {
            const res = await fetch(`${FASTAPI_URL}/family/member/${member.id}/prescriptions`, { headers });
            if (res.ok) {
                const data = await res.json();
                setPrescriptions(data.prescriptions || []);
            }
        } catch (e) { console.error(e); }
        finally { setLoadingRx(false); }
    }, [member.id, token]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { loadPrescriptions(); }, [loadPrescriptions]);

    // ── Upload prescription ─────────────────────────────────────────────────
    const uploadRx = async (e) => {
        e.preventDefault();
        if (!rxFile) return;
        setUploading(true); setError(null);
        const form = new FormData();
        form.append('uid', uid);
        form.append('member_id', member.id);
        form.append('file', rxFile);
        try {
            const res = await fetch(`${FASTAPI_URL}/family/upload-prescription`, { method: 'POST', body: form });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Upload failed');
            await loadPrescriptions();
            setRxFile(null);
        } catch (err) { setError(err.message); }
        finally { setUploading(false); }
    };

    // ── Save notes/checkup ────────────────────────────────────────────────
    const saveNotes = async () => {
        setSavingNotes(true);
        try {
            const res = await fetch(`${FASTAPI_URL}/family/member/${member.id}`, {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: member.name, age: member.age, relation: member.relation, lastCheckupDate: checkup, medicalNotes: notes })
            });
            if (res.ok) { setNoteSaved(true); setTimeout(() => setNoteSaved(false), 2000); onMemberUpdated(); }
        } catch (e) { setError(e.message); }
        finally { setSavingNotes(false); }
    };

    // ── Relation avatar color ────────────────────────────────────────────
    const avatarColors = { Spouse: 'var(--primary)', Child: 'var(--success)', Parent: 'var(--warning)', Sibling: 'var(--accent)', Other: 'var(--text-muted)' };
    const avatarColor = avatarColors[member.relation] || 'var(--primary)';

    return (
        <div>
            {/* Back button / header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <button onClick={onBack} className="btn-outline" style={{ padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                    <ArrowLeft size={15} /> Back
                </button>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: `linear-gradient(135deg, ${avatarColor}, rgba(99,102,241,0.5))`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.1rem', color: '#fff', flexShrink: 0 }}>
                    {member.name?.charAt(0).toUpperCase()}
                </div>
                <div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{member.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{member.relation} · {member.age} yrs</div>
                </div>
            </div>

            {error && <div className="error-msg" style={{ marginBottom: '1rem' }}><AlertCircle size={15} /> {error}</div>}

            {/* Info grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>

                {/* Last Checkup Date Tracker */}
                <div style={{ background: 'var(--gradient-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
                    <CheckupTracker
                        uid={uid}
                        token={token}
                        initialDate={checkup}
                        memberName={member.name}
                        onDateSaved={async (d) => {
                            setCheckup(d);
                            // Call the parent update logic to sync with backend
                            const res = await fetch(`${FASTAPI_URL}/family/member/${member.id}`, {
                                method: 'PATCH',
                                headers: { ...headers, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name: member.name, age: member.age, relation: member.relation, lastCheckupDate: d, medicalNotes: notes })
                            });
                            if (res.ok) { onMemberUpdated(); }
                        }}
                    />
                </div>

                {/* Medical Notes */}
                <div style={{ background: 'var(--gradient-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                        <FileText size={16} color="var(--primary)" /> Medical Notes
                    </div>
                    <textarea
                        className="form-input"
                        rows={4}
                        placeholder="Allergies, chronic conditions, current medications..."
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', resize: 'vertical' }}
                    />
                    <button className="btn-primary" style={{ fontSize: '0.82rem', padding: '0.35rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }} onClick={saveNotes} disabled={savingNotes}>
                        {noteSaved ? <><CheckCircle size={13} /> Saved</> : savingNotes ? '⏳' : 'Save Notes'}
                    </button>
                </div>

            </div>

            {/* Upload Prescription */}
            <div style={{ background: 'var(--gradient-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.25rem', marginBottom: '1.5rem' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.95rem' }}>
                    <Pill size={16} color="var(--primary)" /> Upload Prescription for {member.name}
                </h4>
                <form onSubmit={uploadRx}>
                    <div style={{ border: '2px dashed var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.25rem', textAlign: 'center', background: 'var(--input-bg)', marginBottom: '0.75rem' }}>
                        <DownloadCloud size={24} style={{ color: 'var(--text-dim)', marginBottom: '0.5rem' }} />
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                            {rxFile ? `📄 ${rxFile.name}` : 'PDF, PNG, JPEG, TXT'}
                        </p>
                        <input
                            type="file"
                            accept="application/pdf,image/png,image/jpeg,text/plain,.pdf,.png,.jpg,.jpeg,.txt"
                            onChange={e => setRxFile(e.target.files[0])}
                            style={{ opacity: 0, position: 'absolute', width: 0 }}
                            id={`rx-upload-${member.id}`}
                        />
                        <label htmlFor={`rx-upload-${member.id}`} className="btn-outline" style={{ cursor: 'pointer', fontSize: '0.82rem' }}>Choose File</label>
                    </div>
                    <button type="submit" className="btn-primary" disabled={uploading || !rxFile} style={{ width: '100%', fontSize: '0.9rem' }}>
                        {uploading ? '⏳ Analyzing...' : '🚀 Upload & Analyze'}
                    </button>
                </form>
            </div>

            {/* Prescription History */}
            <div>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.95rem' }}>
                    <FileText size={16} color="var(--accent)" /> Prescription History
                </h4>
                {loadingRx ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}><span className="loader" /></div>
                ) : prescriptions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No prescriptions uploaded yet.</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {prescriptions.map((px, i) => {
                            const ai = px.ai_analysis || {};
                            const sc = ai.severity || 'Unknown';
                            return (
                                <div key={px.id || i} className="report-card">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        <div>
                                            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Prescription Analysis</div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{px.filename}</div>
                                        </div>
                                        <span className={`badge ${severityClass(sc)}`}>Severity: {sc}</span>
                                    </div>
                                    {ai.summary && <p style={{ fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '0.6rem', color: 'var(--text-main)' }}>{ai.summary}</p>}
                                    {ai.comparison && <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: '0.75rem' }}>&quot;{ai.comparison}&quot;</p>}
                                    {ai.recommendations?.length > 0 && (
                                        <div style={{ background: 'rgba(99,102,241,0.08)', padding: '0.65rem 1rem', borderRadius: 'var(--radius-sm)', marginBottom: '0.75rem', borderLeft: '3px solid var(--primary)' }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.3rem' }}>Recommendations</div>
                                            {ai.recommendations.map((r, ri) => <div key={ri} style={{ fontSize: '0.82rem', color: 'var(--text-main)', paddingLeft: '0.4rem' }}>• {r}</div>)}
                                        </div>
                                    )}
                                    {px.file_url && <a href={px.file_url} target="_blank" rel="noreferrer" className="link" style={{ fontSize: '0.82rem' }}>→ View Document</a>}
                                    {ai.medicines?.length > 0 && <MedicineReminders medicines={ai.medicines} uid={`${uid}_${member.id}`} />}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default FamilyMemberDetail;
