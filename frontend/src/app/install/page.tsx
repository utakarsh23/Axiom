"use client";

import { Suspense } from "react";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Network, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { workspaces as wsApi } from "@/lib/api";

type Status = "loading" | "success" | "error" | "missing";

function InstallPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [status, setStatus] = useState<Status>("loading");
    const [errorMsg, setErrorMsg] = useState("");

    useEffect(() => {
        const run = async () => {
            // GitHub redirects here with ?installation_id=<id>&setup_action=install
            const rawId = searchParams.get("installation_id");
const workspaceId = searchParams.get("state");

            if (!rawId) {
                setStatus("error");
                setErrorMsg("No installation_id received from GitHub.");
                return;
            }

            if (!workspaceId) {
                setStatus("missing");
                return;
            }

            const installationId = parseInt(rawId, 10);
            if (isNaN(installationId)) {
                setStatus("error");
                setErrorMsg("Invalid installation_id from GitHub.");
                return;
            }

            try {
                await wsApi.setInstallation(workspaceId, installationId);
                localStorage.removeItem("pendingInstallWorkspaceId");
                setStatus("success");
                setTimeout(() => router.replace(`/workspace?workspaceId=${workspaceId}`), 1500);
            } catch (err: any) {
                setStatus("error");
                setErrorMsg(err.message || "Failed to link GitHub App to workspace.");
            }
        };

        run();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-[#F8F7F5] text-[#231F20] gap-6">
            {/* Brand */}
            <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-xl bg-[#231F20] flex items-center justify-center">
                    <Network className="h-5 w-5 text-[#C4F3C4]" />
                </div>
                <span className="font-black text-xl tracking-tight">
                    Axiom<span className="opacity-40">.ai</span>
                </span>
            </div>

            {status === "loading" && (
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-[#231F20]" />
                    <p className="text-base font-medium">Connecting GitHub App…</p>
                    <p className="text-sm text-[#6B6868]">Linking installation to your workspace.</p>
                </div>
            )}

            {status === "success" && (
                <div className="flex flex-col items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-[#C4F3C4] flex items-center justify-center">
                        <CheckCircle2 className="h-6 w-6 text-[#231F20]" />
                    </div>
                    <p className="text-base font-semibold">GitHub App connected!</p>
                    <p className="text-sm text-[#6B6868]">Redirecting you back to your workspace…</p>
                </div>
            )}

            {status === "error" && (
                <div className="flex flex-col items-center gap-3 max-w-sm text-center">
                    <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                        <AlertCircle className="h-6 w-6 text-red-600" />
                    </div>
                    <p className="text-base font-semibold">Something went wrong</p>
                    <p className="text-sm text-[#6B6868]">{errorMsg}</p>
                    <button
                        onClick={() => router.push("/dashboard")}
                        className="mt-2 text-sm underline text-[#231F20] hover:opacity-70"
                    >
                        Back to Dashboard
                    </button>
                </div>
            )}

            {status === "missing" && (
                <div className="flex flex-col items-center gap-3 max-w-sm text-center">
                    <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
                        <AlertCircle className="h-6 w-6 text-amber-600" />
                    </div>
                    <p className="text-base font-semibold">Workspace not found</p>
                    <p className="text-sm text-[#6B6868]">
                        We couldn&apos;t determine which workspace to link. Go back to your workspace and try again.
                    </p>
                    <button
                        onClick={() => router.push("/dashboard")}
                        className="mt-2 text-sm underline text-[#231F20] hover:opacity-70"
                    >
                        Back to Dashboard
                    </button>
                </div>
            )}
        </div>
    );
}

export default function InstallPage() {
    return (
        <Suspense fallback={
            <div className="flex h-screen w-full items-center justify-center bg-[#F8F7F5]">
                <Loader2 className="h-8 w-8 animate-spin text-[#231F20]" />
            </div>
        }>
            <InstallPageInner />
        </Suspense>
    );
}
