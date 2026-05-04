from django.db import models
from django.contrib.auth.models import User

class Repository(models.Model):
    name = models.CharField(max_length=255)
    full_name = models.CharField(max_length=255, unique=True)
    github_id = models.BigIntegerField(unique=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='repositories')
    url = models.URLField()
    is_active = models.BooleanField(default=True)
    last_indexed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.full_name

class PullRequest(models.Model):
    repository = models.ForeignKey(Repository, on_delete=models.CASCADE, related_name='pull_requests')
    number = models.IntegerField()
    title = models.CharField(max_length=255)
    github_id = models.BigIntegerField(unique=True)
    state = models.CharField(max_length=20) # open, closed, merged
    diff_url = models.URLField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('repository', 'number')

    def __str__(self):
        return f"{self.repository.full_name} #{self.number}"
