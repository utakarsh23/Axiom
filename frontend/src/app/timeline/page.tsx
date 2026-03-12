"use client";

import { Suspense } from "react";


import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Play, Pause, FastForward, GitCommit, Loader2 } from "lucide-react";
import { graph as graphApi } from "@/lib/api";

function TimelinePageInner() {
    const searchParams = useSearchParams();
    const workspaceId = searchParams.get("workspaceId") || "";

    const [commitHash, setCommitHash] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [graphState, setGraphState] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const loadTimeline = async () => {
        if (!commitHash.trim() || !workspaceId) return;
        setIsLoading(true);
        setError(null);

        try {
            const data = await graphApi.timeline(workspaceId, commitHash.trim());
            setGraphState(data);
        } catch (err: any) {
            setError(err.message || "Failed to load timeline");
            setGraphState(null);
        } finally {
            setIsLoading(false);
        }
    };

    const nodes = graphState?.nodes || [];
    const edges = graphState?.edges || [];

    return (
        <div className="flex h-full w-full flex-col p-6 overflow-y-auto">
            <div className="flex flex-col gap-2 mb-8">
                <h1 className="text-2xl font-bold tracking-tight">Temporal Architecture Timeline</h1>
                <p className="text-muted-foreground mt-1">Rewind the knowledge graph to investigate past states.</p>
            </div>

            <div className="flex-1 flex flex-col gap-6">
                {/* Graph Preview */}
                <Card className="flex-1 bg-card border-border overflow-hidden flex flex-col">
                    <CardHeader className="border-b border-border bg-muted/30 py-3 flex flex-row items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                            <GitCommit className="w-4 h-4 text-primary" />
                            {graphState ? `State: ${commitHash.slice(0, 8)}` : "No commit loaded"}
                        </CardTitle>
                        {nodes.length > 0 && (
                            <span className="text-xs text-muted-foreground">{nodes.length} nodes, {edges.length} edges</span>
                        )}
                    </CardHeader>
                    <CardContent className="flex-1 p-0 relative min-h-[300px]">
                        <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(hsl(var(--muted-foreground)/0.2) 1px, transparent 0)", backgroundSize: "24px 24px" }} />

                        {isLoading ? (
                            <div className="absolute inset-0 flex items-center justify-center z-10">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        ) : graphState ? (
                            <div className="absolute inset-0 flex items-center justify-center p-8 z-10">
                                <div className="flex flex-wrap gap-3 justify-center">
                                    {nodes.slice(0, 20).map((n: any, i: number) => (
                                        <div key={i} className="px-3 py-2 bg-primary/10 border border-primary/30 rounded-lg text-xs font-semibold">
                                            {n.name || n.label || n.id}
                                        </div>
                                    ))}
                                    {nodes.length > 20 && (
                                        <div className="px-3 py-2 bg-muted text-muted-foreground rounded-lg text-xs">
                                            +{nodes.length - 20} more
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center z-10 text-muted-foreground text-sm">
                                Enter a commit hash to load the graph state.
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Controls */}
                <Card className="bg-card border-border">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-4">
                            <Input
                                placeholder="Enter commit hash (e.g. a1b2c3d)"
                                value={commitHash}
                                onChange={(e) => setCommitHash(e.target.value)}
                                className="flex-1 bg-muted border-border"
                            />
                            <Button onClick={loadTimeline} disabled={isLoading || !commitHash.trim()} className="h-10 px-6">
                                {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                                Load State
                            </Button>
                        </div>
                        {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}


export default function TimelinePage() {
  return (
    <Suspense fallback={<div className="flex h-full w-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
      <TimelinePageInner />
    </Suspense>
  );
}
