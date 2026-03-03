import path from 'path';
import { logger } from '../logger';

// Maps file extensions to their language name and corresponding .wasm grammar file
// WASM files are sourced from tree-sitter-wasms — no native compilation needed
// To add a new language: add its extension + wasm filename here

// At runtime __dirname = dist/parser/ → ../../node_modules = ingestion-service/node_modules ✓
const WASM_DIR = path.join(
  __dirname,
  '../../node_modules/tree-sitter-wasms/out'
);

const EXTENSION_MAP: Record<string, { language: string; wasmFile: string }> = {
  '.ts': { language: 'typescript', wasmFile: 'tree-sitter-typescript.wasm' },
  '.tsx': { language: 'typescript', wasmFile: 'tree-sitter-typescript.wasm' },
  '.js': { language: 'javascript', wasmFile: 'tree-sitter-javascript.wasm' },
  '.jsx': { language: 'javascript', wasmFile: 'tree-sitter-javascript.wasm' },
  '.py': { language: 'python', wasmFile: 'tree-sitter-python.wasm' },
  '.java': { language: 'java', wasmFile: 'tree-sitter-java.wasm' },
  '.c': { language: 'c', wasmFile: 'tree-sitter-c.wasm' },
  '.cpp': { language: 'cpp', wasmFile: 'tree-sitter-cpp.wasm' },
  '.cc': { language: 'cpp', wasmFile: 'tree-sitter-cpp.wasm' },
  '.go': { language: 'go', wasmFile: 'tree-sitter-go.wasm' },
  '.rs': { language: 'rust', wasmFile: 'tree-sitter-rust.wasm' },
  '.sol': { language: 'solidity', wasmFile: 'tree-sitter-solidity.wasm' },
};

function getLanguageConfig(ext: string): { language: string; wasmPath: string } | null {
  try {
    const entry = EXTENSION_MAP[ext.toLowerCase()];
    if (!entry) return null;
    return {
      language: entry.language,
      wasmPath: path.join(WASM_DIR, entry.wasmFile),
    };
  } catch (err: any) {
    logger.error({ ext, err: { message: err?.message, stack: err?.stack } }, 'Error getting language config for extension');
    return null;
  }
}

export { getLanguageConfig };