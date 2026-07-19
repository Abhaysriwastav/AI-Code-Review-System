from typing import TypedDict, List, Annotated, Dict, Any
from langgraph.graph import StateGraph, END
import operator
import json
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

class CodeReviewWorkflow:
    def __init__(self):
        self.ollama = OllamaClient()
        self.workflow = self._build_workflow()

    def _build_workflow(self):
        builder = StateGraph(AgentState)

        builder.add_node("analyzer", self.analyzer_agent)
        builder.add_node("static_analysis", self.static_analysis_agent)
        builder.add_node("security", self.security_agent)
        builder.add_node("performance", self.performance_agent)
        builder.add_node("clean_code", self.clean_code_agent)
        builder.add_node("documentation", self.documentation_agent)
        builder.add_node("summarizer", self.summary_agent)

        builder.set_entry_point("analyzer")
        builder.add_edge("analyzer", "static_analysis")
        builder.add_edge("static_analysis", "security")
        builder.add_edge("security", "performance")
        builder.add_edge("performance", "clean_code")
        builder.add_edge("clean_code", "documentation")
        builder.add_edge("documentation", "summarizer")
        builder.add_edge("summarizer", END)

        return builder.compile()

    async def analyzer_agent(self, state: AgentState):
        print("\n[Workflow] Starting Code Analysis Workflow...")
        return {"language": "python", "files": ["scan"], "current_agent": "Analyzer"}

    async def static_analysis_agent(self, state: AgentState):
        print("[Workflow] Running Static Analysis Agent...")
        return {"static_analysis_results": {"pylint": [], "bandit": []}, "current_agent": "Static Analysis"}

    async def security_agent(self, state: AgentState):
        print("[Workflow] Running Security Agent (evaluating vulnerability issues)...")
        prompt = f"""Analyze the following code for security vulnerabilities.
Look for: SQL injection, hardcoded secrets, insecure API usage, XSS, CSRF, unsafe dependencies.

Code:
{state['diff'][:3000]}

List each issue as a JSON array with fields: category, severity (critical/warning/suggestion), issue_description, file_name, line_number.
Return ONLY valid JSON array, no markdown. Example: [{{"category":"security","severity":"critical","issue_description":"...","file_name":"app.py","line_number":10}}]
If no issues found return: []"""
        try:
            response = await self.ollama.generate(prompt, "You are a Senior Security Engineer. Return ONLY a valid JSON array of issues.")
            response = response.strip()
            if "```" in response:
                response = response.split("```")[1].replace("json","").strip()
            issues_data = __import__('json').loads(response) if response and response != "[]" else []
        except Exception as e:
            import traceback; traceback.print_exc()
            issues_data = []
        return {"issues": issues_data, "current_agent": "Security"}

    async def performance_agent(self, state: AgentState):
        print("[Workflow] Running Performance Agent (evaluating resource issues)...")
        prompt = f"""Analyze the following code for performance issues.
Look for: inefficient loops, N+1 queries, memory leaks, blocking I/O, redundant computations.

Code:
{state['diff'][:3000]}

List each issue as a JSON array with fields: category, severity (critical/warning/suggestion), issue_description, file_name, line_number.
Return ONLY valid JSON array. If no issues found return: []"""
        try:
            response = await self.ollama.generate(prompt, "You are a Performance Optimization Expert. Return ONLY a valid JSON array.")
            response = response.strip()
            if "```" in response:
                response = response.split("```")[1].replace("json","").strip()
            issues_data = __import__('json').loads(response) if response and response != "[]" else []
        except Exception as e:
            import traceback; traceback.print_exc()
            issues_data = []
        return {"issues": issues_data, "current_agent": "Performance"}

    async def clean_code_agent(self, state: AgentState):
        print("[Workflow] Running Clean Code Agent (evaluating design issues)...")
        prompt = f"""Review this code for clean code violations.
Check: naming conventions, function length, code duplication (DRY), SOLID principles, complexity.

Code:
{state['diff'][:3000]}

List each issue as a JSON array with fields: category, severity (critical/warning/suggestion), issue_description, file_name, line_number.
Return ONLY valid JSON array. If no issues return: []"""
        try:
            response = await self.ollama.generate(prompt, "You are a Principal Software Architect. Return ONLY a valid JSON array.")
            response = response.strip()
            if "```" in response:
                response = response.split("```")[1].replace("json","").strip()
            issues_data = __import__('json').loads(response) if response and response != "[]" else []
        except Exception as e:
            import traceback; traceback.print_exc()
            issues_data = []
        return {"issues": issues_data, "current_agent": "Clean Code"}

    async def documentation_agent(self, state: AgentState):
        print("[Workflow] Running Documentation Agent (evaluating comments & docstrings)...")
        prompt = f"""Review this code for documentation quality.
Check: missing docstrings, unclear variable names, lack of comments on complex logic.

Code:
{state['diff'][:3000]}

List each issue as a JSON array with fields: category, severity (critical/warning/suggestion), issue_description, file_name, line_number.
Return ONLY valid JSON array. If no issues return: []"""
        try:
            response = await self.ollama.generate(prompt, "You are a Technical Writer. Return ONLY a valid JSON array.")
            response = response.strip()
            if "```" in response:
                response = response.split("```")[1].replace("json","").strip()
            issues_data = __import__('json').loads(response) if response and response != "[]" else []
        except Exception as e:
            import traceback; traceback.print_exc()
            issues_data = []
        return {"issues": issues_data, "current_agent": "Documentation"}

    async def summary_agent(self, state: AgentState):
        print("[Workflow] Running Summarizer Agent (compiling final overview)...")
        issues = state.get('issues', [])
        issues_text = "\n".join([f"- [{i.get('severity','?').upper()}] {i.get('category','')}: {i.get('issue_description','')}" for i in issues]) if issues else "No issues found."
        
        prompt = f"""You reviewed code and found these issues:
{issues_text}

Write a professional 2-3 sentence summary of the code quality and the most important findings.
Be specific and actionable. Do NOT use bullet points, just plain text."""
        try:
            summary_text = await self.ollama.generate(prompt, "You are a Senior Code Review Lead. Be concise and professional.")
        except Exception as e:
            import traceback; traceback.print_exc()
            total = len(issues)
            crits = sum(1 for i in issues if i.get('severity') == 'critical')
            summary_text = f"Found {total} issue(s), {crits} critical. Review the flagged items before merging."
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
