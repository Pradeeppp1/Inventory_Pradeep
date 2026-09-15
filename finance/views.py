import json
from datetime import datetime
from decimal import Decimal, InvalidOperation

from django.contrib.auth import login, logout, authenticate
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm
from django.db.models import Q, Sum
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods
from django.contrib.auth.models import User

from .models import Category, Customer, InventoryItem, Transaction, UserProfile
from .forms import CustomUserCreationForm

def is_approved(user):
    return hasattr(user, "userprofile") and user.userprofile.is_approved

def is_admin(user):
    return is_approved(user) and user.userprofile.role == UserProfile.Role.ADMIN

approved_required = user_passes_test(is_approved, login_url="pending_approval")
admin_required = user_passes_test(is_admin, login_url="dashboard")

def login_view(request):
    if request.user.is_authenticated:
        return redirect("dashboard")
    error = None
    if request.method == "POST":
        form = AuthenticationForm(request, data=request.POST)
        if form.is_valid():
            user = form.get_user()
            login(request, user)
            return redirect(request.GET.get("next") or "dashboard")
        else:
            error = "Invalid username or password"
    else:
        form = AuthenticationForm()
    return render(request, "finance/login.html", {"form": form, "error": error})


def register_view(request):
    if request.user.is_authenticated:
        return redirect("dashboard")
    error = None
    if request.method == "POST":
        form = CustomUserCreationForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)
            if user.userprofile.is_approved:
                return redirect("dashboard")
            return redirect("pending_approval")
        else:
            error = "Please correct the errors below."
    else:
        form = CustomUserCreationForm()
    return render(request, "finance/register.html", {"form": form, "error": error})


def logout_view(request):
    logout(request)
    return redirect("login")


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
    pending_users = User.objects.filter(userprofile__is_approved=False).select_related('userprofile')
    return render(request, "finance/admin_dashboard.html", {"pending_users": pending_users})

@login_required(login_url="login")
@admin_required
@require_http_methods(["POST"])
def approve_user(request, user_id):
    user_to_approve = get_object_or_404(User, id=user_id)
    if hasattr(user_to_approve, 'userprofile'):
        user_to_approve.userprofile.is_approved = True
        user_to_approve.userprofile.save()
    return redirect("admin_dashboard")


@login_required(login_url="login")
@approved_required
@ensure_csrf_cookie
def expenses_page(request):
    return render(request, "finance/expenses.html")


@login_required(login_url="login")
@approved_required
@ensure_csrf_cookie
def customers_page(request):
    return render(request, "finance/customers.html")


@login_required(login_url="login")
@approved_required
@ensure_csrf_cookie
def reports_page(request):
    return render(request, "finance/reports.html")


@login_required(login_url="login")
@approved_required
@ensure_csrf_cookie
def inventory_page(request):
    return render(request, "finance/inventory.html")


def _parse_json(request):
    try:
        return json.loads(request.body)
    except json.JSONDecodeError:
        return None


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


@login_required(login_url="login")
@approved_required
@require_http_methods(["GET"])
def api_summary(request):
    user_txs = Transaction.objects.filter(user=request.user)
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
    customers = Customer.objects.filter(user=request.user)
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


@login_required(login_url="login")
@approved_required
@require_http_methods(["GET", "POST"])
def api_transactions(request):
    if request.method == "GET":
        transactions = Transaction.objects.filter(user=request.user).select_related("category").all()

        tx_type = request.GET.get("type")
        if tx_type in ("income", "expense"):
            transactions = transactions.filter(type=tx_type)

        category_id = request.GET.get("category")
        if category_id:
            transactions = transactions.filter(category_id=category_id)
            
        customer_id = request.GET.get("customer")
        if customer_id:
            transactions = transactions.filter(customer_id=customer_id)

        date_from = request.GET.get("date_from")
        if date_from:
            transactions = transactions.filter(date__gte=date_from)

        date_to = request.GET.get("date_to")
        if date_to:
            transactions = transactions.filter(date__lte=date_to)

        return JsonResponse(
            {
                "transactions": [
                    _transaction_payload(t) for t in transactions
                ]
            }
        )

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
        item_obj = get_object_or_404(InventoryItem, pk=data["item_id"])
        item_qty = int(data.get("item_quantity", 1))

        # Auto-adjust inventory stock
        if data["type"] == "expense": # Customer debit / Sale
            item_obj.quantity = max(0, item_obj.quantity - item_qty)
            item_obj.save()
        elif data["type"] == "income": # Customer credit / Stock purchase
            item_obj.quantity += item_qty
            item_obj.save()

    sale_type = data.get("sale_type", "retail")
    subtotal_val = Decimal(str(data.get("subtotal", data["amount"])))
    discount_val = Decimal(str(data.get("discount", "0")))
    discount_type = data.get("discount_type", "amount")
    
    if discount_type == "percent":
        disc_amt = subtotal_val * (discount_val / Decimal("100"))
    else:
        disc_amt = discount_val
    net_amount = max(Decimal("0"), subtotal_val - disc_amt)

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
        customer_id=data.get("customer_id") or None,
        item=item_obj,
        item_quantity=item_qty,
        description=data.get("description", "").strip(),
    )
    return JsonResponse({"transaction": _transaction_payload(transaction)}, status=201)


@login_required(login_url="login")
@approved_required
@require_http_methods(["GET", "PUT", "DELETE"])
def api_transaction_detail(request, pk):
    transaction = get_object_or_404(
        Transaction.objects.select_related("category"), pk=pk
    )

    if request.method == "GET":
        return JsonResponse({"transaction": _transaction_payload(transaction)})

    if request.method == "DELETE":
        transaction.delete()
        return JsonResponse({"success": True})

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
    subtotal_val = Decimal(str(data.get("subtotal", data["amount"])))
    discount_val = Decimal(str(data.get("discount", transaction.discount or "0")))
    discount_type = data.get("discount_type", transaction.discount_type or "amount")
    
    if discount_type == "percent":
        disc_amt = subtotal_val * (discount_val / Decimal("100"))
    else:
        disc_amt = discount_val
    net_amount = max(Decimal("0"), subtotal_val - disc_amt)

    transaction.type = data["type"]
    transaction.sale_type = sale_type
    transaction.title = data["title"].strip()
    transaction.subtotal = subtotal_val
    transaction.discount = discount_val
    transaction.discount_type = discount_type
    transaction.amount = net_amount
    transaction.date = data["date"]
    transaction.category = category
    transaction.customer_id = data.get("customer_id") or None
    transaction.description = data.get("description", "").strip()
    transaction.save()

    return JsonResponse({"transaction": _transaction_payload(transaction)})


def _validate_transaction_data(data):
    required = ("type", "title", "amount", "date", "category_id")
    for field in required:
        if field not in data or data[field] in (None, ""):
            return f"Missing required field: {field}"

    if data["type"] not in ("income", "expense"):
        return "Type must be 'income' or 'expense'"

    try:
        amount = Decimal(str(data["amount"]))
        if amount <= 0:
            return "Amount must be greater than zero"
        data["amount"] = amount
    except (InvalidOperation, TypeError):
        return "Invalid amount"

    try:
        data["date"] = datetime.strptime(data["date"], "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return "Invalid date (use YYYY-MM-DD)"

    return None


@login_required(login_url="login")
@approved_required
@require_http_methods(["GET", "POST"])
def api_customers(request):
    if request.method == "GET":
        customers = Customer.objects.filter(user=request.user)
        return JsonResponse(
            {
                "customers": [
                    {
                        "id": c.id,
                        "name": c.name,
                        "customer_type": c.customer_type or "retail",
                        "email": c.email,
                        "phone": c.phone,
                    }
                    for c in customers
                ]
            }
        )

    data = _parse_json(request)
    if not data or not data.get("name", "").strip():
        return JsonResponse({"error": "Name is required"}, status=400)

    customer = Customer.objects.create(
        user=request.user,
        name=data["name"].strip(),
        customer_type=data.get("customer_type", "retail").strip(),
        email=data.get("email", "").strip(),
        phone=data.get("phone", "").strip(),
    )
    return JsonResponse(
        {
            "customer": {
                "id": customer.id,
                "name": customer.name,
                "customer_type": customer.customer_type,
                "email": customer.email,
                "phone": customer.phone,
            }
        },
        status=201,
    )


@login_required(login_url="login")
@approved_required
@require_http_methods(["GET"])
def api_customer_ledger(request, pk):
    customer = get_object_or_404(Customer, pk=pk, user=request.user)
    transactions = customer.transactions.filter(user=request.user).select_related("category").order_by("date", "created_at")
    
    income = transactions.filter(type=Transaction.Type.INCOME).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    expense = transactions.filter(type=Transaction.Type.EXPENSE).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    net_balance = income - expense

    return JsonResponse(
        {
            "customer": {
                "id": customer.id,
                "name": customer.name,
                "customer_type": customer.customer_type or "retail",
                "email": customer.email,
                "phone": customer.phone,
            },
            "summary": {
                "total_credits": str(income),
                "total_debits": str(expense),
                "net_balance": str(net_balance),
            },
            "transactions": [_transaction_payload(t) for t in transactions],
        }
    )


@login_required(login_url="login")
@approved_required
@require_http_methods(["GET"])
def api_reports(request):
    user_txs = Transaction.objects.filter(user=request.user)
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

    user_custs = Customer.objects.filter(user=request.user)
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

    inv_items = InventoryItem.objects.filter(user=request.user)
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


@login_required(login_url="login")
@approved_required
@require_http_methods(["GET", "POST"])
def api_inventory(request):
    if request.method == "GET":
        items = InventoryItem.objects.filter(user=request.user)
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

    data = _parse_json(request)
    if not data or not data.get("name") or not data.get("sku"):
        return JsonResponse({"error": "Name and SKU are required"}, status=400)

    try:
        item = InventoryItem.objects.create(
            user=request.user,
            name=data["name"].strip(),
            sku=data["sku"].strip().upper(),
            category=data.get("category", "General").strip(),
            unit=data.get("unit", "Pcs").strip(),
            cost_price=Decimal(str(data.get("cost_price", "0"))),
            selling_price=Decimal(str(data.get("selling_price", "0"))),
            wholesale_price=Decimal(str(data.get("wholesale_price", data.get("selling_price", "0")))),
            quantity=int(data.get("quantity", 0)),
            reorder_level=int(data.get("reorder_level", 5)),
            description=data.get("description", "").strip(),
        )
        return JsonResponse({"item": {"id": item.id, "name": item.name}}, status=201)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)


@login_required(login_url="login")
@approved_required
@require_http_methods(["PUT", "DELETE"])
def api_inventory_detail(request, pk):
    item = get_object_or_404(InventoryItem, pk=pk, user=request.user)
    if request.method == "DELETE":
        item.delete()
        return JsonResponse({"success": True})
    
    data = _parse_json(request)
    if not data:
        return JsonResponse({"error": "Invalid data"}, status=400)

    try:
        item.name = data.get("name", item.name).strip()
        item.sku = data.get("sku", item.sku).strip().upper()
        item.category = data.get("category", item.category).strip()
        item.unit = data.get("unit", item.unit).strip()
        item.cost_price = Decimal(str(data.get("cost_price", item.cost_price)))
        item.selling_price = Decimal(str(data.get("selling_price", item.selling_price)))
        item.wholesale_price = Decimal(str(data.get("wholesale_price", item.wholesale_price)))
        item.quantity = int(data.get("quantity", item.quantity))
        item.reorder_level = int(data.get("reorder_level", item.reorder_level))
        item.description = data.get("description", item.description).strip()
        item.save()
        return JsonResponse({"success": True})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)


@login_required(login_url="login")
@approved_required
@require_http_methods(["POST"])
def api_inventory_adjust(request, pk):
    item = get_object_or_404(InventoryItem, pk=pk, user=request.user)
    data = _parse_json(request)
    change = int(data.get("change", 0))
    item.quantity = max(0, item.quantity + change)
    item.save()
    return JsonResponse({"id": item.id, "quantity": item.quantity})

