import React from 'react';

export const TermsOfService = () => {
    return (
        <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', color: 'var(--text-main)', lineHeight: '1.6' }}>
            <h1 style={{ color: 'var(--primary)', marginBottom: '1.5rem' }}>Terms of Service</h1>
            <p><strong>Effective Date:</strong> March 1, 2026</p>

            <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--accent)' }}>1. Acceptance of Terms</h2>
            <p>By accessing or using the MedAxis AI platform, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, then you may not access the service.</p>

            <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--accent)' }}>2. Description of Service</h2>
            <p>MedAxis AI provides a platform for centralized health records, AI-driven medical report analysis, and secure data sharing between patients, doctors, and hospitals. Our services are for informational and organizational purposes and **do not replace professional medical advice, diagnosis, or treatment**.</p>

            <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--accent)' }}>3. User Accounts</h2>
            <p>When you create an account with us, you must provide information that is accurate, complete, and current at all times. Failure to do so constitutes a breach of the Terms, which may result in immediate termination of your account on our Service.</p>
            <p>You are responsible for safeguarding the password that you use to access the Service and for any activities or actions under your password.</p>

            <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--accent)' }}>4. Privacy & Consent</h2>
            <p>Your use of the Service is also governed by our Privacy Policy. By using the Service, you consent to the collection and use of your data as outlined in the Privacy Policy. Patients have full control over granting and revoking consent to specific doctors.</p>

            <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--accent)' }}>5. Limitation of Liability</h2>
            <p>In no event shall MedAxis AI, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.</p>

            <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--accent)' }}>6. Changes to Terms</h2>
            <p>We reserve the right, at our sole discretion, to modify or replace these Terms at any time. What constitutes a material change will be determined at our sole discretion.</p>

            <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--accent)' }}>7. Contact Us</h2>
            <p>If you have any questions about these Terms, please contact us at: support@medaxis.ai</p>
        </div>
    );
};
