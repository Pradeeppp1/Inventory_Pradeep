from .models import UserProfile


def user_flags(request):
    flags = {
        "is_app_admin": False,
        "is_app_manager": False,
        "is_app_accountant": False,
        "is_app_salesman": False,
        "is_app_receptionist": False,
        "is_app_staff": False,
        "is_app_approved": False,
        "user_role": None,
        # Permission booleans for template rendering
        "can_view_expenses": False,
        "can_view_billing": False,
        "can_view_customers": False,
        "can_view_reports": False,
        "can_edit_inventory": False,
    }
    user = request.user
    if not user.is_authenticated:
        return flags
    profile = getattr(user, "userprofile", None)
    if not profile or not profile.is_approved:
        return flags

    role = profile.role
    flags["is_app_approved"] = True
    flags["user_role"] = role
    flags["is_app_admin"] = role == UserProfile.Role.ADMIN
    flags["is_app_manager"] = role == UserProfile.Role.MANAGER
    flags["is_app_accountant"] = role == UserProfile.Role.ACCOUNTANT
    flags["is_app_salesman"] = role == UserProfile.Role.SALESMAN
    flags["is_app_receptionist"] = role == UserProfile.Role.RECEPTIONIST
    flags["is_app_staff"] = role == UserProfile.Role.STAFF

    # Inventory view is allowed for everyone approved
    # Editing inventory (adding items, adjusting stock) is for Admin, Manager, Accountant
    flags["can_edit_inventory"] = role in (UserProfile.Role.ADMIN, UserProfile.Role.MANAGER, UserProfile.Role.ACCOUNTANT)

    # Expenses tab: Admin, Manager, Accountant, Staff (Salesman and Receptionist focus on customer/dues & billing)
    flags["can_view_expenses"] = role in (UserProfile.Role.ADMIN, UserProfile.Role.MANAGER, UserProfile.Role.ACCOUNTANT, UserProfile.Role.STAFF)

    # Billing (Sales bills): Admin, Manager, Accountant, Salesperson, Receptionist, Staff
    flags["can_view_billing"] = True

    # Customer details & dues: Everyone approved (Admin, Manager, Accountant, Salesperson, Receptionist, Staff)
    flags["can_view_customers"] = True

    # Reports: Admin, Manager, Accountant (Accountant gets full financial reporting)
    flags["can_view_reports"] = role in (UserProfile.Role.ADMIN, UserProfile.Role.MANAGER, UserProfile.Role.ACCOUNTANT)

    return flags
