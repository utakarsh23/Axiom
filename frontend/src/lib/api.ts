/**
 * Axiom API helpers.
 *
 * All paths are relative — NGINX on port 80 handles routing.
 * JWT is stored as an HTTP-only cookie set by auth-service,
 * so we just need credentials: "include" on every request.
 *
 * During local dev (Next.js on :3000), we proxy through the
 * NEXT_PUBLIC_API_URL env var which defaults to "http://localhost:80".
 */

const API = process.env.NEXT_PUBLIC_API_URL || "";

async function apiFetch<T = any>(
    path: string,
    opts: RequestInit = {}
): Promise<T> {
    const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
    const res = await fetch(`${API}${path}`, {
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(opts.headers || {}),
        },
        ...opts,
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err: any = new Error(body.error || body.message || res.statusText);
        err.status = res.status;
        throw err;
    }

    if (res.status === 204) return {} as T;
    return res.json();
}

/* ─── Auth ──────────────────────────────────────────────────────────────── */

export const auth = {
    me: () => apiFetch("/auth/me"),
    verify: () => apiFetch("/auth/verify"),
};

/* ─── Workspaces ────────────────────────────────────────────────────────── */

export const workspaces = {
    list: () => apiFetch("/api/workspaces"),
    create: (name: string) => apiFetch("/api/workspaces", { method: "POST", body: JSON.stringify({ name }) }),
    get: (id: string) => apiFetch(`/api/workspaces/${id}`),
    delete: (id: string) => apiFetch(`/api/workspaces/${id}`, { method: "DELETE" }),
    setInstallation: (id: string, installationId: number) =>
        apiFetch(`/api/workspaces/${id}/installation`, { method: "PATCH", body: JSON.stringify({ installationId }) }),
    rulebook: {
        get: (id: string) => apiFetch(`/api/workspaces/${id}/rulebook`),
        update: (id: string, rulebook: any) => apiFetch(`/api/workspaces/${id}/rulebook`, { method: "PUT", body: JSON.stringify(rulebook) }),
    },
};

/* ─── Repos ─────────────────────────────────────────────────────────────── */

export const repos = {
    list: (wId: string) => apiFetch(`/api/workspaces/${wId}/repos`),
    add: (wId: string, body: { name: string; gitUrl: string; language?: string; branch?: string }) =>
        apiFetch(`/api/workspaces/${wId}/repos`, { method: "POST", body: JSON.stringify(body) }),
    get: (wId: string, rId: string) => apiFetch(`/api/workspaces/${wId}/repos/${rId}`),
    delete: (wId: string, rId: string) => apiFetch(`/api/workspaces/${wId}/repos/${rId}`, { method: "DELETE" }),
};

/* ─── Graph ─────────────────────────────────────────────────────────────── */

export const graph = {
    workspace: (wId: string) => apiFetch(`/api/graph/${wId}`),
    repo: (wId: string, rId: string) => apiFetch(`/api/graph/${wId}/repo/${rId}`),
    impact: (wId: string, entityName: string) => apiFetch(`/api/graph/${wId}/impact/${entityName}`),
    timeline: (wId: string, commit: string) => apiFetch(`/api/graph/${wId}/timeline?commit=${commit}`),

    // Lazy-expand endpoints (per frontend.md)
    entryFiles: (wId: string, rId: string) => apiFetch(`/api/graph/${wId}/${rId}/entry-files`),
    fileFunctions: (wId: string, rId: string, filePath: string) => apiFetch(`/api/graph/${wId}/${rId}/file-functions?filePath=${encodeURIComponent(filePath)}`),
    functionCalls: (wId: string, rId: string, name: string, filePath: string) =>
        apiFetch(`/api/graph/${wId}/${rId}/function-calls?name=${encodeURIComponent(name)}&filePath=${encodeURIComponent(filePath)}`),
};

/* ─── Search (RAG) ──────────────────────────────────────────────────────── */

export const search = {
    query: (body: { workspaceId: string; query: string; topK?: number }) =>
        apiFetch("/api/search", { method: "POST", body: JSON.stringify(body) }),
};

/* ─── Docs ──────────────────────────────────────────────────────────────── */

export const docs = {
    workspace: (wId: string) => apiFetch(`/api/docs/${wId}`),
    entity: (wId: string, entityId: string) => apiFetch(`/api/docs/${wId}/entity/${entityId}`),
};
