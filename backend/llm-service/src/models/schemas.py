from pydantic import BaseModel
from typing import Optional

# ── /llm/explain
class ExplainContext(BaseModel):
    entityName: str
    kind: str
    language: str
    filePath: str
    code: str
    callList: list[str] = []
    calledBy: list[str] = []

class ExplainRequest(BaseModel):
    context: ExplainContext

# ── /llm/patch
class CallerNode(BaseModel):
    entityId: str
    name: str
    kind: str
    filePath: str
    language: str
    code: Optional[str] = ""

class Finding(BaseModel):
    source: str
    type: str
    description: str
    severity: Optional[str] = None
    line: Optional[int] = None
    code: Optional[str] = None
    path: Optional[list[str]] = None
    entity: Optional[str] = None
    expected: Optional[str] = None
    ruleId: Optional[str] = None


class PatchRequest(BaseModel):
    findings: list[Finding]
    entityCode: str
    callers: list[CallerNode] = []
    callees: list[CallerNode] = []
    similarSafePatterns: list[str] = []

# ── /llm/whatif
class WhatIfRequest(BaseModel):
    entityName: str
    proposedChange: str
    blastRadius: dict = {}
    similarPatterns: list[str] = []

# ── /llm/pr
class PRRequest(BaseModel):
    entityName: str
    findings: list[Finding] = []
    unifiedDiff: str
    riskScore: str
    explanation: str

# ── /llm/embed
class EmbedRequest(BaseModel):
    code: str
