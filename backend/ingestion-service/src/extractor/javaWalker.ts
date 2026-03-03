import { Node } from 'web-tree-sitter';
import { ExtractedEntity, ExtractedImport, ExtractedCall, ExtractionResult } from './types';

// TODO: v2 — Cross-service call detection (Kafka, RabbitMQ, HTTP clients etc.)
// See backend/Todo.md for full list

function walkJavaTree(root: Node, filePath: string): ExtractionResult {
  const entities: ExtractedEntity[] = [];
  const imports: ExtractedImport[] = [];
  const calls: ExtractedCall[] = [];

  let currentFunctionName: string | null = null;

  function walk(node: Node): void {
    switch (node.type) {

      // public void foo(String a) {}
      case 'method_declaration': {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = nameNode.text;
          const params = node.childForFieldName('formal_parameters')?.text ?? '';
          const returnType = node.childForFieldName('type')?.text ?? '';
          const body = node.childForFieldName('body');

          entities.push({
            kind: 'function',
            name,
            filePath,
            language: 'java',
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            rawSignature: `${returnType} ${name}${params}`.trim(),
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

      // class Foo {}
      case 'class_declaration': {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          entities.push({
            kind: 'class',
            name: nameNode.text,
            filePath,
            language: 'java',
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            rawSignature: `class ${nameNode.text}`,
            rawBody: node.text,
          });
        }
        break;
      }

      // import java.util.ArrayList;
      case 'import_declaration': {
        const pathNode = node.children.find(c => c.type === 'scoped_identifier' || c.type === 'identifier');
        if (pathNode) {
          imports.push({
            fromPath: filePath,
            importSource: pathNode.text,
            isExternal: true, // Java imports are always fully qualified — treat as external
          });
        }
        return;
      }

      // foo() or obj.method()
      case 'method_invocation': {
        const nameNode = node.childForFieldName('name');
        if (nameNode && currentFunctionName) {
          calls.push({
            callerName: currentFunctionName,
            calleeName: nameNode.text,
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

export { walkJavaTree };
