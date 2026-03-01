const admin = require('firebase-admin');

// Since we are running locally, let's just initialize using Application Default if GOOGLE_APPLICATION_CREDENTIALS is set,
// or we can just try directly to see what the admin.auth() error naturally looks like
admin.initializeApp({
    projectId: "medaxis-ai" // Your project ID
});

async function testAuth() {
    try {
        const userRecord = await admin.auth().createUser({
            email: "test.internal.error@example.com",
            password: "password123",
            displayName: "Test Error User",
        });
        console.log("Success! UID:", userRecord.uid);
    } catch (error) {
        console.error("EXACT ERROR: ", error);
    }
}

testAuth();
