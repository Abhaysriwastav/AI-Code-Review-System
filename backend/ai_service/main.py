from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import os
from agents.workflow import CodeReviewWorkflow

app = FastAPI(title="AI Review Service")

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

@app.get("/list-desktop-folders")
async def list_desktop_folders():
    try:
        desktop_path = "/desktop"
        if not os.path.exists(desktop_path):
            return {"folders": [], "message": "Desktop not mounted"}
        folders = [f for f in os.listdir(desktop_path) if os.path.isdir(os.path.join(desktop_path, f)) and not f.startswith(".")]
        return {"folders": folders}
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
        files = []
        for root, dirs, filenames in os.walk(full_path):
            for f in filenames:
                if f.endswith(".py") or f.endswith(".js") or f.endswith(".ts"):
                    files.append(os.path.join(root, f))
        
        if not files:
            return {"message": "No code files found"}

        # Combine contents for analysis
        combined_content = ""
        for file_path in files[:5]: # Limit to 5 files for demo
            with open(file_path, "r") as f:
                combined_content += f"\n--- File: {file_path} ---\n"
                combined_content += f.read()
            
        result = await workflow.run(combined_content, f"Local scan of {request.path}")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
