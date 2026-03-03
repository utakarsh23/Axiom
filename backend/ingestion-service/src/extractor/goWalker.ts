import Parser from 'web-tree-sitter';
import { ExtractedEntity, ExtractedImport, ExtractedCall, ExtractionResult } from './types';

// TODO: v2 — Cross-service call detection (HTTP clients, gRPC, Kafka etc.)
// See backend/Todo.md for full list

function walkGoTree(root: Parser.SyntaxNode, filePath: string): ExtractionResult {
  const entities: ExtractedEntity[] = [];
  const imports: ExtractedImport[] = [];
  const calls: ExtractedCall[] = [];

  let currentFunctionName: string | null = null;

  function walk(node: Parser.SyntaxNode): void {
    switch (node.type) {

      // func foo(a int, b int) int {}
      case 'function_declaration': {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = nameNode.text;
          const params = node.childForFieldName('parameters')?.text ?? '';
          const result = node.childForFieldName('result')?.text ?? '';
          const body = node.childForFieldName('body');

          entities.push({
            kind: 'function',
            name,
            filePath,
            language: 'go',
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            rawSignature: `${name}${params} ${result}`.trim(),
            rawBody: node.text,
          });

          const prev = currentFunctionName;
          currentFunctionName = name;
          if (body) walk(body);
          currentFunctionName = prev;
          return;
        }
        break;
      }

      // func (r *Receiver) foo() {} — method with receiver
      case 'method_declaration': {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = nameNode.text;
          const params = node.childForFieldName('parameters')?.text ?? '';
          const result = node.childForFieldName('result')?.text ?? '';
          const body = node.childForFieldName('body');

          entities.push({
            kind: 'function',
            name,
            filePath,
            language: 'go',
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            rawSignature: `${name}${params} ${result}`.trim(),
            rawBody: node.text,
          });

          const prev = currentFunctionName;
          currentFunctionName = name;
          if (body) walk(body);
          currentFunctionName = prev;
          return;
        }
        break;
      }

      // import "fmt" or import ( "fmt"\n "os" )
      case 'import_declaration': {
        for (const child of node.children) {
          if (child.type === 'import_spec') {
            const pathNode = child.childForFieldName('path');
            if (pathNode) {
              const importSource = pathNode.text.replace(/['"]/g, '');
              const isExternal = !importSource.startsWith('.');
              imports.push({
                fromPath: filePath,
                importSource,
                isExternal,
              });
            }
          }
        }
        return;
      }

      // foo() or pkg.Method()
      case 'call_expression': {
        const fnNode = node.childForFieldName('function');
        if (fnNode && currentFunctionName) {
          const calleeName = fnNode.type === 'selector_expression'
            ? fnNode.childForFieldName('field')?.text ?? fnNode.text
            : fnNode.text;

          calls.push({
            callerName: currentFunctionName,
            calleeName,
            filePath,
          });
        }
        break;
      }
    }

    node.children.forEach(walk);
  }

  walk(root);
  return { entities, imports, calls };
}

export { walkGoTree };
