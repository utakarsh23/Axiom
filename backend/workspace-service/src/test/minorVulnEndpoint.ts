import crypto from 'crypto';

// This function generates a gravatar URL for a given email address.
// It contains a minor security misconfiguration: using MD5 for hashing.
// MD5 is deprecated and vulnerable to collision attacks, but swapping it out
// for a stronger algorithm like SHA-256 is incredibly low-risk, making this
// the perfect candidate for an automated PR fix!
export function getGravatarUrl(email: string): string {
    const trimmedEmail = email.trim().toLowerCase();

    // VULNERABILITY: Using deprecated MD5 algorithm
    const hash = crypto.createHash('md5').update(trimmedEmail).digest('hex');

    return `https://www.gravatar.com/avatar/${hash}?d=identicon`;
}
