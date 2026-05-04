from rest_framework import viewsets, permissions
from .models import Review, ReviewIssue
from rest_framework import serializers

class ReviewIssueSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReviewIssue
        fields = '__all__'

class ReviewSerializer(serializers.ModelSerializer):
    issues = ReviewIssueSerializer(many=True, read_only=True)
    
    class Meta:
        model = Review
        fields = '__all__'

class ReviewViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ReviewSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Review.objects.filter(pull_request__repository__owner=self.request.user)
