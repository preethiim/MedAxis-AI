import React from 'react';

export const PrivacyPolicy = () => {
    return (
        <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', color: 'var(--text-main)', lineHeight: '1.6' }}>
            <h1 style={{ color: 'var(--primary)', marginBottom: '1.5rem' }}>Privacy Policy</h1>
            <p><strong>Effective Date:</strong> March 1, 2026</p>

            <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--accent)' }}>1. Introduction</h2>
            <p>Welcome to MedAxis AI. This Privacy Policy explains how we collect, use, process, and protect your personal and medical data when you use our platform. By accessing our services, you agree to the practices described in this policy.</p>

            <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--accent)' }}>2. Data We Collect</h2>
            <p>We collect the following types of information to provide and improve our healthcare services:</p>
            <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
                <li><strong>Personal Information:</strong> Name, email address, date of birth, gender, and contact details.</li>
                <li><strong>Health Data:</strong> Uploaded blood reports, clinical prescriptions, system-calculated metrics (e.g., BMI), and step counts.</li>
                <li><strong>Technical Data:</strong> IP addresses, browser types, and application usage access logs.</li>
            </ul>

            <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--accent)' }}>3. How We Use Data</h2>
            <p>Your data is strictly utilized for the following purposes:</p>
            <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
                <li>To provide decentralized, cross-hospital access to your health records for authorized medical professionals.</li>
                <li>To facilitate automated blood report analysis and generate clinical insights.</li>
                <li>To manage user authentication, platform security, and account administration.</li>
                <li>To track user activity for the health reward system (e.g., step counting).</li>
            </ul>

            <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--accent)' }}>4. AI Processing Disclosure (OpenAI Usage)</h2>
            <p>MedAxis AI utilizes advanced artificial intelligence models, specifically OpenAI's GPT-4o-mini, to analyze your medical documents (such as blood reports). By uploading these documents, you acknowledge and consent that the text content of your reports is securely transmitted to OpenAI via API for processing. The AI's outputs are used to supplement — not replace — professional medical diagnoses. We ensure that our API usage complies with OpenAI's strict data privacy agreements for healthcare applications, meaning your data is not used to train their public models.</p>

            <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--accent)' }}>5. Data Storage (Firebase, Firestore, Storage)</h2>
            <p>We use Google Firebase as our primary cloud infrastructure provider. All textual structured data (such as FHIR resources, user profiles, and consent logs) is stored in Firebase Firestore. All uploaded files, including PDF blood reports, are securely stored in Firebase Storage. These services employ industry-standard encryption at rest and in transit.</p>

            <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--accent)' }}>6. Security Measures</h2>
            <p>We have implemented robust, production-grade security measures to safeguard your information:</p>
            <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
                <li><strong>Role-Based Access Control:</strong> Strict Firebase Security Rules ensure that clinical data collections are inaccessible directly from the client. Data is only served through our secure backend API after verifying JWT authentication tokens and specific user roles (Patient, Doctor, Hospital, Super Admin).</li>
                <li><strong>Consent Verification:</strong> Doctors cannot access a patient's records or prescribe medications without an explicit consent record granted by the patient.</li>
                <li><strong>Audit Logging:</strong> Critical actions, such as viewing a patient's history or issuing a prescription, are heavily audited and logged.</li>
            </ul>

            <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--accent)' }}>7. User Rights</h2>
            <p>Depending on your jurisdiction, you have the right to:</p>
            <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
                <li>Access the personal and medical data we hold about you.</li>
                <li>Request corrections to inaccurate or incomplete data.</li>
                <li>Manage and revoke consent granted to specific healthcare professionals at any time.</li>
                <li>Request the deletion of your account and associated personal data.</li>
            </ul>

            <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--accent)' }}>8. Contact Information</h2>
            <p>If you have any questions, concerns, or requests regarding this Privacy Policy or the handling of your data, please contact our Data Protection Officer at: <a href="mailto:preethiim2003@gmail.com" style={{ color: 'var(--primary)', textDecoration: 'none' }}>preethiim2003@gmail.com</a></p>
        </div>
    );
};
