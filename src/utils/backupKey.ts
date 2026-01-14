/**
 * Backup key formatting utilities
 * Formats secret keys in the same way as the mobile client for compatibility
 */

// Base32 alphabet (RFC 4648) - excludes confusing characters
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Decodes a base32 string to bytes
 * Handles common character substitutions (0→O, 1→I, 8→B, 9→G)
 * @param base32 - The base32 encoded string (can include dashes)
 * @returns The decoded bytes as Uint8Array
 */
export function base32ToBytes(base32: string): Uint8Array {
    // Normalize: uppercase and handle common substitutions
    const normalized = base32.toUpperCase()
        .replace(/0/g, 'O')
        .replace(/1/g, 'I')
        .replace(/8/g, 'B')
        .replace(/9/g, 'G');

    // Remove non-base32 characters (dashes, spaces, etc.)
    const cleaned = normalized.replace(/[^A-Z2-7]/g, '');

    const bytes: number[] = [];
    let buffer = 0;
    let bufferLength = 0;

    for (const char of cleaned) {
        const value = BASE32_ALPHABET.indexOf(char);
        if (value === -1) continue; // Skip invalid characters

        buffer = (buffer << 5) | value;
        bufferLength += 5;

        if (bufferLength >= 8) {
            bufferLength -= 8;
            bytes.push((buffer >> bufferLength) & 0xff);
        }
    }

    return new Uint8Array(bytes);
}

/**
 * Parses a backup key string and returns the master secret
 * @param backupKey - The backup key in format "XXXXX-XXXXX-..."
 * @returns The 32-byte master secret
 * @throws Error if the backup key is invalid
 */
export function parseBackupKey(backupKey: string): Uint8Array {
    const bytes = base32ToBytes(backupKey);
    if (bytes.length !== 32) {
        throw new Error(`Invalid backup key: expected 32 bytes, got ${bytes.length}`);
    }
    return bytes;
}

function bytesToBase32(bytes: Uint8Array): string {
    let result = '';
    let buffer = 0;
    let bufferLength = 0;

    for (const byte of bytes) {
        buffer = (buffer << 8) | byte;
        bufferLength += 8;

        while (bufferLength >= 5) {
            bufferLength -= 5;
            result += BASE32_ALPHABET[(buffer >> bufferLength) & 0x1f];
        }
    }

    // Handle remaining bits
    if (bufferLength > 0) {
        result += BASE32_ALPHABET[(buffer << (5 - bufferLength)) & 0x1f];
    }

    return result;
}

/**
 * Formats a secret key for display in a user-friendly format matching mobile client
 * @param secretBytes - 32-byte secret key as Uint8Array
 * @returns Formatted string like "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
 */
export function formatSecretKeyForBackup(secretBytes: Uint8Array): string {
    // Convert to base32
    const base32 = bytesToBase32(secretBytes);

    // Split into groups of 5 characters
    const groups: string[] = [];
    for (let i = 0; i < base32.length; i += 5) {
        groups.push(base32.slice(i, i + 5));
    }

    // Join with dashes
    // 32 bytes = 256 bits = 52 base32 chars (51.2 rounded up)
    // That's approximately 11 groups of 5 chars
    return groups.join('-');
}