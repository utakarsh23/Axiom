"use client";

import { Suspense } from "react";


import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Loader2, Copy, Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { docs as docsApi } from "@/lib/api";

function DocumentationPageInner() {
    const searchParams = useSearchParams();
    const workspaceId = searchParams.get("workspaceId") || "";

    const [docList, setDocList] = useState<any[]>([]);
    const [selectedDoc, setSelectedDoc] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isCopied, setIsCopied] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        if (!workspaceId) return;
        (async () => {
            setIsLoading(true);
            try {
                const data = await docsApi.workspace(workspaceId);
                setDocList(data.docs || data.entities || data || []);
            } catch (err) {
                console.error("Failed to load docs:", err);
                setDocList([]);
            } finally {
                setIsLoading(false);
            }
        })();
    }, [workspaceId]);

    const handleSelectEntity = async (doc: any) => {
        setSelectedDoc(doc);
        // Optionally fetch full doc for entity
        if (doc.entityId || doc._id) {
            try {
                const full = await docsApi.entity(workspaceId, doc.entityId || doc._id);
                setSelectedDoc(full.doc || full);
            } catch { /* use partial */ }
        }
    };

    const handleCopy = () => {
        const text = selectedDoc?.docBlock || selectedDoc?.content || selectedDoc?.markdown || "";
        if (text) {
            navigator.clipboard.writeText(text);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        }
    };

    const filtered = searchQuery
        ? docList.filter((d: any) => {
            const name = (d.entityName || d.name || "").toLowerCase();
            return name.includes(searchQuery.toLowerCase());
        })
        : docList;

    return (
        <div className="flex h-full w-full flex-col p-6 lg:p-10 bg-background overflow-y-auto">
            <div className="flex flex-col gap-2 mb-8">
                <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
                    <BookOpen className="w-8 h-8 text-primary" />
                    Documentation
                </h1>
                <p className="text-muted-foreground mt-1 text-lg max-w-2xl">
                    Browse auto-generated documentation for entities in this workspace.
                </p>
            </div>

            <div className="grid gap-8 grid-cols-1 lg:grid-cols-12 flex-1">
                {/* Entity List */}
                <div className="lg:col-span-4 flex flex-col gap-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Filter entities..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-card focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[calc(100vh-300px)]">
                        {isLoading ? (
                            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                        ) : filtered.length === 0 ? (
                            <div className="text-sm text-muted-foreground py-6 text-center">No documentation found.</div>
                        ) : (
                            filtered.map((doc: any, i: number) => (
                                <button
                                    key={doc.entityId || doc._id || i}
                                    onClick={() => handleSelectEntity(doc)}
                                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all text-sm ${selectedDoc && (selectedDoc.entityId || selectedDoc._id) === (doc.entityId || doc._id)
                                            ? "border-primary bg-primary/5"
                                            : "border-border hover:border-primary/50 hover:bg-muted/30"
                                        }`}
                                >
                                    <span className="font-semibold truncate block">{doc.entityName || doc.name || `Entity ${i + 1}`}</span>
                                    {doc.type && <Badge variant="outline" className="mt-1 text-[10px]">{doc.type}</Badge>}
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Doc Viewer */}
                <div className="lg:col-span-8 flex flex-col h-full min-h-[500px]">
                    <Card className="flex-1 flex flex-col bg-card shadow-sm border-border overflow-hidden">
                        <CardHeader className="border-b border-border bg-muted/20 flex flex-row items-center justify-between py-4">
                            <div>
                                <CardTitle className="text-lg">{selectedDoc?.entityName || selectedDoc?.name || "Select an entity"}</CardTitle>
                                <CardDescription>Auto-generated documentation</CardDescription>
                            </div>
                            {selectedDoc && (
                                <Button variant="outline" size="sm" onClick={handleCopy} className="h-8">
                                    {isCopied ? <Check className="w-4 h-4 mr-2 text-emerald-500" /> : <Copy className="w-4 h-4 mr-2" />}
                                    {isCopied ? "Copied!" : "Copy"}
                                </Button>
                            )}
                        </CardHeader>
                        <CardContent className="flex-1 overflow-y-auto p-6">
                            {selectedDoc ? (
                                <div className="prose prose-sm max-w-none prose-pre:bg-muted prose-pre:border prose-pre:border-border font-sans leading-relaxed whitespace-pre-wrap">
                                    {selectedDoc.docBlock || selectedDoc.content || selectedDoc.markdown || "No documentation content available."}
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50 pt-20">
                                    <BookOpen className="w-16 h-16 mb-4 opacity-50" />
                                    <p>Select an entity to view its documentation.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}


export default function DocumentationPage() {
  return (
    <Suspense fallback={<div className="flex h-full w-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
      <DocumentationPageInner />
    </Suspense>
  );
}
