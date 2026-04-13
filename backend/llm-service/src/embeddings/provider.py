from sentence_transformers import SentenceTransformer
import os 


MODEL_NAME = os.getenv("MODEL_NAME", "all-MiniLM-L6-v2")

model = SentenceTransformer(MODEL_NAME)

def getEmbeddings(code : str) -> list[float]:
    vector = model.encode(code).tolist()
    return vector
