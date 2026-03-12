"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Circle, ArrowRight, Server, Globe, Database } from "lucide-react";
import Link from "next/link";

const roles = [
    { id: "backend", label: "Backend Engineer", icon: Server, color: "#60a5fa" },
    { id: "frontend", label: "Frontend Developer", icon: Globe, color: "#C4F3C4" },
    { id: "sre", label: "SRE / Data Engineer", icon: Database, color: "#f59e0b" },
];

const modules = [
    { id: "graph", title: "Knowledge Graph", desc: "Explore architecture as a graph", link: "/graph", role: ["backend", "frontend", "sre"] },
    { id: "search", title: "Search & RAG", desc: "Ask questions about your codebase", link: "/search", role: ["backend", "frontend"] },
    { id: "impact", title: "Impact Analysis", desc: "Understand blast radius of changes", link: "/impact", role: ["backend", "sre"] },
    { id: "docs", title: "Documentation", desc: "Browse auto-generated docs", link: "/docs", role: ["backend", "frontend"] },
    { id: "health", title: "System Health", desc: "Monitor service health and drift", link: "/health", role: ["sre"] },
    { id: "timeline", title: "Timeline", desc: "Rewind to past architecture states", link: "/timeline", role: ["backend", "sre"] },
];

export default function OnboardingPage() {
    const [selectedRole, setSelectedRole] = useState<string>("backend");
    const [completedModules, setCompletedModules] = useState<Set<string>>(new Set());

    const filteredModules = modules.filter(m => m.role.includes(selectedRole));
    const progress = filteredModules.length > 0 ? Math.round((completedModules.size / filteredModules.length) * 100) : 0;

    return (
        <div className="flex h-full w-full flex-col p-6 lg:p-10 overflow-y-auto">
            <div className="flex flex-col gap-2 mb-8">
                <h1 className="text-3xl font-black tracking-tight">Welcome to Axiom</h1>
                <p className="text-muted-foreground text-lg">Choose your path and explore the platform.</p>
            </div>

            {/* Role selector */}
            <div className="flex gap-3 mb-8 flex-wrap">
                {roles.map((role) => (
                    <button
                        key={role.id}
                        onClick={() => setSelectedRole(role.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${selectedRole === role.id
                                ? "border-primary bg-primary/5 text-foreground"
                                : "border-border bg-card text-muted-foreground hover:border-primary/50"
                            }`}
                    >
                        <role.icon className="h-4 w-4" style={{ color: role.color }} />
                        {role.label}
                    </button>
                ))}
            </div>

            {/* Progress */}
            <div className="mb-8">
                <div className="flex justify-between text-sm mb-2">
                    <span className="font-medium">Learning Progress</span>
                    <span className="text-muted-foreground">{progress}%</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-[#C4F3C4] rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
            </div>

            {/* Modules */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredModules.map((mod) => {
                    const done = completedModules.has(mod.id);
                    return (
                        <Card key={mod.id} className={`bg-card transition-all ${done ? "opacity-60" : "hover:border-primary/50"}`}>
                            <CardHeader className="pb-3">
                                <div className="flex justify-between items-start">
                                    <CardTitle className="text-base">{mod.title}</CardTitle>
                                    <button onClick={() => setCompletedModules(prev => {
                                        const next = new Set(prev);
                                        done ? next.delete(mod.id) : next.add(mod.id);
                                        return next;
                                    })}>
                                        {done
                                            ? <CheckCircle className="h-5 w-5 text-emerald-500" />
                                            : <Circle className="h-5 w-5 text-muted-foreground" />}
                                    </button>
                                </div>
                                <CardDescription>{mod.desc}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Link href={mod.link}>
                                    <Button variant="outline" size="sm" className="w-full text-xs">
                                        Explore <ArrowRight className="h-3 w-3 ml-1" />
                                    </Button>
                                </Link>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
