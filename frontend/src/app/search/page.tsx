"use client";

import { Suspense } from "react";


import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Send, Bot, User, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { search as searchApi } from "@/lib/api";
import Link from "next/link";

interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    citations?: { text: string; nodeId: string; type: string }[];
}

function SearchPageInner() {
    const searchParams = useSearchParams();
    const workspaceId = searchParams.get("workspaceId") || "";

    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: "msg-0",
            role: "assistant",
            content:
                "Hello! I'm your Axiom search assistant. I can help you find entities, trace dependencies, and explore your codebase. What would you like to search for?",
        },
    ]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const getNodeColor = (type: string) => {
        switch (type) {
            case "Service": return "bg-blue-500/10 text-blue-500 border-blue-500/50";
            case "API": return "bg-purple-500/10 text-purple-500 border-purple-500/50";
            case "Database": return "bg-emerald-500/10 text-emerald-500 border-emerald-500/50";
            case "Incident": return "bg-red-500/10 text-red-500 border-red-500/50";
            default: return "bg-gray-500/10 text-gray-400 border-gray-500/50";
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: input.trim() };
        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        setIsLoading(true);

        try {
            const data = await searchApi.query({ workspaceId, query: userMsg.content, topK: 5 });
            const answer = data.answer || "";
            const results = data.results || [];

            const citations: ChatMessage["citations"] = [];

            // Build citations from source results
            if (results.length > 0) {
                results.forEach((r: any) => {
                    const name = r.entityName || r.name;
                    if (name) {
                        citations.push({
                            text: name,
                            nodeId: r.entityId || r.id || "",
                            type: r.kind || r.type || "Entity",
                        });
                    }
                });
            }

            const content = answer || "No relevant information found. Try different search terms.";

            setMessages((prev) => [
                ...prev,
                { id: `resp-${Date.now()}`, role: "assistant", content, citations },
            ]);
        } catch (err: any) {
            setMessages((prev) => [
                ...prev,
                { id: `err-${Date.now()}`, role: "assistant", content: `Search failed: ${err.message}` },
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full max-w-4xl mx-auto w-full p-4 md:p-6">
            <div className="flex-1 bg-card border border-border rounded-xl flex flex-col overflow-hidden shadow-sm">
                {/* Header */}
                <div className="h-14 border-b border-border flex items-center px-4 bg-muted/30">
                    <Bot className="w-5 h-5 text-primary mr-2" />
                    <h2 className="font-semibold tracking-tight">Search Assistant</h2>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
                    <div className="space-y-6 pb-4">
                        {messages.map((msg) => (
                            <div key={msg.id} className={cn("flex gap-4", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", msg.role === "assistant" ? "bg-primary/20 text-primary" : "bg-secondary text-secondary-foreground")}>
                                    {msg.role === "assistant" ? <Bot size={18} /> : <User size={18} />}
                                </div>
                                <div className={cn("flex flex-col gap-2 max-w-[80%]", msg.role === "user" && "items-end")}>
                                    <div className={cn("px-4 py-2 rounded-2xl whitespace-pre-wrap", msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
                                        <p className="text-sm leading-relaxed">{msg.content}</p>
                                    </div>
                                    {msg.citations && msg.citations.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-1">
                                            {msg.citations.map((cite, i) => (
                                                <Link href={`/graph?workspaceId=${workspaceId}&node=${cite.nodeId}`} key={i}>
                                                    <Badge variant="outline" className={cn("cursor-pointer shrink-0 hover:bg-background/80 transition-colors", getNodeColor(cite.type))}>
                                                        {cite.text}
                                                        <ArrowUpRight className="w-3 h-3 ml-1 opacity-70" />
                                                    </Badge>
                                                </Link>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex gap-4 flex-row">
                                <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
                                    <Bot size={18} />
                                </div>
                                <div className="flex items-center gap-1 bg-muted px-4 py-3 rounded-2xl h-[40px]">
                                    <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" />
                                    <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce [animation-delay:0.2s]" />
                                    <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce [animation-delay:0.4s]" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Input */}
                <div className="p-4 border-t border-border bg-background">
                    <form onSubmit={handleSubmit} className="flex gap-2">
                        <Input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Search entities, functions, services..."
                            className="flex-1 bg-muted border-border focus-visible:ring-primary h-12 py-2 px-4 rounded-xl"
                            disabled={isLoading}
                        />
                        <Button type="submit" size="icon" disabled={!input.trim() || isLoading} className="h-12 w-12 rounded-xl shrink-0">
                            <Send className="w-5 h-5" />
                        </Button>
                    </form>
                    <div className="mt-2 text-[10px] text-center text-muted-foreground uppercase tracking-widest font-semibold">
                        Powered by Axiom Search RAG
                    </div>
                </div>
            </div>
        </div>
    );
}


export default function SearchPage() {
  return (
    <Suspense fallback={<div className="flex h-full w-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
      <SearchPageInner />
    </Suspense>
  );
}
