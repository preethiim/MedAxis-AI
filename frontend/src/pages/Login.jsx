import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import { auth } from '../firebase/firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { HeartPulse, CheckCircle, Camera, ShieldCheck } from 'lucide-react';
import * as faceapi from 'face-api.js';
import Webcam from 'react-webcam';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 3-Layer Security States for Patients
    const [authStep, setAuthStep] = useState(1); // 1 = Email, 2 = OTP, 3 = Face, 4 = Done
    const [patientUid, setPatientUid] = useState(null); // Holds UID during steps 2 & 3
    const [referenceImageUrl, setReferenceImageUrl] = useState(null); // User's profile image to match against
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const webcamRef = React.useRef(null);

    // New Auth Methods State
    const [loginMethod, setLoginMethod] = useState('email'); // 'email' | 'phone'
    const [phoneNumber, setPhoneNumber] = useState('');
    const [otp, setOtp] = useState('');
    const [isOtpSent, setIsOtpSent] = useState(false);
    const [confirmationResult, setConfirmationResult] = useState(null);

    const { userRole, currentUser, loading } = useAuth();
    const navigate = useNavigate();

    // Redirect if completely logged in (Step 4 for patients, or immediately for others)
    useEffect(() => {
        if (!loading && currentUser && userRole) {
            if (userRole === 'patient') {
                if (authStep === 4) {
                    navigate(`/dashboard/${userRole}`);
                }
            } else {
                navigate(`/dashboard/${userRole}`);
            }
        }
    }, [currentUser, userRole, loading, navigate, authStep]);

    // Load Face-API models when entering Step 3
    useEffect(() => {
        const loadModels = async () => {
            try {
                const MODEL_URL = process.env.PUBLIC_URL + '/models';
                await Promise.all([
                    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
                    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
                ]);
                setModelsLoaded(true);
            } catch (err) {
                console.error("Failed to load face-api models:", err);
                setError("Failed to initialize camera security models. Ensure models are in /public/models.");
            }
        };

        if (authStep === 3 && !modelsLoaded) {
            loadModels();
        }
    }, [authStep, modelsLoaded]);

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
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Force token refresh to get role
            const tokenResult = await user.getIdTokenResult(true);
            const role = tokenResult.claims.role;

            if (role === 'patient') {
                // Pre-fetch user document to get the profileImage for Face Match
                const token = await user.getIdToken();
                const res = await fetch(`http://localhost:8000/patient/me`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (res.ok) {
                    const data = await res.json();
                    if (!data.profileImage) {
                        await auth.signOut();
                        setError("Face Authentication Required: Please update your profile with a clear face image to log in.");
                        setIsSubmitting(false);
                        return;
                    }
                    setReferenceImageUrl(data.profileImage);
                }

                // Proceed to Step 2: OTP
                setPatientUid(user.uid);
                await generateBackendOTP(user.uid, token);
                setAuthStep(2);
                setIsSubmitting(false);
            } else {
                // Doctors, Hospitals, Superadmins go straight in
                setAuthStep(4);
            }
        } catch (err) {
            setError(err.message);
            setIsSubmitting(false);
        }
    };

    const generateBackendOTP = async (uid, token) => {
        try {
            const res = await fetch('http://localhost:8000/patient/generate-otp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ uid: uid })
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || "Failed to generate OTP");
            }
        } catch (err) {
            throw err;
        }
    };

    const handleVerifyBackendOTP = async (e) => {
        e.preventDefault();
        if (!otp) return;
        setError('');
        setIsSubmitting(true);
        try {
            const token = await currentUser.getIdToken();
            const res = await fetch('http://localhost:8000/patient/verify-otp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ uid: patientUid, otp: otp })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || "Invalid OTP");
            }

            // OTP Verified -> Go to Step 3 (Face Match)
            setAuthStep(3);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleFaceAuthentication = async () => {
        if (!webcamRef.current) return;
        setError('');
        setIsSubmitting(true);

        try {
            // 1. Get Reference Image Descriptor
            const refImage = await faceapi.fetchImage(referenceImageUrl);
            const refDetection = await faceapi.detectSingleFace(refImage).withFaceLandmarks().withFaceDescriptor();

            if (!refDetection) {
                throw new Error("Could not detect a face in your reference profile image. Please contact admin.");
            }

            // 2. Get Live Webcam Descriptor
            const videoElement = webcamRef.current.video;
            const liveDetection = await faceapi.detectSingleFace(videoElement).withFaceLandmarks().withFaceDescriptor();

            if (!liveDetection) {
                throw new Error("Could not detect a face in the webcam feed. Please ensure good lighting and look directly at the camera.");
            }

            // 3. Compare Descriptors
            const distance = faceapi.euclideanDistance(refDetection.descriptor, liveDetection.descriptor);

            // distance < 0.6 is good match, closer to 0 is better.
            const THRESHOLD = 0.5;

            if (distance < THRESHOLD) {
                // Success!
                setAuthStep(4);
            } else {
                throw new Error(`Face match failed (Distance: ${distance.toFixed(2)}). You do not match the registered profile image.`);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleGoogleLogin = async () => {
        setError('');
        setIsSubmitting(true);
        const provider = new GoogleAuthProvider();
        provider.addScope('https://www.googleapis.com/auth/fitness.activity.read');
        try {
            const result = await signInWithPopup(auth, provider);

            // Enforce Email Verification Rule
            if (result.user && !result.user.emailVerified) {
                await auth.signOut();
                setError('Google Sign-In is only allowed for users with a verified email address. Please verify your Google account email first.');
                setIsSubmitting(false);
                return;
            }

            // Capture Google Access Token to query Google REST APIs later
            const credential = GoogleAuthProvider.credentialFromResult(result);
            if (credential && credential.accessToken) {
                localStorage.setItem('googleAccessToken', credential.accessToken);
            }
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

                {/* --- PATIENT 3-LAYER WIZARD: STEP 1 (Email/Pwd) OR Phone OR OAuth --- */}
                {authStep === 1 && (
                    <>
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
                    </>
                )}

                {/* --- PATIENT 3-LAYER WIZARD: STEP 2 (OTP Verification) --- */}
                {authStep === 2 && (
                    <form onSubmit={handleVerifyBackendOTP}>
                        <div style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.9rem' }}>
                            <ShieldCheck size={16} /> Layer 1 Passed. Enter Security PIN.
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                            Check your backend terminal for the simulated OTP code sent to Patient UID: {patientUid?.substring(0, 8)}...
                        </p>
                        <div className="form-group">
                            <label className="form-label">6-Digit OTP</label>
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
                            {isSubmitting ? <span className="loader"></span> : 'Verify PIN'}
                        </button>
                    </form>
                )}

                {/* --- PATIENT 3-LAYER WIZARD: STEP 3 (FACE AUTH) --- */}
                {authStep === 3 && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.9rem' }}>
                            <Camera size={16} /> Layer 2 Passed. Final Step: Face Log In.
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem', textAlign: 'center' }}>
                            Please look straight into the camera to verify your identity against your profile image.
                        </p>

                        {!modelsLoaded ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                <span className="loader" style={{ borderColor: 'var(--primary)', borderBottomColor: 'transparent', width: '32px', height: '32px', marginBottom: '1rem' }}></span>
                                <p>Loading Deep Learning Models...</p>
                            </div>
                        ) : (
                            <>
                                <div style={{ borderRadius: '12px', overflow: 'hidden', border: '3px solid var(--primary)', marginBottom: '1rem', background: '#000', width: '100%', maxWidth: '300px', aspectRatio: '4/3' }}>
                                    <Webcam
                                        audio={false}
                                        ref={webcamRef}
                                        screenshotFormat="image/jpeg"
                                        videoConstraints={{ facingMode: "user" }}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                </div>
                                <button onClick={handleFaceAuthentication} className="btn-primary" disabled={isSubmitting} style={{ width: '100%' }}>
                                    {isSubmitting ? <span className="loader"></span> : 'Capture & Verify Face'}
                                </button>
                            </>
                        )}
                    </div>
                )}

                <p style={{ textAlign: 'center', marginTop: '1.5rem', color: 'var(--text-muted)' }}>
                    Don't have an account? <Link to="/register" className="link">Create one</Link>
                </p>
            </div>

            {/* Footer */}
            <footer style={{ marginTop: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <div style={{ marginBottom: '0.5rem', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                    Created by Preethi M, Vinuthashree Gowd & Yashavanthagowda R G — BNM Institute of Technology
                </div>
                By logging in, you agree to our <Link to="/privacy" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>Privacy Policy</Link>
            </footer>
        </div>
    );
};

export default Login;
