from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from .agents.workflow import CodeReviewWorkflow
from .schemas.review import FullReview
import uvicorn
import os

app = FastAPI(title="AI Code Review Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ReviewRequest(BaseModel):
    diff: str
    repo_url: str
    pr_number: int
    context: str = ""

workflow = CodeReviewWorkflow()

@app.post("/review", response_model=dict)
async def trigger_review(request: ReviewRequest):
    try:
        result = await workflow.run(request.diff, request.context)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
