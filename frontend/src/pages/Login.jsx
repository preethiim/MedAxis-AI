import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import { auth } from '../firebase/firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { HeartPulse, CheckCircle } from 'lucide-react';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // New Auth Methods State
    const [loginMethod, setLoginMethod] = useState('email'); // 'email' | 'phone'
    const [phoneNumber, setPhoneNumber] = useState('');
    const [otp, setOtp] = useState('');
    const [isOtpSent, setIsOtpSent] = useState(false);
    const [confirmationResult, setConfirmationResult] = useState(null);

    const { userRole, currentUser, loading } = useAuth();
    const navigate = useNavigate();

    // Redirect if already logged in and role is resolved
    useEffect(() => {
        if (!loading && currentUser && userRole) {
            navigate(`/dashboard/${userRole}`);
        }
    }, [currentUser, userRole, loading, navigate]);

    const setupRecaptcha = () => {
        if (!window.recaptchaVerifier) {
            window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
                'size': 'invisible'
            });
        }
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            setError(err.message);
            setIsSubmitting(false);
        }
    };

    const handleGoogleLogin = async () => {
        setError('');
        setIsSubmitting(true);
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
        } catch (err) {
            setError(err.message);
            setIsSubmitting(false);
        }
    };

    const handleSendOtp = async (e) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);
        try {
            setupRecaptcha();
            const appVerifier = window.recaptchaVerifier;
            const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+91${phoneNumber}`;
            const confirmation = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
            setConfirmationResult(confirmation);
            setIsOtpSent(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleVerifyOtp = async (e) => {
        e.preventDefault();
        if (!otp) return;
        setError('');
        setIsSubmitting(true);
        try {
            await confirmationResult.confirm(otp);
        } catch (err) {
            setError(err.message);
            setIsSubmitting(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-form-wrapper glass-panel">
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                    <img src="/logo.png" alt="MedAxis AI Logo" style={{ height: '56px', objectFit: 'contain' }} />
                </div>
                <h1 className="auth-title">Welcome Back</h1>
                <p className="auth-subtitle">Sign in to MedAxis AI</p>

                {error && <div className="error-msg">{error}</div>}

                {currentUser && !userRole && !loading && (
                    <div style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.9rem', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                        <strong>Account Created!</strong> You are signed in via {currentUser.email ? 'OAuth' : 'Phone'}, but your account has not been assigned a system role (Patient/Doctor/Hospital) yet. Please contact your hospital administrator.
                    </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.25rem', borderRadius: '8px' }}>
                    <button
                        onClick={() => setLoginMethod('email')}
                        style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', background: loginMethod === 'email' ? 'var(--primary)' : 'transparent', color: loginMethod === 'email' ? 'white' : 'var(--text-muted)', border: 'none', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}
                    >
                        Email
                    </button>
                    <button
                        onClick={() => setLoginMethod('phone')}
                        style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', background: loginMethod === 'phone' ? 'var(--primary)' : 'transparent', color: loginMethod === 'phone' ? 'white' : 'var(--text-muted)', border: 'none', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}
                    >
                        Phone OTP
                    </button>
                </div>

                <div id="recaptcha-container"></div>

                {loginMethod === 'email' && (
                    <form onSubmit={handleLogin}>
                        <div className="form-group">
                            <label className="form-label">Email Address</label>
                            <input
                                type="email"
                                className="form-input"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                placeholder="doctor@medaxis.ai"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Password</label>
                            <input
                                type="password"
                                className="form-input"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                placeholder="••••••••"
                            />
                        </div>

                        <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ marginTop: '0.5rem' }}>
                            {isSubmitting ? <span className="loader"></span> : 'Sign In'}
                        </button>

                        <div style={{ margin: '1.5rem 0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }}></div>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>OR</span>
                            <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }}></div>
                        </div>

                        <button type="button" onClick={handleGoogleLogin} disabled={isSubmitting} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'white', color: '#1f2937', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
                            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" style={{ width: '18px', height: '18px' }} />
                            Contine with Google
                        </button>
                    </form>
                )}

                {loginMethod === 'phone' && (
                    <div>
                        {!isOtpSent ? (
                            <form onSubmit={handleSendOtp}>
                                <div className="form-group">
                                    <label className="form-label">Phone Number</label>
                                    <input
                                        type="tel"
                                        className="form-input"
                                        value={phoneNumber}
                                        onChange={(e) => setPhoneNumber(e.target.value)}
                                        required
                                        placeholder="+91 99999 99999"
                                    />
                                    <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>Include country code (e.g. +91)</small>
                                </div>
                                <button type="submit" className="btn-primary" disabled={isSubmitting}>
                                    {isSubmitting ? <span className="loader"></span> : 'Send Verification Code'}
                                </button>
                            </form>
                        ) : (
                            <form onSubmit={handleVerifyOtp}>
                                <div style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.9rem' }}>
                                    <CheckCircle size={16} /> Code sent to {phoneNumber}
                                </div>
                                <div className="form-group">
                                    <label className="form-label">6-Digit Code</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={otp}
                                        onChange={(e) => setOtp(e.target.value)}
                                        required
                                        placeholder="123456"
                                        maxLength={6}
                                        style={{ letterSpacing: '4px', textAlign: 'center', fontSize: '1.2rem', fontWeight: 600 }}
                                    />
                                </div>
                                <button type="submit" className="btn-primary" disabled={isSubmitting}>
                                    {isSubmitting ? <span className="loader"></span> : 'Verify & Log In'}
                                </button>
                                <button type="button" onClick={() => setIsOtpSent(false)} style={{ background: 'none', border: 'none', color: 'var(--primary)', width: '100%', marginTop: '1rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                                    Change Phone Number
                                </button>
                            </form>
                        )}
                    </div>
                )}

                <p style={{ textAlign: 'center', marginTop: '1.5rem', color: 'var(--text-muted)' }}>
                    Don't have an account? <Link to="/register" className="link">Create one</Link>
                </p>
            </div>

            {/* Public Legal Footer for Google Verification */}
            <footer style={{ marginTop: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                By logging in, you agree to our <Link to="/privacy" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>Privacy Policy</Link>
            </footer>
        </div>
    );
};

export default Login;
