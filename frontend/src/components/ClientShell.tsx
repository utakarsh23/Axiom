"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";

export function ClientShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    // Hide sidebar on the login page (/) and the dashboard (/dashboard)
    const hideSidebar = pathname === "/" || pathname === "/dashboard";

    return (
        <>
            {!hideSidebar && (
                <Suspense fallback={<div className="w-64 bg-[#F8F7F5] border-r border-[#E5E3E0]" />}>
                    <Sidebar />
                </Suspense>
            )}
            <main className="flex-1 overflow-auto bg-background relative z-0">
                {children}
            </main>
        </>
    );
}
