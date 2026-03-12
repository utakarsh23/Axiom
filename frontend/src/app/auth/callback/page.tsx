"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/api";
import { Loader2, Network } from "lucide-react";
import Link from "next/link";

export default function AuthCallbackPage() {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                // Auth-service sets a JWT cookie during the OAuth callback redirect.
                // We call /auth/me to confirm login and fetch the user profile.
                const data = await auth.me();
                if (data && data.user) {
                    localStorage.setItem("user", JSON.stringify(data.user));
                    router.replace("/dashboard");
                } else {
                    setError("Login failed. Please try again.");
                }
            } catch (err: any) {
                console.error("Auth callback error:", err);
                setError(err.message || "Authentication failed.");
            }
        })();
    }, [router]);

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
