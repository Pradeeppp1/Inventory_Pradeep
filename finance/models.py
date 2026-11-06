from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver

class UserProfile(models.Model):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        MANAGER = "manager", "Manager"
        ACCOUNTANT = "accountant", "Accountant"
        SALESMAN = "salesman", "Salesperson"
        RECEPTIONIST = "receptionist", "Receptionist"
        STAFF = "staff", "General Staff"

    user = models.OneToOneField(User, on_delete=models.CASCADE)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.SALESMAN)
    is_approved = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.user.username} - {self.get_role_display()}"

@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        is_first_user = User.objects.count() == 1
        role = UserProfile.Role.ADMIN if is_first_user else UserProfile.Role.STAFF
        UserProfile.objects.create(user=instance, role=role, is_approved=is_first_user)
    else:
        # Fallback for existing users who do not have a profile yet
        if not hasattr(instance, 'userprofile'):
            is_first_user = instance.id == 1
            role = UserProfile.Role.ADMIN if is_first_user else UserProfile.Role.STAFF
            UserProfile.objects.create(user=instance, role=role, is_approved=is_first_user)


class Category(models.Model):
    class Type(models.TextChoices):
        INCOME = "income", "Income"
        EXPENSE = "expense", "Expense"

    name = models.CharField(max_length=100)
    type = models.CharField(max_length=10, choices=Type.choices)

    class Meta:
        verbose_name_plural = "categories"
        ordering = ["type", "name"]
        unique_together = ["name", "type"]

    def __str__(self):
        return f"{self.name} ({self.get_type_display()})"


class Customer(models.Model):
    class CustomerType(models.TextChoices):
        RETAIL = "retail", "Retail"
        WHOLESALE = "wholesale", "Wholesale"

    user = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="customers")
    name = models.CharField(max_length=200)
    customer_type = models.CharField(max_length=20, choices=CustomerType.choices, default=CustomerType.RETAIL)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    pan_vat = models.CharField(max_length=30, blank=True, verbose_name="PAN / VAT No.")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.get_customer_type_display()})"


class Transaction(models.Model):
    class Type(models.TextChoices):
        INCOME = "income", "Income"
        EXPENSE = "expense", "Expense"

    class SaleType(models.TextChoices):
        RETAIL = "retail", "Retail"
        WHOLESALE = "wholesale", "Wholesale"

    class DiscountType(models.TextChoices):
        AMOUNT = "amount", "NPR"
        PERCENT = "percent", "%"

    user = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="transactions")
    type = models.CharField(max_length=10, choices=Type.choices)
    sale_type = models.CharField(max_length=20, choices=SaleType.choices, default=SaleType.RETAIL)
    title = models.CharField(max_length=200)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0.00, validators=[MinValueValidator(0)])
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00, validators=[MinValueValidator(0)])
    discount_type = models.CharField(max_length=10, choices=DiscountType.choices, default=DiscountType.AMOUNT)
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    date = models.DateField()
    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        related_name="transactions",
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transactions",
    )
    item = models.ForeignKey(
        "InventoryItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transactions",
    )
    item_quantity = models.IntegerField(default=1, validators=[MinValueValidator(1)])
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"{self.title} — {self.amount}"


class InventoryItem(models.Model):
    user = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="inventory_items")
    name = models.CharField(max_length=200)
    sku = models.CharField(max_length=50)
    category = models.CharField(max_length=100, default="General")
    unit = models.CharField(max_length=30, default="Pcs")
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, default=0.00, validators=[MinValueValidator(0)])
    selling_price = models.DecimalField(max_digits=12, decimal_places=2, default=0.00, validators=[MinValueValidator(0)]) # Retail price
    wholesale_price = models.DecimalField(max_digits=12, decimal_places=2, default=0.00, validators=[MinValueValidator(0)]) # Wholesale price
    quantity = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    reorder_level = models.IntegerField(default=5, validators=[MinValueValidator(0)])
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["sku"], name="unique_inventory_sku_company"),
            models.CheckConstraint(condition=Q(quantity__gte=0), name="inventory_quantity_non_negative"),
            models.CheckConstraint(condition=Q(reorder_level__gte=0), name="inventory_reorder_non_negative"),
            models.CheckConstraint(condition=Q(cost_price__gte=0), name="inventory_cost_non_negative"),
            models.CheckConstraint(condition=Q(selling_price__gte=0), name="inventory_selling_non_negative"),
            models.CheckConstraint(condition=Q(wholesale_price__gte=0), name="inventory_wholesale_non_negative"),
        ]

    def __str__(self):
        return f"{self.name} ({self.sku}) - Qty: {self.quantity}"


class SalesBill(models.Model):
    class PaymentMode(models.TextChoices):
        CASH = "cash", "Cash"
        CREDIT = "credit", "Credit"
        ONLINE = "online", "Online"

    class DiscountType(models.TextChoices):
        AMOUNT = "amount", "NPR"
        PERCENT = "percent", "%"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        CANCELLED = "cancelled", "Cancelled"

    user = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="sales_bills")
    bill_number = models.CharField(max_length=30, unique=True)  # editable — user can set manually
    customer = models.ForeignKey(
        Customer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sales_bills",
    )
    date = models.DateField()
    payment_mode = models.CharField(max_length=10, choices=PaymentMode.choices, default=PaymentMode.CASH)
    notes = models.TextField(blank=True)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0.00, validators=[MinValueValidator(0)])
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00, validators=[MinValueValidator(0)])
    discount_type = models.CharField(max_length=10, choices=DiscountType.choices, default=DiscountType.AMOUNT)
    grand_total = models.DecimalField(max_digits=12, decimal_places=2, default=0.00, validators=[MinValueValidator(0)])
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    cancel_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "-created_at"]

    @classmethod
    def suggest_next_number(cls):
        """Return the suggested next auto bill number (e.g. BILL-0012)."""
        last = cls.objects.order_by("-id").first()
        next_num = (last.id + 1) if last else 1
        return f"BILL-{next_num:04d}"

    def save(self, *args, **kwargs):
        if not self.bill_number:
            last = SalesBill.objects.order_by("-id").first()
            next_num = (last.id + 1) if last else 1
            self.bill_number = f"BILL-{next_num:04d}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.bill_number} — {self.grand_total}"


class SalesBillItem(models.Model):
    bill = models.ForeignKey(SalesBill, on_delete=models.CASCADE, related_name="items")
    inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bill_items",
    )
    item_name = models.CharField(max_length=200)  # snapshot in case item deleted
    item_sku = models.CharField(max_length=50, blank=True)
    unit = models.CharField(max_length=30, default="Pcs")
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1, validators=[MinValueValidator(0)])
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0.00, validators=[MinValueValidator(0)])
    line_total = models.DecimalField(max_digits=12, decimal_places=2, default=0.00, validators=[MinValueValidator(0)])

    def save(self, *args, **kwargs):
        from decimal import Decimal
        self.line_total = self.quantity * self.unit_price
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.item_name} x {self.quantity} @ {self.unit_price}"


class AuditEvent(models.Model):
    actor = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="audit_events")
    action = models.CharField(max_length=80)
    target_model = models.CharField(max_length=80)
    target_id = models.CharField(max_length=80, blank=True)
    summary = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.action} {self.target_model} {self.target_id}".strip()
