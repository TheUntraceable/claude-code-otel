"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useMemo } from "react";

type ConvexClientProviderProps = {
    children: React.ReactNode;
};

export function ConvexClientProvider({ children }: ConvexClientProviderProps) {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? "http://127.0.0.1:3210";

    const client = useMemo(() => new ConvexReactClient(convexUrl), [convexUrl]);

    return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
