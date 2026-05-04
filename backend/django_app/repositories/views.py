from rest_framework import viewsets, permissions
from .models import Repository, PullRequest
from .serializers import RepositorySerializer, PullRequestSerializer

class RepositoryViewSet(viewsets.ModelViewSet):
    serializer_class = RepositorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Repository.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

class PullRequestViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PullRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return PullRequest.objects.filter(repository__owner=self.request.user)
