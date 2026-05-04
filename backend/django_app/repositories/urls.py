from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RepositoryViewSet, PullRequestViewSet

router = DefaultRouter()
router.register(r'repos', RepositoryViewSet, basename='repository')
router.register(r'prs', PullRequestViewSet, basename='pullrequest')

urlpatterns = [
    path('', include(router.urls)),
]
