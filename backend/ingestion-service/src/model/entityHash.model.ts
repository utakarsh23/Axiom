import mongoose, { Schema, Document } from 'mongoose';

// Stored per entity per file per repo
// Enables the diff engine to compare current parse against last known state
// callList is stored as an array (not just the hash) so we can diff exact additions/removals

export interface IEntityHash extends Document {
  workspaceId: string;
  repoId: string;
  filePath: string;
  entityName: string;
  kind: string;
  language: string;
  signatureHash: string;
  bodyHash: string;
  callListHash: string;
  callList: string[];   // actual callee names — used for precise RELATION_ADDED/REMOVED diffing
  commitHash: string;
  updatedAt: Date;
}

const EntityHashSchema = new Schema<IEntityHash>({
  workspaceId:   { type: String, required: true },
  repoId:        { type: String, required: true },
  filePath:      { type: String, required: true },
  entityName:    { type: String, required: true },
  kind:          { type: String, required: true },
  language:      { type: String, required: true },
  signatureHash: { type: String, required: true },
  bodyHash:      { type: String, required: true },
  callListHash:  { type: String, required: true },
  callList:      { type: [String], default: [] },
  commitHash:    { type: String, required: true },
  updatedAt:     { type: Date, default: Date.now },
});

// Compound index — every entity is uniquely identified by these three fields
// Also speeds up the fetch query in the diff engine: "give me all entities for this file in this repo"
EntityHashSchema.index({ repoId: 1, filePath: 1, entityName: 1 }, { unique: true });

const EntityHashModel = mongoose.model<IEntityHash>('EntityHash', EntityHashSchema);

export { EntityHashModel };