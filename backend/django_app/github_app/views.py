import json
import hmac
import hashlib
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from .models import GithubWebhookLog
from repositories.models import Repository, PullRequest
from reviews.tasks import process_code_review

@csrf_exempt
def github_webhook(request):
    if request.method != 'POST':
        return HttpResponse(status=405)

    # Verify webhook signature (optional but recommended)
    # signature = request.headers.get('X-Hub-Signature-256')
    # ... verification logic ...

    event = request.headers.get('X-GitHub-Event')
    payload = json.loads(request.body)

    if event == 'pull_request':
        action = payload.get('action')
        pr_data = payload.get('pull_request')
        repo_data = payload.get('repository')

        if action in ['opened', 'synchronize']:
            # 1. Update/Create Repository
            repo, _ = Repository.objects.get_or_create(
                github_id=repo_data['id'],
                defaults={
                    'name': repo_data['name'],
                    'full_name': repo_data['full_name'],
                    'url': repo_data['html_url'],
                    'owner': request.user # This needs better user handling in real app
                }
            )

            # 2. Update/Create PR
            pr, _ = PullRequest.objects.update_or_create(
                repository=repo,
                number=payload['number'],
                defaults={
                    'title': pr_data['title'],
                    'github_id': pr_data['id'],
                    'state': pr_data['state'],
                    'diff_url': pr_data['diff_url'],
                }
            )

            # 3. Trigger AI Review Task
            process_code_review.delay(pr.id)

            return JsonResponse({'status': 'Review triggered'})

    return JsonResponse({'status': 'Ignored'})

@csrf_exempt
def scan_local_folder(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    
    try:
        data = json.loads(request.body)
        path = data.get('path')
        if not path:
            return JsonResponse({'error': 'Path required'}, status=400)

        import requests
        ai_service_url = f"{settings.AI_SERVICE_URL}/scan-local"
        response = requests.post(ai_service_url, json={'path': path})
        
        return JsonResponse(response.json())
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
