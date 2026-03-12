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
    list: () => apiFetch("/workspaces"),
    create: (name: string) => apiFetch("/workspaces", { method: "POST", body: JSON.stringify({ name }) }),
    get: (id: string) => apiFetch(`/workspaces/${id}`),
    delete: (id: string) => apiFetch(`/workspaces/${id}`, { method: "DELETE" }),
    setInstallation: (id: string, installationId: number) =>
        apiFetch(`/workspaces/${id}/installation`, { method: "PATCH", body: JSON.stringify({ installationId }) }),
    rulebook: {
        get: (id: string) => apiFetch(`/workspaces/${id}/rulebook`),
        update: (id: string, rulebook: any) => apiFetch(`/workspaces/${id}/rulebook`, { method: "PUT", body: JSON.stringify(rulebook) }),
    },
};

/* ─── Repos ─────────────────────────────────────────────────────────────── */

export const repos = {
    list: (wId: string) => apiFetch(`/workspaces/${wId}/repos`),
    add: (wId: string, body: { name: string; gitUrl: string; language?: string; branch?: string }) =>
        apiFetch(`/workspaces/${wId}/repos`, { method: "POST", body: JSON.stringify(body) }),
    get: (wId: string, rId: string) => apiFetch(`/workspaces/${wId}/repos/${rId}`),
    delete: (wId: string, rId: string) => apiFetch(`/workspaces/${wId}/repos/${rId}`, { method: "DELETE" }),
};

/* ─── Graph ─────────────────────────────────────────────────────────────── */

export const graph = {
    workspace: (wId: string) => apiFetch(`/graph/${wId}`),
    repo: (wId: string, rId: string) => apiFetch(`/graph/${wId}/repo/${rId}`),
    impact: (wId: string, entityName: string) => apiFetch(`/graph/${wId}/impact/${entityName}`),
    timeline: (wId: string, commit: string) => apiFetch(`/graph/${wId}/timeline?commit=${commit}`),

    // Lazy-expand endpoints (per frontend.md)
    entryFiles: (wId: string, rId: string) => apiFetch(`/graph/${wId}/${rId}/entry-files`),
    fileFunctions: (wId: string, rId: string, filePath: string) => apiFetch(`/graph/${wId}/${rId}/file-functions?filePath=${encodeURIComponent(filePath)}`),
    functionCalls: (wId: string, rId: string, name: string, filePath: string) =>
        apiFetch(`/graph/${wId}/${rId}/function-calls?name=${encodeURIComponent(name)}&filePath=${encodeURIComponent(filePath)}`),
};

/* ─── Search (RAG) ──────────────────────────────────────────────────────── */

export const search = {
    query: (body: { workspaceId: string; query: string; topK?: number }) =>
        apiFetch("/search", { method: "POST", body: JSON.stringify(body) }),
};

/* ─── Docs ──────────────────────────────────────────────────────────────── */

export const docs = {
    workspace: (wId: string) => apiFetch(`/docs/${wId}`),
    entity: (wId: string, entityId: string) => apiFetch(`/docs/${wId}/entity/${entityId}`),
};
