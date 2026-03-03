// Mirrors the IRulebook interface from Workspace Service model.
// Copied here to avoid cross-service imports — CI Service fetches rulebook over HTTP.
interface ILayerRule {
  from:   string;
  to:     string;
  reason: string;
}

interface IRulebook {
  naming?: {
    functions?: string;
    classes?:   string;
    files?:     string;
    constants?: string;
  };
  comments?: {
    requireJsDoc?:    boolean;
    minCommentRatio?: number;
  };
  structure?: {
    maxFunctionLines?:  number;
    maxFileLines?:      number;
    forbiddenPatterns?: string[];
  };
  architecture?: {
    forbiddenLayerAccess?: ILayerRule[];
  };
}

export { IRulebook, ILayerRule };