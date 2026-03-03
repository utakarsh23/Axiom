import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { config } from '../config';

// Returns an Octokit client authenticated as a specific installation.
// Uses @octokit/auth-app directly (CJS-compatible) instead of @octokit/app (ESM-only).
// installationId comes from the REPO_ADDED event payload, stored in workspace-service.
async function getInstallationClient(installationId: number): Promise<Octokit> {
    const auth = createAppAuth({
        appId: config.github.appId,
        privateKey: config.github.privateKey,
        installationId,
    });

    const { token } = await auth({ type: 'installation' });

    return new Octokit({ auth: token });
}

// Fetches the full file tree of a repo at a specific commit (used in Full Mode / cold start).
// Returns only blobs (files), not trees (directories).
// recursive: '1' flattens the entire tree into a single list.
async function fetchRepoTree(
    octokit: Octokit,
    owner: string,
    repo: string,
    commitSha: string
): Promise<{ path: string; sha: string; type: string }[]> {
    try {
        const { data } = await octokit.git.getTree({
            owner,
            repo,
            tree_sha: commitSha,
            recursive: '1',
        });
        return data.tree.filter((item) => item.type === 'blob') as {
            path: string;
            sha: string;
            type: string;
        }[];
    } catch (error: any) {
        throw new Error(`Failed to fetch repo tree: ${error.message}`);
    }
}

// Fetches the raw source content of a single file at a given ref (commit SHA or branch).
// GitHub returns content as base64 — we decode it to a UTF-8 string.
async function fetchFileContent(
    octokit: Octokit,
    owner: string,
    repo: string,
    path: string,
    ref: string
): Promise<string> {
    try {
        const { data } = await octokit.repos.getContent({ owner, repo, path, ref });
        if (Array.isArray(data) || data.type !== 'file') {
            throw new Error(`Path ${path} is not a file`);
        }
        return Buffer.from(data.content, 'base64').toString('utf-8');
    } catch (error: any) {
        throw new Error(`Failed to fetch file content: ${error.message}`);
    }
}

// Fetches the list of files changed in a specific commit (used in Diff Mode).
// Returns filename + status (added, modified, removed, renamed).
async function fetchCommitDiff(
    octokit: Octokit,
    owner: string,
    repo: string,
    commitSha: string
): Promise<{ filename: string; status: string }[]> {
    try {
        const { data } = await octokit.repos.getCommit({ owner, repo, ref: commitSha });
        return (data.files ?? []).map((f) => ({
            filename: f.filename ?? '',
            status: f.status ?? '',
        }));
    } catch (error: any) {
        throw new Error(`Failed to fetch commit diff: ${error.message}`);
    }
}

// Fetches the latest commit SHA on the default branch (used for cold start when no SHA is known).
async function fetchLatestCommitSha(
    octokit: Octokit,
    owner: string,
    repo: string,
    branch: string
): Promise<string> {
    try {
        const { data } = await octokit.repos.getBranch({ owner, repo, branch });
        return data.commit.sha;
    } catch (error: any) {
        throw new Error(`Failed to fetch latest commit SHA: ${error.message}`);
    }
}

export {
    getInstallationClient,
    fetchRepoTree,
    fetchFileContent,
    fetchCommitDiff,
    fetchLatestCommitSha,
};