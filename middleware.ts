import { NextRequest, NextResponse } from "next/server";

import { COOKIE_NAME, verifyCookie } from "@/lib/auth";

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|api/logout).*)"],
};

export default async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (pathname.startsWith("/login")) {
        return NextResponse.next();
    }

    const secret = process.env.BETTER_AUTH_SECRET;
    const cookieValue = request.cookies.get(COOKIE_NAME)?.value;

    try {
        if (!secret || !cookieValue || !(await verifyCookie(cookieValue, secret))) {
            const loginUrl = new URL("/login", request.url);
            loginUrl.searchParams.set("from", pathname);
            return NextResponse.redirect(loginUrl);
        }
    } catch {
        return NextResponse.redirect(new URL("/login", request.url));
    }

    return NextResponse.next();
}
