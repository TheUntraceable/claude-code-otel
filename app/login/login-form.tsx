"use client";

import { useActionState } from "react";
import { Zap } from "lucide-react";

import { loginAction } from "./actions";

export function LoginForm({ from }: { from: string | null }) {
    const [state, action, pending] = useActionState(loginAction, null);

    return (
        <div className="w-full max-w-sm">
            {/* Logo */}
            <div className="mb-8 flex flex-col items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white">
                    <Zap className="h-5 w-5 text-[#09090b]" />
                </div>
                <div className="text-center">
                    <h1 className="text-[15px] font-semibold text-white/90">Claude Code</h1>
                    <p className="mt-0.5 text-[13px] text-white/40">Telemetry Dashboard</p>
                </div>
            </div>

            {/* Card */}
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-6">
                <form action={action} className="flex flex-col gap-4">
                    {from && (
                        <input type="hidden" name="from" value={from} />
                    )}

                    <div className="flex flex-col gap-1.5">
                        <label
                            htmlFor="password"
                            className="text-[12px] font-medium tracking-wide text-white/50"
                        >
                            PASSWORD
                        </label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            autoFocus
                            autoComplete="current-password"
                            required
                            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 text-[13px] text-white/90 placeholder:text-white/20 outline-none transition focus:border-white/20 focus:bg-white/[0.07]"
                            placeholder="Enter password"
                        />
                    </div>

                    {state?.error && (
                        <p className="text-[12px] text-red-400/80">{state.error}</p>
                    )}

                    <button
                        type="submit"
                        disabled={pending}
                        className="mt-1 h-9 w-full rounded-lg bg-white text-[13px] font-medium text-[#09090b] transition hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {pending ? "Verifying…" : "Unlock"}
                    </button>
                </form>
            </div>
        </div>
    );
}
