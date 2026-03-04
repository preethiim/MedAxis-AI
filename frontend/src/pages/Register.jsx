import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { HeartPulse } from 'lucide-react';

const Register = () => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        height: '',
        weight: '',
        bmi: ''
    });

    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { currentUser, userRole } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (currentUser && userRole) {
            navigate(`/dashboard/${userRole}`);
        }
    }, [currentUser, userRole, navigate]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => {
            const newData = { ...prev, [name]: value };

            // Auto-calculate BMI when height or weight changes
            if (name === 'height' || name === 'weight') {
                const h = parseFloat(newData.height);
                const w = parseFloat(newData.weight);
                if (h > 0 && w > 0) {
                    const heightInM = h / 100;
                    newData.bmi = (w / (heightInM * heightInM)).toFixed(1);
                } else {
                    newData.bmi = '';
                }
            }
            return newData;
        });
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

            // role is always "patient" — enforced server-side too
            const payload = { ...formData, role: 'patient' };

            const res = await fetch(`${API_BASE_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.detail || 'Failed to register account.');
            }

            if (data.success) {
                // Auto-sign in after successful registration
                import('firebase/auth').then(({ signInWithEmailAndPassword }) => {
                    import('../firebase/firebaseConfig').then(({ auth }) => {
                        signInWithEmailAndPassword(auth, formData.email, formData.password)
                            .catch(err => {
                                setError("Account created! Please sign in: " + err.message);
                                setIsSubmitting(false);
                            });
                    });
                });
            }
        } catch (err) {
            setError(err.message);
            setIsSubmitting(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-form-wrapper glass-panel" style={{ maxWidth: '540px' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                    <img src="/logo.png" alt="MedAxis AI Logo" style={{ height: '56px', objectFit: 'contain' }} />
                </div>
                <h1 className="auth-title">Join MedAxis AI</h1>
                <p className="auth-subtitle">Create your patient account to get started</p>

                {/* Role notice — informational only */}
                <div style={{
                    background: 'rgba(96,165,250,0.08)',
                    border: '1px solid rgba(96,165,250,0.25)',
                    borderRadius: '8px',
                    padding: '0.6rem 0.9rem',
                    marginBottom: '1.25rem',
                    fontSize: '0.82rem',
                    color: '#93c5fd',
                    lineHeight: 1.5
                }}>
                    🩺 <strong>Patients</strong> can self-register here.&nbsp;
                    Doctors are added by their hospital. Hospitals are added by a super admin.
                </div>

                {error && <div className="error-msg">{error}</div>}

                <form onSubmit={handleRegister}>
                    <div className="form-group">
                        <label className="form-label">Full Name</label>
                        <input
                            type="text"
                            className="form-input"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Email Address</label>
                        <input
                            type="email"
                            className="form-input"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <input
                            type="password"
                            className="form-input"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            required
                            minLength="6"
                        />
                    </div>

                    {/* Patient Medical Information */}
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '10px', marginBottom: '1rem' }}>
                        <h4 style={{ marginBottom: '1rem', fontSize: '0.9rem', color: '#94a3b8' }}>Medical Information (optional)</h4>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <div className="form-group" style={{ flex: 1 }}>
                                <label className="form-label">Height (cm)</label>
                                <input type="number" className="form-input" name="height" value={formData.height} onChange={handleChange} />
                            </div>
                            <div className="form-group" style={{ flex: 1 }}>
                                <label className="form-label">Weight (kg)</label>
                                <input type="number" className="form-input" name="weight" value={formData.weight} onChange={handleChange} />
                            </div>
                            <div className="form-group" style={{ flex: 1 }}>
                                <label className="form-label">BMI</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    className="form-input"
                                    name="bmi"
                                    value={formData.bmi}
                                    readOnly
                                    style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', cursor: 'not-allowed' }}
                                />
                            </div>
                        </div>
                    </div>

                    <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ marginTop: '0.5rem' }}>
                        {isSubmitting ? <span className="loader"></span> : 'Create Patient Account'}
                    </button>
                </form>

                <p style={{ textAlign: 'center', marginTop: '1.5rem', color: 'var(--text-muted)' }}>
                    Already have an account? <Link to="/login" className="link">Sign in</Link>
                </p>
            </div>

            {/* Footer */}
            <footer style={{ marginTop: '2rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                Created by Preethi M, Vinuthashree Gowd & Yashavanthagowda R G — BNM Institute of Technology
            </footer>
        </div>
    );
};

export default Register;
