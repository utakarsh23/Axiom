"use client";

import { Suspense } from "react";


import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Play, AlertTriangle, Loader2 } from "lucide-react";
import { graph as graphApi } from "@/lib/api";

function ImpactPageInner() {
    const searchParams = useSearchParams();
    const workspaceId = searchParams.get("workspaceId") || "";

    const [target, setTarget] = useState("");
    const [isSimulating, setIsSimulating] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const simulateImpact = async () => {
        if (!target.trim() || !workspaceId) return;
        setIsSimulating(true);
        setResult(null);
        setError(null);

        try {
            const data = await graphApi.impact(workspaceId, target.trim());
            setResult(data);
        } catch (err: any) {
            setError(err.message || "Impact analysis failed");
        } finally {
            setIsSimulating(false);
        }
    };

    const callers = result?.callers || result?.dependents || [];
    const callees = result?.callees || result?.dependencies || [];
    const impacted = result?.impactedEndpoints || result?.affected || [];

    return (
        <div className="flex h-full w-full flex-col p-6 overflow-y-auto">
            <div className="flex flex-col gap-2 mb-8">
                <h1 className="text-2xl font-bold tracking-tight">What-If Impact Simulator</h1>
                <p className="text-muted-foreground mt-1">Predict the blast radius of changes before they merge.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-3 flex-1">
                {/* Controls */}
                <div className="flex flex-col gap-6">
                    <Card className="bg-card">
                        <CardHeader>
                            <CardTitle>Simulation Parameters</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label className="text-sm font-medium mb-1 block text-muted-foreground">Target Entity</label>
                                <Input value={target} onChange={(e) => setTarget(e.target.value)} className="bg-muted border-border" placeholder="e.g. auth-service or validateToken" />
                            </div>
                            <Button onClick={simulateImpact} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 mt-4 h-12" disabled={isSimulating || !target.trim()}>
                                {isSimulating ? (
                                    <span className="flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" /> Running Analysis…
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        <Play className="w-4 h-4" /> Run Blast Radius Analysis
                                    </span>
                                )}
                            </Button>
                        </CardContent>
                    </Card>

                    {error && (
                        <Card className="bg-card border-red-500/30">
                            <CardContent className="pt-6">
                                <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
                                    <AlertTriangle className="w-5 h-5 shrink-0" />
                                    <p>{error}</p>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {result && (
                        <Card className="bg-card border-primary/30 animate-in fade-in slide-in-from-bottom-4">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Impact Summary</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Callers:</span>
                                    <span className="font-semibold">{callers.length}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Callees:</span>
                                    <span className="font-semibold">{callees.length}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Impacted Endpoints:</span>
                                    <span className="font-semibold text-red-500">{impacted.length}</span>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Results */}
                <div className="md:col-span-2 flex flex-col gap-6">
                    {result ? (
                        <>
                            {callers.length > 0 && (
                                <Card className="bg-card">
                                    <CardHeader className="py-4 border-b border-border bg-muted/30">
                                        <CardTitle className="text-base">Callers (Upstream Dependencies)</CardTitle>
                                    </CardHeader>
                                    <CardContent className="pt-4">
                                        <div className="flex flex-wrap gap-2">
                                            {callers.map((c: any, i: number) => (
                                                <Badge key={i} variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/50 px-3 py-1">
                                                    {c.name || c}
                                                </Badge>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {callees.length > 0 && (
                                <Card className="bg-card">
                                    <CardHeader className="py-4 border-b border-border bg-muted/30">
                                        <CardTitle className="text-base">Callees (Downstream)</CardTitle>
                                    </CardHeader>
                                    <CardContent className="pt-4">
                                        <div className="flex flex-wrap gap-2">
                                            {callees.map((c: any, i: number) => (
                                                <Badge key={i} variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/50 px-3 py-1">
                                                    {c.name || c}
                                                </Badge>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {impacted.length > 0 && (
                                <Card className="bg-card border-red-500/30">
                                    <CardHeader className="py-4 border-b border-border bg-muted/30">
                                        <CardTitle className="text-base text-red-500">Impacted Endpoints</CardTitle>
                                    </CardHeader>
                                    <CardContent className="pt-4">
                                        <div className="flex flex-wrap gap-2">
                                            {impacted.map((ep: any, i: number) => (
                                                <Badge key={i} variant="outline" className="bg-red-500/10 text-red-500 border-red-500/50 px-3 py-1">
                                                    {ep.method ? `${ep.method} ${ep.path}` : (ep.name || ep)}
                                                </Badge>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </>
                    ) : (
                        !isSimulating && (
                            <div className="h-32 flex items-center justify-center border border-dashed border-border rounded-xl text-muted-foreground bg-muted/20">
                                Enter a target entity and run the analysis to see impact results.
                            </div>
                        )
                    )}
                </div>
            </div>
        </div>
    );
}


export default function ImpactPage() {
  return (
    <Suspense fallback={<div className="flex h-full w-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
      <ImpactPageInner />
    </Suspense>
  );
}
