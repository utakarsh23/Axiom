import axios from 'axios';
import { config } from '../config';
import logger from '../logger';
import { Finding } from '../types/finding';
import { GraphNode } from './graphClient';

// Input sent to LLM Service for patch generation
interface PatchRequest {
  findings: Finding[];
  entityCode: string;
  callers: (GraphNode & { code?: string })[];
  callees: (GraphNode & { code?: string })[];
  similarSafePatterns: string[];
}

// Output received from LLM Service after patch generation
interface PatchResponse {
  confirmedViolations: string[];
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  unifiedDiff: string;
  riskScore: 'LOW' | 'MEDIUM' | 'HIGH';
  explanation: string;
}

// Sends structured findings and entity context to LLM Service.
// Returns a unified diff patch + risk assessment.
// Only called when Tier 1 or Tier 2 has produced findings — never on clean commits.
const requestPatch = async (req: PatchRequest): Promise<PatchResponse> => {
  try {
    const response = await axios.post<PatchResponse>(
      `${config.services.llm}/llm/patch`,
      req
    );
    return response.data;
  } catch (err) {
    logger.error({ err }, 'LLM Service patch request failed');
    throw err;
  }
};

export { requestPatch, PatchRequest, PatchResponse };