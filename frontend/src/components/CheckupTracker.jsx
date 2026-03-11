/**
 * CheckupTracker — shows the patient's last checkup date,
 * how long ago it was, a browser reminder if > 6 months,
 * and a date picker to update it.
 */
import React, { useState, useEffect } from 'react';
import { Calendar, Bell, CheckCircle, AlertTriangle } from 'lucide-react';

const FASTAPI_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

/** Returns elapsed months (float) between a date string and today. */
const monthsAgo = (dateStr) => {
    if (!dateStr) return null;
    const then = new Date(dateStr);
    const now = new Date();
    return (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth())
        + (now.getDate() < then.getDate() ? -1 : 0);
};

/** Human-readable "X months ago / X years ago / today". */
const formatAgo = (months) => {
    if (months === null) return null;
    if (months <= 0) return 'Today';
    if (months < 2) return '1 month ago';
    if (months < 12) return `${months} months ago`;
    const yrs = Math.floor(months / 12);
    const rem = months % 12;
    return rem === 0 ? `${yrs} year${yrs > 1 ? 's' : ''} ago` : `${yrs} yr ${rem} mo ago`;
};

const CheckupTracker = ({ uid, token, initialDate, onDateSaved, memberName = null }) => {
    const [dateStr, setDateStr] = useState(initialDate || '');
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [notified, setNotified] = useState(false);
    const [savedMsg, setSavedMsg] = useState(false);

    const months = monthsAgo(dateStr);
    const isOverdue = months !== null && months >= 6;
    const label = memberName ? `${memberName}'s last checkup` : 'Your last medical checkup';

    // ── Fire browser notification once if overdue ────────────────────────────
    useEffect(() => {
        if (!isOverdue || notified) return;
        const fire = () => {
            new Notification('Medical Checkup Reminder 🏥', {
                body: `${label} was ${formatAgo(months)}. Time to schedule one!`,
                icon: '/favicon.ico',
            });
            setNotified(true);
        };
        if (Notification.permission === 'granted') { fire(); }
        else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(p => { if (p === 'granted') fire(); });
        }
    }, [isOverdue, months, label, notified]);

    // ── Save to backend (patient own) or just call onDateSaved (family member) ──
    const save = async () => {
        if (!dateStr) return;
        setSaving(true);
        try {
            // For family members, just call the parent's handler
            if (onDateSaved) {
                await onDateSaved(dateStr);
            } else {
                // Patient self-update
                const res = await fetch(`${FASTAPI_URL}/patient/update-checkup-date`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ lastCheckupDate: dateStr }),
                });
                if (!res.ok) { const d = await res.json(); throw new Error(d.detail || 'Save failed'); }
            }
            setEditing(false);
            setSavedMsg(true);
            setTimeout(() => setSavedMsg(false), 2500);
        } catch (e) { console.error(e); }
        finally { setSaving(false); }
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            background: isOverdue
                ? 'rgba(239,68,68,0.08)'
                : dateStr
                    ? 'rgba(16,185,129,0.07)'
                    : 'rgba(99,102,241,0.07)',
            border: `1px solid ${isOverdue ? 'rgba(239,68,68,0.25)' : dateStr ? 'rgba(16,185,129,0.2)' : 'rgba(99,102,241,0.2)'}`,
            flexWrap: 'wrap',
        }}>
            {/* Icon */}
            {isOverdue
                ? <AlertTriangle size={17} color="var(--danger)" style={{ flexShrink: 0 }} />
                : dateStr
                    ? <CheckCircle size={17} color="var(--success)" style={{ flexShrink: 0 }} />
                    : <Calendar size={17} color="var(--primary)" style={{ flexShrink: 0 }} />
            }

            {/* Text */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: isOverdue ? 'var(--danger)' : dateStr ? 'var(--success)' : 'var(--primary)' }}>
                    {label}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {!dateStr
                        ? 'No checkup date recorded'
                        : isOverdue
                            ? `⚠️ ${formatAgo(months)} — overdue! Schedule one now.`
                            : `✅ ${formatAgo(months)} (${new Date(dateStr).toLocaleDateString('en-IN')})`
                    }
                </div>
                {isOverdue && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '0.1rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Bell size={11} /> Reminder sent to browser notifications
                    </div>
                )}
            </div>

            {/* Edit / date input */}
            {editing ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                    <input
                        type="date"
                        className="form-input"
                        value={dateStr}
                        onChange={e => setDateStr(e.target.value)}
                        max={new Date().toISOString().split('T')[0]}
                        style={{ margin: 0, padding: '0.3rem 0.6rem', fontSize: '0.8rem', width: 'auto' }}
                    />
                    <button className="btn-primary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }} onClick={save} disabled={saving || !dateStr}>
                        {saving ? '⏳' : 'Save'}
                    </button>
                    <button className="btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }} onClick={() => setEditing(false)}>✕</button>
                </div>
            ) : (
                <button
                    className="btn-outline"
                    style={{ padding: '0.28rem 0.65rem', fontSize: '0.75rem', flexShrink: 0 }}
                    onClick={() => setEditing(true)}
                >
                    {savedMsg ? '✅ Saved' : dateStr ? 'Update' : 'Set Date'}
                </button>
            )}
        </div>
    );
};

export default CheckupTracker;
