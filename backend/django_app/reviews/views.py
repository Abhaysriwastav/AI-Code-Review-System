from rest_framework import viewsets, permissions
import os
from django.http import JsonResponse
from .models import Review, ReviewIssue
from rest_framework import serializers

class ReviewIssueSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReviewIssue
        fields = '__all__'

class ReviewSerializer(serializers.ModelSerializer):
    issues = ReviewIssueSerializer(many=True, read_only=True)
    pr_title = serializers.CharField(source='pull_request.title', read_only=True)
    repo_name = serializers.CharField(source='pull_request.repository.full_name', read_only=True)
    
    class Meta:
        model = Review
        fields = ['id', 'pr_title', 'repo_name', 'summary', 'overall_score', 
                  'total_issues', 'critical_issues', 'warning_issues', 
                  'suggestion_issues', 'created_at', 'issues']

class ReviewViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ReviewSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        return Review.objects.all().order_by('-created_at')

# New top‑level view that returns the markdown report
def report_view(request):
    """Return the generated code review report markdown.

    The report is stored in the Antigravity IDE artifact directory.
    """
    report_path = os.path.join(os.path.dirname(__file__), 'code_review_report.md')
    try:
        with open(report_path, "r", encoding="utf-8") as f:
            content = f.read()
        return JsonResponse({"markdown": content})
    except FileNotFoundError:
        return JsonResponse({"error": "Report not found"}, status=404)

