"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { COOKIE_MAX_AGE, COOKIE_NAME, hashPassword, signCookie } from "@/lib/auth";

function validateFrom(from: string | null): string | null {
    if (!from) return null;
    // Must be a relative path — starts with / but not //
    if (from.startsWith("/") && !from.startsWith("//")) return from;
    return null;
}

export async function loginAction(
    _prevState: { error: string } | null,
    formData: FormData,
): Promise<{ error: string }> {
    const password = formData.get("password");
    const from = formData.get("from");

    if (typeof password !== "string") {
        return { error: "Invalid request." };
    }

    const expectedPassword = process.env.DASHBOARD_PASSWORD;
    const secret = process.env.BETTER_AUTH_SECRET;

    if (!expectedPassword || !secret) {
        return { error: "Server misconfiguration: DASHBOARD_PASSWORD or BETTER_AUTH_SECRET is not set." };
    }

    // Timing-safe password comparison: HMAC both sides, then XOR-compare
    const [expectedHash, candidateHash] = await Promise.all([
        hashPassword(secret, expectedPassword),
        hashPassword(secret, password),
    ]);

    // Manual timing-safe compare on equal-length base64url strings
    if (expectedHash.length !== candidateHash.length) {
        return { error: "Incorrect password." };
    }
    let diff = 0;
    for (let i = 0; i < expectedHash.length; i++) {
        diff |= expectedHash.charCodeAt(i) ^ candidateHash.charCodeAt(i);
    }
    if (diff !== 0) {
        return { error: "Incorrect password." };
    }

    // Password correct — issue session cookie
    const cookieValue = await signCookie(secret);
    const jar = await cookies();
    jar.set(COOKIE_NAME, cookieValue, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: COOKIE_MAX_AGE,
        path: "/",
    });

    const destination = validateFrom(typeof from === "string" ? from : null) ?? "/";
    redirect(destination);
}
