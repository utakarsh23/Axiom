from fastapi import FastAPI
from dotenv import load_dotenv

load_dotenv()

from src.api.router import router

app = FastAPI(title="LLM Service")
app.include_router(router)
