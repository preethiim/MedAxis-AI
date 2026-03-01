import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

admin.initializeApp();

export const registerUser = onCall(async (request) => {
    const data = request.data;
    const { email, password, role, healthId, employeeId, height, weight, bmi, name } = data;

    if (!email || !password || !role) {
        throw new HttpsError("invalid-argument", "Missing essential fields: email, password, or role.");
    }

    if (!['patient', 'doctor', 'hospital'].includes(role)) {
        throw new HttpsError("invalid-argument", "Invalid role provided.");
    }

    try {
        // 1. Create the user in Firebase Auth
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: name,
        });

        // 2. Set Custom User Claims
        await admin.auth().setCustomUserClaims(userRecord.uid, { role });

        // 3. Store additional user info in Firestore
        const userData: any = {
            uid: userRecord.uid,
            role,
            email,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (name) userData.name = name;

        // Auto-generate IDs if not provided
        if (role === 'patient') {
            const generatedHealthId = 'PAT-' + Math.random().toString(36).substr(2, 6).toUpperCase();
            userData.healthId = healthId || generatedHealthId;
            userData.height = height || "";
            userData.weight = weight || "";
            userData.bmi = bmi || "";
        } else if (role === 'hospital') {
            userData.employeeId = employeeId || "";
        } else if (role === 'doctor') {
            const generatedDoctorId = 'DOC-' + Math.random().toString(36).substr(2, 6).toUpperCase();
            userData.doctorId = generatedDoctorId;
        }

        await admin.firestore().collection('users').doc(userRecord.uid).set(userData);

        return {
            success: true,
            uid: userRecord.uid,
            message: "User successfully registered with role " + role
        };
    } catch (error: any) {
        // Log the exact internal error so Firebase logs catch it
        console.error("Registration Error details:", error);

        // If it's a known auth error (like email-already-exists), pass that message safely.
        if (error.code && error.code.startsWith('auth/')) {
            throw new HttpsError("already-exists", error.message);
        }

        throw new HttpsError("internal", error.message || "An unknown error occurred during registration.");
    }
});
