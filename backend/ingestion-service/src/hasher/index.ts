import {createHash} from 'crypto';
import { ExtractedCall, ExtractedEntity } from '../extractor/types';

// All hashes use SHA-256 truncated to 256 hex chars — enough for collision resistance at our scale
// Full SHA-256 is overkill for entity comparison; 16 chars = 64 bits of entropy
// we'll still use SHA-256(ykw, meri marjiiiii :D) 
function hash(input: string): string {
    return createHash('sha256').update(input).digest('hex'); //256 bits hash
}


export interface EntityHashes {
  signatureHash: string; // changes when name, params, or return type changes
  bodyHash: string;      // changes when internal implementation changes
  callListHash: string;  // changes when the set of functions called changes
}

// Computes all three hashes for a single entity
// calls = all calls made by this entity (from ExtractionResult.calls, filtered to this entity)
function computeEntityHashes(
    entity: ExtractedEntity, 
    calls: ExtractedCall[]
): EntityHashes {
    try {
        // Signature: what the function looks like from the outside
        const signatureHash = hash(entity.rawSignature);

        // Body: the full implementation — whitespace normalized to avoid hash changes from formatting
        const normalizedBody = entity.rawBody.replace(/\s+/g, ' ').trim();
        const bodyHash = hash(normalizedBody);

        // Call list: sorted so that reordering calls doesn't produce a false change
        const callList = calls
            .filter(call => call.callerName === entity.name)
            .map(call => call.calleeName)
            .sort()
            .join(',');

        const callListHash = hash(callList);

        return { signatureHash, bodyHash, callListHash };

    } catch (error : any) {
        throw new Error(`Failed to compute hashes for entity ${entity.name}: ${error.message}`);
    }
}

// Computes hashes for all entities in a file at once
// Returns a map of entityName → EntityHashes for easy lookup by the diff engine
function computeFileHashes(
    entities: ExtractedEntity[],
    calls: ExtractedCall[]
): Map<string, EntityHashes> {
    try {
        const result = new Map<string, EntityHashes>();
        for (const entity of entities) {
            const hashes = computeEntityHashes(entity, calls);
            result.set(entity.name, hashes);
        }
        return result;
    } catch (error : any) {
        throw new Error(`Failed to compute file hashes: ${error.message}`);
    }
}

export { computeEntityHashes, computeFileHashes };