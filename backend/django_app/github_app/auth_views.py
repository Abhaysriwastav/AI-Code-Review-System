import json
import re
import html
import time
import logging
from typing import Optional
from pydantic import BaseModel, EmailStr, field_validator, ValidationError
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.core.cache import cache
from django.core.mail import send_mail
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

logger = logging.getLogger(__name__)

# Mandatory exact generic auth error message to prevent enumeration
EXACT_AUTH_ERROR = "Incorrect email or password"
PASSWORD_RESET_GENERIC_MESSAGE = "If that email is registered, you'll receive a reset link"


def get_client_ip(request):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', '127.0.0.1')


def sanitize_input(value: str) -> str:
    """
    Sanitizes string inputs by unescaping entities, stripping HTML/script tags,
    removing null bytes/control chars, and trimming whitespace.
    """
    if not isinstance(value, str):
        return ""
    val = html.unescape(value)
    val = re.sub(r'<[^>]*?>', '', val)
    val = re.sub(r'(?i)(javascript:|vbscript:|onload=|onerror=|onclick=)', '', val)
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
        if not (8 <= len(v) <= 128):
            raise ValueError("Password must be between 8 and 128 characters.")
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


class PasswordResetSchema(BaseModel):
    email: EmailStr

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: EmailStr) -> str:
        return sanitize_input(str(v)).lower()


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
            get_client_ip(request),
            e.errors() if isinstance(e, ValidationError) else str(e)
        )
        return JsonResponse({'error': EXACT_AUTH_ERROR}, status=400)

    try:
        # Non-enumerating duplicate user check
        if User.objects.filter(username__iexact=payload.username).exists() or \
           User.objects.filter(email__iexact=payload.email).exists():
            logger.warning("Registration duplicate attempt for username/email: %s / %s", payload.username, payload.email)
            return JsonResponse({'error': EXACT_AUTH_ERROR}, status=400)

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
        return JsonResponse({'error': EXACT_AUTH_ERROR}, status=500)


@csrf_exempt
def login_user(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST method required'}, status=405)

    client_ip = get_client_ip(request)

    # 1. IP Rate Limiting: Max 10 requests per IP per minute
    ip_cache_key = f"ratelimit:ip:{client_ip}"
    ip_requests = cache.get(ip_cache_key, 0)
    if ip_requests >= 10:
        logger.warning("Rate limit exceeded for IP: %s", client_ip)
        return JsonResponse({'error': EXACT_AUTH_ERROR}, status=429)
    cache.set(ip_cache_key, ip_requests + 1, timeout=60)

    try:
        raw_body = json.loads(request.body)
        payload = LoginSchema(**raw_body)
    except (json.JSONDecodeError, ValidationError) as e:
        logger.warning("Login validation failure from IP %s: %s", client_ip, e.errors() if isinstance(e, ValidationError) else str(e))
        return JsonResponse({'error': EXACT_AUTH_ERROR}, status=400)

    identifier = payload.username.lower().strip()
    lockout_key = f"lockout:{identifier}"
    failed_attempts_key = f"failed_attempts:{identifier}"

    # 2. Account Lockout Check (15 minutes = 900 seconds)
    if cache.get(lockout_key):
        logger.warning("Locked out login attempt for %s from IP %s", identifier, client_ip)
        return JsonResponse({'error': EXACT_AUTH_ERROR}, status=400)

    # 3. Progressive Delay based on failed attempt count
    failed_count = cache.get(failed_attempts_key, 0)
    if failed_count > 0:
        delay = min(failed_count * 0.5, 3.0)
        time.sleep(delay)

    try:
        username = payload.username
        matched_user = None
        if '@' in payload.username:
            matched_user = User.objects.filter(email__iexact=payload.username).first()
            if matched_user:
                username = matched_user.username

        user = authenticate(request, username=username, password=payload.password)

        if user is None or not user.is_active:
            new_failed_count = failed_count + 1
            cache.set(failed_attempts_key, new_failed_count, timeout=900)
            logger.info("Failed login attempt #%d for user/email: %s from IP %s", new_failed_count, identifier, client_ip)

            # Lock account if 5 consecutive failed attempts reached
            if new_failed_count >= 5:
                cache.set(lockout_key, True, timeout=900)  # 15 min lockout
                logger.warning("Account locked out for %s after 5 failed attempts.", identifier)

                # Send email notification with reset link
                recipient_email = matched_user.email if matched_user else (payload.username if '@' in payload.username else None)
                if recipient_email:
                    try:
                        send_mail(
                            subject="Security Alert: Account Temporarily Locked",
                            message=(
                                f"Hello,\n\nYour account ({identifier}) was temporarily locked due to 5 consecutive failed login attempts.\n"
                                "If this was you, you can reset your password at: http://localhost:3000/login?reset=true\n"
                                "If this wasn't you, your account remains secure.\n\nBest,\nCode Reviewer Team"
                            ),
                            from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@codereviewer.dev'),
                            recipient_list=[recipient_email],
                            fail_silently=True,
                        )
                        logger.info("Lockout reset notification email sent to %s", recipient_email)
                    except Exception as mail_err:
                        logger.error("Failed to send lockout email: %s", mail_err)

            return JsonResponse({'error': EXACT_AUTH_ERROR}, status=400)

        # Successful Login -> Clear failed attempt counters & lockouts
        cache.delete(failed_attempts_key)
        cache.delete(lockout_key)

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
        return JsonResponse({'error': EXACT_AUTH_ERROR}, status=500)


@csrf_exempt
def request_password_reset(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST method required'}, status=405)

    try:
        raw_body = json.loads(request.body)
        payload = PasswordResetSchema(**raw_body)
    except (json.JSONDecodeError, ValidationError):
        return JsonResponse({'message': PASSWORD_RESET_GENERIC_MESSAGE})

    user = User.objects.filter(email__iexact=payload.email).first()
    if user:
        logger.info("Password reset requested for registered email: %s", payload.email)
        try:
            send_mail(
                subject="Password Reset Request",
                message=f"Hello {user.username},\n\nClick the link to reset your password: http://localhost:3000/login?reset=true\n",
                from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@codereviewer.dev'),
                recipient_list=[user.email],
                fail_silently=True,
            )
        except Exception:
            pass

    return JsonResponse({'message': PASSWORD_RESET_GENERIC_MESSAGE})


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
