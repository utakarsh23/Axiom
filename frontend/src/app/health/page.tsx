"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, ShieldAlert, FileSearch, Layers } from "lucide-react";

export default function HealthPage() {
    return (
        <div className="flex h-full w-full flex-col p-6 overflow-y-auto">
            <div className="flex flex-col gap-2 mb-8">
                <h1 className="text-2xl font-bold tracking-tight">System Health & Compliance</h1>
                <p className="text-muted-foreground mt-1">Real-time monitoring of architecture drift, documentation coverage, and system load.</p>
            </div>

            {/* KPI Cards */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
                <Card className="bg-card">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Overall Health Score</CardTitle>
                        <Activity className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">92/100</div>
                        <p className="text-xs text-emerald-500 mt-1">↑ 4% from last week</p>
                    </CardContent>
                </Card>

                <Card className="bg-card border-red-500/50 shadow-[0_0_15px_rgba(255,50,50,0.1)]">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Active Incidents</CardTitle>
                        <ShieldAlert className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-red-500">1</div>
                        <p className="text-xs text-red-500 mt-1">INC-142: Graph API Latency</p>
                    </CardContent>
                </Card>

                <Card className="bg-card">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Doc Coverage</CardTitle>
                        <FileSearch className="h-4 w-4 text-[#C4F3C4]" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">78%</div>
                        <p className="text-xs text-muted-foreground mt-1">22 orphaned services found</p>
                    </CardContent>
                </Card>

                <Card className="bg-card">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Architecture Drift</CardTitle>
                        <Layers className="h-4 w-4 text-yellow-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">Medium</div>
                        <p className="text-xs text-yellow-500 mt-1">3 undocumented DB writes</p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts/Risk area */}
            <div className="grid gap-6 md:grid-cols-2">
                <Card className="bg-card border border-border">
                    <CardHeader>
                        <CardTitle>Global Edge Latency (24h)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-48 flex items-center justify-center text-muted-foreground text-sm border border-dashed border-border rounded-lg bg-muted/20">
                            Chart placeholder — connect to metrics service
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-[#FFB7B2]/20 border border-border">
                    <CardHeader>
                        <CardTitle>High Risk Components</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {[
                                { name: "Auth Service", type: "Service", owner: "team-security", risk: "high", reason: "INC-142 active" },
                                { name: "Payments Database", type: "Database", owner: "team-finance", risk: "medium", reason: "Undocumented writes" },
                                { name: "Graph API", type: "API", owner: "team-graph", risk: "medium", reason: "Latency spikes" },
                            ].map((comp, i) => (
                                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex flex-col">
                                        <span className="font-semibold text-sm">{comp.name}</span>
                                        <span className="text-xs font-mono text-muted-foreground">{comp.owner}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-muted-foreground">{comp.reason}</span>
                                        <span className={`w-2 h-2 rounded-full ${comp.risk === "high" ? "bg-red-500 animate-pulse shadow-[0_0_8px_rgba(255,50,50,0.8)]" : "bg-yellow-500"}`} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
