import mongoose, { Document, Schema } from 'mongoose';

// A repo belongs to one workspace. Ingestion Service uses repoId + workspaceId
// as the root context for all code entities it extracts.
interface IRepo extends Document {
  workspaceId: string;
  name: string;
  gitUrl: string;      // clone URL — used by Ingestion to pull the repo
  branch: string;      // branch to ingest — defaults to 'main'
  language: string;    // primary language — e.g. 'typescript', 'python'
  createdAt: Date;
  updatedAt: Date;
}

const RepoSchema = new Schema<IRepo>(
  {
    workspaceId: { type: String, required: true },
    name:        { type: String, required: true },
    gitUrl:      { type: String, required: true },
    branch:      { type: String, required: true, default: 'main' },
    language:    { type: String, required: true },
  },
  {
    collection: 'repos',
    timestamps: true,
  }
);

// One repo name per workspace — prevents duplicate repos in same workspace
RepoSchema.index({ workspaceId: 1, name: 1 }, { unique: true });

const RepoModel = mongoose.model<IRepo>('Repo', RepoSchema);

export { RepoModel, IRepo };