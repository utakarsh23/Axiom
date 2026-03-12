"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    Network,
    Search,
    Activity,
    HeartPulse,
    GitPullRequest,
    GraduationCap,
    Clock,
    Settings,
    BookOpen,
} from "lucide-react";

const navigation = [
    { name: "Knowledge Graph", href: "/graph", icon: Network },
    { name: "Search", href: "/search", icon: Search },
    { name: "Impact Simulator", href: "/impact", icon: Activity },
    { name: "System Health", href: "/health", icon: HeartPulse },
    { name: "PR Review", href: "/pr-review", icon: GitPullRequest },
    { name: "Onboarding", href: "/onboarding", icon: GraduationCap },
    { name: "Timeline", href: "/timeline", icon: Clock },
    { name: "Documentation", href: "/docs", icon: BookOpen },
];

export function Sidebar() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : "";

    return (
        <div className="flex h-full w-64 flex-col border-r border-[#E5E3E0] bg-[#F8F7F5] text-[#231F20]">
            {/* Brand */}
            <div className="flex flex-col border-b border-[#E5E3E0]">
                <div className="flex h-14 items-center px-5 gap-3">
                    <div className="w-7 h-7 rounded-lg bg-[#231F20] flex items-center justify-center shrink-0">
                        <Network className="h-3.5 w-3.5 text-[#C4F3C4]" />
                    </div>
                    <span className="font-black text-sm tracking-tight text-[#231F20]">
                        Axiom<span className="opacity-40">.ai</span>
                    </span>
                </div>

                {/* Active Workspace */}
                <div className="px-4 pb-4">
                    <Link
                        href="/dashboard"
                        className="flex items-center justify-between rounded-lg border border-[#E5E3E0] bg-white px-3 py-2 text-sm transition-all hover:border-[#231F20]/30 hover:bg-[#F4F2F0]"
                    >
                        <div className="flex items-center gap-2 overflow-hidden">
                            <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_var(--color-emerald-500)]" />
                            <span className="font-mono text-xs font-semibold truncate leading-none pt-0.5">
                                workspace repos
                            </span>
                        </div>
                        <span className="text-[10px] text-[#6B6868] bg-[#F4F2F0] rounded px-1.5 py-0.5 border border-[#E5E3E0] shrink-0">
                            Switch
                        </span>
                    </Link>
                </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-3 py-4 space-y-0.5">
                {navigation.map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    return (
                        <Link
                            key={item.name}
                            href={`${item.href}${qs}`}
                            className={cn(
                                "group flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                                isActive
                                    ? "bg-[#C4F3C4] text-[#231F20]"
                                    : "text-[#6B6868] hover:bg-[#EDECEA] hover:text-[#231F20]"
                            )}
                        >
                            <item.icon
                                className={cn(
                                    "mr-3 h-4 w-4 shrink-0 transition-colors",
                                    isActive
                                        ? "text-[#231F20]"
                                        : "text-[#6B6868] group-hover:text-[#231F20]"
                                )}
                                aria-hidden="true"
                            />
                            {item.name}
                            {item.name === "System Health" && (
                                <span className="ml-auto inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className="border-t border-[#E5E3E0] p-4">
                <Link
                    href="/settings"
                    className="group flex items-center rounded-lg px-3 py-2.5 text-sm font-medium text-[#6B6868] transition-all hover:bg-[#EDECEA] hover:text-[#231F20]"
                >
                    <Settings className="mr-3 h-4 w-4 text-[#6B6868] group-hover:text-[#231F20]" />
                    Settings
                </Link>
            </div>
        </div>
    );
}
