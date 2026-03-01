import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, ShieldCheck, FileText, ArrowRight } from 'lucide-react';

export const LandingPage = () => {
    const navigate = useNavigate();

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)', color: 'var(--text-main)' }}>

            {/* Header / Navbar */}
            <header style={{ padding: '1.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '12px', background: 'linear-gradient(135deg, var(--primary), var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                        <Activity size={24} />
                    </div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, letterSpacing: '-0.03em' }}>MedAxis AI</h1>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn-outline" onClick={() => navigate('/login')}>Login</button>
                    <button className="btn-primary" onClick={() => navigate('/register')}>Sign Up</button>
                </div>
            </header>

            {/* Hero Section */}
            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', textAlign: 'center' }}>
                <div style={{ maxWidth: '800px' }}>
                    <h2 style={{ fontSize: '3rem', fontWeight: 800, marginBottom: '1.5rem', background: 'linear-gradient(to right, var(--primary), var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        AI-Powered Healthcare Ecosystem
                    </h2>
                    <p style={{ fontSize: '1.2rem', color: 'var(--text-muted)', marginBottom: '2.5rem', lineHeight: 1.6 }}>
                        Centralize your health records, instantly analyze blood test reports with advanced AI, and securely connect with doctors across different hospitals.
                    </p>
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button className="btn-primary" onClick={() => navigate('/register')} style={{ padding: '0.75rem 2rem', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            Get Started <ArrowRight size={18} />
                        </button>
                    </div>
                </div>

                {/* Features Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '2rem', marginTop: '5rem', maxWidth: '1000px', width: '100%' }}>
                    <div className="glass-panel" style={{ textAlign: 'left', padding: '2rem' }}>
                        <FileText size={32} color="var(--primary)" style={{ marginBottom: '1rem' }} />
                        <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Smart Analysis</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>Upload PDF reports and let our AI instantly highlight abnormal values, assess risk, and provide actionable lifestyle recommendations.</p>
                    </div>
                    <div className="glass-panel" style={{ textAlign: 'left', padding: '2rem' }}>
                        <ShieldCheck size={32} color="var(--success)" style={{ marginBottom: '1rem' }} />
                        <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Secure & Centralized</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>Your FHIR-compliant health records are safely stored on the cloud. You have full control over which doctors can view your data.</p>
                    </div>
                    <div className="glass-panel" style={{ textAlign: 'left', padding: '2rem' }}>
                        <Activity size={32} color="var(--accent)" style={{ marginBottom: '1rem' }} />
                        <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Integrated Care</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>Doctors can quickly look up records across different hospitals, add clinical notes, and create digital prescriptions seamlessly.</p>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer style={{ padding: '2rem', textAlign: 'center', borderTop: '1px solid var(--border-color)', background: 'var(--input-bg)' }}>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: '1rem' }}>&copy; 2026 MedAxis AI. All rights reserved.</p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', fontSize: '0.85rem' }}>
                    <Link to="/privacy-policy" style={{ color: 'var(--primary)', textDecoration: 'none' }}>Privacy Policy</Link>
                    <Link to="/terms-of-service" style={{ color: 'var(--primary)', textDecoration: 'none' }}>Terms of Service</Link>
                </div>
            </footer>
        </div>
    );
};
