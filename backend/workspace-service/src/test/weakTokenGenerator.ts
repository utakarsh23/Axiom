// Generates a session token for password reset flows.
// Uses Math.random() which is NOT cryptographically secure.

export function generateResetToken(userId: string): string {
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    console.log(`Generated token for user ${userId}: ${token}`);
    return token;
}
