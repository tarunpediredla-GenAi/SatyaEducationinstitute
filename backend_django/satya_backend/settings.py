"""
Django settings for Satya's Education Vercel Serverless Backend.
Uses Firebase Admin SDK on the server and Cashfree Payment Gateway (INR).
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "django-insecure-replace-in-vercel-production-env")
DEBUG = os.environ.get("DJANGO_DEBUG", "False").lower() == "true"

ALLOWED_HOSTS = [
    "localhost",
    "127.0.0.1",
    ".vercel.app",
    ".run.app",
]
if os.environ.get("CUSTOM_DOMAIN"):
    ALLOWED_HOSTS.append(os.environ["CUSTOM_DOMAIN"])

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "api",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "satya_backend.urls"
WSGI_APPLICATION = "satya_backend.wsgi.application"

# Database is Cloud Firestore accessed via Firebase Admin SDK
DATABASES = {}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
