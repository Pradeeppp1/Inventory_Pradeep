from django.urls import path

from . import views

urlpatterns = [
    path("login/", views.login_view, name="login"),
    path("register/", views.register_view, name="register"),
    path("logout/", views.logout_view, name="logout"),
    path("", views.landing_page, name="landing_page"),
    path("dashboard/", views.dashboard, name="dashboard"),
    path("pending-approval/", views.pending_approval, name="pending_approval"),
    path("admin-dashboard/", views.admin_dashboard, name="admin_dashboard"),
    path("approve-user/<int:user_id>/", views.approve_user, name="approve_user"),
    path("api/summary/", views.api_summary, name="api_summary"),
    path("api/categories/", views.api_categories, name="api_categories"),
    path("api/transactions/", views.api_transactions, name="api_transactions"),
    path(
        "api/transactions/<int:pk>/",
        views.api_transaction_detail,
        name="api_transaction_detail",
    ),
    path("expenses/", views.expenses_page, name="expenses"),
    path("customers/", views.customers_page, name="customers"),
    path("inventory/", views.inventory_page, name="inventory"),
    path("reports/", views.reports_page, name="reports"),
    path("api/customers/", views.api_customers, name="api_customers"),
    path(
        "api/customers/<int:pk>/ledger/",
        views.api_customer_ledger,
        name="api_customer_ledger",
    ),
    path("api/reports/", views.api_reports, name="api_reports"),
    path("api/inventory/", views.api_inventory, name="api_inventory"),
    path("api/inventory/<int:pk>/", views.api_inventory_detail, name="api_inventory_detail"),
    path("api/inventory/<int:pk>/adjust/", views.api_inventory_adjust, name="api_inventory_adjust"),
]
