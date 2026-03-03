import React, { useState, useRef } from 'react';
import { Camera, Upload, X, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const ProfileImageUpload = ({ currentImage, onImageUpdate }) => {
    const { currentUser } = useAuth();
    const [previewUrl, setPreviewUrl] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const fileInputRef = useRef(null);

    const defaultIcon = "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png";

    const handleFileSelect = (e) => {
        setError('');
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setError('Please select an image file.');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            setError('File size must be less than 5MB.');
            return;
        }

        setSelectedFile(file);

        // Show local preview
        const reader = new FileReader();
        reader.onloadend = () => {
            setPreviewUrl(reader.result);
        };
        reader.readAsDataURL(file);
    };

    const handleUpload = async () => {
        if (!selectedFile) return;
        setLoading(true);
        setError('');

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);

            const token = await currentUser.getIdToken();
            const res = await fetch(`${API_BASE_URL}/upload/profile-image`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Upload failed');

            setPreviewUrl(null);
            setSelectedFile(null);
            if (onImageUpdate) {
                onImageUpdate(data.profileImage);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const cancelUpload = () => {
        setPreviewUrl(null);
        setSelectedFile(null);
        setError('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const displayUrl = previewUrl || currentImage || defaultIcon;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', width: '100%' }}>

            <div style={{ position: 'relative', width: '90px', height: '90px' }}>
                <img
                    src={displayUrl}
                    alt="Profile"
                    style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: '3px solid var(--primary)',
                        padding: '2px',
                        background: 'var(--bg-card)'
                    }}
                />

                {/* Edit overlay button */}
                {!selectedFile && (
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            position: 'absolute',
                            bottom: 0,
                            right: 0,
                            background: 'var(--primary)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '50%',
                            width: '28px',
                            height: '28px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                        }}
                        title="Change Profile Photo"
                    >
                        <Camera size={14} />
                    </button>
                )}
            </div>

            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*"
                style={{ display: 'none' }}
            />

            {error && (
                <div style={{ color: 'var(--danger)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <AlertCircle size={12} />
                    {error}
                </div>
            )}

            {selectedFile && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        onClick={handleUpload}
                        disabled={loading}
                        className="btn-primary"
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', minWidth: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        {loading ? 'Uploading...' : <><Upload size={14} /> Save</>}
                    </button>
                    <button
                        onClick={cancelUpload}
                        disabled={loading}
                        className="btn-outline"
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', minWidth: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <X size={14} /> Cancel
                    </button>
                </div>
            )}
        </div>
    );
};
