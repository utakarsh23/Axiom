import { Octokit } from '@octokit/rest';
import { config } from '../config';
import logger from '../logger';

// Creates an authenticated Octokit instance using GitHub App credentials.
// Called once per PR creation — installation token is short-lived.
const createOctokit = (): Octokit => {
  return new Octokit({
    auth: config.github.privateKey,
  });
};

interface CreatePRInput {
  owner:       string;
  repo:        string;
  baseBranch:  string;   // branch the PR targets — usually 'main' or 'master'
  branchName:  string;   // new branch name for the patch
  commitMessage: string;
  patchContent:  string; // unified diff to apply
  prTitle:       string;
  prBody:        string;
}

interface CreatePRResult {
  prUrl:    string;
  prNumber: number;
  branch:   string;
}

// Creates a new branch, commits the patch, and opens a pull request.
// Never touches the base branch directly.
const createPullRequest = async (input: CreatePRInput): Promise<CreatePRResult> => {
  const octokit = createOctokit();

  try {
    // Get the SHA of the base branch HEAD to branch from
    const { data: refData } = await octokit.git.getRef({
      owner: input.owner,
      repo:  input.repo,
      ref:   `heads/${input.baseBranch}`,
    });

    const baseSha = refData.object.sha;

    // Create the new branch from base HEAD
    await octokit.git.createRef({
      owner: input.owner,
      repo:  input.repo,
      ref:   `refs/heads/${input.branchName}`,
      sha:   baseSha,
    });

    logger.info({ branch: input.branchName }, 'Created new branch for patch');

    // Commit the patch file to the new branch
    // Note: in production this would apply the unified diff properly
    // For now we commit the raw patch as a file for review
    const { data: commitData } = await octokit.repos.createOrUpdateFileContents({
      owner:   input.owner,
      repo:    input.repo,
      path:    `.axiom/patches/${input.branchName}.patch`,
      message: input.commitMessage,
      content: Buffer.from(input.patchContent).toString('base64'),
      branch:  input.branchName,
    });

    logger.info({ sha: commitData.commit.sha }, 'Patch committed to branch');

    // Open the pull request
    const { data: prData } = await octokit.pulls.create({
      owner: input.owner,
      repo:  input.repo,
      title: input.prTitle,
      body:  input.prBody,
      head:  input.branchName,
      base:  input.baseBranch,
    });

    logger.info({ prNumber: prData.number, prUrl: prData.html_url }, 'Pull request created');

    return {
      prUrl:    prData.html_url,
      prNumber: prData.number,
      branch:   input.branchName,
    };
  } catch (err) {
    logger.error({ err, repo: `${input.owner}/${input.repo}` }, 'Failed to create pull request');
    throw err;
  }
};

export { createPullRequest, CreatePRInput, CreatePRResult };