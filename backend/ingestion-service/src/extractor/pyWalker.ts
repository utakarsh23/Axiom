import Parser from 'web-tree-sitter';
import { ExtractedEntity, ExtractedImport, ExtractedCall, ExtractionResult } from './types';
import { resolveCallee } from './callFilter';


// TODO: v2 — Cross-service call detection (Kafka, RabbitMQ, HTTP clients etc.)
// See backend/Todo.md for full list

function walkPyTree(root: Parser.SyntaxNode, filePath: string): ExtractionResult {
  const entities: ExtractedEntity[] = [];
  const imports: ExtractedImport[] = [];
  const calls: ExtractedCall[] = [];

  let currentFunctionName: string | null = null;

  function walk(node: Parser.SyntaxNode): void {
    switch (node.type) {

      // def foo(a, b):
      case 'function_definition': {
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
            language: 'python',
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

      // class Foo:
      case 'class_definition': {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          entities.push({
            kind: 'class',
            name: nameNode.text,
            filePath,
            language: 'python',
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            rawSignature: `class ${nameNode.text}`,
            rawBody: node.text,
          });
        }
        break;
      }

      // import os / import os.path
      case 'import_statement': {
        for (const child of node.children) {
          if (child.type === 'dotted_name' || child.type === 'aliased_import') {
            const importSource = child.childForFieldName('name')?.text ?? child.text;
            imports.push({
              fromPath: filePath,
              importSource,
              isExternal: true, // Python stdlib and third-party are both external
            });
          }
        }
        return;
      }

      // from os import path / from .utils import helper
      case 'import_from_statement': {
        const moduleNode = node.childForFieldName('module_name');
        if (moduleNode) {
          const importSource = moduleNode.text;
          const isExternal = !importSource.startsWith('.');
          imports.push({
            fromPath: filePath,
            importSource,
            isExternal,
          });
        }
        return;
      }

      // foo() or obj.method()
      case 'call': {
        const fnNode = node.childForFieldName('function');
        if (fnNode && currentFunctionName) {
          let calleeName: string | null;
          if (fnNode.type === 'attribute') {
            const objectName = fnNode.childForFieldName('object')?.text ?? null;
            const propertyName = fnNode.childForFieldName('attribute')?.text ?? null;
            calleeName = resolveCallee(fnNode.text, objectName, propertyName);
          } else {
            calleeName = resolveCallee(fnNode.text, null, null);
          }
          if (calleeName) {
            calls.push({ callerName: currentFunctionName, calleeName, filePath });
          }
        }
        break;
      }
    }

    node.children.forEach(walk);
  }

  walk(root);
  return { entities, imports, calls };
}

export { walkPyTree };
