import mongoose, { Document, Schema } from 'mongoose';

// Naming convention rules — enforced by CI Service per workspace
interface INamingRules {
  functions?: string;   // e.g. "camelCase"
  classes?: string;     // e.g. "PascalCase"
  files?: string;       // e.g. "kebab-case"
  constants?: string;   // e.g. "UPPER_SNAKE_CASE"
}

// Comment quality rules
interface ICommentRules {
  requireJsDoc?: boolean;     // all exported functions must have a JSDoc block
  minCommentRatio?: number;   // minimum ratio of comment lines to code lines (0–1)
}

// Code structure limits
interface IStructureRules {
  maxFunctionLines?: number;        // max lines per function body
  maxFileLines?: number;            // max lines per file
  forbiddenPatterns?: string[];     // e.g. ["console.log", "debugger", "TODO:"]
}

// Architecture layer access rules — what layer is forbidden from calling what
interface ILayerRule {
  from: string;     // e.g. "controller"
  to: string;       // e.g. "repository"
  reason: string;   // human-readable explanation surfaced in PR
}

interface IArchitectureRules {
  forbiddenLayerAccess?: ILayerRule[];
}

// The full workspace rulebook — all fields optional
// If not set, only default policy rules + Semgrep apply
interface IRulebook {
  naming?: INamingRules;
  comments?: ICommentRules;
  structure?: IStructureRules;
  architecture?: IArchitectureRules;
}

// A workspace is the top-level container scoped to a user.
// All repos, entities, graphs, and docs live under a workspace.
interface IWorkspace extends Document {
  name: string;
  userId: string;      // owner — set by NGINX from auth token via x-user-id header
  rulebook?: IRulebook;
  createdAt: Date;
  updatedAt: Date;
}

const LayerRuleSchema = new Schema<ILayerRule>(
  {
    from:   { type: String, required: true },
    to:     { type: String, required: true },
    reason: { type: String, required: true },
  },
  { _id: false }
);

const RulebookSchema = new Schema<IRulebook>(
  {
    naming: {
      functions: String,
      classes:   String,
      files:     String,
      constants: String,
    },
    comments: {
      requireJsDoc:     Boolean,
      minCommentRatio:  Number,
    },
    structure: {
      maxFunctionLines:  Number,
      maxFileLines:      Number,
      forbiddenPatterns: [String],
    },
    architecture: {
      forbiddenLayerAccess: [LayerRuleSchema],
    },
  },
  { _id: false }
);

const WorkspaceSchema = new Schema<IWorkspace>(
  {
    name:     { type: String, required: true },
    userId:   { type: String, required: true },
    rulebook: { type: RulebookSchema, default: undefined },
  },
  {
    collection: 'workspaces',
    timestamps: true,   // auto-manages createdAt + updatedAt
  }
);

// A user can have multiple workspaces, but names should be unique per user
WorkspaceSchema.index({ userId: 1, name: 1 }, { unique: true });

const WorkspaceModel = mongoose.model<IWorkspace>('Workspace', WorkspaceSchema);

export { WorkspaceModel, IWorkspace, IRulebook };