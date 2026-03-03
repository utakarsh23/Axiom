import { Node } from 'web-tree-sitter';
import { ExtractedEntity, ExtractedImport, ExtractedCall, ExtractionResult } from './types';

// Handles both C and C++ files (.c, .cpp, .cc, .h)
// TODO: v2 — Cross-service call detection (HTTP clients, sockets etc.)
// See backend/Todo.md for full list

function walkCTree(root: Node, filePath: string, language: 'c' | 'cpp'): ExtractionResult {
  const entities: ExtractedEntity[] = [];
  const imports: ExtractedImport[] = [];
  const calls: ExtractedCall[] = [];

  let currentFunctionName: string | null = null;

  function walk(node: Node): void {
    switch (node.type) {

      // int foo(int a, int b) {}
      case 'function_definition': {
        const declarator = node.childForFieldName('declarator');
        // declarator may be function_declarator or pointer_declarator wrapping function_declarator
        const funcDeclarator = declarator?.type === 'function_declarator'
          ? declarator
          : declarator?.children.find(c => c.type === 'function_declarator');

        const nameNode = funcDeclarator?.childForFieldName('declarator');
        if (nameNode) {
          const name = nameNode.text;
          const params = funcDeclarator?.childForFieldName('parameters')?.text ?? '';
          const returnType = node.childForFieldName('type')?.text ?? '';
          const body = node.childForFieldName('body');

          entities.push({
            kind: 'function',
            name,
            filePath,
            language,
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

      // C++: class Foo {}
      case 'class_specifier': {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          entities.push({
            kind: 'class',
            name: nameNode.text,
            filePath,
            language,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            rawSignature: `class ${nameNode.text}`,
            rawBody: node.text,
          });
        }
        break;
      }

      // #include <stdio.h> or #include "myheader.h"
      case 'preproc_include': {
        const pathNode = node.children.find(c =>
          c.type === 'string_literal' || c.type === 'system_lib_string'
        );
        if (pathNode) {
          const importSource = pathNode.text.replace(/[<>"]/g, '');
          const isExternal = pathNode.type === 'system_lib_string'; // <...> = system, "..." = local
          imports.push({
            fromPath: filePath,
            importSource,
            isExternal,
          });
        }
        return;
      }

      // foo() or bar(x, y)
      case 'call_expression': {
        const fnNode = node.childForFieldName('function');
        if (fnNode && currentFunctionName) {
          calls.push({
            callerName: currentFunctionName,
            calleeName: fnNode.text,
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

export { walkCTree };
