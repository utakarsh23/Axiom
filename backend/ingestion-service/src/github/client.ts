import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";
import { config } from "../config";


// GitHub App instance — initialized once, shared across all requests
// Uses App-level auth; per-request auth is done via getInstallationClient
const app = new App({
  appId: config.github.appId,
  privateKey: config.github.privateKey,
  webhooks : {
    secret: config.github.webhookSecret,
  },
});


// Returns an Octokit client authenticated as a specific installation
// installationId comes from Workspace Service (stored in MongoDB when repo is registered)
async function getInstallationClient(installationId: number): Promise<Octokit> {
    const octokit = await app.getInstallationOctokit(installationId);
    return octokit as unknown as Octokit;
}


// Fetches the full file tree of a repo at a specific commit (used in Full Mode / cold start)
// Returns only blobs (files), not trees (directories)
// recursive: '1' flattens the entire tree into a single list
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
            path : string;
            sha : string;
            type : string;
        }[];
    } catch (error: any) {
        throw new Error(`Failed to fetch repo tree: ${error.message}`);
    }
}

// Fetches the raw source content of a single file at a given ref (commit SHA or branch)
// GitHub returns content as base64 — we decode it to UTF-8 string
async function fetchFileContent(
    octokit: Octokit,
    owner: string,
    repo: string,
    path: string,
    ref: string): Promise<string> {
    try {
          const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path,
            ref,
        });
        if(Array.isArray(data) || data.type !== 'file') {
            throw new Error(`Path ${path} is not a file`);
        }

        return Buffer.from(data.content, 'base64').toString('utf-8');
    } catch (error: any) {
        throw new Error(`Failed to fetch file content: ${error.message}`);
    }
}


// Fetches the list of files changed in a specific commit (used in Diff Mode)
// Returns filename + status (added, modified, removed, renamed)
// Only metadata — we fetch actual content separately via fetchFileContent
async function fetchCommitDiff(
    octokit: Octokit,
    owner: string,
    repo: string,
    commitSha: string
): Promise<{ filename: string; status: string }[]> {
    try {
        const { data } = await octokit.repos.getCommit({
            owner,
            repo,
            ref: commitSha,
        })

        return (data.files ?? []).map((f) => ({
            filename: f.filename,
            status: f.status,
        }));
    } catch (error: any) {
        throw new Error(`Failed to fetch commit diff: ${error.message}`);
    }
}

export {
    getInstallationClient,
    fetchRepoTree,
    fetchFileContent,
    fetchCommitDiff,
}