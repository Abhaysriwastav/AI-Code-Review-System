from django.contrib import admin
from django.urls import path, include
from rest_framework import routers

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/repositories/', include('repositories.urls')),
    path('api/reviews/', include('reviews.urls')),
    path('api/github/', include('github_app.urls')),
]
