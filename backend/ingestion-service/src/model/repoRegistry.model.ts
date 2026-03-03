import mongoose, { Schema, Document } from 'mongoose';

// Maps the GitHub-side identity (installationId + owner + repo name)
// to the Axiom-side identity (workspaceId + repoId).
//
// Written at the end of Full Mode cold start.
// Read by the webhook handler to enrich COMMIT_RECEIVED with workspaceId + repoId.
// This avoids cross-service HTTP calls — all resolution stays within ingestion-service.

export interface IRepoRegistry extends Document {
    installationId: number;
    owner: string;
    repo: string;
    workspaceId: string;
    repoId: string;
    defaultBranch: string;
    updatedAt: Date;
}

const RepoRegistrySchema = new Schema<IRepoRegistry>({
    installationId: { type: Number, required: true },
    owner: { type: String, required: true },
    repo: { type: String, required: true },
    workspaceId: { type: String, required: true },
    repoId: { type: String, required: true },
    defaultBranch: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
});

// Unique compound index — one registry entry per repo per installation
RepoRegistrySchema.index({ installationId: 1, owner: 1, repo: 1 }, { unique: true });

const RepoRegistryModel = mongoose.model<IRepoRegistry>('RepoRegistry', RepoRegistrySchema);

export { RepoRegistryModel };
