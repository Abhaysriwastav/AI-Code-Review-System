import json
import re
import html
import logging
from typing import Optional
from pydantic import BaseModel, EmailStr, field_validator, ValidationError
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

logger = logging.getLogger(__name__)

GENERIC_VALIDATION_ERROR = "Invalid request data. Please check your inputs and try again."


def sanitize_input(value: str) -> str:
    """
    Sanitizes string inputs by unescaping entities, stripping HTML/script tags,
    removing null bytes/control chars, and trimming whitespace.
    """
    if not isinstance(value, str):
        return ""
    # Unescape HTML entities first (e.g. &lt;script&gt; -> <script>)
    val = html.unescape(value)
    # Strip HTML and XML tags
    val = re.sub(r'<[^>]*?>', '', val)
    # Strip dangerous script/event attributes patterns
    val = re.sub(r'(?i)(javascript:|vbscript:|onload=|onerror=|onclick=)', '', val)
    # Remove null bytes and non-printable control characters
    val = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', val)
    return val.strip()


class RegisterSchema(BaseModel):
    username: str
    email: EmailStr
    password: str
    first_name: Optional[str] = ""
    last_name: Optional[str] = ""

    @field_validator('username')
    @classmethod
    def validate_username(cls, v: str) -> str:
        clean = sanitize_input(v)
        if not (3 <= len(clean) <= 30):
            raise ValueError("Username must be between 3 and 30 characters.")
        if not re.match(r'^[a-zA-Z0-9_.-]+$', clean):
            raise ValueError("Username contains invalid characters.")
        return clean

    @field_validator('email')
    @classmethod
    def validate_email_sanitized(cls, v: EmailStr) -> str:
        clean = sanitize_input(str(v)).lower()
        if not (5 <= len(clean) <= 254):
            raise ValueError("Email length invalid.")
        return clean

    @field_validator('password')
    @classmethod
    def validate_password_length(cls, v: str) -> str:
        if not (6 <= len(v) <= 128):
            raise ValueError("Password must be between 6 and 128 characters.")
        return v

    @field_validator('first_name', 'last_name')
    @classmethod
    def validate_names(cls, v: Optional[str]) -> str:
        clean = sanitize_input(v or "")
        if len(clean) > 50:
            raise ValueError("Display name exceeds maximum allowed length.")
        return clean


class LoginSchema(BaseModel):
    username: str
    password: str

    @field_validator('username')
    @classmethod
    def validate_identifier(cls, v: str) -> str:
        clean = sanitize_input(v)
        if not (3 <= len(clean) <= 254):
            raise ValueError("Identifier length invalid.")
        return clean

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not (1 <= len(v) <= 128):
            raise ValueError("Password length invalid.")
        return v


@csrf_exempt
def register_user(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST method required'}, status=405)

    try:
        raw_body = json.loads(request.body)
        payload = RegisterSchema(**raw_body)
    except (json.JSONDecodeError, ValidationError) as e:
        logger.warning(
            "Registration validation failure from IP %s: %s",
            request.META.get('REMOTE_ADDR'),
            e.errors() if isinstance(e, ValidationError) else str(e)
        )
        return JsonResponse({'error': GENERIC_VALIDATION_ERROR}, status=400)

    try:
        if User.objects.filter(username__iexact=payload.username).exists():
            return JsonResponse({'error': 'Username is already taken'}, status=400)

        if User.objects.filter(email__iexact=payload.email).exists():
            return JsonResponse({'error': 'An account with this email already exists'}, status=400)

        user = User.objects.create_user(
            username=payload.username,
            email=payload.email,
            password=payload.password,
            first_name=payload.first_name,
            last_name=payload.last_name
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
        logger.error("Unexpected error during user registration: %s", e, exc_info=True)
        return JsonResponse({'error': 'An unexpected server error occurred'}, status=500)


@csrf_exempt
def login_user(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST method required'}, status=405)

    try:
        raw_body = json.loads(request.body)
        payload = LoginSchema(**raw_body)
    except (json.JSONDecodeError, ValidationError) as e:
        logger.warning(
            "Login validation failure from IP %s: %s",
            request.META.get('REMOTE_ADDR'),
            e.errors() if isinstance(e, ValidationError) else str(e)
        )
        return JsonResponse({'error': GENERIC_VALIDATION_ERROR}, status=400)

    try:
        username = payload.username
        if '@' in payload.username:
            matched_user = User.objects.filter(email__iexact=payload.username).first()
            if matched_user:
                username = matched_user.username

        user = authenticate(request, username=username, password=payload.password)

        if user is None:
            logger.info("Failed login attempt for user/email: %s", payload.username)
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
        logger.error("Unexpected error during user login: %s", e, exc_info=True)
        return JsonResponse({'error': 'An unexpected server error occurred'}, status=500)


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
