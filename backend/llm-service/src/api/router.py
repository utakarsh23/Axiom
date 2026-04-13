from fastapi import APIRouter
from src.models.schemas import ExplainRequest, WhatIfRequest, PatchRequest, PRRequest, EmbedRequest
from src.llm.provider import generate_explanation, generate_whatif, generate_patch, generate_pr
from src.embeddings.provider import getEmbeddings

router = APIRouter(prefix="/llm")

@router.post("/explain")
async def explain(req: ExplainRequest):
    return {"explanation": generate_explanation(req.context)}

@router.post("/whatif")
async def whatif(req: WhatIfRequest):
    return {"report": generate_whatif(req)}

@router.post("/patch")
async def patch(req: PatchRequest):
    return generate_patch(req)

@router.post("/pr")
async def pr(req: PRRequest):
    return {"pr_description": generate_pr(req)}

@router.post("/embed")
async def embed(req: EmbedRequest):
    return {"vector": getEmbeddings(req.code)}
