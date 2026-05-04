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
        full_path = os.path.join("/desktop", request.path.lstrip("/"))
        if not os.path.exists(full_path):
            raise HTTPException(status_code=404, detail="Path not found on desktop")
        
        # Directories to skip entirely
        SKIP_DIRS = {
            'node_modules', '.git', '__pycache__', '.next', '.venv', 'venv',
            'env', 'dist', 'build', '.tox', 'coverage', '.mypy_cache',
            '.pytest_cache', 'migrations', 'staticfiles', 'media'
        }
        # File extensions to analyze
        CODE_EXTS = {'.py', '.js', '.ts', '.tsx', '.jsx', '.java', '.go', '.rs', '.cpp', '.c', '.rb', '.php'}

        files = []
        for root, dirs, filenames in os.walk(full_path):
            # Prune skip dirs in-place so os.walk doesn't recurse into them
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith('.')]
            for f in filenames:
                ext = os.path.splitext(f)[1].lower()
                if ext in CODE_EXTS:
                    files.append(os.path.join(root, f))
        
        if not files:
            return {"message": f"No code files found in '{request.path}'. Supported: {', '.join(CODE_EXTS)}"}

        # Read up to 10 files, max 500 lines each
        combined_content = ""
        files_analyzed = []
        for file_path in files[:10]:
            try:
                with open(file_path, "r", errors="ignore") as f:
                    lines = f.readlines()[:500]
                    rel_path = os.path.relpath(file_path, full_path)
                    combined_content += f"\n\n--- File: {rel_path} ---\n"
                    combined_content += "".join(lines)
                    files_analyzed.append(rel_path)
            except Exception:
                continue
        
        if not combined_content.strip():
            return {"message": "Files found but could not be read."}

        result = await workflow.run(combined_content, f"Local scan of {request.path} ({len(files_analyzed)} files)")
        result['files_analyzed'] = files_analyzed
        result['total_files_found'] = len(files)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
