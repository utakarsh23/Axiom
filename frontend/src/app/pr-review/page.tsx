"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GitPullRequest, SearchX, FileJson, Check, X } from "lucide-react";

export default function PrReviewPage() {
    return (
        <div className="flex h-full w-full flex-col p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">CI/CD Architecture Enforcer</h1>
                    <p className="text-muted-foreground mt-1">Review pull requests against the established architecture graph.</p>
                </div>
                <Badge variant="outline" className="px-3 py-1 bg-yellow-500/10 text-yellow-500 border-yellow-500/50">
                    2 Pending Reviews
                </Badge>
            </div>

            <div className="grid gap-6">
                <Card className="bg-card border-border">
                    <CardHeader className="bg-muted/30 pb-4 border-b border-border">
                        <div className="flex items-start justify-between">
                            <div>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <GitPullRequest className="w-5 h-5 text-primary" />
                                    feat: Add user role column to profiles DB
                                </CardTitle>
                                <CardDescription className="mt-1">
                                    #1042 opened 2 hours ago by @alice-dev
                                </CardDescription>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" className="text-red-500 border-red-500/30 hover:bg-red-500/10">
                                    <X className="w-4 h-4 mr-2" /> Reject
                                </Button>
                                <Button className="bg-emerald-500 text-white hover:bg-emerald-600">
                                    <Check className="w-4 h-4 mr-2" /> Approve Fix
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <h3 className="text-sm font-semibold mb-3 tracking-tight">Architecture Violations Detected:</h3>
                        <div className="space-y-4">
                            <div className="flex items-start gap-4 p-4 rounded-lg bg-red-500/5 border border-red-500/20">
                                <SearchX className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                                <div className="flex-1">
                                    <h4 className="text-sm font-semibold text-red-500">Undocumented Database Mutation</h4>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        The schema change to `user_profiles` is not reflected in the Knowledge Graph.
                                        This table is heavily queried by `billing-worker` which may break.
                                    </p>
                                    <div className="mt-3 flex items-center gap-2">
                                        <Badge variant="outline" className="bg-background">src/db/migrations/005_roles.sql</Badge>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-start gap-4 p-4 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                                <FileJson className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />
                                <div className="flex-1">
                                    <h4 className="text-sm font-semibold text-yellow-500">Missing ADR</h4>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Introducing a new role based access control (RBAC) model requires an Architecture Decision Record.
                                    </p>
                                    <div className="mt-3 bg-muted p-3 rounded border border-border">
                                        <p className="text-xs font-semibold mb-2">Suggested Action: Generate Draft ADR</p>
                                        <Button variant="secondary" size="sm" className="h-8 text-[11px]">Generate from PR Diff Context</Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
