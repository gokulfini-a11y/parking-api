import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import config from '../config/config.js';

// ======================================================================
// INTERNAL: AES-256 Encryption Helpers
// ======================================================================
const AES_ALGO = 'aes-256-cbc';
const IV_LENGTH = 16;

// Derive a 32-byte AES key from the secret
function deriveKey(secret) {
    return crypto.createHash('sha256').update(secret).digest();
}

function encryptPayload(payload, secret) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = deriveKey(secret);

    const cipher = crypto.createCipheriv(AES_ALGO, key, iv);

    let encrypted = cipher.update(JSON.stringify(payload), 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // return iv + encrypted blob
    return `${iv.toString('base64')}:${encrypted}`;
}

function decryptPayload(encryptedText, secret) {
    const [ivStr, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivStr, 'base64');
    const key = deriveKey(secret);

    const decipher = crypto.createDecipheriv(AES_ALGO, key, iv);

    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
}

// ======================================================================
// PUBLIC: JWT Encrypt
// ======================================================================
export function jwtEncrypt(payload, expiryInSeconds = config.JWT_TTL_SECONDS) {
    const jwtOptions = {
        algorithm: config.JWT_ALGORITHM,
        expiresIn: expiryInSeconds
    };

    // Step 1: Encrypt the payload
    const encryptedData = encryptPayload(payload, config.JWT_SECRET);

    // Step 2: Sign the encrypted payload into JWT
    const token = jwt.sign(
        { data: encryptedData },
        config.JWT_SECRET,
        jwtOptions
    );

    // Expiry timestamp matching the JWT
    const expiryAt = new Date(Date.now() + expiryInSeconds * 1000);

    return {
        token,
        expiry_at: expiryAt
    };
}

// ======================================================================
// PUBLIC: JWT Decrypt
// ======================================================================
export function jwtDecrypt(token) {
    // Step 1: Verify the JWT and extract encrypted data
    const decoded = jwt.verify(token, config.JWT_SECRET, {
        algorithms: [config.JWT_ALGORITHM || 'HS256']
    });

    if (!decoded?.data) {
        throw new Error('Invalid JWT: missing encrypted payload');
    }

    // Step 2: Decrypt the AES encrypted blob
    const decryptedData = decryptPayload(decoded.data, config.JWT_SECRET);

    // Attach expiry from standard JWT claim to the object
    if (typeof decryptedData === 'object' && decryptedData !== null) {
        decryptedData._tokenExp = decoded.exp;
    }

    return decryptedData;
}
