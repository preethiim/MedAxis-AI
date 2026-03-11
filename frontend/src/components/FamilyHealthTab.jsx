import React, { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Edit2, Trash2, ChevronRight, AlertCircle, Calendar } from 'lucide-react';
import FamilyMemberDetail from './FamilyMemberDetail';

const FASTAPI_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const RELATIONS = ['Spouse', 'Child', 'Parent', 'Sibling', 'Grandparent', 'Other'];

const AVATAR_COLORS = {
    Spouse: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
    Child:  'linear-gradient(135deg,#10b981,#34d399)',
    Parent: 'linear-gradient(135deg,#f59e0b,#fbbf24)',
    Sibling:'linear-gradient(135deg,#3b82f6,#60a5fa)',
    Grandparent: 'linear-gradient(135deg,#ef4444,#f87171)',
    Other:  'linear-gradient(135deg,#6b7280,#9ca3af)',
};

const monthsAgo = (dateStr) => {
    if (!dateStr) return null;
    const then = new Date(dateStr);
    const now = new Date();
    return (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth())
        + (now.getDate() < then.getDate() ? -1 : 0);
};

const emptyForm = { name: '', age: '', relation: 'Spouse', lastCheckupDate: '', medicalNotes: '' };

const FamilyHealthTab = ({ uid, token }) => {
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editMember, setEditMember] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [selectedMember, setSelectedMember] = useState(null);
    const [deletingId, setDeletingId] = useState(null);

    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    // ── Fetch members ──────────────────────────────────────────────────────────
    const loadMembers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${FASTAPI_URL}/family/members`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) {
                const data = await res.json();
                setMembers(data.members || []);
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { loadMembers(); }, [loadMembers]);

    // ── Open add form ─────────────────────────────────────────────────────────
    const openAdd = () => { setEditMember(null); setForm(emptyForm); setError(null); setShowForm(true); };
    const openEdit = (m, e) => {
        e.stopPropagation();
        setEditMember(m);
        setForm({ name: m.name, age: String(m.age), relation: m.relation, lastCheckupDate: m.lastCheckupDate || '', medicalNotes: m.medicalNotes || '' });
        setError(null);
        setShowForm(true);
    };

    // ── Save (add or edit) ────────────────────────────────────────────────────
    const saveMember = async (e) => {
        e.preventDefault();
        if (!form.name.trim() || !form.age) { setError('Name and Age are required.'); return; }
        setSaving(true); setError(null);
        const payload = { name: form.name.trim(), age: parseInt(form.age), relation: form.relation, lastCheckupDate: form.lastCheckupDate, medicalNotes: form.medicalNotes };
        try {
            const url = editMember
                ? `${FASTAPI_URL}/family/member/${editMember.id}`
                : `${FASTAPI_URL}/family/member`;
            const method = editMember ? 'PATCH' : 'POST';
            const res = await fetch(url, { method, headers, body: JSON.stringify(payload) });
            if (!res.ok) { const d = await res.json(); throw new Error(d.detail || 'Save failed'); }
            await loadMembers();
            setShowForm(false);
        } catch (err) { setError(err.message); }
        finally { setSaving(false); }
    };

    // ── Delete ────────────────────────────────────────────────────────────────
    const deleteMember = async (id, e) => {
        e.stopPropagation();
        if (!window.confirm('Delete this family member and all their records?')) return;
        setDeletingId(id);
        try {
            await fetch(`${FASTAPI_URL}/family/member/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            setMembers(prev => prev.filter(m => m.id !== id));
        } catch (err) { console.error(err); }
        finally { setDeletingId(null); }
    };

    // ── Detail view ───────────────────────────────────────────────────────────
    if (selectedMember) {
        return (
            <FamilyMemberDetail
                member={selectedMember}
                uid={uid}
                token={token}
                onBack={() => setSelectedMember(null)}
                onMemberUpdated={loadMembers}
            />
        );
    }

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <h3 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                    <Users size={20} /> Family Health
                </h3>
                <button className="btn-primary" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem', padding: '0.45rem 1rem' }}>
                    <Plus size={15} /> Add Member
                </button>
            </div>

            {error && !showForm && <div className="error-msg" style={{ marginBottom: '1rem' }}><AlertCircle size={15} /> {error}</div>}

            {/* Add / Edit Form */}
            {showForm && (
                <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', marginBottom: '1.5rem' }}>
                    <h4 style={{ marginBottom: '1.25rem', fontSize: '0.95rem', fontWeight: 700 }}>
                        {editMember ? `Edit — ${editMember.name}` : '➕ Add Family Member'}
                    </h4>
                    {error && <div className="error-msg" style={{ marginBottom: '0.75rem' }}><AlertCircle size={14} /> {error}</div>}
                    <form onSubmit={saveMember} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Full Name *</label>
                            <input className="form-input" placeholder="e.g. Priya Sharma" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required style={{ margin: 0 }} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Age *</label>
                            <input className="form-input" type="number" min="0" max="130" placeholder="e.g. 35" value={form.age} onChange={e => setForm(p => ({ ...p, age: e.target.value }))} required style={{ margin: 0 }} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Relation *</label>
                            <select className="form-input" value={form.relation} onChange={e => setForm(p => ({ ...p, relation: e.target.value }))} style={{ margin: 0 }}>
                                {RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Last Checkup Date</label>
                            <input className="form-input" type="date" value={form.lastCheckupDate} onChange={e => setForm(p => ({ ...p, lastCheckupDate: e.target.value }))} style={{ margin: 0 }} />
                        </div>
                        <div className="form-group" style={{ margin: 0, gridColumn: '1/-1' }}>
                            <label className="form-label">Medical Notes</label>
                            <textarea className="form-input" rows={2} placeholder="Allergies, chronic conditions, current meds..." value={form.medicalNotes} onChange={e => setForm(p => ({ ...p, medicalNotes: e.target.value }))} style={{ margin: 0, resize: 'vertical', fontSize: '0.85rem' }} />
                        </div>
                        <div style={{ gridColumn: '1/-1', display: 'flex', gap: '0.65rem' }}>
                            <button type="submit" className="btn-primary" disabled={saving} style={{ fontSize: '0.88rem' }}>
                                {saving ? '⏳ Saving...' : editMember ? 'Update Member' : 'Add Member'}
                            </button>
                            <button type="button" className="btn-outline" onClick={() => setShowForm(false)} style={{ fontSize: '0.88rem' }}>Cancel</button>
                        </div>
                    </form>
                </div>
            )}

            {/* Members list */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}><span className="loader" /></div>
            ) : members.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3.5rem', color: 'var(--text-muted)' }}>
                    <Users size={56} style={{ opacity: 0.15, marginBottom: '1rem' }} />
                    <p style={{ marginBottom: '0.5rem' }}>No family members added yet.</p>
                    <p style={{ fontSize: '0.85rem' }}>Click <strong>Add Member</strong> to start tracking family health.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                    {members.map(m => {
                        const avatarBg = AVATAR_COLORS[m.relation] || AVATAR_COLORS.Other;
                        return (
                            <div
                                key={m.id}
                                onClick={() => setSelectedMember(m)}
                                style={{
                                    background: 'var(--gradient-card)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: 'var(--radius-md)',
                                    padding: '1.25rem',
                                    cursor: 'pointer',
                                    transition: 'var(--transition)',
                                    position: 'relative',
                                    overflow: 'hidden',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.transform = ''; }}
                            >
                                {/* Top row */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '0.85rem' }}>
                                    <div style={{ width: 46, height: 46, borderRadius: '50%', background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.15rem', color: '#fff', flexShrink: 0 }}>
                                        {m.name?.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.1rem' }}>{m.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{m.relation} · {m.age} yrs</div>
                                    </div>
                                    <ChevronRight size={18} style={{ marginLeft: 'auto', color: 'var(--text-dim)' }} />
                                </div>

                                {/* Checkup date */}
                                {m.lastCheckupDate && (
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.6rem' }}>
                                        <Calendar size={12} /> Last checkup: {new Date(m.lastCheckupDate).toLocaleDateString('en-IN')}
                                        {monthsAgo(m.lastCheckupDate) >= 6 && (
                                            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.2)', marginLeft: '0.3rem' }}>
                                                OVERDUE
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* Notes preview */}
                                {m.medicalNotes && (
                                    <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.4, marginBottom: '0.85rem', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                        {m.medicalNotes}
                                    </p>
                                )}

                                {/* Actions */}
                                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem' }}>
                                    <button onClick={e => openEdit(m, e)} className="btn-outline" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                        <Edit2 size={12} /> Edit
                                    </button>
                                    <button onClick={e => deleteMember(m.id, e)} className="btn-outline" disabled={deletingId === m.id} style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}>
                                        {deletingId === m.id ? '...' : <><Trash2 size={12} /> Delete</>}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default FamilyHealthTab;
