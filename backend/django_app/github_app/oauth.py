import requests
from django.conf import settings
from django.shortcuts import redirect
from django.http import JsonResponse
from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from django.views.decorators.csrf import csrf_exempt
import json

def github_login(request):
    """Redirect to GitHub for authentication."""
    url = f"https://github.com/login/oauth/authorize?client_id={settings.GITHUB_CLIENT_ID}&scope=repo,user"
    return redirect(url)

@csrf_exempt
def github_callback(request):
    """Handle callback from GitHub."""
    code = request.GET.get('code')
    if not code:
        return JsonResponse({'error': 'No code provided'}, status=400)

    # 1. Exchange code for access token
    token_url = "https://github.com/login/oauth/access_token"
    headers = {'Accept': 'application/json'}
    data = {
        'client_id': settings.GITHUB_CLIENT_ID,
        'client_secret': settings.GITHUB_CLIENT_SECRET,
        'code': code,
    }
    
    response = requests.post(token_url, headers=headers, data=data)
    token_data = response.json()
    access_token = token_data.get('access_token')

    if not access_token:
        return JsonResponse({'error': 'Failed to obtain access token'}, status=400)

    # 2. Fetch user info from GitHub
    user_url = "https://api.github.com/user"
    user_headers = {'Authorization': f'token {access_token}'}
    user_response = requests.get(user_url, headers=user_headers)
    github_user = user_response.json()

    # 3. Create or update user in Django
    user, created = User.objects.get_or_create(
        username=github_user['login'],
        defaults={'email': github_user.get('email', '')}
    )

    # 4. Generate DRF token for frontend
    drf_token, _ = Token.objects.get_or_create(user=user)

    # Redirect to frontend with token
    frontend_url = f"{settings.NEXT_PUBLIC_API_URL.replace(':8000', ':3000')}/auth/callback?token={drf_token.key}"
    return redirect(frontend_url)
