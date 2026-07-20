from typing import TypedDict, List, Annotated, Dict, Any
from langgraph.graph import StateGraph, END
import operator
import json
import re
from ollama_client import OllamaClient


class AgentState(TypedDict):
    diff: str
    language: str
    files: List[str]
    context: str
    issues: Annotated[List[Dict[str, Any]], operator.add]
    summary: str
    current_agent: str
    static_analysis_results: Dict


# ── Shared JSON extractor ─────────────────────────────────────────────────────
def extract_json_array(raw: str) -> list:
    """
    Robustly extract a JSON array from a model response that may contain:
    - Markdown code fences (```json ... ```)
    - Trailing commas before ] or }
    - Single-quoted strings (rare but happens)
    - Extra prose before/after the array
    Returns [] on any parse failure.
    """
    if not raw:
        return []

    text = raw.strip()

    # 1. Strip markdown fences - handle ``` json ``` or ```json\n...\n```
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.IGNORECASE)
    if fence_match:
        text = fence_match.group(1).strip()

    # 2. Find first '[' and last ']' to isolate the array
    start = text.find('[')
    end   = text.rfind(']')
    if start == -1 or end == -1 or end < start:
        return []
    text = text[start:end + 1]

    # 3. Remove trailing commas before ] or }  (common Ollama mistake)
    text = re.sub(r',\s*([}\]])', r'\1', text)

    # 4. Attempt parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 5. Last resort: use regex to extract individual {...} objects
    objects = re.findall(r'\{[^{}]*\}', text, re.DOTALL)
    results = []
    for obj in objects:
        obj = re.sub(r',\s*([}\]])', r'\1', obj)
        try:
            results.append(json.loads(obj))
        except Exception:
            pass
    return results


# ── Shared issue fields required in every prompt ──────────────────────────────
ISSUE_FIELDS = (
    'category, severity (use exactly: "critical", "warning", or "suggestion"), '
    'issue_description, explanation (why this is a problem), '
    'suggested_fix (concrete steps to resolve), '
    'improved_code (working replacement snippet, empty string if not applicable), '
    'file_name, line_number (integer), '
    'confidence_score (float 0.0-1.0 representing how confident you are), '
    'compliance_tag (string for security vulnerabilities representing OWASP Top 10 or CWE mapping, e.g. "CWE-89 (SQL Injection)" or "OWASP A03:2021-Injection"; empty string if not a security issue)'
)

ISSUE_EXAMPLE = (
    '[{"category":"Security","severity":"critical",'
    '"issue_description":"Hardcoded API key","explanation":"Anyone with access to source code can steal the key",'
    '"suggested_fix":"Use environment variables instead","improved_code":"api_key = os.getenv(\'API_KEY\')",'
    '"file_name":"app.py","line_number":5,"confidence_score":0.95,"compliance_tag":"CWE-798 (Use of Hardcoded Credentials)"}]'
)


class CodeReviewWorkflow:
    def __init__(self):
        self.ollama = OllamaClient()
        self.workflow = self._build_workflow()

    def _build_workflow(self):
        builder = StateGraph(AgentState)

        builder.add_node("analyzer",        self.analyzer_agent)
        builder.add_node("static_analysis", self.static_analysis_agent)
        builder.add_node("security",        self.security_agent)
        builder.add_node("performance",     self.performance_agent)
        builder.add_node("clean_code",      self.clean_code_agent)
        builder.add_node("documentation",   self.documentation_agent)
        builder.add_node("summarizer",      self.summary_agent)

        builder.set_entry_point("analyzer")
        builder.add_edge("analyzer",        "static_analysis")
        builder.add_edge("static_analysis", "security")
        builder.add_edge("security",        "performance")
        builder.add_edge("performance",     "clean_code")
        builder.add_edge("clean_code",      "documentation")
        builder.add_edge("documentation",   "summarizer")
        builder.add_edge("summarizer",      END)

        return builder.compile()

    # ── Agents ────────────────────────────────────────────────────────────────

    async def analyzer_agent(self, state: AgentState):
        print("\n[Workflow] Starting Code Analysis Workflow...")
        return {"language": "python", "files": ["scan"], "current_agent": "Analyzer"}

    async def static_analysis_agent(self, state: AgentState):
        print("[Workflow] Running Static Analysis Agent...")
        return {"static_analysis_results": {"pylint": [], "bandit": []}, "current_agent": "Static Analysis"}

    async def security_agent(self, state: AgentState):
        print("[Workflow] Running Security Agent (evaluating vulnerability issues)...")
        prompt = f"""You are a Senior Security Engineer. Analyze the code below for security vulnerabilities.

Look for: SQL injection, hardcoded secrets/passwords/tokens, insecure API usage, XSS, CSRF,
unsafe deserialization, command injection, path traversal, weak cryptography, missing auth.

Code:
{state['diff'][:8000]}

Return ONLY a valid JSON array. Each item must have exactly these fields:
{ISSUE_FIELDS}

Example:
{ISSUE_EXAMPLE}

If no security issues found, return: []
Return ONLY the JSON array, no explanation, no markdown."""

        try:
            response = await self.ollama.generate(prompt, "You are a Senior Security Engineer. Return ONLY a valid JSON array.")
            issues_data = extract_json_array(response)
        except Exception:
            import traceback; traceback.print_exc()
            issues_data = []
        print(f"[Security Agent] Found {len(issues_data)} issues")
        return {"issues": issues_data, "current_agent": "Security"}

    async def performance_agent(self, state: AgentState):
        print("[Workflow] Running Performance Agent (evaluating resource issues)...")
        prompt = f"""You are a Performance Optimization Expert. Analyze the code below for performance problems.

Look for: N+1 database queries, inefficient nested loops (O(N²) or worse), memory leaks,
blocking synchronous I/O, repeated expensive computations, missing caching, large data loads.

Code:
{state['diff'][:8000]}

Return ONLY a valid JSON array. Each item must have exactly these fields:
{ISSUE_FIELDS}

If no performance issues found, return: []
Return ONLY the JSON array, no explanation, no markdown."""

        try:
            response = await self.ollama.generate(prompt, "You are a Performance Expert. Return ONLY a valid JSON array.")
            issues_data = extract_json_array(response)
        except Exception:
            import traceback; traceback.print_exc()
            issues_data = []
        print(f"[Performance Agent] Found {len(issues_data)} issues")
        return {"issues": issues_data, "current_agent": "Performance"}

    async def clean_code_agent(self, state: AgentState):
        print("[Workflow] Running Clean Code Agent (evaluating design issues)...")
        prompt = f"""You are a Principal Software Architect. Review the code below for clean code violations.

Check for: non-descriptive variable/function names, functions > 20 lines doing too many things,
code duplication (DRY violations), SOLID principle violations, magic numbers/strings, dead code,
overly complex conditionals, missing error handling.

Code:
{state['diff'][:8000]}

Return ONLY a valid JSON array. Each item must have exactly these fields:
{ISSUE_FIELDS}

If no clean code issues found, return: []
Return ONLY the JSON array, no explanation, no markdown."""

        try:
            response = await self.ollama.generate(prompt, "You are a Principal Software Architect. Return ONLY a valid JSON array.")
            issues_data = extract_json_array(response)
        except Exception:
            import traceback; traceback.print_exc()
            issues_data = []
        print(f"[Clean Code Agent] Found {len(issues_data)} issues")
        return {"issues": issues_data, "current_agent": "Clean Code"}

    async def documentation_agent(self, state: AgentState):
        print("[Workflow] Running Documentation Agent (evaluating comments & docstrings)...")
        prompt = f"""You are a Technical Documentation Expert. Review the code below for documentation quality.

Check for: missing module/class/function docstrings, unclear variable names with no comments,
missing type hints, absence of inline comments on complex logic, undocumented exceptions.

Code:
{state['diff'][:8000]}

Return ONLY a valid JSON array. Each item must have exactly these fields:
{ISSUE_FIELDS}

If no documentation issues found, return: []
Return ONLY the JSON array, no explanation, no markdown."""

        try:
            response = await self.ollama.generate(prompt, "You are a Technical Writer. Return ONLY a valid JSON array.")
            issues_data = extract_json_array(response)
        except Exception:
            import traceback; traceback.print_exc()
            issues_data = []
        print(f"[Documentation Agent] Found {len(issues_data)} issues")
        return {"issues": issues_data, "current_agent": "Documentation"}

    async def summary_agent(self, state: AgentState):
        print("[Workflow] Running Summarizer Agent (compiling final overview)...")
        issues = state.get('issues', [])

        crits = [i for i in issues if isinstance(i, dict) and i.get('severity', '').lower() == 'critical']
        warns = [i for i in issues if isinstance(i, dict) and i.get('severity', '').lower() == 'warning']
        suggs = [i for i in issues if isinstance(i, dict) and i.get('severity', '').lower() == 'suggestion']

        issues_text = "\n".join([
            f"- [{i.get('severity','?').upper()}] {i.get('category','')}: {i.get('issue_description','')}"
            for i in issues
        ]) if issues else "No issues found — the code appears clean."

        prompt = f"""You reviewed code and found these issues:
{issues_text}

Statistics: {len(crits)} critical, {len(warns)} warnings, {len(suggs)} suggestions.

Write a professional 3-4 sentence executive summary of the overall code quality and the most
important findings. Be specific about what was found and what the developer should prioritize.
Do NOT use bullet points — write plain flowing prose only."""

        try:
            summary_text = await self.ollama.generate(
                prompt,
                "You are a Senior Engineering Lead writing a concise executive summary. Use plain prose."
            )
        except Exception:
            import traceback; traceback.print_exc()
            summary_text = (
                f"Scan complete: {len(crits)} critical issue(s), {len(warns)} warning(s), "
                f"{len(suggs)} suggestion(s) identified. Review the flagged items before deploying."
            )

        print(f"[Summarizer] Done. Total issues across all agents: {len(issues)}")
        return {"summary": summary_text.strip(), "current_agent": "Summarizer"}

    async def run(self, diff: str, context: str = ""):
        initial_state = {
            "diff": diff,
            "language": "unknown",
            "files": [],
            "context": context,
            "issues": [],
            "summary": "",
            "current_agent": "Starting",
            "static_analysis_results": {}
        }
        return await self.workflow.ainvoke(initial_state)
