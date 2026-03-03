import { Node } from 'web-tree-sitter';
import { ExtractedEntity, ExtractedImport, ExtractedCall, ExtractionResult } from './types';

// TODO: v2 — Cross-service call detection (external contract calls etc.)
// See backend/Todo.md for full list

function walkSolTree(root: Node, filePath: string): ExtractionResult {
  const entities: ExtractedEntity[] = [];
  const imports: ExtractedImport[] = [];
  const calls: ExtractedCall[] = [];

  let currentFunctionName: string | null = null;

  function walk(node: Node): void {
    switch (node.type) {

      // function foo(uint a) public returns (uint) {}
      case 'function_definition': {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = nameNode.text;
          const params = node.childForFieldName('parameter_list')?.text ?? '';
          const returnType = node.childForFieldName('return_type')?.text ?? '';
          const body = node.childForFieldName('body');

          entities.push({
            kind: 'function',
            name,
            filePath,
            language: 'solidity',
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

      // contract Foo {}
      case 'contract_declaration': {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          entities.push({
            kind: 'class', // contracts map closest to classes in the graph
            name: nameNode.text,
            filePath,
            language: 'solidity',
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            rawSignature: `contract ${nameNode.text}`,
            rawBody: node.text,
          });
        }
        break;
      }

      // import './Token.sol' or import '@openzeppelin/contracts/token/ERC20/ERC20.sol'
      case 'import_directive': {
        const pathNode = node.children.find(c => c.type === 'string');
        if (pathNode) {
          const importSource = pathNode.text.replace(/['"]/g, '');
          const isExternal = !importSource.startsWith('.');
          imports.push({
            fromPath: filePath,
            importSource,
            isExternal,
          });
        }
        return;
      }

      // foo() or contract.method()
      case 'call_expression': {
        const fnNode = node.childForFieldName('function');
        if (fnNode && currentFunctionName) {
          const calleeName = fnNode.type === 'member_expression'
            ? fnNode.childForFieldName('property')?.text ?? fnNode.text
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

export { walkSolTree };
