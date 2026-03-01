import React from 'react';

export const PrivacyPolicy = () => {
    return (
        <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', color: 'var(--text-main)', lineHeight: '1.6' }}>
            <h1 style={{ color: 'var(--primary)', marginBottom: '1.5rem' }}>Privacy Policy</h1>
            <p><strong>Effective Date:</strong> March 1, 2026</p>

            <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--accent)' }}>1. Introduction</h2>
            <p>Welcome to MedAxis AI ("we," "our," or "us"). We respect your privacy and are committed to protecting your personal data. This privacy policy will inform you as to how we look after your personal data when you visit our website and tell you about your privacy rights.</p>

            <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--accent)' }}>2. The Data We Collect</h2>
            <p>We may collect, use, store and transfer different kinds of personal data about you which we have grouped together as follows:</p>
            <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
                <li><strong>Identity Data:</strong> first name, last name, username or similar identifier, marital status, title, date of birth and gender.</li>
                <li><strong>Contact Data:</strong> email address and telephone numbers.</li>
                <li><strong>Health Data:</strong> medical records, blood reports, prescriptions, and device step counts (FHIR compliant).</li>
                <li><strong>Technical Data:</strong> internet protocol (IP) address, your login data, browser type and version.</li>
            </ul>

            <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--accent)' }}>3. How We Use Your Data</h2>
            <p>We will only use your personal data when the law allows us to. Most commonly, we will use your personal data in the following circumstances:</p>
            <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
                <li>To provide medical analysis and insights via AI (OpenAI).</li>
                <li>To allow authorized healthcare providers to access your records (with your explicit consent).</li>
                <li>To manage our relationship with you.</li>
            </ul>

            <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--accent)' }}>4. Data Security & Storage</h2>
            <p>Your data is securely stored on Google Cloud infrastructure (Firebase Firestore & Storage). We have put in place appropriate security measures to prevent your personal data from being accidentally lost, used or accessed in an unauthorized way, altered or disclosed.</p>

            <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--accent)' }}>5. Your Legal Rights</h2>
            <p>Under certain circumstances, you have rights under data protection laws in relation to your personal data, including the right to request access, correction, erasure, or restriction of processing.</p>

            <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--accent)' }}>6. Contact Us</h2>
            <p>If you have any questions about this privacy policy or our privacy practices, please contact us at: privacy@medaxis.ai</p>
        </div>
    );
};
