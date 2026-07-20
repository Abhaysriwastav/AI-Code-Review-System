from django.db import models
from repositories.models import PullRequest

class Review(models.Model):
    pull_request = models.ForeignKey(PullRequest, on_delete=models.CASCADE, related_name='reviews')
    summary = models.TextField()
    total_issues = models.IntegerField(default=0)
    critical_issues = models.IntegerField(default=0)
    warning_issues = models.IntegerField(default=0)
    suggestion_issues = models.IntegerField(default=0)
    overall_score = models.FloatField(default=0.0)
    raw_response = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

class ReviewIssue(models.Model):
    review = models.ForeignKey(Review, on_delete=models.CASCADE, related_name='issues')
    file_name = models.CharField(max_length=512)
    line_number = models.IntegerField()
    severity = models.CharField(max_length=20)
    category = models.CharField(max_length=50)
    description = models.TextField()
    explanation = models.TextField()
    suggested_fix = models.TextField()
    improved_code = models.TextField()
    confidence_score = models.FloatField()
    compliance_tag = models.CharField(max_length=100, blank=True, default='')

    def __str__(self):
        return f"{self.severity} - {self.file_name}:{self.line_number}"
