from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver

class UserProfile(models.Model):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        MANAGER = "manager", "Manager"
        STAFF = "staff", "Staff"

    user = models.OneToOneField(User, on_delete=models.CASCADE)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.STAFF)
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

@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    if hasattr(instance, 'userprofile'):
        instance.userprofile.save()
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

    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True, related_name="customers")
    name = models.CharField(max_length=200)
    customer_type = models.CharField(max_length=20, choices=CustomerType.choices, default=CustomerType.RETAIL)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
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

    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True, related_name="transactions")
    type = models.CharField(max_length=10, choices=Type.choices)
    sale_type = models.CharField(max_length=20, choices=SaleType.choices, default=SaleType.RETAIL)
    title = models.CharField(max_length=200)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    discount_type = models.CharField(max_length=10, choices=DiscountType.choices, default=DiscountType.AMOUNT)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
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
    item_quantity = models.IntegerField(default=1)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"{self.title} — {self.amount}"


class InventoryItem(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True, related_name="inventory_items")
    name = models.CharField(max_length=200)
    sku = models.CharField(max_length=50)
    category = models.CharField(max_length=100, default="General")
    unit = models.CharField(max_length=30, default="Pcs")
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    selling_price = models.DecimalField(max_digits=12, decimal_places=2, default=0.00) # Retail price
    wholesale_price = models.DecimalField(max_digits=12, decimal_places=2, default=0.00) # Wholesale price
    quantity = models.IntegerField(default=0)
    reorder_level = models.IntegerField(default=5)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.sku}) - Qty: {self.quantity}"
