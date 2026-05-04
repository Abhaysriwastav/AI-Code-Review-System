from celery import shared_task
import requests
from django.conf import settings
from .models import Review, ReviewIssue
from repositories.models import PullRequest

@shared_task
def process_code_review(pr_id):
    try:
        pr = PullRequest.objects.get(id=pr_id)
        
        # 1. Fetch diff from GitHub
        # This is a placeholder for actual GitHub API call
        diff_content = "def hello():\n    print('world')" 
        
        # 2. Call AI Service
        ai_service_url = f"{settings.AI_SERVICE_URL}/review"
        payload = {
            "diff": diff_content,
            "repo_url": pr.repository.url,
            "pr_number": pr.number,
            "context": f"Previous context for {pr.repository.full_name}"
        }
        
        response = requests.post(ai_service_url, json=payload, timeout=300)
        response.raise_for_status()
        result = response.json()
        
        # 3. Save Review results
        # LangGraph returns the full state, we need to extract issues and summary
        issues_data = result.get("issues", [])
        
        review = Review.objects.create(
            pull_request=pr,
            summary=result.get("summary", ""),
            raw_response=result
        )
        
        for issue in issues_data:
            ReviewIssue.objects.create(
                review=review,
                file_name=issue.get("file_name", "unknown"),
                line_number=issue.get("line_number", 0),
                severity=issue.get("severity", "Suggestion"),
                category=issue.get("category", "Clean Code"),
                description=issue.get("issue_description", ""),
                explanation=issue.get("explanation", ""),
                suggested_fix=issue.get("suggested_fix", ""),
                improved_code=issue.get("improved_code", ""),
                confidence_score=issue.get("confidence_score", 0.0)
            )
            
        return f"Review for PR {pr_id} completed."
        
    except Exception as e:
        return f"Error processing review: {str(e)}"
