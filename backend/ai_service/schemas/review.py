from typing import List, Optional
from pydantic import BaseModel, Field
from enum import Enum

class Severity(str, Enum):
    CRITICAL = "Critical"
    WARNING = "Warning"
    SUGGESTION = "Suggestion"

class Category(str, Enum):
    SECURITY = "Security"
    PERFORMANCE = "Performance"
    CLEAN_CODE = "Clean Code"
    DOCUMENTATION = "Documentation"
    ARCHITECTURE = "Architecture"

class CodeIssue(BaseModel):
    file_name: str
    line_number: int
    severity: Severity
    category: Category
    issue_description: str
    explanation: str
    suggested_fix: str
    improved_code: str
    confidence_score: float = Field(..., ge=0, le=1)
    compliance_tag: Optional[str] = ""

class ReviewSummary(BaseModel):
    total_issues: int
    critical_issues: int
    warning_issues: int
    suggestion_issues: int
    overall_score: float
    summary_text: str

class FullReview(BaseModel):
    issues: List[CodeIssue]
    summary: ReviewSummary
    repository_context_used: bool = False

class AgentProgress(BaseModel):
    agent_name: str
    status: str
    message: str
    percentage: float
