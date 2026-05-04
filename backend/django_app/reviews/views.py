from rest_framework import viewsets, permissions
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
