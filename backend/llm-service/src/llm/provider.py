import google.generativeai as genai
import os, json

API_KEY = os.getenv("GEMINI_API_KEY")
genai.configure(api_key=API_KEY)

MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
model = genai.GenerativeModel(MODEL_NAME)


def generate_explanation(context) -> str:
    prompt = f"""Explain the following code in plain English.

Entity: {context.entityName} ({context.kind})
Language: {context.language}
File: {context.filePath}

Code:
{context.code}

This entity calls: {', '.join(context.callList) if context.callList else 'nothing'}
Called by: {', '.join(context.calledBy) if context.calledBy else 'nothing'}"""

    response = model.generate_content(prompt)
    return response.text


def generate_whatif(req) -> str:
    prompt = f"""Based on this structural context, explain the consequences of this proposed change.

Entity: {req.entityName}
Proposed Change: {req.proposedChange}
Blast Radius: {json.dumps(req.blastRadius, indent=2)}
Similar Patterns: {json.dumps(req.similarPatterns)}"""

    response = model.generate_content(prompt)
    return response.text


def generate_patch(req) -> dict:
    callers_str = "\n".join([f"  - {c.name} ({c.filePath})\n    Code: {c.code}" for c in req.callers if c.code]) or "  None"
    callees_str = "\n".join([f"  - {c.name} ({c.filePath})\n    Code: {c.code}" for c in req.callees if c.code]) or "  None"
    
    findings_str = "\n".join([f"  - [{f.source}] {f.type}: {f.description}" for f in req.findings])

    prompt = f"""Analyze these violations and the provided code context.
Return your response IN STRICT JSON FORMAT with these fields:
"confirmedViolations": array of confirmed violation descriptions
"severity": "LOW" or "MEDIUM" or "HIGH"
"unifiedDiff": the unified diff patch to fix the issues
"riskScore": "LOW" or "MEDIUM" or "HIGH"
"explanation": brief explanation of what the patch does

RISK SCORING GUIDE (follow strictly):
- LOW risk + LOW severity: Simple, mechanical fixes. Examples: replacing a weak hash algorithm (md5→sha256), replacing Math.random() with crypto.randomUUID(), adding missing input trim/validation, fixing a typo in error messages, removing leftover console.log/debugger statements.
- MEDIUM risk + MEDIUM severity: Logic changes with limited scope. Examples: adding parameterized queries to replace string concatenation in SQL, adding input sanitization, replacing eval() with a safe parser, adding rate limiting.
- HIGH risk + HIGH severity: Changes that alter authentication flows, modify public API contracts, touch secrets management, or rewrite large blocks of business logic. Examples: rewriting entire auth middleware, removing endpoints, changing encryption schemes.

IMPORTANT: Most single-function fixes with < 10 lines changed should be LOW or MEDIUM. Only use HIGH when the fix fundamentally changes how the code operates or could break callers.

Findings:
{findings_str}

Entity Code:
{req.entityCode}

Callers (functions that call this entity):
{callers_str}

Callees (functions this entity calls):
{callees_str}"""

    response = model.generate_content(prompt, generation_config={"response_mime_type": "application/json"})
    try:
        return json.loads(response.text)
    except Exception:
        return {"confirmedViolations": [], "severity": "HIGH", "unifiedDiff": "", "riskScore": "HIGH", "explanation": "Failed to parse LLM response"}


def generate_pr(req) -> str:
    findings_str = "\n".join([f"- [{f.source}] {f.type}: {f.description}" for f in req.findings]) or "None"

    prompt = f"""Generate a pull request description for this automated fix.

Entity: {req.entityName}
Risk Score: {req.riskScore}

Findings:
{findings_str}

Explanation: {req.explanation}

Diff:
{req.unifiedDiff}"""

    response = model.generate_content(prompt)
    return response.text


def generate_rag_answer(req) -> str:
    context_blocks = []
    for i, ctx in enumerate(req.contexts):
        block = f"--- Context {i+1} ---"
        if ctx.entityName:
            block += f"\nEntity: {ctx.entityName}"
        if ctx.kind:
            block += f" ({ctx.kind})"
        if ctx.filePath:
            block += f"\nFile: {ctx.filePath}"
        if ctx.docBlock:
            block += f"\nDocumentation:\n{ctx.docBlock}"
        if ctx.code:
            block += f"\nCode:\n{ctx.code}"
        context_blocks.append(block)

    context_str = "\n\n".join(context_blocks) if context_blocks else "No context available."

    prompt = f"""You are Axiom, a codebase intelligence assistant. Answer the user's question using ONLY the retrieved code context below. Be concise, specific, and reference entity names and file paths when relevant.

If the context doesn't contain enough information to fully answer, say so clearly.

Retrieved Context:
{context_str}

User Question: {req.query}

Answer:"""

    response = model.generate_content(prompt)
    return response.text
