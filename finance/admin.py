from django.contrib import admin

from .models import AuditEvent, Category, Customer, InventoryItem, SalesBill, SalesBillItem, Transaction


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "type")
    list_filter = ("type",)
    search_fields = ("name",)


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ("title", "type", "amount", "date", "category")
    list_filter = ("type", "category", "date")
    search_fields = ("title", "description")
    date_hierarchy = "date"

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ("name", "customer_type", "email", "phone", "user")
    search_fields = ("name", "email", "phone")
    list_filter = ("customer_type",)

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(InventoryItem)
class InventoryItemAdmin(admin.ModelAdmin):
    list_display = ("name", "sku", "quantity", "cost_price", "selling_price", "user")
    search_fields = ("name", "sku")
    list_filter = ("category",)

    def has_delete_permission(self, request, obj=None):
        return False


class SalesBillItemInline(admin.TabularInline):
    model = SalesBillItem
    extra = 0
    readonly_fields = ("line_total",)


@admin.register(SalesBill)
class SalesBillAdmin(admin.ModelAdmin):
    list_display = ("bill_number", "date", "customer", "grand_total", "status", "user")
    search_fields = ("bill_number", "customer__name")
    list_filter = ("status", "payment_mode", "date")
    inlines = [SalesBillItemInline]

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ("created_at", "actor", "action", "target_model", "target_id")
    list_filter = ("action", "target_model", "created_at")
    search_fields = ("summary", "target_id", "actor__username")
    readonly_fields = ("actor", "action", "target_model", "target_id", "summary", "created_at")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
