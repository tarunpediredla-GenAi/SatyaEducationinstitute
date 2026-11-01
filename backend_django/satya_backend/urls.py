from django.urls import path
from api import views

urlpatterns = [
    path("api/catalog", views.catalog_view, name="catalog"),
    path("api/cart/verify", views.verify_cart_view, name="verify_cart"),
    path("api/cashfree/create-order", views.create_cashfree_order_view, name="create_order"),
    path("api/cashfree/verify-order", views.verify_cashfree_order_view, name="verify_order"),
    path("api/cashfree/webhook", views.cashfree_webhook_view, name="cashfree_webhook"),
    path("api/content/signed-url", views.signed_content_url_view, name="signed_content_url"),
    path("api/admin/overview", views.admin_overview_view, name="admin_overview"),
    path("api/admin/action", views.admin_action_view, name="admin_action"),
]
