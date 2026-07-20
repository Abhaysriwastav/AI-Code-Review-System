import json
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

@csrf_exempt
def register_user(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST method required'}, status=405)

    try:
        data = json.loads(request.body)
        username = (data.get('username') or '').strip()
        email = (data.get('email') or '').strip().lower()
        password = data.get('password') or ''
        first_name = (data.get('first_name') or '').strip()
        last_name = (data.get('last_name') or '').strip()

        if not username:
            return JsonResponse({'error': 'Username is required'}, status=400)
        if not email:
            return JsonResponse({'error': 'Email is required'}, status=400)
        if not password:
            return JsonResponse({'error': 'Password is required'}, status=400)
        if len(password) < 6:
            return JsonResponse({'error': 'Password must be at least 6 characters long'}, status=400)

        if User.objects.filter(username__iexact=username).exists():
            return JsonResponse({'error': 'Username is already taken'}, status=400)

        if User.objects.filter(email__iexact=email).exists():
            return JsonResponse({'error': 'An account with this email already exists'}, status=400)

        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name
        )

        login(request, user)

        full_name = user.get_full_name() or user.username
        return JsonResponse({
            'message': 'Registration successful',
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'name': full_name,
            }
        }, status=201)

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
def login_user(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST method required'}, status=405)

    try:
        data = json.loads(request.body)
        identifier = (data.get('username') or data.get('email') or '').strip()
        password = data.get('password') or ''

        if not identifier or not password:
            return JsonResponse({'error': 'Please provide username/email and password'}, status=400)

        username = identifier
        if '@' in identifier:
            matched_user = User.objects.filter(email__iexact=identifier).first()
            if matched_user:
                username = matched_user.username

        user = authenticate(request, username=username, password=password)

        if user is None:
            return JsonResponse({'error': 'Invalid credentials. Please check your username/email and password.'}, status=400)

        if not user.is_active:
            return JsonResponse({'error': 'User account is disabled'}, status=400)

        login(request, user)

        full_name = user.get_full_name() or user.username
        return JsonResponse({
            'message': 'Login successful',
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'name': full_name,
            }
        })

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
def logout_user(request):
    if request.method not in ('POST', 'GET'):
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    logout(request)
    return JsonResponse({'message': 'Logged out successfully'})


@csrf_exempt
def get_current_user(request):
    if request.user.is_authenticated:
        full_name = request.user.get_full_name() or request.user.username
        return JsonResponse({
            'authenticated': True,
            'user': {
                'id': request.user.id,
                'username': request.user.username,
                'email': request.user.email,
                'name': full_name,
            }
        })
    return JsonResponse({'authenticated': False, 'user': None})
