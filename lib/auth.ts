export const COOKIE_NAME = "dashboard_session";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds
const MAX_AGE_MS = COOKIE_MAX_AGE * 1000;

function encode(str: string): Uint8Array<ArrayBuffer> {
    // Wrap in a new Uint8Array to ensure the buffer is typed as ArrayBuffer
    // (not ArrayBufferLike), which is required by the Web Crypto API types.
    const encoded = new TextEncoder().encode(str);
    return new Uint8Array(encoded.buffer as ArrayBuffer);
}

function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
}

async function toBase64Url(buf: ArrayBuffer): Promise<string> {
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        "raw",
        encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
    );
}

async function hmacSign(key: CryptoKey, data: string): Promise<string> {
    const sig = await crypto.subtle.sign("HMAC", key, encode(data));
    return toBase64Url(sig);
}

/** Create a signed session cookie value. */
export async function signCookie(secret: string): Promise<string> {
    const timestamp = Date.now().toString();
    const key = await importHmacKey(secret);
    const sig = await hmacSign(key, timestamp);
    return `${timestamp}.${sig}`;
}

/** Verify a signed session cookie value. Returns true if valid and not expired. */
export async function verifyCookie(value: string, secret: string): Promise<boolean> {
    const dotIndex = value.lastIndexOf(".");
    if (dotIndex === -1) return false;

    const timestamp = value.slice(0, dotIndex);
    const storedSig = value.slice(dotIndex + 1);

    const ts = parseInt(timestamp, 10);
    if (Number.isNaN(ts)) return false;
    if (Date.now() - ts > MAX_AGE_MS) return false;

    const key = await importHmacKey(secret);
    const expectedSig = await hmacSign(key, timestamp);

    return timingSafeEqual(storedSig, expectedSig);
}

/**
 * HMAC-hash a password for timing-safe comparison.
 * Both the expected and candidate passwords are hashed before comparing,
 * ensuring the comparison always operates on equal-length strings.
 */
export async function hashPassword(secret: string, password: string): Promise<string> {
    const key = await importHmacKey(secret);
    return hmacSign(key, password);
}
