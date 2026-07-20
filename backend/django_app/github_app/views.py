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

        # Run the scan in a background thread so we return immediately
        import threading

        def run_scan(path):
            try:
                import requests as http_requests
                ai_service_url = f"{settings.AI_SERVICE_URL}/scan-local"
                # Use a 10-minute timeout — Ollama on CPU is slow
                response = http_requests.post(ai_service_url, json={'path': path}, timeout=600)
                if response.status_code != 200:
                    raise Exception(f"AI Service returned status code {response.status_code}: {response.text}")
                ai_result = response.json()

                from reviews.models import Review
                from repositories.models import Repository, PullRequest
                from django.contrib.auth.models import User

                system_user, _ = User.objects.get_or_create(
                    username='local_scanner',
                    defaults={'email': 'scanner@local.dev'}
                )
                local_repo, _ = Repository.objects.get_or_create(
                    github_id=0,
                    defaults={
                        'name': 'Local Scans',
                        'full_name': 'local/scans',
                        'url': 'http://localhost',
                        'owner': system_user,
                    }
                )
                scan_number = PullRequest.objects.filter(repository=local_repo).count() + 1
                local_pr = PullRequest.objects.create(
                    repository=local_repo,
                    title=f"Local Scan: {path}",
                    github_id=-(scan_number),
                    number=scan_number,
                    state="completed",
                    diff_url="http://localhost",
                )
                issues_list = ai_result.get('issues', [])
                crits = sum(1 for i in issues_list if isinstance(i, dict) and i.get('severity','').lower() == 'critical')
                warnings = sum(1 for i in issues_list if isinstance(i, dict) and i.get('severity','').lower() == 'warning')
                suggestions = sum(1 for i in issues_list if isinstance(i, dict) and i.get('severity','').lower() == 'suggestion')

                # Compute score dynamically: start at 100 and deduct per issue severity
                # Clean repos get 95, floor is 20 for very buggy code
                total_issues = len(issues_list)
                if total_issues == 0:
                    computed_score = 95.0
                else:
                    computed_score = max(20.0, 100.0 - (crits * 5) - (warnings * 3) - (suggestions * 1))

                review = Review.objects.create(
                    pull_request=local_pr,
                    summary=ai_result.get('summary', f'Local scan of {path}'),
                    overall_score=computed_score,
                    total_issues=len(issues_list),
                    critical_issues=crits,
                    warning_issues=warnings,
                    suggestion_issues=suggestions,
                    raw_response=ai_result,
                )

                from reviews.models import ReviewIssue
                # Confidence defaults by severity when AI doesn't emit one
                sev_confidence_defaults = {'critical': 0.92, 'warning': 0.78, 'suggestion': 0.65}
                for issue in issues_list:
                    if isinstance(issue, dict):
                        sev_key = issue.get('severity', 'suggestion').lower()
                        default_conf = sev_confidence_defaults.get(sev_key, 0.70)
                        ReviewIssue.objects.create(
                            review=review,
                            file_name=issue.get('file_name', 'unknown'),
                            line_number=issue.get('line_number', 0),
                            severity=issue.get('severity', 'Suggestion'),
                            category=issue.get('category', 'Clean Code'),
                            description=issue.get('issue_description', ''),
                            explanation=issue.get('explanation', ''),
                            suggested_fix=issue.get('suggested_fix', ''),
                            improved_code=issue.get('improved_code', ''),
                            confidence_score=float(issue.get('confidence_score') or default_conf),
                            compliance_tag=issue.get('compliance_tag', ''),
                        )
            except Exception as e:
                import traceback
                print(f"[scan_local background error] {e}\n{traceback.format_exc()}")

        thread = threading.Thread(target=run_scan, args=(path,), daemon=True)
        thread.start()

        return JsonResponse({
            'status': 'scanning',
            'message': f'AI agents started scanning "{path}". Results will appear in the dashboard in 2-5 minutes.',
            'path': path
        })

    except Exception as e:
        import traceback
        return JsonResponse({'error': str(e), 'trace': traceback.format_exc()}, status=500)

@csrf_exempt
def list_desktop_folders(request):
    """List folders at a given subpath under /desktop. Accepts ?path=sub/folder"""
    try:
        import requests
        subpath = request.GET.get('path', '')
        ai_service_url = f"{settings.AI_SERVICE_URL}/list-desktop-folders"
        response = requests.get(ai_service_url, params={'path': subpath})
        return JsonResponse(response.json())
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
def chat_about_issue(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    try:
        import requests
        body = json.loads(request.body)
        ai_service_url = f"{settings.AI_SERVICE_URL}/chat"
        response = requests.post(ai_service_url, json=body, timeout=300)
        return JsonResponse(response.json(), status=response.status_code)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

