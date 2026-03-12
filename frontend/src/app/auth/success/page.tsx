"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Network } from "lucide-react";
import Link from "next/link";
import { auth } from "@/lib/api";

function AuthSuccessInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const token = searchParams.get("token");
                if (!token) {
                    setError("No token received. Please try logging in again.");
                    return;
                }

                // Store the JWT token
                localStorage.setItem("authToken", token);

                // Also set it as a cookie so the API helpers can send it
                document.cookie = `token=${token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;

                // Fetch user profile
                try {
                    const data = await auth.me();
                    if (data?.user) {
                        localStorage.setItem("user", JSON.stringify(data.user));
                    }
                } catch {
                    // Non-critical: user data can be fetched later
                }

                router.replace("/dashboard");
            } catch (err: any) {
                console.error("Auth success handler error:", err);
                setError(err.message || "Authentication failed.");
            }
        })();
    }, [router, searchParams]);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-white">
            <div className="w-10 h-10 rounded-xl bg-[#231F20] flex items-center justify-center">
                <Network className="w-5 h-5 text-[#C4F3C4]" />
            </div>
            {error ? (
                <div className="text-center">
                    <p className="text-red-500 font-medium">{error}</p>
                    <Link href="/" className="text-sm text-[#6B6868] hover:text-[#231F20] mt-2 inline-block underline">
                        Back to login
                    </Link>
                </div>
            ) : (
                <>
                    <Loader2 className="h-8 w-8 animate-spin text-[#231F20]" />
                    <p className="text-sm text-[#6B6868]">Completing sign in…</p>
                </>
            )}
        </div>
    );
}

export default function AuthSuccessPage() {
    return (
        <Suspense fallback={<div className="flex h-full w-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
            <AuthSuccessInner />
        </Suspense>
    );
}
