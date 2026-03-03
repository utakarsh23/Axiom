import Parser from 'web-tree-sitter';
import { ExtractedEntity, ExtractedImport, ExtractedCall, ExtractionResult } from './types';


// TODO: v2 — Cross-service call detection
// Add detection for the following patterns inside the call_expression case:
// - Kafka:    producer.send('topic-name', message)     → CALLS_API edge to ExternalService: kafka:<topic>
// - RabbitMQ: channel.publish('exchange', ...)         → CALLS_API edge to ExternalService: rabbitmq:<exchange>
// - NATS:     nc.publish('subject', data)              → CALLS_API edge to ExternalService: nats:<subject>
// - gRPC:     client.MethodName(request)               → CALLS_API edge to ExternalService: grpc:<service>
// - HTTP:     axios.get(url) / fetch(url)              → CALLS_API edge to ExternalService parsed from URL
// These produce CALLS_API edges in Neo4j, not CALLS edges
// Impact traversal must follow both edge types for full cross-service blast radius
// HTTP methods used to detect Express/Fastify-style endpoint declarations
// e.g. app.get('/path', handler) or router.post('/path', handler)
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);

function walkTsTree(
  root: Parser.SyntaxNode,
  filePath: string,
): ExtractionResult {
  const entities: ExtractedEntity[] = [];
  const imports: ExtractedImport[] = [];
  const calls: ExtractedCall[] = [];

  // Tracks which function we are currently inside
  // Used to attribute call_expression nodes to their caller
  let currentFunctionName: string | null = null;

  function walk(node: Parser.SyntaxNode): void {
    switch (node.type) {

      // function foo() {}
      case 'function_declaration':
      case 'function': {
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
            language: 'typescript',
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            rawSignature: `${name}${params}${returnType}`,
            rawBody: node.text,
          });

          // Walk just the body with this function set as the current context
          // so any call_expression found inside is attributed to this function
          const prev = currentFunctionName;
          currentFunctionName = name;
          if (body) walk(body);
          currentFunctionName = prev;
          return; // skip default child walk — already walked body above
        }
        break;
      }

      // class methods
      case 'method_definition': {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = nameNode.text;
          const params = node.childForFieldName('parameters')?.text ?? '';
          const returnType = node.childForFieldName('return_type')?.text ?? '';

          entities.push({
            kind: 'function',
            name,
            filePath,
            language: 'typescript',
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            rawSignature: `${name}${params}${returnType}`,
            rawBody: node.text,
          });

          const prev = currentFunctionName;
          currentFunctionName = name;
          node.children.forEach(walk);
          currentFunctionName = prev;
          return;
        }
        break;
      }

      // const foo = () => {} or const foo = function() {}
      case 'lexical_declaration':
      case 'variable_declaration': {
        for (const child of node.children) {
          if (child.type === 'variable_declarator') {
            const nameNode = child.childForFieldName('name');
            const valueNode = child.childForFieldName('value');

            if (nameNode && valueNode &&
              (valueNode.type === 'arrow_function' || valueNode.type === 'function')) {
              const name = nameNode.text;
              const params = valueNode.childForFieldName('parameters')?.text ?? '';
              const returnType = valueNode.childForFieldName('return_type')?.text ?? '';
              const body = valueNode.childForFieldName('body');

              entities.push({
                kind: 'function',
                name,
                filePath,
                language: 'typescript',
                startLine: node.startPosition.row + 1,
                endLine: node.endPosition.row + 1,
                rawSignature: `${name}${params}${returnType}`,
                rawBody: valueNode.text,
              });

              const prev = currentFunctionName;
              currentFunctionName = name;
              if (body) walk(body);
              currentFunctionName = prev;
            }
          }
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
            language: 'typescript',
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            rawSignature: `class ${nameNode.text}`,
            rawBody: node.text,
          });
        }
        break;
      }

      // import { x } from './y' or import express from 'express'
      case 'import_declaration': {
        const sourceNode = node.childForFieldName('source');
        if (sourceNode) {
          const importSource = sourceNode.text.replace(/['"]/g, '');
          const isExternal = !importSource.startsWith('.') && !importSource.startsWith('/');
          imports.push({
            fromPath: filePath,
            importSource,
            isExternal,
          });
        }
        return; // never recurse into import nodes
      }

      // foo() or app.get('/path', handler)
      case 'call_expression': {
        const fnNode = node.childForFieldName('function');
        if (fnNode) {

          // Detect Express/Fastify endpoint: app.get(...) router.post(...)
          if (fnNode.type === 'member_expression') {
            const method = fnNode.childForFieldName('property')?.text ?? '';
            if (HTTP_METHODS.has(method)) {
              const args = node.childForFieldName('arguments');
              const firstArg = args?.children.find(c => c.type === 'string');
              if (firstArg) {
                entities.push({
                  kind: 'endpoint',
                  name: `${method.toUpperCase()} ${firstArg.text.replace(/['"]/g, '')}`,
                  filePath,
                  language: 'typescript',
                  startLine: node.startPosition.row + 1,
                  endLine: node.endPosition.row + 1,
                  rawSignature: `${method.toUpperCase()} ${firstArg.text}`,
                  rawBody: node.text,
                });
              }
            }
          }

          // Record the call if we are inside a known function
          if (currentFunctionName) {
            const calleeName = fnNode.type === 'member_expression'
              ? fnNode.childForFieldName('property')?.text ?? fnNode.text
              : fnNode.text;

            calls.push({
              callerName: currentFunctionName,
              calleeName,
              filePath,
            });
          }
        }
        break;
      }
    }

    // Default: walk all children of this node
    node.children.forEach(walk);
  }

  walk(root);
  return { entities, imports, calls };
}

export { walkTsTree };