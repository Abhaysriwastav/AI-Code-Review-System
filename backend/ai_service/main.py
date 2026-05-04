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

class LocalScanRequest(BaseModel):
    path: str # Path inside the /desktop mount

workflow = CodeReviewWorkflow()

@app.post("/review", response_model=dict)
async def trigger_review(request: ReviewRequest):
    try:
        result = await workflow.run(request.diff, request.context)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/scan-local")
async def scan_local(request: LocalScanRequest):
    try:
        # Construct absolute path in container
        full_path = os.path.join("/desktop", request.path.lstrip("/"))
        if not os.path.exists(full_path):
            raise HTTPException(status_code=404, detail="Path not found on desktop")
        
        # Simple implementation: read the first python file found
        # In production, we'd loop through and chunk everything
        files = []
        for root, dirs, filenames in os.walk(full_path):
            for f in filenames:
                if f.endswith(".py"):
                    files.append(os.path.join(root, f))
        
        if not files:
            return {"message": "No code files found"}

        with open(files[0], "r") as f:
            content = f.read()
            
        result = await workflow.run(content, f"Local scan of {request.path}")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
