import Parser from 'web-tree-sitter';
import path from 'path';
import { getLanguageConfig } from './grammars';
import { ParsedFile } from './types';
import { logger } from '../logger';

// Parser is initialized once and reused — loading WASM is expensive
// Language instances are cached after first load
let parserReady = false;
const languageCache: Record<string, Parser.Language> = {};

// Must be called once before parseFile is used (called in service startup)
async function initParser(): Promise<void> {
    await Parser.init();
    parserReady = true;
}

// Returns null for unsupported extensions — caller skips silently
// This handles generated files, assets, configs, lockfiles etc.
async function parseFile(filePath: string, content: string): Promise<ParsedFile | null> {
    try {
        if (!parserReady) throw new Error('Parser not initialized. Call initParser() first.');
        const ext = path.extname(filePath).toLowerCase();
        const config = getLanguageConfig(ext);
        if (!config) return null;

        // Load and cache the language grammar
        if (!languageCache[config.language]) {
            languageCache[config.language] = await Parser.Language.load(config.wasmPath);
        }

        const parser = new Parser();
        parser.setLanguage(languageCache[config.language]);

        const ast = parser.parse(content);
        return {
            filePath,
            language: config.language,
            ast,
        };
    } catch (err: any) {
        logger.error({ filePath, err: { message: err?.message, stack: err?.stack } }, 'Error parsing file');
        return null;
    }
}

export { initParser, parseFile };
export type { ParsedFile };