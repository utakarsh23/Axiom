"use client";

import { Suspense } from "react";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Network, GitBranch, Settings, ArrowRight, Loader2, FolderGit2,
    Plus, X, AlertCircle, Search, Check, ChevronLeft, Trash2, CheckCircle2,
} from "lucide-react";
import { workspaces as wsApi, repos as repoApi } from "@/lib/api";

// GitHub repo shape returned by the GitHub REST API
interface GHRepo {
    id: number;
    name: string;
    full_name: string;
    clone_url: string;
    default_branch: string;
    language: string | null;
    private: boolean;
}

const LANGUAGE_OPTIONS = [
    { value: "typescript", label: "TypeScript" },
    { value: "javascript", label: "JavaScript" },
    { value: "python", label: "Python" },
    { value: "go", label: "Go" },
    { value: "java", label: "Java" },
    { value: "rust", label: "Rust" },
    { value: "cpp", label: "C++" },
    { value: "csharp", label: "C#" },
    { value: "ruby", label: "Ruby" },
    { value: "php", label: "PHP" },
];

// Maps GitHub's language display name → our lowercase value
const GH_LANG_MAP: Record<string, string> = {
    TypeScript: "typescript",
    JavaScript: "javascript",
    Python: "python",
    Go: "go",
    Java: "java",
    Rust: "rust",
    "C++": "cpp",
    "C#": "csharp",
    Ruby: "ruby",
    PHP: "php",
};

function WorkspacePageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const workspaceId = searchParams.get("workspaceId") || "";

    const [workspace, setWorkspace] = useState<any>(null);
    const [repos, setRepos] = useState<any[]>([]);
    const [isFetching, setIsFetching] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);

    // Add-repo modal
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [gitUrl, setGitUrl] = useState("");
    const [repoName, setRepoName] = useState("");
    const [language, setLanguage] = useState("");
    const [branch, setBranch] = useState("main");
    const [isAdding, setIsAdding] = useState(false);
    const [addError, setAddError] = useState("");

    // GitHub repo picker (populated if rawGithubToken is in localStorage)
    const [ghRepos, setGhRepos] = useState<GHRepo[]>([]);
    const [ghSearch, setGhSearch] = useState("");
    const [selectedGhRepo, setSelectedGhRepo] = useState<GHRepo | null>(null);
    const [isLoadingGh, setIsLoadingGh] = useState(false);

    // ── Data fetching ───────────────────────────────────────────────────────

    const fetchData = useCallback(async () => {
        if (!workspaceId) return;
        setIsFetching(true);
        try {
            const [wsData, reposData] = await Promise.all([
                wsApi.get(workspaceId),
                repoApi.list(workspaceId),
            ]);
            setWorkspace(wsData.workspace || wsData);
            setRepos(reposData.repos || reposData || []);
        } catch (err) {
            console.error("Failed to load workspace:", err);
        } finally {
            setIsFetching(false);
        }
    }, [workspaceId]);

    useEffect(() => {
        const stored = localStorage.getItem("user");
        if (stored) {
            try { setCurrentUser(JSON.parse(stored)); } catch { }
        }
        fetchData();
    }, [fetchData]);

    // Re-fetch workspace when the user returns to this tab (e.g. after GitHub App install)
    useEffect(() => {
        const onFocus = () => fetchData();
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, [fetchData]);

    // Load GitHub repos when modal opens (if raw token is present)
    useEffect(() => {
        if (!isAddOpen) return;
        const ghToken = typeof window !== "undefined"
            ? localStorage.getItem("rawGithubToken")
            : null;
        if (!ghToken || ghRepos.length > 0) return;

        setIsLoadingGh(true);
        fetch("https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator", {
            headers: { Authorization: `token ${ghToken}` },
        })
            .then(r => r.json())
            .then(data => { if (Array.isArray(data)) setGhRepos(data); })
            .catch(() => { })
            .finally(() => setIsLoadingGh(false));
    }, [isAddOpen, ghRepos.length]);

    // ── Handlers ────────────────────────────────────────────────────────────

    const handleSelectGhRepo = (repo: GHRepo) => {
        setSelectedGhRepo(repo);
        setGitUrl(repo.clone_url);
        setRepoName(repo.name);
        setBranch(repo.default_branch || "main");
        setLanguage(repo.language ? (GH_LANG_MAP[repo.language] || repo.language.toLowerCase()) : "");
    };

    const handleAdd = async () => {
        if (!gitUrl.trim() || !language) return;
        setIsAdding(true);
        setAddError("");
        try {
            await repoApi.add(workspaceId, {
                name: repoName.trim() || gitUrl.split("/").pop()?.replace(".git", "") || "repo",
                gitUrl: gitUrl.trim(),
                language,
                branch: branch.trim() || "main",
            });
            resetForm();
            setIsAddOpen(false);
            fetchData();
        } catch (err: any) {
            setAddError(err.message || "Failed to add repository");
        } finally {
            setIsAdding(false);
        }
    };

    const handleDeleteRepo = async (repoId: string) => {
        if (!confirm("Remove this repository from the workspace?")) return;
        try {
            await repoApi.delete(workspaceId, repoId);
            fetchData();
        } catch (err: any) {
            alert(err.message || "Failed to remove repository");
        }
    };

    const resetForm = () => {
        setGitUrl("");
        setRepoName("");
        setLanguage("");
        setBranch("main");
        setAddError("");
        setGhSearch("");
        setSelectedGhRepo(null);
    };

    // GitHub App connection
    const [appNameInput, setAppNameInput] = useState("");
    const appName = process.env.NEXT_PUBLIC_GITHUB_APP_NAME || appNameInput.trim();

    const handleInstallGitHubApp = () => {
        if (!appName) return;
        window.location.href =
  `https://github.com/apps/${appName}/installations/new?state=${workspaceId}`;
    };

    const userName = currentUser?.username || currentUser?.login || currentUser?.name || "User";
    const hasGhRepos = ghRepos.length > 0;
    const filteredGhRepos = ghSearch
        ? ghRepos.filter(r => r.name.toLowerCase().includes(ghSearch.toLowerCase()) ||
            r.full_name.toLowerCase().includes(ghSearch.toLowerCase()))
        : ghRepos;
    const hasInstallation = !!workspace?.installationId;

    if (!workspaceId) {
        return (
            <div className="flex h-full items-center justify-center">
                <p className="text-[#6B6868]">No workspace selected. <button onClick={() => router.push("/dashboard")} className="underline">Go to dashboard</button></p>
            </div>
        );
    }

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

                {/* Back + Title */}
                <section className="flex flex-col gap-3">
                    <button
                        onClick={() => router.push("/dashboard")}
                        className="inline-flex items-center gap-1.5 text-sm text-[#6B6868] hover:text-[#231F20] transition-colors w-fit"
                    >
                        <ChevronLeft className="h-3.5 w-3.5" /> All Workspaces
                    </button>
                    <span className="inline-flex w-fit bg-[#C4F3C4] text-[#231F20] text-xs font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full">
                        Workspace
                    </span>
                    <h1 className="text-4xl font-black tracking-tight">
                        {isFetching ? "Loading…" : (workspace?.name || "Workspace")}
                    </h1>
                    <p className="text-[#9A9090] text-base">
                        Add repositories to analyse, then open the Knowledge Graph.
                    </p>
                </section>

                {/* GitHub App warning banner */}
                {!isFetching && !hasInstallation && (
                    <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                            <div className="text-sm">
                                <p className="font-semibold text-amber-900">GitHub App not connected</p>
                                <p className="text-amber-700 mt-0.5">
                                    Install the Axiom GitHub App on your account or organisation so it can clone and index your repositories.
                                    After installing, you&apos;ll be redirected back here automatically.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 pl-7">
                            {!process.env.NEXT_PUBLIC_GITHUB_APP_NAME && (
                                <Input
                                    placeholder="Your GitHub App slug (e.g. axiom-ai)"
                                    value={appNameInput}
                                    onChange={e => setAppNameInput(e.target.value)}
                                    className="h-9 text-sm bg-white max-w-xs"
                                />
                            )}
                            <button
                                onClick={handleInstallGitHubApp}
                                disabled={!appName}
                                className="inline-flex items-center gap-2 rounded-lg bg-[#231F20] px-4 py-2 text-sm font-medium text-white hover:bg-[#231F20]/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                            >
                                Install GitHub App
                            </button>
                            <button
                                onClick={fetchData}
                                className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-50 transition-colors shrink-0"
                            >
                                Already installed? Check again
                            </button>
                        </div>
                    </div>
                )}

                {/* Action bar */}
                <section className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                    <p className="text-sm text-[#6B6868]">
                        {isFetching ? "" : `${repos.length} ${repos.length === 1 ? "repository" : "repositories"} in this workspace`}
                    </p>
                    <div className="flex gap-3">
                        <Button
                            onClick={() => { resetForm(); setIsAddOpen(true); }}
                            className="h-11 px-5 bg-white text-[#231F20] border border-[#E5E3E0] hover:bg-[#F4F2F0] hover:border-[#231F20] transition-all font-medium"
                        >
                            <Plus className="mr-2 h-4 w-4" />
                            Add Repository
                        </Button>
                        <Button
                            onClick={() => router.push(`/view?workspaceId=${workspaceId}`)}
                            disabled={repos.length === 0}
                            className={`h-11 px-5 font-medium transition-all ${repos.length > 0
                                    ? "bg-[#231F20] text-white hover:bg-[#231F20]/90"
                                    : "bg-muted text-muted-foreground border border-border opacity-50 cursor-not-allowed"
                                }`}
                        >
                            Open Knowledge Graph <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    </div>
                </section>

                {/* Repo Grid */}
                <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {isFetching ? (
                        <div className="col-span-full flex justify-center py-10">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : repos.length === 0 ? (
                        /* Empty-state card — same proportions as a real card */
                        <button
                            onClick={() => { resetForm(); setIsAddOpen(true); }}
                            className="col-span-full md:col-span-1 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[#E5E3E0] bg-white p-10 text-[#6B6868] hover:border-[#231F20]/30 hover:text-[#231F20] transition-all cursor-pointer"
                        >
                            <Plus className="h-8 w-8" />
                            <span className="text-sm font-medium">Add your first repository</span>
                        </button>
                    ) : (
                        <>
                            {repos.map((repo) => (
                                <Card
                                    key={repo._id}
                                    className="border-2 border-border bg-card hover:border-primary/50 hover:bg-muted/30 transition-all duration-200"
                                >
                                    <CardHeader className="pb-3">
                                        <div className="flex justify-between items-start">
                                            <CardTitle className="text-base flex items-center gap-2 overflow-hidden">
                                                <FolderGit2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                <span className="font-mono truncate" title={repo.name}>{repo.name}</span>
                                            </CardTitle>
                                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 shrink-0">
                                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                                Added
                                            </Badge>
                                        </div>
                                        <CardDescription className="flex items-center gap-4 mt-2">
                                            <span className="flex items-center text-xs">
                                                <GitBranch className="w-3 h-3 mr-1" /> {repo.branch || "main"}
                                            </span>
                                            <span className="text-xs font-mono text-muted-foreground">{repo.language}</span>
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="pb-4">
                                        <p className="text-xs text-muted-foreground font-mono truncate" title={repo.gitUrl}>
                                            {repo.gitUrl}
                                        </p>
                                    </CardContent>
                                    <CardFooter className="pt-0 flex justify-between items-center text-xs text-muted-foreground border-t border-border/50 bg-muted/10 px-6 py-3">
                                        <span>Added {repo.createdAt ? new Date(repo.createdAt).toLocaleDateString() : "—"}</span>
                                        <button
                                            onClick={() => handleDeleteRepo(repo._id)}
                                            className="text-muted-foreground hover:text-destructive transition-colors"
                                            title="Remove repository"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </CardFooter>
                                </Card>
                            ))}

                            {/* Add-another card */}
                            <button
                                onClick={() => { resetForm(); setIsAddOpen(true); }}
                                className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#E5E3E0] bg-white p-6 text-[#6B6868] hover:border-[#231F20]/30 hover:text-[#231F20] transition-all cursor-pointer min-h-[180px]"
                            >
                                <Plus className="h-6 w-6" />
                                <span className="text-sm font-medium">Add Repository</span>
                            </button>
                        </>
                    )}
                </section>
            </div>

            {/* ── Add Repository Modal ───────────────────────────────────────────── */}
            {isAddOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                    <div className="bg-card w-full max-w-lg rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

                        {/* Header */}
                        <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-muted/30">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <FolderGit2 className="w-5 h-5" /> Add Repository
                                </h2>
                                <p className="text-sm text-muted-foreground mt-1">
                                    {hasGhRepos ? "Select from GitHub or enter manually." : "Enter the repository details below."}
                                </p>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => { setIsAddOpen(false); resetForm(); }} className="rounded-full">
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="p-6 flex-1 overflow-y-auto space-y-5">

                            {/* ── GitHub repo picker (only when rawGithubToken is present) ── */}
                            {(hasGhRepos || isLoadingGh) && (
                                <div>
                                    <p className="text-xs font-semibold text-[#6B6868] uppercase tracking-wider mb-2">
                                        Your GitHub Repositories
                                    </p>
                                    {isLoadingGh ? (
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                                            <Loader2 className="h-4 w-4 animate-spin" /> Loading repositories…
                                        </div>
                                    ) : (
                                        <>
                                            <div className="relative mb-2">
                                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                                <Input
                                                    placeholder="Search repositories…"
                                                    value={ghSearch}
                                                    onChange={e => setGhSearch(e.target.value)}
                                                    className="pl-8 h-9 text-sm bg-background"
                                                />
                                            </div>
                                            <div className="max-h-44 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                                                {filteredGhRepos.slice(0, 50).map(r => (
                                                    <button
                                                        key={r.id}
                                                        onClick={() => handleSelectGhRepo(r)}
                                                        className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between hover:bg-muted transition-colors ${selectedGhRepo?.id === r.id ? "bg-[#C4F3C4]/40" : ""}`}
                                                    >
                                                        <div className="flex items-center gap-2 overflow-hidden">
                                                            <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${r.private ? "bg-amber-400" : "bg-emerald-400"}`} />
                                                            <span className="font-medium truncate">{r.name}</span>
                                                            <span className="text-xs text-muted-foreground truncate hidden sm:block">{r.full_name.split("/")[0]}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0 ml-2">
                                                            {r.language && <span className="text-xs text-muted-foreground">{r.language}</span>}
                                                            {selectedGhRepo?.id === r.id && <Check className="h-3.5 w-3.5 text-[#231F20]" />}
                                                        </div>
                                                    </button>
                                                ))}
                                                {filteredGhRepos.length === 0 && (
                                                    <p className="px-3 py-4 text-sm text-center text-muted-foreground">No repositories found.</p>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-2">Or fill in details manually below:</p>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* ── Manual form ─────────────────────────────────────────────── */}
                            <div className="space-y-3">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Repository URL <span className="text-red-500">*</span></label>
                                    <Input
                                        placeholder="https://github.com/owner/repo.git"
                                        value={gitUrl}
                                        onChange={e => {
                                            setGitUrl(e.target.value);
                                            setSelectedGhRepo(null);
                                        }}
                                        className="bg-background"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Repository Name</label>
                                    <Input
                                        placeholder="Auto-detected from URL"
                                        value={repoName}
                                        onChange={e => setRepoName(e.target.value)}
                                        className="bg-background"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium">Language <span className="text-red-500">*</span></label>
                                        <select
                                            value={language}
                                            onChange={e => setLanguage(e.target.value)}
                                            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                                        >
                                            <option value="">Select…</option>
                                            {LANGUAGE_OPTIONS.map(l => (
                                                <option key={l.value} value={l.value}>{l.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium">Branch</label>
                                        <Input
                                            placeholder="main"
                                            value={branch}
                                            onChange={e => setBranch(e.target.value)}
                                            className="bg-background"
                                        />
                                    </div>
                                </div>

                                {addError && (
                                    <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2.5">
                                        <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                                        <p className="text-sm text-destructive">{addError}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-border bg-muted/30 flex justify-end gap-3">
                            <Button variant="outline" onClick={() => { setIsAddOpen(false); resetForm(); }}>Cancel</Button>
                            <Button
                                onClick={handleAdd}
                                disabled={isAdding || !gitUrl.trim() || !language}
                                className="bg-primary text-primary-foreground hover:bg-primary/90"
                            >
                                {isAdding && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Add Repository
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function WorkspacePage() {
    return (
        <Suspense fallback={
            <div className="flex h-full w-full items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
        }>
            <WorkspacePageInner />
        </Suspense>
    );
}
