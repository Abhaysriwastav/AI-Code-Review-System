from django.urls import path
from . import views, oauth

urlpatterns = [
    path('webhook/', views.github_webhook, name='github_webhook'),
    path('login/', oauth.github_login, name='github_login'),
    path('callback/', oauth.github_callback, name='github_callback'),
    path('scan-local/', views.scan_local_folder, name='scan_local_folder'),
]
