"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Network, Search, GitBranch, Settings, CheckCircle2, AlertTriangle, ArrowRight, Loader2, Building2 } from "lucide-react";
import { workspaces as wsApi, repos as repoApi } from "@/lib/api";

export default function DashboardPage() {
    const router = useRouter();
    const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null);
    const [workspaceList, setWorkspaceList] = useState<any[]>([]);
    const [isFetching, setIsFetching] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);

    // Create modal
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [wsName, setWsName] = useState("");
    const [repoUrl, setRepoUrl] = useState("");
    const [repoName, setRepoName] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    const fetchWorkspaces = async () => {
        setIsFetching(true);
        try {
            const data = await wsApi.list();
            const list = (data.workspaces || []).map((w: any) => ({
                id: w._id,
                name: w.name,
                repoCount: w.repositories?.length || 0,
                status: "Healthy",
                risk: "Low",
                lastScan: w.updatedAt ? new Date(w.updatedAt).toLocaleString() : "N/A",
            }));
            setWorkspaceList(list);
        } catch (err) {
            console.error("Failed to fetch workspaces:", err);
            setWorkspaceList([]);
        } finally {
            setIsFetching(false);
        }
    };

    useEffect(() => {
        const stored = localStorage.getItem("user");
        if (stored) {
            try { setCurrentUser(JSON.parse(stored)); } catch { }
        }
        fetchWorkspaces();
    }, []);

    const handleEnter = () => {
        if (selectedWorkspace) {
            router.push(`/graph?workspaceId=${selectedWorkspace}`);
        }
    };

    const handleCreate = async () => {
        if (!wsName.trim()) return;
        setIsCreating(true);
        try {
            const data = await wsApi.create(wsName.trim());
            const newWsId = data.workspace?._id;
            if (newWsId && repoUrl.trim()) {
                await repoApi.add(newWsId, {
                    name: repoName.trim() || repoUrl.split("/").pop() || "repo",
                    gitUrl: repoUrl.trim(),
                });
            }
            setIsCreateOpen(false);
            setWsName("");
            setRepoUrl("");
            setRepoName("");
            await fetchWorkspaces();
        } catch (err: any) {
            console.error("Create workspace error:", err);
            alert(err.message || "Failed to create workspace");
        } finally {
            setIsCreating(false);
        }
    };

    const userName = currentUser?.username || currentUser?.login || currentUser?.name || "User";

    return (
        <div className="flex h-screen w-full flex-col bg-[#F8F7F5] text-[#231F20] overflow-y-auto">
            {/* Navbar */}
            <header className="flex h-16 items-center justify-between border-b border-[#E5E3E0] bg-white px-8 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#231F20] flex items-center justify-center">
                        <Network className="h-4 w-4 text-[#C4F3C4]" />
                    </div>
                    <span className="font-black text-lg tracking-tight text-[#231F20]">
                        Axiom<span className="text-[#231F20]/50">.ai</span>
                    </span>
                </div>
                <div className="flex items-center gap-5">
                    <Button variant="ghost" size="icon" className="text-[#6B6868] hover:text-[#231F20] hover:bg-[#F4F2F0]">
                        <Settings className="h-5 w-5" />
                    </Button>
                    <div className="flex items-center gap-3 pl-5 border-l border-[#E5E3E0]">
                        <span className="text-sm font-medium text-[#6B6868]">{userName}</span>
                        <div className="h-8 w-8 rounded-full bg-[#231F20] flex items-center justify-center text-white font-black text-xs">
                            {userName.slice(0, 2).toUpperCase()}
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex-1 w-full max-w-6xl mx-auto px-8 py-10 flex flex-col gap-10">
                {/* Welcome */}
                <section className="flex flex-col gap-3">
                    <span className="inline-flex w-fit bg-[#C4F3C4] text-[#231F20] text-xs font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full">
                        Dashboard
                    </span>
                    <h1 className="text-4xl font-black tracking-tight">
                        Welcome back{currentUser?.name ? `, ${currentUser.name.split(" ")[0]}` : ""}.
                    </h1>
                    <p className="text-[#9A9090] text-base">Select a workspace to begin architectural analysis.</p>
                </section>

                {/* Action bar */}
                <section className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full sm:max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B6868]" />
                        <input
                            type="text"
                            placeholder="Search workspaces..."
                            className="flex h-11 w-full rounded-lg border border-[#E5E3E0] bg-white px-3 py-2 pl-9 text-sm text-[#231F20] placeholder:text-[#6B6868] focus:outline-none focus:ring-2 focus:ring-[#231F20]/20 focus:border-[#231F20] transition-colors"
                        />
                    </div>
                    <Button
                        onClick={() => setIsCreateOpen(true)}
                        className="w-full sm:w-auto h-11 px-5 bg-white text-[#231F20] border border-[#E5E3E0] hover:bg-[#F4F2F0] hover:border-[#231F20] transition-all font-medium"
                    >
                        <Building2 className="mr-2 h-4 w-4" />
                        Create Workspace
                    </Button>
                </section>

                {/* Workspace Grid */}
                <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {isFetching ? (
                        <div className="col-span-full flex justify-center py-10">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : workspaceList.length === 0 ? (
                        <div className="col-span-full text-center py-10 text-muted-foreground">
                            No workspaces found. Create one to get started!
                        </div>
                    ) : (
                        workspaceList.map((ws) => (
                            <Card
                                key={ws.id}
                                onClick={() => setSelectedWorkspace(ws.id)}
                                className={`cursor-pointer transition-all duration-200 border-2 ${selectedWorkspace === ws.id
                                        ? "border-primary bg-primary/5 scale-[1.02]"
                                        : "border-border bg-card hover:border-primary/50 hover:bg-muted/30"
                                    }`}
                            >
                                <CardHeader className="pb-3">
                                    <div className="flex justify-between items-start">
                                        <CardTitle className="text-lg flex items-center gap-2 overflow-hidden">
                                            <span className="font-mono truncate" title={ws.name}>{ws.name}</span>
                                        </CardTitle>
                                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                                            <CheckCircle2 className="w-3 h-3 mr-1" />
                                            {ws.status}
                                        </Badge>
                                    </div>
                                    <CardDescription className="flex items-center gap-4 mt-2">
                                        <span className="flex items-center text-xs">
                                            <GitBranch className="w-3 h-3 mr-1" /> {ws.repoCount} Repositories
                                        </span>
                                        <span className="text-xs text-muted-foreground">Workspace</span>
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="pb-4">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">Architectural Risk:</span>
                                        <span className="font-semibold text-emerald-500">{ws.risk}</span>
                                    </div>
                                </CardContent>
                                <CardFooter className="pt-0 flex justify-between items-center text-xs text-muted-foreground border-t border-border/50 bg-muted/10 px-6 py-3">
                                    Last synchronized: {ws.lastScan}
                                </CardFooter>
                            </Card>
                        ))
                    )}
                </section>

                {/* Enter Workspace CTA */}
                <div className="mt-auto pt-4 flex justify-end">
                    <Button
                        onClick={handleEnter}
                        disabled={!selectedWorkspace}
                        className={`px-8 h-12 text-base transition-all ${selectedWorkspace
                                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                : "bg-muted text-muted-foreground border border-border opacity-50 cursor-not-allowed"
                            }`}
                    >
                        Enter Workspace <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                </div>
            </div>

            {/* Create Workspace Modal */}
            {isCreateOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                    <div className="bg-card w-full max-w-lg rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-muted/30">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <Building2 className="w-5 h-5" /> Create Workspace
                                </h2>
                                <p className="text-sm text-muted-foreground mt-1">Add a workspace with an initial repository.</p>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setIsCreateOpen(false)} className="rounded-full">
                                <span className="sr-only">Close</span>✕
                            </Button>
                        </div>

                        <div className="p-6 flex-1 overflow-y-auto space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Workspace Name <span className="text-red-500">*</span></label>
                                <Input
                                    placeholder="e.g. My Backend Services"
                                    value={wsName}
                                    onChange={(e) => setWsName(e.target.value)}
                                    className="bg-background"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Repository URL</label>
                                <Input
                                    placeholder="https://github.com/owner/repo"
                                    value={repoUrl}
                                    onChange={(e) => setRepoUrl(e.target.value)}
                                    className="bg-background"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Repository Name (optional)</label>
                                <Input
                                    placeholder="Auto-detected from URL"
                                    value={repoName}
                                    onChange={(e) => setRepoName(e.target.value)}
                                    className="bg-background"
                                />
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-border bg-muted/30 flex justify-end gap-3">
                            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                            <Button
                                onClick={handleCreate}
                                disabled={isCreating || !wsName.trim()}
                                className="bg-primary text-primary-foreground hover:bg-primary/90"
                            >
                                {isCreating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Create Workspace
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
