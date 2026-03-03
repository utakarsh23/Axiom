import Parser from 'web-tree-sitter';
import { ExtractedEntity, ExtractedImport, ExtractedCall, ExtractionResult } from './types';

// TODO: v2 — Cross-service call detection (HTTP clients, gRPC, message queues etc.)
// See backend/Todo.md for full list

function walkRustTree(root: Parser.SyntaxNode, filePath: string): ExtractionResult {
  const entities: ExtractedEntity[] = [];
  const imports: ExtractedImport[] = [];
  const calls: ExtractedCall[] = [];

  let currentFunctionName: string | null = null;

  function walk(node: Parser.SyntaxNode): void {
    switch (node.type) {

      // fn foo(a: i32, b: i32) -> i32 {}
      case 'function_item': {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = nameNode.text;
          const params = node.childForFieldName('parameters')?.text ?? '';
          const returnType = node.childForFieldName('return_type')?.text ?? '';
          const body = node.childForFieldName('body');

          entities.push({
            kind: 'function',
            name,
            filePath,
            language: 'rust',
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            rawSignature: `${name}${params}${returnType}`,
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

      // struct Foo {}
      case 'struct_item': {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          entities.push({
            kind: 'class', // structs are the closest Rust equivalent to classes
            name: nameNode.text,
            filePath,
            language: 'rust',
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            rawSignature: `struct ${nameNode.text}`,
            rawBody: node.text,
          });
        }
        break;
      }

      // use std::collections::HashMap;
      case 'use_declaration': {
        const argNode = node.childForFieldName('argument');
        if (argNode) {
          const importSource = argNode.text;
          const isExternal = !importSource.startsWith('crate') && !importSource.startsWith('super') && !importSource.startsWith('self');
          imports.push({
            fromPath: filePath,
            importSource,
            isExternal,
          });
        }
        return;
      }

      // foo() or obj.method()
      case 'call_expression': {
        const fnNode = node.childForFieldName('function');
        if (fnNode && currentFunctionName) {
          const calleeName = fnNode.type === 'field_expression'
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

export { walkRustTree };
