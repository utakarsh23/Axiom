"use client";

import { Suspense } from "react";


import { useCallback, useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    Panel,
    MarkerType,
    Node,
    Edge,
} from "reactflow";
import "reactflow/dist/style.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
    Search, RefreshCw, Loader2, Send, Bot, User,
    FileText, Code, Boxes, Plug, Package, X, ChevronRight
} from "lucide-react";
import { graph as graphApi, search as searchApi, repos as repoApi } from "@/lib/api";

/* ───── Node type visual config ──────────────────────────────────────── */

const nodeTypeColors: Record<string, string> = {
    FILE: "#94a3b8",
    FUNCTION: "#60a5fa",
    ENDPOINT: "#34d399",
    CLASS: "#a78bfa",
    EXTERNALSERVICE: "#f59e0b",
};

const nodeTypeIcons: Record<string, any> = {
    FILE: FileText,
    FUNCTION: Code,
    ENDPOINT: Plug,
    CLASS: Boxes,
    EXTERNALSERVICE: Package,
};

/* ───── Custom ReactFlow Node ────────────────────────────────────────── */

function ArchitectureNode({ data }: { data: any }) {
    const type = (data.type || "FUNCTION").toUpperCase();
    const color = nodeTypeColors[type] || "#6b7280";
    const Icon = nodeTypeIcons[type] || Code;
    const isFile = type === "FILE";
    const isExternal = type === "EXTERNALSERVICE";

    return (
        <div
            className={`
        flex items-center gap-2 px-3 py-2 border shadow-sm backdrop-blur-sm transition-all
        hover:shadow-md hover:scale-[1.02] cursor-pointer
        ${isFile ? "rounded-lg" : isExternal ? "rounded-xl rotate-0" : "rounded-full"}
      `}
            style={{
                borderColor: color,
                backgroundColor: `${color}15`,
                minWidth: isFile ? "140px" : "auto",
            }}
        >
            <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
            <span className="text-xs font-semibold text-foreground truncate max-w-[160px]">
                {data.label}
            </span>
        </div>
    );
}

const nodeTypes = { architectureNode: ArchitectureNode };

/* ───── Edge styles ──────────────────────────────────────────────────── */

function makeEdge(id: string, source: string, target: string, type: string): Edge {
    const isExternal = type === "CALLS_EXTERNAL";
    const isApi = type === "API_CALL";
    return {
        id,
        source,
        target,
        animated: !isExternal,
        style: {
            stroke: isExternal ? "#f59e0b" : isApi ? "#34d399" : "#94a3b8",
            strokeWidth: 2,
            strokeDasharray: isExternal ? "6 3" : isApi ? "3 3" : undefined,
        },
        markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isExternal ? "#f59e0b" : isApi ? "#34d399" : "#94a3b8",
        },
    };
}

/* ───── RAG Chat Message ─────────────────────────────────────────────── */

interface ChatMsg {
    id: string;
    role: "user" | "assistant";
    content: string;
}

/* ───── Main Graph Page ──────────────────────────────────────────────── */

function GraphPageInner() {
    const searchParams = useSearchParams();
    const workspaceId = searchParams.get("workspaceId") || "";

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    // Node deduplication registry — key = filePath or entityId
    const nodeRegistry = useRef<Map<string, Node>>(new Map());
    const expandedNodes = useRef<Set<string>>(new Set());

    // Repos for this workspace
    const [repoList, setRepoList] = useState<any[]>([]);
    const [activeRepoId, setActiveRepoId] = useState<string>("");

    // RAG drawer state
    const [drawerNode, setDrawerNode] = useState<any | null>(null);
    const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
    const [chatInput, setChatInput] = useState("");
    const [chatLoading, setChatLoading] = useState(false);

    /* ── Fetch repos ────────────────────────────────────────────────── */

    useEffect(() => {
        if (!workspaceId) return;
        (async () => {
            try {
                const data = await repoApi.list(workspaceId);
                const list = data.repos || [];
                setRepoList(list);
                if (list.length > 0) setActiveRepoId(list[0]._id);
            } catch (err) {
                console.error("Failed to load repos:", err);
            }
        })();
    }, [workspaceId]);

    /* ── Load entry files when repo selected ────────────────────────── */

    const loadEntryFiles = useCallback(async () => {
        if (!workspaceId || !activeRepoId) return;
        setLoading(true);
        nodeRegistry.current.clear();
        expandedNodes.current.clear();

        try {
            const data = await graphApi.entryFiles(workspaceId, activeRepoId);
            const files: { file: string; functions: string[] }[] = data.files || data || [];
            const newNodes: Node[] = [];

            files.forEach((f: any, i: number) => {
                const filePath = f.file || f.filePath;
                const nodeId = `file:${filePath}`;
                const node: Node = {
                    id: nodeId,
                    position: { x: 100, y: 100 + i * 100 },
                    type: "architectureNode",
                    data: { label: filePath.split("/").pop() || filePath, type: "FILE", filePath },
                };
                newNodes.push(node);
                nodeRegistry.current.set(nodeId, node);
            });

            setNodes(newNodes);
            setEdges([]);
        } catch (err) {
            console.error("Failed to load entry files:", err);
            // Graceful fallback: try full workspace graph
            try {
                const data = await graphApi.workspace(workspaceId);
                const rfNodes: Node[] = (data.nodes || []).map((n: any, i: number) => ({
                    id: n.id || n.entityId || `node-${i}`,
                    position: n.position || { x: 100 + (i % 5) * 250, y: 100 + Math.floor(i / 5) * 120 },
                    type: "architectureNode",
                    data: { label: n.name || n.label || n.id, type: n.type || n.kind || "FUNCTION", ...n },
                }));
                const rfEdges: Edge[] = (data.edges || []).map((e: any) => makeEdge(
                    e.id || `${e.source}-${e.target}`, e.source, e.target, e.type || "CALLS"
                ));
                rfNodes.forEach(n => nodeRegistry.current.set(n.id, n));
                setNodes(rfNodes);
                setEdges(rfEdges);
            } catch {
                setNodes([]);
                setEdges([]);
            }
        } finally {
            setLoading(false);
        }
    }, [workspaceId, activeRepoId, setNodes, setEdges]);

    useEffect(() => {
        if (activeRepoId) loadEntryFiles();
    }, [activeRepoId, loadEntryFiles]);

    /* ── Click File → expand functions ──────────────────────────────── */

    const expandFile = useCallback(async (nodeId: string, filePath: string) => {
        if (expandedNodes.current.has(nodeId)) return;
        expandedNodes.current.add(nodeId);

        try {
            const data = await graphApi.fileFunctions(workspaceId, activeRepoId, filePath);
            const entities: any[] = data.functions || data || [];
            const parentNode = nodeRegistry.current.get(nodeId);
            if (!parentNode) return;

            const newNodes: Node[] = [];
            const newEdges: Edge[] = [];

            entities.forEach((ent: any, i: number) => {
                const entId = `fn:${filePath}:${ent.name}`;
                if (nodeRegistry.current.has(entId)) {
                    // Deduplicate — just add edge
                    newEdges.push(makeEdge(`${nodeId}->${entId}`, nodeId, entId, "DECLARES"));
                    return;
                }

                const node: Node = {
                    id: entId,
                    position: { x: parentNode.position.x + 260, y: parentNode.position.y + i * 70 },
                    type: "architectureNode",
                    data: {
                        label: ent.name,
                        type: ent.type || ent.kind || "FUNCTION",
                        filePath,
                    },
                };
                newNodes.push(node);
                nodeRegistry.current.set(entId, node);
                newEdges.push(makeEdge(`${nodeId}->${entId}`, nodeId, entId, "DECLARES"));
            });

            if (newNodes.length > 0 || newEdges.length > 0) {
                setNodes(nds => [...nds, ...newNodes]);
                setEdges(eds => [...eds, ...newEdges]);
            }
        } catch (err) {
            console.error("Failed to expand file:", err);
        }
    }, [workspaceId, activeRepoId, setNodes, setEdges]);

    /* ── Click Function → expand calls ─────────────────────────────── */

    const expandFunction = useCallback(async (nodeId: string, name: string, filePath: string) => {
        if (expandedNodes.current.has(nodeId)) return;
        expandedNodes.current.add(nodeId);

        try {
            const data = await graphApi.functionCalls(workspaceId, activeRepoId, name, filePath);
            const internal: any[] = data.internalCalls || [];
            const external: any[] = data.externalCalls || [];
            const parentNode = nodeRegistry.current.get(nodeId);
            if (!parentNode) return;

            const newNodes: Node[] = [];
            const newEdges: Edge[] = [];
            let offset = 0;

            internal.forEach((call: any) => {
                const targetFile = call.file || call.filePath || "";
                const targetId = `fn:${targetFile}:${call.name}`;

                if (nodeRegistry.current.has(targetId)) {
                    // Dedup: draw edge to existing
                    newEdges.push(makeEdge(`${nodeId}->${targetId}`, nodeId, targetId, "CALLS"));
                } else {
                    const node: Node = {
                        id: targetId,
                        position: { x: parentNode.position.x + 280, y: parentNode.position.y + offset * 70 },
                        type: "architectureNode",
                        data: { label: call.name, type: "FUNCTION", filePath: targetFile },
                    };
                    newNodes.push(node);
                    nodeRegistry.current.set(targetId, node);
                    newEdges.push(makeEdge(`${nodeId}->${targetId}`, nodeId, targetId, "CALLS"));
                    offset++;
                }
            });

            external.forEach((ext: any) => {
                const extId = `ext:${ext.name}`;
                if (!nodeRegistry.current.has(extId)) {
                    const node: Node = {
                        id: extId,
                        position: { x: parentNode.position.x + 280, y: parentNode.position.y + offset * 70 },
                        type: "architectureNode",
                        data: { label: ext.name, type: "EXTERNALSERVICE" },
                    };
                    newNodes.push(node);
                    nodeRegistry.current.set(extId, node);
                    offset++;
                }
                newEdges.push(makeEdge(`${nodeId}->${extId}`, nodeId, extId, "CALLS_EXTERNAL"));
            });

            if (newNodes.length > 0 || newEdges.length > 0) {
                setNodes(nds => [...nds, ...newNodes]);
                setEdges(eds => [...eds, ...newEdges]);
            }
        } catch (err) {
            console.error("Failed to expand function:", err);
        }
    }, [workspaceId, activeRepoId, setNodes, setEdges]);

    /* ── Node click → open RAG drawer + expand ─────────────────────── */

    const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        const d = node.data;
        setDrawerNode({ id: node.id, ...d });

        // Pre-populate chat
        const label = d.label || node.id;
        const promptQ = d.filePath
            ? `What does ${label} in ${d.filePath} do?`
            : `What does ${label} do?`;
        setChatMsgs([{
            id: "prompt",
            role: "assistant",
            content: `You selected **${label}** (${d.type || "unknown"}). Ask me anything about it!`,
        }]);
        setChatInput(promptQ);
    }, []);

    const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
        const d = node.data;
        const type = (d.type || "").toUpperCase();

        if (type === "FILE" && d.filePath) {
            expandFile(node.id, d.filePath);
        } else if (type === "FUNCTION" || type === "ENDPOINT" || type === "CLASS") {
            expandFunction(node.id, d.label, d.filePath || "");
        }
    }, [expandFile, expandFunction]);

    const onPaneClick = useCallback(() => {
        setDrawerNode(null);
    }, []);

    /* ── RAG chat submit ───────────────────────────────────────────── */

    const handleChatSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim() || chatLoading) return;

        const userMsg: ChatMsg = { id: Date.now().toString(), role: "user", content: chatInput.trim() };
        setChatMsgs(prev => [...prev, userMsg]);
        setChatInput("");
        setChatLoading(true);

        try {
            const nodeName = drawerNode?.label || "";
            const filePath = drawerNode?.filePath || "";
            const contextStr = filePath ? `(context: ${nodeName} in ${filePath})` : `(context: ${nodeName})`;

            const data = await searchApi.query({
                workspaceId,
                query: `${userMsg.content} ${contextStr}`,
                topK: 5,
            });

            const results = data.results || [];
            const answer = results.length > 0
                ? results.map((r: any) =>
                    `**${r.entityName || r.name || "Result"}** (${r.repoId || ""})\nScore: ${r.score?.toFixed(3) || "N/A"}\n${r.docBlock || r.code || r.description || ""}`
                ).join("\n\n---\n\n")
                : "No results found. Try rephrasing your question.";

            setChatMsgs(prev => [...prev, { id: `resp-${Date.now()}`, role: "assistant", content: answer }]);
        } catch (err: any) {
            setChatMsgs(prev => [...prev, { id: `err-${Date.now()}`, role: "assistant", content: `Error: ${err.message}` }]);
        } finally {
            setChatLoading(false);
        }
    };

    /* ── Filter nodes by search ────────────────────────────────────── */

    const filteredNodes = searchQuery
        ? nodes.filter(n => {
            const label = (n.data?.label || "").toLowerCase();
            const type = (n.data?.type || "").toLowerCase();
            return label.includes(searchQuery.toLowerCase()) || type.includes(searchQuery.toLowerCase());
        })
        : nodes;
    const visibleIds = new Set(filteredNodes.map(n => n.id));
    const filteredEdges = edges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target));

    /* ── Render ────────────────────────────────────────────────────── */

    return (
        <div className="flex h-full w-full">
            {/* Graph Canvas */}
            <div className="flex-1 flex flex-col p-6">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Knowledge Graph</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Click a node to ask questions • Double-click to expand
                        </p>
                    </div>
                    {repoList.length > 1 && (
                        <select
                            className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background"
                            value={activeRepoId}
                            onChange={(e) => setActiveRepoId(e.target.value)}
                        >
                            {repoList.map((r: any) => (
                                <option key={r._id} value={r._id}>{r.name}</option>
                            ))}
                        </select>
                    )}
                </div>

                <div className="flex-1 rounded-xl border border-border bg-card overflow-hidden relative">
                    {loading ? (
                        <div className="flex h-full w-full items-center justify-center flex-col gap-3">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <span className="text-sm text-muted-foreground">Loading graph…</span>
                        </div>
                    ) : (
                        <ReactFlow
                            nodes={filteredNodes}
                            edges={filteredEdges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onNodeClick={onNodeClick}
                            onNodeDoubleClick={onNodeDoubleClick}
                            onPaneClick={onPaneClick}
                            nodeTypes={nodeTypes}
                            fitView
                            className="bg-background/50"
                            proOptions={{ hideAttribution: true }}
                            minZoom={0.2}
                            maxZoom={2}
                        >
                            <Background color="var(--border)" gap={24} size={1} />
                            <Controls className="fill-foreground !bg-card border-border" />
                            <MiniMap
                                nodeColor={(n) => nodeTypeColors[n.data?.type?.toUpperCase()] || "#6b7280"}
                                maskColor="hsl(var(--background) / 0.6)"
                                className="!bg-card border border-border rounded-lg shadow-lg"
                            />

                            {/* Search Panel */}
                            <Panel position="top-left" className="bg-card p-3 rounded-lg border border-border shadow-md space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                        <input
                                            type="text"
                                            placeholder="Search nodes..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                                        />
                                    </div>
                                    <button onClick={loadEntryFiles} className="p-1.5 rounded-md hover:bg-muted transition-colors" title="Refresh">
                                        <RefreshCw className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </Panel>

                            {/* Legend */}
                            <Panel position="bottom-left" className="bg-card p-3 rounded-lg border border-border text-xs shadow-md">
                                <h3 className="font-semibold mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Legend</h3>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                                    {Object.entries(nodeTypeColors).map(([type, color]) => (
                                        <div key={type} className="flex items-center gap-1.5">
                                            <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: color }} />
                                            <span>{type.charAt(0) + type.slice(1).toLowerCase()}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-2 pt-2 border-t border-border text-[10px] text-muted-foreground">
                                    💡 Double-click to expand • Click for RAG chat
                                </div>
                            </Panel>

                            {/* Stats */}
                            <Panel position="top-right" className="bg-card px-3 py-2 rounded-lg border border-border text-xs shadow-md">
                                <div className="flex items-center gap-4">
                                    <span><strong>{filteredNodes.length}</strong> nodes</span>
                                    <span><strong>{filteredEdges.length}</strong> edges</span>
                                </div>
                            </Panel>
                        </ReactFlow>
                    )}
                </div>
            </div>

            {/* RAG Chat Drawer */}
            {drawerNode && (
                <div className="w-96 bg-sidebar border-l border-border flex flex-col h-full">
                    {/* Header */}
                    <div className="p-4 border-b border-border flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3 min-w-0">
                            <div
                                className="p-2 rounded-lg border shrink-0"
                                style={{
                                    borderColor: nodeTypeColors[drawerNode.type?.toUpperCase()] || "#6b7280",
                                    backgroundColor: `${nodeTypeColors[drawerNode.type?.toUpperCase()] || "#6b7280"}15`,
                                }}
                            >
                                {(() => {
                                    const Icon = nodeTypeIcons[drawerNode.type?.toUpperCase()] || Code;
                                    return <Icon className="h-4 w-4" style={{ color: nodeTypeColors[drawerNode.type?.toUpperCase()] || "#6b7280" }} />;
                                })()}
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-sm font-bold truncate">{drawerNode.label}</h2>
                                <Badge variant="outline" className="mt-1 text-[10px]">{drawerNode.type}</Badge>
                                {drawerNode.filePath && (
                                    <p className="text-[10px] text-muted-foreground mt-1 font-mono truncate">{drawerNode.filePath}</p>
                                )}
                            </div>
                        </div>
                        <button onClick={() => setDrawerNode(null)} className="p-1 hover:bg-muted rounded">
                            <X className="h-4 w-4 text-muted-foreground" />
                        </button>
                    </div>

                    {/* Quick Actions */}
                    <div className="px-4 py-3 border-b border-border flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => {
                                const d = drawerNode;
                                if ((d.type || "").toUpperCase() === "FILE" && d.filePath) {
                                    expandFile(d.id, d.filePath);
                                } else {
                                    expandFunction(d.id, d.label, d.filePath || "");
                                }
                            }}
                        >
                            <ChevronRight className="h-3 w-3 mr-1" /> Expand
                        </Button>
                    </div>

                    {/* Chat Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {chatMsgs.map((msg) => (
                            <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${msg.role === "assistant" ? "bg-primary/20 text-primary" : "bg-secondary text-secondary-foreground"
                                    }`}>
                                    {msg.role === "assistant" ? <Bot size={14} /> : <User size={14} />}
                                </div>
                                <div className={`px-3 py-2 rounded-xl text-xs leading-relaxed max-w-[80%] whitespace-pre-wrap ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                                    }`}>
                                    {msg.content}
                                </div>
                            </div>
                        ))}
                        {chatLoading && (
                            <div className="flex gap-3">
                                <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
                                    <Bot size={14} />
                                </div>
                                <div className="flex items-center gap-1 bg-muted px-3 py-2 rounded-xl">
                                    <span className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce" />
                                    <span className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce [animation-delay:0.2s]" />
                                    <span className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce [animation-delay:0.4s]" />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Chat Input */}
                    <div className="p-3 border-t border-border">
                        <form onSubmit={handleChatSubmit} className="flex gap-2">
                            <Input
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                placeholder="Ask about this node..."
                                className="flex-1 text-xs h-9 rounded-lg bg-muted border-border"
                                disabled={chatLoading}
                            />
                            <Button type="submit" size="icon" disabled={!chatInput.trim() || chatLoading} className="h-9 w-9 rounded-lg shrink-0">
                                <Send className="w-3.5 h-3.5" />
                            </Button>
                        </form>
                        <p className="text-[10px] text-center text-muted-foreground mt-2 uppercase tracking-widest font-semibold">
                            Powered by Search RAG
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}


export default function GraphPage() {
  return (
    <Suspense fallback={<div className="flex h-full w-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
      <GraphPageInner />
    </Suspense>
  );
}
