// All entity types the extractor can produce from any language
// These map directly to Neo4j node types defined in the architecture


type EntityKind = 'function' | 'class' | 'endpoint';

interface ExtractedEntity {
  kind: EntityKind;
  name: string;
  filePath: string;
  language: string;
  startLine: number;
  endLine: number;
  rawSignature: string; // used for signatureHash
  rawBody: string;      // used for bodyHash
}

interface ExtractedImport {
  fromPath: string;     // file doing the importing
  importSource: string; // raw import string e.g. '../utils/helper' or 'express'
  isExternal: boolean;  // true if not a relative/absolute path
}


interface ExtractedCall {
  callerName: string; // function containing the call
  calleeName: string; // function being called
  filePath: string;
}

interface ExtractionResult {
  entities: ExtractedEntity[];
  imports: ExtractedImport[];
  calls: ExtractedCall[];
}

export type { ExtractedEntity, EntityKind, ExtractedImport, ExtractedCall, ExtractionResult  };