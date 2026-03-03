import { ParsedFile } from '../parser/types';
import { ExtractionResult } from './types';
import { walkTsTree } from './tsWalker';
import { walkPyTree } from './pyWalker';
import { walkJavaTree } from './javaWalker';
import { walkCTree } from './cWalker';
import { walkGoTree } from './goWalker';
import { walkRustTree } from './rustWalker';
import { walkSolTree } from './solWalker';

// Routes a parsed file to the correct language walker
// All walkers return the same ExtractionResult shape

function extract(parsed: ParsedFile): ExtractionResult {
  const root = parsed.ast.rootNode;

  switch (parsed.language) {
    case 'typescript':
    case 'javascript':
      return walkTsTree(root, parsed.filePath);
    case 'python':
      return walkPyTree(root, parsed.filePath);
    case 'java':
      return walkJavaTree(root, parsed.filePath);
    case 'c':
      return walkCTree(root, parsed.filePath, 'c');
    case 'cpp':
      return walkCTree(root, parsed.filePath, 'cpp');
    case 'go':
      return walkGoTree(root, parsed.filePath);
    case 'rust':
      return walkRustTree(root, parsed.filePath);
    case 'solidity':
      return walkSolTree(root, parsed.filePath);
    default:
      return { entities: [], imports: [], calls: [] };
  }
}

export { extract };
export type { ExtractionResult };