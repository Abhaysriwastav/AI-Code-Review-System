from typing import TypedDict, List, Annotated, Dict
from langgraph.graph import StateGraph, END
import operator
import json
from schemas.review import CodeIssue, FullReview, ReviewSummary, Severity, Category
from ollama_client import OllamaClient
from static_analysis import StaticAnalyzer

class AgentState(TypedDict):
    diff: str
    language: str
    files: List[str]
    context: str
    issues: Annotated[List[CodeIssue], operator.add]
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
        prompt = f"""
        Analyze this GitHub diff and identify:
        1. Primary programming language
        2. List of files changed
        
        Diff:
        {state['diff']}
        """
        # In production, we'd use a lightweight model or regex for this
        return {"language": "python", "files": ["main.py"], "current_agent": "Analyzer"}

    async def static_analysis_agent(self, state: AgentState):
        # Placeholder: in a real setup, we'd need the actual file content, not just the diff
        # For now, we simulate static analysis results
        return {"static_analysis_results": {"pylint": [], "bandit": []}, "current_agent": "Static Analysis"}

    async def security_agent(self, state: AgentState):
        prompt = f"Analyze the following code for security vulnerabilities, secret leaks, and unsafe patterns. Consider these files: {state['files']}\n\nCode Diff:\n{state['diff']}"
        system = """You are a Senior Security Engineer. 
        Detect: SQL injection, XSS, CSRF, insecure API usage, hardcoded secrets, and unsafe dependencies.
        Return issues in JSON format matching the CodeIssue schema."""
        
        # Simulating structured generation
        issues = [] # await self.ollama.generate_structured(prompt, List[CodeIssue], system)
        return {"issues": issues, "current_agent": "Security"}

    async def performance_agent(self, state: AgentState):
        prompt = f"Analyze the following code for performance bottlenecks, inefficient loops, and memory leaks.\n\nCode Diff:\n{state['diff']}"
        system = "You are a Performance Optimization Expert. Focus on complexity, DB query efficiency, and resource management."
        return {"issues": [], "current_agent": "Performance"}

    async def clean_code_agent(self, state: AgentState):
        prompt = f"Check for readability, architectural consistency, and clean code principles (SOLID, DRY).\n\nCode Diff:\n{state['diff']}"
        system = "You are a Principal Software Architect. Check for naming conventions, modularity, and maintainability."
        return {"issues": [], "current_agent": "Clean Code"}

    async def documentation_agent(self, state: AgentState):
        prompt = f"Evaluate the documentation and suggest updates for the changed code.\n\nCode Diff:\n{state['diff']}"
        system = "You are a Technical Writer. Ensure docstrings, README updates, and complex logic explanations are present."
        return {"issues": [], "current_agent": "Documentation"}

    async def summary_agent(self, state: AgentState):
        issues_summary = "\n".join([f"- {i.category}: {i.issue_description}" for i in state['issues']])
        prompt = f"Summarize the following code review findings and provide an overall score (0-100).\n\nFindings:\n{issues_summary}"
        system = "You are a Final Review Aggregator. Prioritize issues and generate a professional summary."
        
        summary_text = "Overall, the code looks good but has some security concerns."
        return {"summary": summary_text, "current_agent": "Summarizer"}

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
