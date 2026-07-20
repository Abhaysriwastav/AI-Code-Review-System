from django.urls import path
from . import views, oauth, auth_views

urlpatterns = [
    path('webhook/', views.github_webhook, name='github_webhook'),
    path('login/', oauth.github_login, name='github_login'),
    path('callback/', oauth.github_callback, name='github_callback'),
    path('scan-local/', views.scan_local_folder, name='scan_local_folder'),
    path('list-folders/', views.list_desktop_folders, name='list_desktop_folders'),
    path('chat/', views.chat_about_issue, name='chat_about_issue'),
    
    # Auth Endpoints
    path('auth/register/', auth_views.register_user, name='auth_register'),
    path('auth/login/', auth_views.login_user, name='auth_login'),
    path('auth/logout/', auth_views.logout_user, name='auth_logout'),
    path('auth/me/', auth_views.get_current_user, name='auth_me'),
    path('auth/password-reset/', auth_views.request_password_reset, name='auth_password_reset'),
]
