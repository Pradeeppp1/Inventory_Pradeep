from django.core.management.base import BaseCommand

from finance.models import Category


DEFAULT_CATEGORIES = [
    ("Sales", Category.Type.INCOME),
    ("Services", Category.Type.INCOME),
    ("Investments", Category.Type.INCOME),
    ("Other Income", Category.Type.INCOME),
    ("Rent", Category.Type.EXPENSE),
    ("Salaries", Category.Type.EXPENSE),
    ("Utilities", Category.Type.EXPENSE),
    ("Supplies", Category.Type.EXPENSE),
    ("Marketing", Category.Type.EXPENSE),
    ("Travel", Category.Type.EXPENSE),
    ("Other Expense", Category.Type.EXPENSE),
]


class Command(BaseCommand):
    help = "Seed default income and expense categories"

    def handle(self, *args, **options):
        created = 0
        for name, category_type in DEFAULT_CATEGORIES:
            _, was_created = Category.objects.get_or_create(
                name=name,
                type=category_type,
            )
            if was_created:
                created += 1

        self.stdout.write(
            self.style.SUCCESS(f"Seeded {created} new categories.")
        )
