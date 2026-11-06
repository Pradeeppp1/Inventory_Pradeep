import json
import hashlib
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation

from django.contrib.auth import login, logout
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib.auth.forms import AuthenticationForm
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction as db_transaction
from django.db.models import F, Sum
from django.http import HttpResponseForbidden, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods
from django.contrib.auth.models import User

from .models import AuditEvent, Category, Customer, InventoryItem, Transaction, UserProfile, SalesBill, SalesBillItem
from .forms import CustomUserCreationForm

def is_approved(user):
    return hasattr(user, "userprofile") and user.userprofile.is_approved

def get_user_role(user):
    if not is_approved(user):
        return None
    return user.userprofile.role

def is_admin(user):
    return get_user_role(user) == UserProfile.Role.ADMIN

def can_access_reports(user):
    # Admin, Manager, and Accountant have access to reports & financials
    return get_user_role(user) in (UserProfile.Role.ADMIN, UserProfile.Role.MANAGER, UserProfile.Role.ACCOUNTANT)

def can_access_expenses(user):
    # Admin, Manager, and Accountant manage daily expenses; Salesperson & Receptionist focus on billing/customers
    return get_user_role(user) in (UserProfile.Role.ADMIN, UserProfile.Role.MANAGER, UserProfile.Role.ACCOUNTANT, UserProfile.Role.STAFF)

def can_access_billing(user):
    # Salesperson, Receptionist, Accountant, Manager, Admin all have billing/sales bills access
    return get_user_role(user) in (
        UserProfile.Role.ADMIN,
        UserProfile.Role.MANAGER,
        UserProfile.Role.ACCOUNTANT,
        UserProfile.Role.SALESMAN,
        UserProfile.Role.RECEPTIONIST,
        UserProfile.Role.STAFF,
    )

def can_access_customers(user):
    # Receptionist, Salesperson, Accountant, Manager, Admin can view customer details & dues
    return get_user_role(user) in (
        UserProfile.Role.ADMIN,
        UserProfile.Role.MANAGER,
        UserProfile.Role.ACCOUNTANT,
        UserProfile.Role.SALESMAN,
        UserProfile.Role.RECEPTIONIST,
        UserProfile.Role.STAFF,
    )

def can_edit_inventory(user):
    # Everyone can VIEW inventory, but only Admin, Manager, Accountant can create/edit/delete/adjust items
    return get_user_role(user) in (UserProfile.Role.ADMIN, UserProfile.Role.MANAGER, UserProfile.Role.ACCOUNTANT)

approved_required           = user_passes_test(is_approved, login_url="pending_approval")
admin_required              = user_passes_test(is_admin, login_url="dashboard")
manager_or_admin_required   = user_passes_test(can_access_reports, login_url="dashboard")
expenses_access_required    = user_passes_test(can_access_expenses, login_url="dashboard")
billing_access_required     = user_passes_test(can_access_billing, login_url="dashboard")
customers_access_required   = user_passes_test(can_access_customers, login_url="dashboard")

MAX_JSON_BYTES = 64 * 1024
LOGIN_FAIL_LIMIT = 5         # lock after 5 bad attempts (was 8)
LOGIN_FAIL_WINDOW = 300      # count failures over 5 minutes
LOGIN_LOCK_SECONDS = 900     # lock out for 15 minutes (was 10)
REMEMBERED_SESSION_SECONDS = 60 * 60 * 8
REGISTER_LIMIT = 3           # max 3 registrations per hour per IP (was 5)
REGISTER_WINDOW = 3600


def _client_ip(request):
    return request.META.get("REMOTE_ADDR") or "unknown"


def _cache_token(value):
    return hashlib.sha256((value or "unknown").encode("utf-8")).hexdigest()


def _login_attempt_keys(ip, username):
    keys = [(f"login_fail_ip:{_cache_token(ip)}", f"login_lock_ip:{_cache_token(ip)}")]
    if username:
        token = _cache_token(username.strip().lower())
        keys.append((f"login_fail_acct:{token}", f"login_lock_acct:{token}"))
    return keys


def _safe_next_url(request):
    candidate = request.POST.get("next") or request.GET.get("next")
    if candidate and url_has_allowed_host_and_scheme(
        candidate,
        allowed_hosts={request.get_host()},
        require_https=request.is_secure(),
    ):
        return candidate
    return None


def csrf_failure(request, reason=""):
    return HttpResponseForbidden("Security check failed. Please refresh the page and try again.")


def _parse_date_param(value):
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return False


def _audit(actor, action, target, summary=""):
    AuditEvent.objects.create(
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action=action,
        target_model=target.__class__.__name__,
        target_id=str(getattr(target, "pk", "")),
        summary=summary[:2000],
    )


def _audit_auth(action, request, *, username="", user=None, summary=""):
    ip = _client_ip(request)
    identifier_hash = _cache_token(username.strip().lower()) if username else ""
    details = [f"ip={ip}"]
    if identifier_hash:
        details.append(f"identifier_hash={identifier_hash[:16]}")
    if summary:
        details.append(summary)
    AuditEvent.objects.create(
        actor=user if action == "auth.login.success" and getattr(user, "is_authenticated", False) else None,
        action=action,
        target_model="User",
        target_id=str(getattr(user, "pk", "")) if user else "",
        summary="; ".join(details)[:2000],
    )


def _parse_decimal(value, field_name, *, min_value=None, max_value=None):
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(f"Invalid {field_name}")
    if not parsed.is_finite():
        raise ValueError(f"Invalid {field_name}")
    if min_value is not None and parsed < Decimal(str(min_value)):
        raise ValueError(f"{field_name.capitalize()} is too low")
    if max_value is not None and parsed > Decimal(str(max_value)):
        raise ValueError(f"{field_name.capitalize()} is too high")
    return parsed


def _calculate_net_amount(subtotal, discount, discount_type):
    if discount_type == "percent":
        if discount > Decimal("100"):
            raise ValueError("Discount percent cannot exceed 100")
        discount_amount = subtotal * (discount / Decimal("100"))
    else:
        if discount > subtotal:
            raise ValueError("Discount cannot exceed subtotal")
        discount_amount = discount
    return subtotal - discount_amount


def _optional_email(value):
    email = (value or "").strip()[:254]
    if not email:
        return ""
    try:
        validate_email(email)
    except ValidationError:
        raise ValueError("Invalid email address")
    return email


def _resolve_login_username(identifier):
    if not identifier:
        return ""
    clean = identifier.strip()

    # 1. Match by Email / Gmail
    if "@" in clean:
        u = User.objects.filter(email__iexact=clean).first()
        if u:
            return u.username

    # 2. Match by exact username
    u = User.objects.filter(username__iexact=clean).first()
    if u:
        return u.username

    # 3. Match by Staff ID or Mobile Phone (stored in last_name: "STAFF_ID|PHONE")
    target = clean.upper()
    phone_clean = re.sub(r"\D", "", clean)
    for cand in User.objects.exclude(last_name=""):
        parts = cand.last_name.split("|")
        staff_part = parts[0].strip().upper()
        if staff_part == target:
            return cand.username
        if len(parts) > 1 and phone_clean:
            cand_phone = re.sub(r"\D", "", parts[1])
            if cand_phone and cand_phone == phone_clean:
                return cand.username

    # 4. Normalized match (e.g. "ecolith enterprises" -> "Ecolith.Enterprises")
    norm_input = re.sub(r"[\s._-]+", "", clean).lower()
    if norm_input in {"ecolithenterprises", "ecolithenterprise"}:
        only_active_user = User.objects.filter(is_active=True).order_by("id")
        if only_active_user.count() == 1:
            return only_active_user.first().username
        business_admin = User.objects.filter(
            is_active=True,
            userprofile__is_approved=True,
            userprofile__role=UserProfile.Role.ADMIN,
        ).order_by("id").first()
        if business_admin:
            return business_admin.username

    if norm_input:
        for cand in User.objects.all():
            norm_u = re.sub(r"[\s._-]+", "", cand.username).lower()
            if norm_u == norm_input:
                return cand.username

    return clean


def login_view(request):
    if request.user.is_authenticated:
        return redirect("dashboard")
    error = None
    ip = _client_ip(request)
    if request.method == "POST":
        post_data = request.POST.copy()
        raw_username = post_data.get("username", "").strip()
        resolved_username = _resolve_login_username(raw_username)
        post_data["username"] = resolved_username
        attempt_keys = _login_attempt_keys(ip, resolved_username or raw_username)

        if any(cache.get(lock_key) for _, lock_key in attempt_keys):
            _audit_auth("auth.login.locked", request, username=resolved_username or raw_username)
            return render(
                request,
                "finance/login.html",
                {
                    "form": AuthenticationForm(),
                    "error": "Too many failed attempts. Please try again later.",
                },
            )

        form = AuthenticationForm(request, data=post_data)
        if form.is_valid():
            user = form.get_user()
            for fail_key, lock_key in attempt_keys:
                cache.delete(fail_key)
                cache.delete(lock_key)
            login(request, user)
            if request.POST.get("remember"):
                request.session.set_expiry(REMEMBERED_SESSION_SECONDS)
            else:
                request.session.set_expiry(0)
            _audit_auth("auth.login.success", request, username=resolved_username, user=user)
            return redirect(_safe_next_url(request) or "dashboard")
        user = User.objects.filter(username__iexact=resolved_username).first()
        locked = False
        for fail_key, lock_key in attempt_keys:
            fails = cache.get(fail_key, 0) + 1
            cache.set(fail_key, fails, LOGIN_FAIL_WINDOW)
            if fails >= LOGIN_FAIL_LIMIT:
                cache.set(lock_key, True, LOGIN_LOCK_SECONDS)
                locked = True
        _audit_auth(
            "auth.login.failure",
            request,
            username=resolved_username or raw_username,
            user=user,
            summary="lock_created=true" if locked else "",
        )
        error = "Invalid credentials. Please check your Gmail, Staff ID, or username and password."
    else:
        form = AuthenticationForm()
    return render(
        request,
        "finance/login.html",
        {"form": form, "error": error, "next": _safe_next_url(request) or ""},
    )


def register_view(request):
    if request.user.is_authenticated:
        return redirect("dashboard")
    error = None
    ip = _client_ip(request)
    if cache.get(f"register_lock:{ip}"):
        return render(
            request,
            "finance/register.html",
            {
                "form": CustomUserCreationForm(),
                "error": "Too many registration attempts. Please try again later.",
            },
        )
    if request.method == "POST":
        form = CustomUserCreationForm(request.POST)
        if form.is_valid():
            user = form.save()
            requested_role = form.cleaned_data.get("requested_role")
            if requested_role in UserProfile.Role.values:
                profile = getattr(user, "userprofile", None)
                if profile:
                    profile.role = requested_role
                    profile.save(update_fields=["role"])

            count_key = f"register_count:{ip}"
            cache.set(count_key, cache.get(count_key, 0) + 1, REGISTER_WINDOW)
            if cache.get(count_key, 0) >= REGISTER_LIMIT:
                cache.set(f"register_lock:{ip}", True, REGISTER_WINDOW)
            if is_approved(user):
                # First user is auto-approved as admin — log them in immediately
                login(request, user)
                return redirect("dashboard")
            # All other users require admin approval — do NOT create a session yet
            return redirect("pending_approval")
        error = "Please correct the errors below."
    else:
        form = CustomUserCreationForm()
    return render(request, "finance/register.html", {"form": form, "error": error})


@require_http_methods(["POST"])
def logout_view(request):
    logout(request)
    return redirect("landing_page")


def api_login_required(view_func):
    """Like @login_required but returns JSON 401 instead of redirecting."""
    from functools import wraps
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"error": "Authentication required"}, status=401)
        return view_func(request, *args, **kwargs)
    return wrapper

def api_approved_required(view_func):
    """Like @approved_required but returns JSON 403 instead of redirecting."""
    from functools import wraps
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"error": "Authentication required"}, status=401)
        if not is_approved(request.user):
            return JsonResponse({"error": "Account pending approval"}, status=403)
        return view_func(request, *args, **kwargs)
    return wrapper

def api_manager_or_admin_required(view_func):
    """Restricts API access to Managers, Accountants, and Admins."""
    from functools import wraps
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"error": "Authentication required"}, status=401)
        if not can_access_reports(request.user):
            return JsonResponse({"error": "Unauthorized: Reports access restricted for this role"}, status=403)
        return view_func(request, *args, **kwargs)
    return wrapper

def api_expenses_required(view_func):
    """Restricts expense management to authorized roles (Admin, Manager, Accountant)."""
    from functools import wraps
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"error": "Authentication required"}, status=401)
        if not can_access_expenses(request.user):
            return JsonResponse({"error": "Unauthorized: Expense management restricted for this role"}, status=403)
        return view_func(request, *args, **kwargs)
    return wrapper


def landing_page(request):
    if request.user.is_authenticated:
        return redirect("dashboard")
    return render(request, "finance/landing.html")


@login_required(login_url="login")
@approved_required
@ensure_csrf_cookie
def dashboard(request):
    return render(request, "finance/dashboard.html")

@login_required(login_url="login")
def pending_approval(request):
    if is_approved(request.user):
        return redirect("dashboard")
    return render(request, "finance/pending_approval.html")

@login_required(login_url="login")
@admin_required
def admin_dashboard(request):
    pending_users = User.objects.filter(userprofile__is_approved=False).select_related("userprofile").order_by("-date_joined")
    active_users = User.objects.filter(userprofile__is_approved=True).select_related("userprofile").order_by("username")
    roles = UserProfile.Role.choices
    return render(
        request,
        "finance/admin_dashboard.html",
        {
            "pending_users": pending_users,
            "active_users": active_users,
            "roles": roles,
        },
    )

@login_required(login_url="login")
@admin_required
@require_http_methods(["POST"])
def approve_user(request, user_id):
    user_to_approve = get_object_or_404(User, id=user_id)
    if user_to_approve.id == request.user.id:
        return redirect("admin_dashboard")
    profile = getattr(user_to_approve, "userprofile", None)
    if profile:
        new_role = request.POST.get("role")
        if new_role in UserProfile.Role.values:
            profile.role = new_role
        profile.is_approved = True
        profile.save(update_fields=["is_approved", "role"])
    return redirect("admin_dashboard")

@login_required(login_url="login")
@admin_required
@require_http_methods(["POST"])
def update_user_role(request, user_id):
    target_user = get_object_or_404(User, id=user_id)
    if target_user.id == request.user.id:
        return redirect("admin_dashboard")
    new_role = request.POST.get("role")
    if new_role in UserProfile.Role.values:
        profile = getattr(target_user, "userprofile", None)
        if profile:
            profile.role = new_role
            profile.save(update_fields=["role"])
    return redirect("admin_dashboard")

@login_required(login_url="login")
@admin_required
@require_http_methods(["POST"])
def toggle_user_access(request, user_id):
    target_user = get_object_or_404(User, id=user_id)
    if target_user.id == request.user.id:
        return redirect("admin_dashboard")
    profile = getattr(target_user, "userprofile", None)
    if profile:
        profile.is_approved = not profile.is_approved
        profile.save(update_fields=["is_approved"])
    return redirect("admin_dashboard")


@login_required(login_url="login")
@expenses_access_required
@ensure_csrf_cookie
def expenses_page(request):
    return render(request, "finance/expenses.html")


@login_required(login_url="login")
@customers_access_required
@ensure_csrf_cookie
def customers_page(request):
    return render(request, "finance/customers.html")


@login_required(login_url="login")
@manager_or_admin_required
@ensure_csrf_cookie
def reports_page(request):
    return render(request, "finance/reports.html")


@login_required(login_url="login")
@approved_required
@ensure_csrf_cookie
def inventory_page(request):
    return render(request, "finance/inventory.html")


@login_required(login_url="login")
@billing_access_required
@ensure_csrf_cookie
def sales_bills_page(request):
    return render(request, "finance/sales_bills.html")


def _parse_json(request):
    body = request.body or b""
    if len(body) > MAX_JSON_BYTES:
        return None
    try:
        data = json.loads(body)
    except (json.JSONDecodeError, ValueError, TypeError):
        return None
    if not isinstance(data, dict):
        return None
    return data


def _owned_customer_id(request, customer_id):
    if not customer_id:
        return None
    try:
        cid = int(customer_id)
    except (TypeError, ValueError):
        raise ValueError("Invalid customer")
    if not Customer.objects.filter(pk=cid).exists():
        raise ValueError("Invalid customer")
    return cid


def _owned_inventory_item(request, item_id):
    if not item_id:
        return None
    try:
        iid = int(item_id)
    except (TypeError, ValueError):
        raise ValueError("Invalid inventory item")
    item = InventoryItem.objects.filter(pk=iid).first()
    if not item:
        raise ValueError("Invalid inventory item")
    return item



def _transaction_payload(transaction):
    date_value = transaction.date
    if hasattr(date_value, "isoformat"):
        date_value = date_value.isoformat()

    subtotal_val = transaction.subtotal if (transaction.subtotal and transaction.subtotal > 0) else transaction.amount

    return {
        "id": transaction.id,
        "type": transaction.type,
        "sale_type": transaction.sale_type or "retail",
        "title": transaction.title,
        "subtotal": str(subtotal_val),
        "discount": str(transaction.discount or 0),
        "discount_type": transaction.discount_type or "amount",
        "amount": str(transaction.amount),
        "date": date_value,
        "category_id": transaction.category_id,
        "category_name": transaction.category.name,
        "customer_id": transaction.customer_id,
        "customer_name": transaction.customer.name if transaction.customer else None,
        "customer_type": transaction.customer.customer_type if transaction.customer else None,
        "item_id": transaction.item_id,
        "item_name": transaction.item.name if transaction.item else None,
        "item_sku": transaction.item.sku if transaction.item else None,
        "item_quantity": transaction.item_quantity or 1,
        "description": transaction.description,
        "created_at": transaction.created_at.isoformat(),
    }


@api_approved_required
@require_http_methods(["GET"])
def api_summary(request):
    user_txs = Transaction.objects.all()
    income = (
        user_txs.filter(type=Transaction.Type.INCOME).aggregate(
            total=Sum("amount")
        )["total"]
        or Decimal("0")
    )
    expense = (
        user_txs.filter(type=Transaction.Type.EXPENSE).aggregate(
            total=Sum("amount")
        )["total"]
        or Decimal("0")
    )
    
    cust_receivables = Decimal("0")
    cust_payables = Decimal("0")
    customers = Customer.objects.all()
    for c in customers:
        c_inc = c.transactions.filter(type=Transaction.Type.INCOME).aggregate(t=Sum("amount"))["t"] or Decimal("0")
        c_exp = c.transactions.filter(type=Transaction.Type.EXPENSE).aggregate(t=Sum("amount"))["t"] or Decimal("0")
        bal = c_exp - c_inc
        if bal > 0:
            cust_receivables += bal
        elif bal < 0:
            cust_payables += abs(bal)

    return JsonResponse(
        {
            "total_income": str(income),
            "total_expense": str(expense),
            "net_balance": str(income - expense),
            "customer_receivables": str(cust_receivables),
            "customer_payables": str(cust_payables),
            "total_customers": customers.count(),
        }
    )


@api_approved_required
@require_http_methods(["GET"])
def api_categories(request):
    category_type = request.GET.get("type")
    categories = Category.objects.all()
    if category_type in ("income", "expense"):
        categories = categories.filter(type=category_type)
    return JsonResponse(
        {
            "categories": [
                {"id": c.id, "name": c.name, "type": c.type} for c in categories
            ]
        }
    )


@api_approved_required
@require_http_methods(["GET", "POST"])
def api_transactions(request):
    if request.method == "GET":
        transactions = Transaction.objects.select_related("category").all()

        tx_type = request.GET.get("type")
        if tx_type in ("income", "expense"):
            transactions = transactions.filter(type=tx_type)

        category_id = request.GET.get("category")
        if category_id:
            try:
                transactions = transactions.filter(category_id=int(category_id))
            except (TypeError, ValueError):
                return JsonResponse({"error": "Invalid category"}, status=400)
            
        customer_id = request.GET.get("customer")
        if customer_id:
            try:
                transactions = transactions.filter(customer_id=int(customer_id))
            except (TypeError, ValueError):
                return JsonResponse({"error": "Invalid customer"}, status=400)

        date_from = _parse_date_param(request.GET.get("date_from"))
        if date_from is False:
            return JsonResponse({"error": "Invalid date_from"}, status=400)
        if date_from:
            transactions = transactions.filter(date__gte=date_from)

        date_to = _parse_date_param(request.GET.get("date_to"))
        if date_to is False:
            return JsonResponse({"error": "Invalid date_to"}, status=400)
        if date_to:
            transactions = transactions.filter(date__lte=date_to)

        return JsonResponse(
            {
                "transactions": [
                    _transaction_payload(t) for t in transactions
                ]
            }
        )

    if request.method == "POST":
        if not can_access_expenses(request.user):
            return JsonResponse({"error": "Permission denied: your role does not allow recording expenses/transactions"}, status=403)

    data = _parse_json(request)
    if not data:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    error = _validate_transaction_data(data)
    if error:
        return JsonResponse({"error": error}, status=400)

    category = get_object_or_404(Category, pk=data["category_id"])
    if category.type != data["type"]:
        return JsonResponse(
            {"error": "Category type does not match transaction type"},
            status=400,
        )

    item_obj = None
    item_qty = 1
    if data.get("item_id"):
        try:
            item_obj = _owned_inventory_item(request, data["item_id"])
        except ValueError as exc:
            return JsonResponse({"error": str(exc)}, status=400)
        try:
            item_qty = int(data.get("item_quantity", 1))
        except (TypeError, ValueError):
            return JsonResponse({"error": "Invalid item quantity"}, status=400)
        if item_qty <= 0 or item_qty > 100000:
            return JsonResponse({"error": "Invalid item quantity"}, status=400)

    try:
        customer_id = _owned_customer_id(request, data.get("customer_id"))
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    sale_type = data.get("sale_type", "retail")
    if sale_type not in ("retail", "wholesale"):
        sale_type = "retail"
    discount_type = data.get("discount_type", "amount")
    try:
        subtotal_val = _parse_decimal(data.get("subtotal", data["amount"]), "subtotal", min_value="0.01", max_value="9999999999.99")
        discount_val = _parse_decimal(data.get("discount", "0"), "discount", min_value="0", max_value="9999999999.99")
        net_amount = _calculate_net_amount(subtotal_val, discount_val, discount_type)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    with db_transaction.atomic():
        transaction = Transaction.objects.create(
            user=request.user,
            type=data["type"],
            sale_type=sale_type,
            title=data["title"].strip(),
            subtotal=subtotal_val,
            discount=discount_val,
            discount_type=discount_type,
            amount=net_amount,
            date=data["date"],
            category=category,
            customer_id=customer_id,
            item=item_obj,
            item_quantity=item_qty,
            description=data.get("description", "").strip(),
        )
        _audit(request.user, "transaction.create", transaction, f"{transaction.type} {transaction.amount}")
    return JsonResponse({"transaction": _transaction_payload(transaction)}, status=201)


@api_approved_required
@require_http_methods(["GET", "PUT", "DELETE"])
def api_transaction_detail(request, pk):
    transaction = get_object_or_404(
        Transaction.objects.select_related("category"), pk=pk
    )

    if request.method == "GET":
        return JsonResponse({"transaction": _transaction_payload(transaction)})

    if request.method == "DELETE":
        return JsonResponse(
            {"error": "Posted transactions are retained for audit. Create a reversing entry instead."},
            status=405,
        )

    if not can_access_expenses(request.user):
        return JsonResponse({"error": "Permission denied: your role does not allow editing transactions"}, status=403)

    data = _parse_json(request)
    if not data:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    error = _validate_transaction_data(data)
    if error:
        return JsonResponse({"error": error}, status=400)

    category = get_object_or_404(Category, pk=data["category_id"])
    if category.type != data["type"]:
        return JsonResponse(
            {"error": "Category type does not match transaction type"},
            status=400,
        )

    sale_type = data.get("sale_type", transaction.sale_type or "retail")
    if sale_type not in ("retail", "wholesale"):
        sale_type = "retail"
    try:
        customer_id = _owned_customer_id(request, data.get("customer_id"))
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)
    discount_type = data.get("discount_type", transaction.discount_type or "amount")
    try:
        subtotal_val = _parse_decimal(data.get("subtotal", data["amount"]), "subtotal", min_value="0.01", max_value="9999999999.99")
        discount_val = _parse_decimal(data.get("discount", transaction.discount or "0"), "discount", min_value="0", max_value="9999999999.99")
        net_amount = _calculate_net_amount(subtotal_val, discount_val, discount_type)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    with db_transaction.atomic():
        transaction.type = data["type"]
        transaction.sale_type = sale_type
        transaction.title = data["title"].strip()
        transaction.subtotal = subtotal_val
        transaction.discount = discount_val
        transaction.discount_type = discount_type
        transaction.amount = net_amount
        transaction.date = data["date"]
        transaction.category = category
        transaction.customer_id = customer_id
        transaction.description = data.get("description", "").strip()
        transaction.save()
        _audit(request.user, "transaction.update", transaction, f"{transaction.type} {transaction.amount}")

    return JsonResponse({"transaction": _transaction_payload(transaction)})


def _validate_transaction_data(data):
    required = ("type", "title", "amount", "date", "category_id")
    for field in required:
        if field not in data or data[field] in (None, ""):
            return f"Missing required field: {field}"

    if data["type"] not in ("income", "expense"):
        return "Type must be 'income' or 'expense'"

    title = str(data["title"]).strip()
    if not title or len(title) > 200:
        return "Title must be between 1 and 200 characters"
    data["title"] = title

    discount_type = data.get("discount_type", "amount")
    if discount_type not in ("amount", "percent"):
        return "Invalid discount type"
    data["discount_type"] = discount_type

    try:
        amount = _parse_decimal(data["amount"], "amount", min_value="0.01", max_value="9999999999.99")
        data["amount"] = amount
    except ValueError as exc:
        return str(exc)

    description = str(data.get("description", "")).strip()[:2000]
    data["description"] = description

    try:
        data["date"] = datetime.strptime(data["date"], "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return "Invalid date (use YYYY-MM-DD)"

    return None


def _validate_inventory_data(data, existing=None):
    try:
        name = str(data.get("name", getattr(existing, "name", ""))).strip()[:200]
        sku = str(data.get("sku", getattr(existing, "sku", ""))).strip().upper()[:50]
        category = str(data.get("category", getattr(existing, "category", "General"))).strip()[:100] or "General"
        unit = str(data.get("unit", getattr(existing, "unit", "Pcs"))).strip()[:30] or "Pcs"
        description = str(data.get("description", getattr(existing, "description", ""))).strip()[:2000]
        cost_price = _parse_decimal(data.get("cost_price", getattr(existing, "cost_price", "0")), "cost price", min_value="0")
        selling_price = _parse_decimal(data.get("selling_price", getattr(existing, "selling_price", "0")), "selling price", min_value="0")
        wholesale_price = _parse_decimal(
            data.get("wholesale_price", getattr(existing, "wholesale_price", selling_price)),
            "wholesale price",
            min_value="0",
        )
        quantity = int(data.get("quantity", getattr(existing, "quantity", 0)))
        reorder_level = int(data.get("reorder_level", getattr(existing, "reorder_level", 5)))
    except (TypeError, ValueError) as exc:
        return None, str(exc) if str(exc).startswith("Invalid") else "Invalid inventory values"

    if not name or not sku:
        return None, "Name and SKU are required"
    if min(cost_price, selling_price, wholesale_price) < 0:
        return None, "Prices cannot be negative"
    if quantity < 0 or quantity > 10_000_000:
        return None, "Invalid quantity"
    if reorder_level < 0 or reorder_level > 10_000_000:
        return None, "Invalid reorder level"

    return {
        "name": name,
        "sku": sku,
        "category": category,
        "unit": unit,
        "cost_price": cost_price,
        "selling_price": selling_price,
        "wholesale_price": wholesale_price,
        "quantity": quantity,
        "reorder_level": reorder_level,
        "description": description,
    }, None


@api_approved_required
@require_http_methods(["GET", "POST"])
def api_customers(request):
    if request.method == "GET":
        customers = Customer.objects.all()
        return JsonResponse(
            {
                "customers": [
                    {
                        "id": c.id,
                        "name": c.name,
                        "customer_type": c.customer_type or "retail",
                        "email": c.email,
                        "phone": c.phone,
                        "pan_vat": c.pan_vat,
                    }
                    for c in customers
                ]
            }
        )

    data = _parse_json(request)
    if not data or not data.get("name", "").strip():
        return JsonResponse({"error": "Name is required"}, status=400)

    name = data["name"].strip()[:200]
    customer_type = data.get("customer_type", "retail").strip()
    if customer_type not in ("retail", "wholesale"):
        customer_type = "retail"
    try:
        email = _optional_email(data.get("email"))
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)
    phone = data.get("phone", "").strip()[:30]
    pan_vat = data.get("pan_vat", "").strip()[:30]
    customer = Customer.objects.create(
        user=request.user,
        name=name,
        customer_type=customer_type,
        email=email,
        phone=phone,
        pan_vat=pan_vat,
    )
    return JsonResponse(
        {
            "customer": {
                "id": customer.id,
                "name": customer.name,
                "customer_type": customer.customer_type,
                "email": customer.email,
                "phone": customer.phone,
                "pan_vat": customer.pan_vat,
            }
        },
        status=201,
    )


@api_approved_required
@require_http_methods(["GET"])
def api_customer_ledger(request, pk):
    customer = get_object_or_404(Customer, pk=pk)
    transactions = customer.transactions.select_related("category").order_by("date", "created_at")

    income = transactions.filter(type=Transaction.Type.INCOME).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    expense = transactions.filter(type=Transaction.Type.EXPENSE).aggregate(total=Sum("amount"))["total"] or Decimal("0")

    # Include active Sales Bills for this customer as additional debit entries (only unpaid balance)
    bills = customer.sales_bills.filter(status=SalesBill.Status.ACTIVE).prefetch_related("items")
    bills_due_total = Decimal("0")
    bill_entries = []
    for b in bills:
        meta = _parse_bill_metadata(b.notes, b.grand_total, b.payment_mode)
        bills_due_total += meta["balance_due"]
        bill_entries.append({
            "entry_type": "bill",
            "id": b.id,
            "bill_number": b.bill_number,
            "date": b.date.isoformat(),
            "amount": str(b.grand_total),
            "amount_paid": str(meta["amount_paid"]),
            "balance_due": str(meta["balance_due"]),
            "payment_status": meta["payment_status"],
            "payment_mode": b.payment_mode,
            "notes": meta["clean_notes"],
            "items_summary": ", ".join(
                f"{it.item_name} x{int(it.quantity)}"
                for it in b.items.all()
            ),
            "items_count": b.items.count(),
        })

    total_debits = expense + bills_due_total
    net_balance = income - total_debits

    return JsonResponse(
        {
            "customer": {
                "id": customer.id,
                "name": customer.name,
                "customer_type": customer.customer_type or "retail",
                "email": customer.email,
                "phone": customer.phone,
                "pan_vat": customer.pan_vat,
            },
            "summary": {
                "total_credits": str(income),
                "total_debits": str(total_debits),
                "net_balance": str(net_balance),
            },
            "transactions": [_transaction_payload(t) for t in transactions],
            "bills": bill_entries,
        }
    )


@api_manager_or_admin_required
@require_http_methods(["GET"])
def api_reports(request):
    user_txs = Transaction.objects.all()
    total_expense = (
        user_txs.filter(type=Transaction.Type.EXPENSE).aggregate(t=Sum("amount"))["t"] or Decimal("0")
    )
    expense_categories = []
    categories = Category.objects.filter(type=Category.Type.EXPENSE)
    for cat in categories:
        cat_sum = (
            user_txs.filter(category=cat).aggregate(t=Sum("amount"))["t"] or Decimal("0")
        )
        if cat_sum > 0:
            pct = round((cat_sum / total_expense * 100), 1) if total_expense > 0 else 0
            expense_categories.append({
                "id": cat.id,
                "name": cat.name,
                "total": str(cat_sum),
                "percentage": float(pct),
            })
    
    expense_categories.sort(key=lambda x: Decimal(x["total"]), reverse=True)

    customer_reports = []
    total_receivables = Decimal("0")
    total_payables = Decimal("0")

    user_custs = Customer.objects.all()
    for c in user_custs:
        c_inc = c.transactions.filter(type=Transaction.Type.INCOME).aggregate(t=Sum("amount"))["t"] or Decimal("0")
        c_exp = c.transactions.filter(type=Transaction.Type.EXPENSE).aggregate(t=Sum("amount"))["t"] or Decimal("0")
        net = c_exp - c_inc
        if net > 0:
            total_receivables += net
        elif net < 0:
            total_payables += abs(net)

        customer_reports.append({
            "id": c.id,
            "name": c.name,
            "phone": c.phone,
            "email": c.email,
            "total_debit": str(c_exp),
            "total_credit": str(c_inc),
            "net_balance": str(net),
            "status": "Owes Money" if net > 0 else ("Advance Paid" if net < 0 else "Settled"),
        })

    income = (
        user_txs.filter(type=Transaction.Type.INCOME).aggregate(t=Sum("amount"))["t"] or Decimal("0")
    )
    net_profit = income - total_expense
    margin = round((net_profit / income * 100), 1) if income > 0 else 0

    inv_items = InventoryItem.objects.all()
    inv_cost_val = sum(i.quantity * i.cost_price for i in inv_items)
    inv_sell_val = sum(i.quantity * i.selling_price for i in inv_items)
    low_stock_count = sum(1 for i in inv_items if i.quantity <= i.reorder_level)

    return JsonResponse({
        "financial_summary": {
            "gross_revenue": str(income),
            "operating_expenses": str(total_expense),
            "net_profit": str(net_profit),
            "profit_margin": float(margin),
            "total_receivables": str(total_receivables),
            "total_payables": str(total_payables),
            "inventory_cost_value": str(inv_cost_val),
            "inventory_sell_value": str(inv_sell_val),
            "low_stock_count": low_stock_count,
        },
        "category_breakdown": expense_categories,
        "customer_statements": customer_reports,
    })


@api_approved_required
@require_http_methods(["GET", "POST"])
def api_inventory(request):
    if request.method == "GET":
        items = InventoryItem.objects.all()
        category = request.GET.get("category")
        if category:
            items = items.filter(category=category)

        data = []
        for item in items:
            total_cost_val = item.quantity * item.cost_price
            total_sell_val = item.quantity * item.selling_price
            data.append({
                "id": item.id,
                "name": item.name,
                "sku": item.sku,
                "category": item.category,
                "unit": item.unit,
                "cost_price": str(item.cost_price),
                "selling_price": str(item.selling_price),
                "wholesale_price": str(item.wholesale_price or item.selling_price),
                "quantity": item.quantity,
                "reorder_level": item.reorder_level,
                "total_cost_value": str(total_cost_val),
                "total_sell_value": str(total_sell_val),
                "is_low_stock": item.quantity <= item.reorder_level,
                "is_out_of_stock": item.quantity <= 0,
                "description": item.description,
            })
        return JsonResponse({"inventory": data})

    # Only Admin, Manager, and Accountant can add inventory items
    if not can_edit_inventory(request.user):
        return JsonResponse({"error": "Permission denied: only Admin, Manager, or Accountant can add inventory"}, status=403)

    data = _parse_json(request)
    if not data or not data.get("name") or not data.get("sku"):
        return JsonResponse({"error": "Name and SKU are required"}, status=400)

    payload, error = _validate_inventory_data(data)
    if error:
        return JsonResponse({"error": error}, status=400)

    try:
        with db_transaction.atomic():
            item = InventoryItem.objects.create(user=request.user, **payload)
            _audit(request.user, "inventory.create", item, f"{item.sku} qty={item.quantity}")
        return JsonResponse({"item": {"id": item.id, "name": item.name}}, status=201)
    except IntegrityError:
        return JsonResponse({"error": "SKU already exists for your inventory"}, status=400)
    except Exception:
        return JsonResponse({"error": "Could not save inventory item"}, status=400)


@api_approved_required
@require_http_methods(["PUT", "DELETE"])
def api_inventory_detail(request, pk):
    item = get_object_or_404(InventoryItem, pk=pk)
    if not can_edit_inventory(request.user):
        return JsonResponse({"error": "Permission denied: only Admin, Manager, or Accountant can edit/delete items"}, status=403)

    if request.method == "DELETE":
        if item.transactions.exists() or item.bill_items.exists():
            return JsonResponse(
                {"error": "This item is linked to posted history and cannot be deleted. Set quantity to zero or rename it as inactive."},
                status=400,
            )
        _audit(request.user, "inventory.delete", item, f"{item.sku} {item.name}")
        item.delete()
        return JsonResponse({"success": True})
    
    data = _parse_json(request)
    if not data:
        return JsonResponse({"error": "Invalid data"}, status=400)

    payload, error = _validate_inventory_data(data, existing=item)
    if error:
        return JsonResponse({"error": error}, status=400)

    try:
        with db_transaction.atomic():
            old_summary = f"{item.sku} qty={item.quantity}"
            for field, value in payload.items():
                setattr(item, field, value)
            item.save()
            _audit(request.user, "inventory.update", item, f"{old_summary} -> {item.sku} qty={item.quantity}")
        return JsonResponse({"success": True})
    except IntegrityError:
        return JsonResponse({"error": "SKU already exists for your inventory"}, status=400)
    except Exception:
        return JsonResponse({"error": "Could not update inventory item"}, status=400)


@api_approved_required
@require_http_methods(["POST"])
def api_inventory_adjust(request, pk):
    item = get_object_or_404(InventoryItem, pk=pk)
    if not can_edit_inventory(request.user):
        return JsonResponse({"error": "Permission denied: only Admin, Manager, or Accountant can adjust stock"}, status=403)

    data = _parse_json(request)
    if not data:
        return JsonResponse({"error": "Invalid JSON"}, status=400)
    try:
        change = int(data.get("change", 0))
    except (TypeError, ValueError):
        return JsonResponse({"error": "Invalid quantity change"}, status=400)
    if abs(change) > 10000:
        return JsonResponse({"error": "Quantity change is too large"}, status=400)
    with db_transaction.atomic():
        updated = InventoryItem.objects.filter(pk=item.pk, quantity__gte=max(-change, 0)).update(
            quantity=F("quantity") + change
        )
        if not updated:
            return JsonResponse({"error": "Insufficient stock for this adjustment"}, status=400)
        item.refresh_from_db(fields=["quantity"])
        _audit(request.user, "inventory.adjust", item, f"change={change}, quantity={item.quantity}")
    return JsonResponse({"id": item.id, "quantity": item.quantity})


def _parse_bill_metadata(notes_str, grand_total, payment_mode):
    """
    Safely extract [PAN: ...], [ADDR: ...], [PAID: ...] from bill.notes.
    Returns clean data dict without requiring DB schema migrations.
    """
    notes_str = notes_str or ""
    pan = ""
    addr = ""
    paid_amt = None

    pan_m = re.search(r"\[PAN:\s*([^\]]+)\]", notes_str)
    if pan_m:
        pan = pan_m.group(1).strip()

    addr_m = re.search(r"\[ADDR:\s*([^\]]+)\]", notes_str)
    if addr_m:
        addr = addr_m.group(1).strip()

    paid_m = re.search(r"\[PAID:\s*([0-9.]+)\]", notes_str)
    if paid_m:
        try:
            paid_amt = Decimal(paid_m.group(1).strip())
        except Exception:
            paid_amt = None

    gt = Decimal(str(grand_total or "0"))
    if paid_amt is None:
        paid_amt = Decimal("0") if payment_mode == "credit" else gt

    paid_amt = max(Decimal("0"), min(gt, paid_amt))
    due_amt = max(Decimal("0"), gt - paid_amt)

    if due_amt == Decimal("0"):
        pay_status = "paid"
    elif paid_amt == Decimal("0"):
        pay_status = "unpaid"
    else:
        pay_status = "partial"

    clean_notes = re.sub(r"\[(PAN|ADDR|PAID):\s*[^\]]+\]\s*", "", notes_str).strip()

    return {
        "pan": pan,
        "billing_address": addr,
        "amount_paid": paid_amt,
        "balance_due": due_amt,
        "payment_status": pay_status,
        "clean_notes": clean_notes,
    }


def _format_bill_notes(clean_notes, pan="", address="", paid_amount=None):
    tags = []
    if pan:
        tags.append(f"[PAN: {pan.strip()}]")
    if address:
        tags.append(f"[ADDR: {address.strip()}]")
    if paid_amount is not None:
        tags.append(f"[PAID: {str(paid_amount)}]")
    prefix = " ".join(tags)
    clean = (clean_notes or "").strip()
    return f"{prefix} {clean}".strip()


def _bill_payload(bill):
    items = bill.items.select_related("inventory_item").all()
    meta = _parse_bill_metadata(bill.notes, bill.grand_total, bill.payment_mode)
    return {
        "id": bill.id,
        "bill_number": bill.bill_number,
        "customer_id": bill.customer_id,
        "customer_name": bill.customer.name if bill.customer else None,
        "customer_type": bill.customer.customer_type if bill.customer else None,
        "customer_phone": bill.customer.phone if bill.customer else "",
        "customer_pan": meta["pan"],
        "billing_address": meta["billing_address"],
        "date": bill.date.isoformat(),
        "payment_mode": bill.payment_mode,
        "amount_paid": str(meta["amount_paid"]),
        "payment_status": meta["payment_status"],
        "balance_due": str(meta["balance_due"]),
        "notes": meta["clean_notes"],
        "raw_notes": bill.notes,
        "subtotal": str(bill.subtotal),
        "discount": str(bill.discount),
        "discount_type": bill.discount_type,
        "grand_total": str(bill.grand_total),
        "status": bill.status,
        "cancel_reason": bill.cancel_reason,
        "created_at": bill.created_at.isoformat(),
        "items": [
            {
                "id": it.id,
                "inventory_item_id": it.inventory_item_id,
                "item_name": it.item_name,
                "item_sku": it.item_sku,
                "unit": it.unit,
                "quantity": str(it.quantity),
                "unit_price": str(it.unit_price),
                "line_total": str(it.line_total),
            }
            for it in items
        ],
    }


@api_approved_required
@require_http_methods(["GET", "POST"])
def api_sales_bills(request):
    if request.method == "GET":
        bills = SalesBill.objects.select_related("customer").prefetch_related("items")

        # By default hide cancelled bills unless explicitly requested
        include_cancelled = request.GET.get("include_cancelled", "false").lower() == "true"
        if not include_cancelled:
            bills = bills.filter(status=SalesBill.Status.ACTIVE)

        customer_id = request.GET.get("customer")
        if customer_id:
            try:
                bills = bills.filter(customer_id=int(customer_id))
            except (TypeError, ValueError):
                return JsonResponse({"error": "Invalid customer"}, status=400)

        payment_mode = request.GET.get("payment_mode")
        if payment_mode:
            if payment_mode not in ("cash", "credit", "online"):
                return JsonResponse({"error": "Invalid payment mode"}, status=400)
            bills = bills.filter(payment_mode=payment_mode)

        date_from = _parse_date_param(request.GET.get("date_from"))
        if date_from is False:
            return JsonResponse({"error": "Invalid date_from"}, status=400)
        if date_from:
            bills = bills.filter(date__gte=date_from)

        date_to = _parse_date_param(request.GET.get("date_to"))
        if date_to is False:
            return JsonResponse({"error": "Invalid date_to"}, status=400)
        if date_to:
            bills = bills.filter(date__lte=date_to)

        payloads = [_bill_payload(b) for b in bills]
        active_payloads = [p for p in payloads if p["status"] == "active"]
        total_revenue = sum(Decimal(p["grand_total"]) for p in active_payloads)
        credit_pending = sum(Decimal(p["balance_due"]) for p in active_payloads)

        return JsonResponse({
            "bills": payloads,
            "summary": {
                "total_bills": len(active_payloads),
                "total_revenue": str(total_revenue),
                "credit_pending": str(credit_pending),
            },
            "suggested_bill_number": SalesBill.suggest_next_number(),
        })

    # POST — create new bill
    if not can_access_billing(request.user):
        return JsonResponse({"error": "Permission denied: billing access restricted for this role"}, status=403)

    data = _parse_json(request)
    if not data:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    line_items = data.get("items", [])
    if not isinstance(line_items, list) or not line_items:
        return JsonResponse({"error": "At least one item is required"}, status=400)
    if len(line_items) > 100:
        return JsonResponse({"error": "Too many line items"}, status=400)

    try:
        bill_date = datetime.strptime(data["date"], "%Y-%m-%d").date()
    except (KeyError, TypeError, ValueError):
        return JsonResponse({"error": "Invalid or missing date (YYYY-MM-DD)"}, status=400)

    # Validate manual bill number (if provided)
    manual_bill_number = (data.get("bill_number") or "").strip()[:30]
    if manual_bill_number:
        if SalesBill.objects.filter(bill_number=manual_bill_number).exists():
            return JsonResponse({"error": "That bill number already exists. Please use a different number."}, status=400)

    try:
        discount_val = _parse_decimal(data.get("discount", "0") or "0", "discount", min_value="0", max_value="9999999999.99")
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)
    discount_type = data.get("discount_type", "amount")
    if discount_type not in ("amount", "percent"):
        return JsonResponse({"error": "Invalid discount type"}, status=400)

    payment_mode = data.get("payment_mode", "cash")
    if payment_mode not in ("cash", "credit", "online"):
        if payment_mode == "mixed":
            payment_mode = "credit"
        else:
            return JsonResponse({"error": "Invalid payment mode"}, status=400)

    try:
        customer_id = _owned_customer_id(request, data.get("customer_id"))
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    if not customer_id:
        return JsonResponse({"error": "Customer is required. Please select or add a customer."}, status=400)

    clean_notes = (data.get("notes") or "").strip()[:2000]
    billing_address = (data.get("billing_address") or "").strip()[:500]
    customer_pan = (data.get("customer_pan") or "").strip()[:30]

    # Calculate subtotal from line items
    subtotal = Decimal("0")
    validated_items = []
    for row in line_items:
        try:
            qty = _parse_decimal(row.get("quantity", 1), "quantity", min_value="0.01", max_value="100000")
            price = _parse_decimal(row.get("unit_price", 0), "unit price", min_value="0", max_value="9999999999.99")
        except ValueError as exc:
            return JsonResponse({"error": str(exc)}, status=400)
        if qty <= 0 or price < 0:
            return JsonResponse({"error": "Quantity must be > 0 and price must be >= 0"}, status=400)

        inv_item = None
        if row.get("inventory_item_id"):
            inv_item = InventoryItem.objects.filter(pk=row["inventory_item_id"]).first()
            if not inv_item:
                return JsonResponse({"error": "Invalid inventory item in line items"}, status=400)
            if qty != qty.to_integral_value():
                return JsonResponse({"error": "Inventory item quantities must be whole numbers"}, status=400)

        item_name = (row.get("item_name") or (inv_item.name if inv_item else "")).strip()
        if not item_name:
            return JsonResponse({"error": "Item name is required for each line item"}, status=400)

        line_total = qty * price
        subtotal += line_total
        validated_items.append({
            "inv_item": inv_item,
            "item_name": item_name,
            "item_sku": row.get("item_sku") or (inv_item.sku if inv_item else ""),
            "unit": row.get("unit") or (inv_item.unit if inv_item else "Pcs"),
            "quantity": qty,
            "unit_price": price,
            "line_total": line_total,
        })

    try:
        grand_total = _calculate_net_amount(subtotal, discount_val, discount_type)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    # Calculate amount paid for partial / credit / full payment
    paid_raw = data.get("amount_paid")
    if paid_raw is not None:
        try:
            amount_paid = _parse_decimal(paid_raw, "amount paid", min_value="0")
        except ValueError as exc:
            return JsonResponse({"error": str(exc)}, status=400)
        if amount_paid > grand_total:
            return JsonResponse({"error": "Amount paid cannot exceed bill total"}, status=400)
    else:
        amount_paid = Decimal("0") if payment_mode == "credit" else grand_total

    formatted_notes = _format_bill_notes(
        clean_notes,
        pan=customer_pan,
        address=billing_address,
        paid_amount=amount_paid,
    )

    bill = SalesBill(
        user=request.user,
        customer_id=customer_id,
        date=bill_date,
        payment_mode=payment_mode,
        notes=formatted_notes,
        subtotal=subtotal,
        discount=discount_val,
        discount_type=discount_type,
        grand_total=grand_total,
    )
    if manual_bill_number:
        bill.bill_number = manual_bill_number

    try:
        with db_transaction.atomic():
            bill.save()
            for row in validated_items:
                bill_item = SalesBillItem.objects.create(
                    bill=bill,
                    inventory_item=row["inv_item"],
                    item_name=row["item_name"][:200],
                    item_sku=str(row["item_sku"])[:50],
                    unit=str(row["unit"])[:30],
                    quantity=row["quantity"],
                    unit_price=row["unit_price"],
                    line_total=row["line_total"],
                )
                if row["inv_item"]:
                    inv = row["inv_item"]
                    qty_int = int(row["quantity"])
                    updated = InventoryItem.objects.filter(pk=inv.pk, quantity__gte=qty_int).update(
                        quantity=F("quantity") - qty_int
                    )
                    if not updated:
                        raise ValueError(f"Insufficient stock for {bill_item.item_name}")
            _audit(request.user, "sales_bill.create", bill, f"{bill.bill_number} total={bill.grand_total}")
    except IntegrityError:
        return JsonResponse({"error": "That bill number already exists. Please use a different number."}, status=400)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    return JsonResponse({"bill": _bill_payload(bill)}, status=201)


@api_approved_required
@require_http_methods(["GET", "DELETE"])
def api_sales_bill_detail(request, pk):
    bill = get_object_or_404(SalesBill, pk=pk)

    if request.method == "GET":
        return JsonResponse({"bill": _bill_payload(bill)})

    if request.method == "DELETE":
        return JsonResponse(
            {"error": "Sales bills are retained for audit. Cancel the bill to reverse inventory."},
            status=405,
        )


@api_approved_required
@require_http_methods(["POST"])
def api_cancel_bill(request, pk):
    """Soft-cancel a bill: mark as CANCELLED, restore inventory, record reason."""
    if not can_access_billing(request.user):
        return JsonResponse({"error": "Permission denied: billing access restricted for this role"}, status=403)

    with db_transaction.atomic():
        bill = get_object_or_404(SalesBill.objects.select_for_update(), pk=pk)
        if bill.status == SalesBill.Status.CANCELLED:
            return JsonResponse({"error": "Bill is already cancelled."}, status=400)

        data = _parse_json(request) or {}
        reason = (data.get("reason") or "").strip()[:500]

        for it in bill.items.select_related("inventory_item").select_for_update().all():
            if it.inventory_item:
                InventoryItem.objects.filter(pk=it.inventory_item_id).update(
                    quantity=F("quantity") + int(it.quantity)
                )

        bill.status = SalesBill.Status.CANCELLED
        bill.cancel_reason = reason
        bill.save(update_fields=["status", "cancel_reason"])
        _audit(request.user, "sales_bill.cancel", bill, reason)

    return JsonResponse({"bill": _bill_payload(bill)})


@api_approved_required
@require_http_methods(["POST"])
def api_update_bill_payment(request, pk):
    """Update payment mode, amount_paid, address, and notes on an existing active bill."""
    if not can_access_billing(request.user):
        return JsonResponse({"error": "Permission denied: billing access restricted for this role"}, status=403)

    bill = get_object_or_404(SalesBill, pk=pk)
    if bill.status == SalesBill.Status.CANCELLED:
        return JsonResponse({"error": "Cannot update payment on a cancelled bill."}, status=400)

    data = _parse_json(request) or {}

    payment_mode = data.get("payment_mode", bill.payment_mode)
    if payment_mode not in ("cash", "credit", "online"):
        if payment_mode == "mixed":
            payment_mode = "credit"
        else:
            return JsonResponse({"error": "Invalid payment mode"}, status=400)

    meta = _parse_bill_metadata(bill.notes, bill.grand_total, bill.payment_mode)

    paid_raw = data.get("amount_paid")
    if paid_raw is not None:
        try:
            new_paid = _parse_decimal(paid_raw, "amount paid", min_value="0")
        except ValueError as exc:
            return JsonResponse({"error": str(exc)}, status=400)
        if new_paid > bill.grand_total:
            return JsonResponse({"error": "Amount paid cannot exceed bill total"}, status=400)
    else:
        new_paid = meta["amount_paid"]

    new_address = data.get("billing_address")
    if new_address is not None:
        meta["billing_address"] = new_address.strip()[:500]

    pay_note = (data.get("payment_note") or "").strip()[:500]
    clean_notes = meta["clean_notes"]
    if pay_note:
        today_str = datetime.now().strftime("%Y-%m-%d")
        clean_notes = f"{clean_notes}\n[Payment {today_str}: {pay_note}]".strip()

    bill.payment_mode = payment_mode
    bill.notes = _format_bill_notes(
        clean_notes,
        pan=meta["pan"],
        address=meta["billing_address"],
        paid_amount=new_paid,
    )
    bill.save(update_fields=["payment_mode", "notes", "updated_at"])

    return JsonResponse({"bill": _bill_payload(bill), "success": True})
