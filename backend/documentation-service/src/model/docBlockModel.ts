import mongoose, { Document, Schema } from 'mongoose';

// Shape of a single documentation block stored in MongoDB.
// One doc block per active entity version — overwritten on update, deleted on entity removal.
interface IDocBlock extends Document {
  entityId: string;       // unique identifier from Ingestion
  workspaceId: string;    // workspace scoping — all queries filter by this
  repoId: string;
  filePath: string;
  entityName: string;
  kind: string;           // function | class | endpoint
  docBlock: string;       // LLM-generated documentation text
  commitHash: string;     // commit at which this doc was generated
  generatedAt: Date;
}

const DocBlockSchema = new Schema<IDocBlock>(
  {
    entityId:    { type: String, required: true },
    workspaceId: { type: String, required: true },
    repoId:      { type: String, required: true },
    filePath:    { type: String, required: true },
    entityName:  { type: String, required: true },
    kind:        { type: String, required: true },
    docBlock:    { type: String, required: true },
    commitHash:  { type: String, required: true },
    generatedAt: { type: Date, default: Date.now },
  },
  { collection: 'docBlocks' }
);

// Compound unique index — one doc block per entity per workspace.
// Upsert operations use this to overwrite stale docs on entity update.
DocBlockSchema.index({ entityId: 1, workspaceId: 1 }, { unique: true });

const DocBlockModel = mongoose.model<IDocBlock>('DocBlock', DocBlockSchema);

export { DocBlockModel, IDocBlock };