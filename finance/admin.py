from django.contrib import admin

from .models import Category, Transaction


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
