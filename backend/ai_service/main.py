from typing import Optional
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
    path: str  # Path inside the /desktop mount
    model: Optional[str] = None
    url: Optional[str] = None
    max_files: Optional[int] = None
    max_lines: Optional[int] = None
    skip_dirs: Optional[str] = None

class ChatRequest(BaseModel):
    code_snippet: str
    issue_description: str
    user_message: str
    history: list[dict] = []


workflow = CodeReviewWorkflow()

@app.post("/review", response_model=dict)
async def trigger_review(request: ReviewRequest):
    try:
        result = await workflow.run(request.diff, request.context)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/list-desktop-folders")
async def list_desktop_folders(path: str = ""):
    """
    List subdirectories (and code files) inside /desktop/<path>.
    path="" → Desktop root. path="Study/MyProject" → drill into that folder.
    """
    try:
        CODE_EXTS = {'.py','.js','.ts','.tsx','.jsx','.java','.go','.rs','.cpp','.c','.rb','.php','.cs','.swift','.kt'}
        SKIP_DIRS = {'node_modules','.git','__pycache__','.next','.venv','venv','env','dist','build','.idea','.vscode'}

        base = "/desktop"
        target = os.path.normpath(os.path.join(base, path.lstrip("/"))) if path else base

        # Security: never escape /desktop
        if not target.startswith(base):
            return {"folders": [], "files": [], "current_path": path, "error": "Invalid path"}

        if not os.path.exists(target):
            return {"folders": [], "files": [], "current_path": path, "message": "Path not found"}

        entries = os.listdir(target)
        folders = sorted([
            e for e in entries
            if os.path.isdir(os.path.join(target, e))
            and not e.startswith('.')
            and e not in SKIP_DIRS
        ])
        code_files = sorted([
            e for e in entries
            if os.path.isfile(os.path.join(target, e))
            and os.path.splitext(e)[1].lower() in CODE_EXTS
        ])

        # Compute parent path — None means "we're at root, no back button"
        if path and path.strip("/"):
            parts = path.strip("/").split("/")
            parent_path = "/".join(parts[:-1]) if len(parts) > 1 else ""
        else:
            parent_path = None

        return {
            "folders": folders,
            "files": code_files,
            "current_path": path,
            "parent_path": parent_path,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/scan-local")
async def scan_local(request: LocalScanRequest):
    try:
        # ── Config ────────────────────────────────────────────────────────────
        SKIP_DIRS = {
            'node_modules', '.git', '__pycache__', '.next', '.venv', 'venv',
            'env', 'dist', 'build', '.tox', 'coverage', '.mypy_cache',
            '.pytest_cache', 'migrations', 'staticfiles', 'media',
            '.idea', '.vscode', 'target', 'bin', 'obj', 'out', '.gradle',
        }
        if request.skip_dirs:
            custom_skips = {d.strip() for d in request.skip_dirs.split(',') if d.strip()}
            SKIP_DIRS.update(custom_skips)

        full_path = os.path.join("/desktop", request.path.lstrip("/"))
        if not os.path.exists(full_path):
            # Attempt automatic fallback resolution by searching for matching folder/file name on Desktop
            target = os.path.basename(request.path.rstrip("/"))
            found = None
            for root, dirs, files in os.walk("/desktop"):
                dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith('.')]
                if target in dirs or target in files:
                    found = os.path.join(root, target)
                    break
            if found:
                full_path = found
            else:
                raise HTTPException(
                    status_code=404,
                    detail=f"Folder '{request.path}' was not found in /desktop. Please click 'Local Review' to pick subfolders."
                )

        CODE_EXTS = {
            '.py', '.js', '.ts', '.tsx', '.jsx', '.java', '.go',
            '.rs', '.cpp', '.c', '.rb', '.php', '.cs', '.swift', '.kt',
        }
        # Single-file scan: read up to 1200 lines
        # Folder scan: read up to 30 files, up to 300 lines each
        MAX_FILES       = request.max_files or 30
        MAX_LINES_FILE  = request.max_lines or 300   # lines per file
        MAX_CHARS_TOTAL = 24_000  # hard cap on total content sent

        # Override Ollama parameters on-the-fly
        if request.model:
            workflow.ollama.model = request.model
        if request.url:
            workflow.ollama.base_url = request.url

        # ── Walk and rank files ────────────────────────────────────────────────
        def is_single_file(p: str) -> bool:
            return os.path.isfile(p)

        all_files: list[str] = []
        if is_single_file(full_path):
            all_files = [full_path]
        else:
            for root, dirs, filenames in os.walk(full_path):
                dirs[:] = [
                    d for d in dirs
                    if d not in SKIP_DIRS and not d.startswith('.')
                ]
                for f in filenames:
                    if os.path.splitext(f)[1].lower() in CODE_EXTS:
                        all_files.append(os.path.join(root, f))

        if not all_files:
            return {
                "message": (
                    f"No code files found in '{request.path}'. "
                    f"Supported extensions: {', '.join(sorted(CODE_EXTS))}"
                )
            }

        # ── Prioritise files most likely to have issues ────────────────────────
        # Heuristic: prefer shorter depth (closer to root), then larger files
        def priority(fp: str) -> tuple:
            rel = os.path.relpath(fp, full_path)
            depth = rel.count(os.sep)
            try:
                size = os.path.getsize(fp)
            except OSError:
                size = 0
            return (depth, -size)   # low depth first, then largest

        all_files.sort(key=priority)
        selected_files = all_files[:MAX_FILES]

        # ── Read files ────────────────────────────────────────────────────────
        combined_content = ""
        files_analyzed: list[str] = []

        for file_path in selected_files:
            if len(combined_content) >= MAX_CHARS_TOTAL:
                break
            try:
                with open(file_path, "r", errors="ignore") as fh:
                    if is_single_file(full_path):
                        lines = fh.readlines()[:1200]
                    else:
                        lines = fh.readlines()[:MAX_LINES_FILE]

                rel_path = os.path.relpath(file_path, full_path if not is_single_file(full_path) else os.path.dirname(full_path))
                block = f"\n\n{'='*60}\nFile: {rel_path}\n{'='*60}\n" + "".join(lines)
                combined_content += block
                files_analyzed.append(rel_path)
            except Exception:
                continue

        # Enforce hard char cap
        combined_content = combined_content[:MAX_CHARS_TOTAL]

        if not combined_content.strip():
            return {"message": "Files found but could not be read."}

        # ── Summarise what we're scanning (for context) ────────────────────────
        context_note = (
            f"Local scan of '{request.path}'. "
            f"Analyzed {len(files_analyzed)} of {len(all_files)} total code files. "
            f"Files: {', '.join(files_analyzed[:10])}"
            + (" …and more." if len(files_analyzed) > 10 else ".")
        )
        print(f"[scan-local] Scanning {len(files_analyzed)} files, {len(combined_content)} chars")

        result = await workflow.run(combined_content, context_note)
        result['files_analyzed'] = files_analyzed
        result['total_files_found'] = len(all_files)
        return result

    except HTTPException:
        raise
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat")
async def chat_about_issue(request: ChatRequest):
    try:
        # Build prompt with context
        messages = []
        
        system_prompt = (
            "You are an expert AI Code Reviewer. You are helping a developer fix code vulnerabilities, "
            "performance bottlenecks, or style issues detected in their scan. "
            "Provide helpful, concise, and structured advice. Show code snippets only when necessary."
        )
        
        prompt = f"""We are reviewing this code snippet:
```
{request.code_snippet}
```

The identified issue is:
"{request.issue_description}"

User asks:
"{request.user_message}"

Provide a professional, specific response on how to fix this issue."""
        
        # Call Ollama Client
        response_text = await workflow.ollama.generate(prompt, system_prompt=system_prompt)
        return {"response": response_text.strip()}
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
