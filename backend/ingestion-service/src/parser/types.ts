// Shared output type for every parser regardless of language
// ast is typed as `any` — each language produces a different node structure
// AST is transient — it is never persisted, only passed to the extractor

export interface ParsedFile {
  filePath: string;
  language: string;
  ast: any;
}