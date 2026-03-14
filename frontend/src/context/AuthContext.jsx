import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '../firebase/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';

const AuthContext = createContext();

export const useAuth = () => {
    return useContext(AuthContext);
};

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [userRole, setUserRole] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setLoading(true);
            if (user) {
                setCurrentUser(user);
                try {
                    // Force token refresh to ensure claims are up to date
                    const tokenResult = await user.getIdTokenResult(true);
                    const role = tokenResult.claims.role;
                    setUserRole(role || null);
                } catch (error) {
                    console.error("Error fetching user claims:", error);
                    setUserRole(null);
                }
            } else {
                setCurrentUser(null);
                setUserRole(null);
            }
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const [patientAuthStep, setPatientAuthStep] = useState(0);

    const logout = () => {
        setPatientAuthStep(0);
        return signOut(auth);
    };

    const value = {
        currentUser,
        userRole,
        loading,
        patientAuthStep,
        setPatientAuthStep,
        logout
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
