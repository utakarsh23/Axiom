import mongoose, { Document, Schema } from 'mongoose';

// A workspace is the top-level container scoped to a user.
// All repos, entities, graphs, and docs live under a workspace.
interface IWorkspace extends Document {
  name: string;
  userId: string;      // owner — set by API Gateway from auth token
  createdAt: Date;
  updatedAt: Date;
}

const WorkspaceSchema = new Schema<IWorkspace>(
  {
    name:   { type: String, required: true },
    userId: { type: String, required: true },
  },
  {
    collection: 'workspaces',
    timestamps: true,   // auto-manages createdAt + updatedAt
  }
);

// A user can have multiple workspaces, but names should be unique per user
WorkspaceSchema.index({ userId: 1, name: 1 }, { unique: true });

const WorkspaceModel = mongoose.model<IWorkspace>('Workspace', WorkspaceSchema);

export { WorkspaceModel, IWorkspace };