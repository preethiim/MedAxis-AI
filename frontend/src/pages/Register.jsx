import React, { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { HeartPulse, UserPlus } from 'lucide-react';

const Register = () => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: 'patient',
        healthId: '',
        employeeId: '',
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
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            const registerUserFn = httpsCallable(functions, 'registerUser');
            const result = await registerUserFn(formData);

            if (result.data.success) {
                // Now sign them in so that the local auth state is updated
                import('firebase/auth').then(({ signInWithEmailAndPassword }) => {
                    import('../firebase/firebaseConfig').then(({ auth }) => {
                        signInWithEmailAndPassword(auth, formData.email, formData.password)
                            .catch(err => {
                                setError("Account created, but couldn't auto-login: " + err.message);
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
                    <UserPlus size={48} color="#60a5fa" />
                </div>
                <h1 className="auth-title">Join MedAxis AI</h1>
                <p className="auth-subtitle">Create your account to get started</p>

                {error && <div className="error-msg">{error}</div>}

                <form onSubmit={handleRegister}>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label className="form-label">Full Name</label>
                            <input type="text" className="form-input" name="name" value={formData.name} onChange={handleChange} required />
                        </div>

                        <div className="form-group" style={{ flex: 1 }}>
                            <label className="form-label">Role</label>
                            <select className="form-input" name="role" value={formData.role} onChange={handleChange} required>
                                <option value="patient">Patient</option>
                                <option value="doctor">Doctor</option>
                                <option value="hospital">Hospital</option>
                            </select>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Email Address</label>
                        <input type="email" className="form-input" name="email" value={formData.email} onChange={handleChange} required />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <input type="password" className="form-input" name="password" value={formData.password} onChange={handleChange} required minLength="6" />
                    </div>

                    {/* Role Specific Fields */}
                    {formData.role === 'patient' && (
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '10px', marginBottom: '1rem' }}>
                            <h4 style={{ marginBottom: '1rem', fontSize: '0.9rem', color: '#94a3b8' }}>Patient Medical Information</h4>
                            <div className="form-group">
                                <label className="form-label">Health ID</label>
                                <input type="text" className="form-input" name="healthId" value={formData.healthId} onChange={handleChange} />
                            </div>

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
                                    <input type="number" step="0.1" className="form-input" name="bmi" value={formData.bmi} onChange={handleChange} />
                                </div>
                            </div>
                        </div>
                    )}

                    {formData.role === 'hospital' && (
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '10px', marginBottom: '1rem' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Hospital Employee ID / Registration No.</label>
                                <input type="text" className="form-input" name="employeeId" value={formData.employeeId} onChange={handleChange} required />
                            </div>
                        </div>
                    )}

                    <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ marginTop: '0.5rem' }}>
                        {isSubmitting ? <span className="loader"></span> : 'Create Account'}
                    </button>
                </form>

                <p style={{ textAlign: 'center', marginTop: '1.5rem', color: 'var(--text-muted)' }}>
                    Already have an account? <Link to="/login" className="link">Sign in</Link>
                </p>
            </div>
        </div>
    );
};

export default Register;
