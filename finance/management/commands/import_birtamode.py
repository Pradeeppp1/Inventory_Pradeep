from datetime import date
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from finance.models import Customer, Category, Transaction, UserProfile

# BS to AD mapping
BS_TO_AD = {
    "2082-12-18": date(2026, 4, 1),
    "2083-01-15": date(2026, 4, 28),
    "2083-01-21": date(2026, 5, 4),
    "2083-01-25": date(2026, 5, 8),
    "2083-01-31": date(2026, 5, 14),
    "2083-02-04": date(2026, 5, 18),
    "2083-02-07": date(2026, 5, 21),
    "2083-02-25": date(2026, 6, 8),
    "2083-02-28": date(2026, 6, 11),
    "2083-03-01": date(2026, 6, 15),
    "2083-03-04": date(2026, 6, 18),
    "2083-03-05": date(2026, 6, 19),
    "2083-03-22": date(2026, 7, 6),
    "2083-04-03": date(2026, 7, 19),
    "2083-04-04": date(2026, 7, 20),
    "2083-04-05": date(2026, 7, 21),
    "2083-04-07": date(2026, 7, 23),
    "2083-04-13": date(2026, 7, 29),
    "2083-04-14": date(2026, 7, 30),
    "2083-05-05": date(2026, 8, 22),
    "2083-05-11": date(2026, 8, 28),
    "2083-05-12": date(2026, 8, 29),
    "2083-05-13": date(2026, 8, 30),
    "2083-05-14": date(2026, 8, 31),
    "2083-05-15": date(2026, 9, 1),
    "2083-05-26": date(2026, 9, 12),
    "2083-06-09": date(2026, 9, 26),
    "2083-06-11": date(2026, 9, 28),
    "2083-06-12": date(2026, 9, 29),
    "2083-06-15": date(2026, 10, 2),
    "2083-06-16": date(2026, 10, 3),
    "2083-06-20": date(2026, 10, 7),
    "2083-06-23": date(2026, 10, 10),
    "2083-07-15": date(2026, 11, 1),
    "2083-07-20": date(2026, 11, 6),
}

# 1. First period sales (Debits) - 2082/83
SALES_PERIOD_1 = [
    ("2082-12-18", "51.2V 105 Ah (Euclion) - 7 pcs", Decimal("700000"), "7 pcs @ 100,000 | Euclion | 2082/83"),
    ("2082-12-18", "64V 105Ah (Euclion) - 3 pcs", Decimal("345000"), "3 pcs @ 115,000 | Euclion | 2082/83"),
    ("2082-12-18", "51.2V 105 Ah (ServoTech) - 15 pcs", Decimal("1500000"), "15 pcs @ 100,000 | ServoTech | 2082/83"),
]

# 2. First period collections (Credits)
COLLECTIONS_PERIOD_1 = [
    ("2082-12-18", Decimal("150000"), "Collection received from Birtamode"),
    ("2083-01-15", Decimal("100000"), "Collection received from Birtamode"),
    ("2083-01-21", Decimal("150000"), "Collection received from Birtamode"),
    ("2083-01-25", Decimal("100000"), "Collection received from Birtamode"),
    ("2083-01-31", Decimal("500000"), "Collection received from Birtamode"),
    ("2083-02-04", Decimal("150000"), "Collection received from Birtamode"),
    ("2083-02-07", Decimal("60000"), "Collection received from Birtamode"),
    ("2083-02-25", Decimal("55000"), "Collection received from Birtamode"),
    ("2083-02-28", Decimal("62000"), "Collection received from Birtamode"),
    ("2083-03-04", Decimal("72000"), "Collection received from Birtamode"),
    ("2083-03-05", Decimal("101000"), "Collection received from Birtamode"),
    ("2083-03-22", Decimal("100000"), "Collection received from Birtamode"),
    ("2083-04-03", Decimal("130000"), "Collection received from Birtamode"),
    ("2083-04-04", Decimal("300000"), "Collection received from Birtamode"),
]

# 3. First period returns (Credits - reduces customer balance)
RETURNS_PERIOD_1 = [
    ("2083-03-01", "Returned: 51.2V 105 Ah (ServoTech) - 4 pcs", Decimal("400000"), "Returned 4 pcs @ 100,000 | ServoTech"),
    ("2083-03-01", "Returned: 64V 105Ah (Euclion) - 1 pc", Decimal("115000"), "Returned 1 pc @ 115,000 | Euclion"),
]

# 4. Second period sales (Debits) - 2083/84
SALES_PERIOD_2 = [
    ("2083-04-05", "51.2V 105 Ah (ServoTech IOT) - 4 pcs", Decimal("472000"), "4 pcs @ 118,000 | ServoTech(IOT)"),
    ("2083-04-07", "64V 105Ah (Servotech) - 1 pc", Decimal("145000"), "1 pc @ 145,000 | Servotech"),
    ("2083-04-07", "64V 210 Ah (Euclion) - 1 pc", Decimal("225000"), "1 pc @ 225,000 | Euclion"),
    ("2083-04-14", "51.2V 105 Ah (ServoTech IOT) - 4 pcs", Decimal("472000"), "4 pcs @ 118,000 | ServoTech(IOT)"),
    ("2083-04-14", "64V 105Ah (Servotech) - 1 pc", Decimal("145000"), "1 pc @ 145,000 | Servotech"),
    ("2083-05-15", "64V 105Ah (Servotech) - 1 pc", Decimal("145000"), "1 pc @ 145,000 | Servotech"),
    ("2083-05-15", "51.2V 105 Ah (Adwin) - 17 pcs", Decimal("1938000"), "17 pcs @ 114,000 | Adwin"),
    ("2083-05-15", "1KVA in-built Inverter (Adwin) - 1 pc", Decimal("63370"), "1 pc @ 63,370 | Adwin"),
    ("2083-05-15", "Lead-acid 150E (Adwin) - 2 pcs", Decimal("45842"), "2 pcs @ 22,921 | Adwin"),
    ("2083-06-11", "51.2V 105 Ah (Adwin) - 20 pcs", Decimal("2280000"), "20 pcs @ 114,000 | Adwin"),
    ("2083-06-11", "51.2V 105 Ah (ServoTech) - 4 pcs", Decimal("456000"), "4 pcs @ 114,000 | ServoTech"),
    ("2083-06-11", "Lead-acid 150E (Adwin) - 4 pcs", Decimal("91684"), "4 pcs @ 22,921 | Adwin"),
    ("2083-07-15", "51.2V 105 Ah (ServoTech) - 5 pcs", Decimal("570000"), "5 pcs @ 114,000 | ServoTech"),
    ("2083-07-20", "51.2V 210 Ah (Euclion) - 1 pc", Decimal("225000"), "1 pc @ 225,000 | Euclion"),
]

# 5. Second period collections (Credits)
COLLECTIONS_PERIOD_2 = [
    ("2083-05-05", Decimal("300000"), "Collection received from Birtamode"),
    ("2083-05-11", Decimal("1000000"), "Collection received from Birtamode"),
    ("2083-05-12", Decimal("210000"), "Collection received from Birtamode"),
    ("2083-05-13", Decimal("367489"), "Collection received from Birtamode"),
    ("2083-05-14", Decimal("367489"), "Collection received from Birtamode"),
    ("2083-05-26", Decimal("265000"), "Collection received from Birtamode"),
    ("2083-06-09", Decimal("324000"), "Collection received from Birtamode"),
    ("2083-06-12", Decimal("200000"), "Collection received from Birtamode"),
    ("2083-06-15", Decimal("735000"), "Collection received from Birtamode (TRISAKTI)"),
    ("2083-06-16", Decimal("20000"), "Collection received from Birtamode"),
    ("2083-06-16", Decimal("300000"), "Collection received from Birtamode"),
    ("2083-06-20", Decimal("400000"), "Collection received from Birtamode"),
    ("2083-06-23", Decimal("200000"), "Collection received from Birtamode"),
    ("2083-07-20", Decimal("200000"), "Collection received from Birtamode"),
]

# 6. Second period returns (Credits)
RETURNS_PERIOD_2 = [
    ("2083-04-13", "Returned: 51.2V 105Ah (ServoTech) - 1 pc", Decimal("100000"), "Returned 1 pc @ 100,000 | ServoTech"),
    ("2083-04-14", "Returned: 64V 105Ah (Euclion) - 1 pc", Decimal("125000"), "Returned 1 pc @ 125,000 | Euclion"),
]

class Command(BaseCommand):
    help = "Imports Birtamode branch customer and all purchase, return, and payment entries."

    def handle(self, *args, **options):
        admin_user = User.objects.filter(is_superuser=True).first() or User.objects.first()

        # 1. Create or get customer: Birtamode Branch
        customer, created = Customer.objects.get_or_create(
            name="Birtamode Branch",
            defaults={
                "customer_type": Customer.CustomerType.WHOLESALE,
                "user": admin_user,
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS("Created customer 'Birtamode Branch'."))
        else:
            self.stdout.write(self.style.WARNING("Customer 'Birtamode Branch' already exists."))

        # 2. Get categories
        sales_cat, _ = Category.objects.get_or_create(
            name="Sales",
            defaults={"type": Category.Type.EXPENSE} # Expense = Debit to customer
        )
        # Ensure category type matches ledger debit/credit convention
        debit_cat, _ = Category.objects.get_or_create(
            name="Branch Sales (Debit)",
            defaults={"type": Category.Type.EXPENSE}
        )
        credit_cat, _ = Category.objects.get_or_create(
            name="Payment / Return (Credit)",
            defaults={"type": Category.Type.INCOME}
        )

        # Clear previous transactions for clean idempotency if needed
        prev_count = customer.transactions.count()
        if prev_count > 0:
            self.stdout.write(f"Replacing {prev_count} existing transactions for Birtamode Branch...")
            customer.transactions.all().delete()

        created_tx = 0

        # Import Sales (Debits)
        for bs_date, title, amount, desc in SALES_PERIOD_1 + SALES_PERIOD_2:
            ad_date = BS_TO_AD[bs_date]
            Transaction.objects.create(
                user=admin_user,
                customer=customer,
                type=Transaction.Type.EXPENSE,  # Debit increases receivable from customer
                sale_type=Transaction.SaleType.WHOLESALE,
                title=title,
                subtotal=amount,
                amount=amount,
                date=ad_date,
                category=debit_cat,
                description=f"BS Date: {bs_date} | {desc}",
            )
            created_tx += 1

        # Import Collections (Credits)
        for bs_date, amount, desc in COLLECTIONS_PERIOD_1 + COLLECTIONS_PERIOD_2:
            ad_date = BS_TO_AD[bs_date]
            Transaction.objects.create(
                user=admin_user,
                customer=customer,
                type=Transaction.Type.INCOME,   # Credit reduces balance
                sale_type=Transaction.SaleType.WHOLESALE,
                title="Payment Received",
                subtotal=amount,
                amount=amount,
                date=ad_date,
                category=credit_cat,
                description=f"BS Date: {bs_date} | {desc}",
            )
            created_tx += 1

        # Import Returns (Credits)
        for bs_date, title, amount, desc in RETURNS_PERIOD_1 + RETURNS_PERIOD_2:
            ad_date = BS_TO_AD[bs_date]
            Transaction.objects.create(
                user=admin_user,
                customer=customer,
                type=Transaction.Type.INCOME,   # Return credit reduces balance
                sale_type=Transaction.SaleType.WHOLESALE,
                title=title,
                subtotal=amount,
                amount=amount,
                date=ad_date,
                category=credit_cat,
                description=f"BS Date: {bs_date} | {desc}",
            )
            created_tx += 1

        # Summary check
        total_debits = sum(s[2] for s in SALES_PERIOD_1 + SALES_PERIOD_2)
        total_credits = sum(c[1] for c in COLLECTIONS_PERIOD_1 + COLLECTIONS_PERIOD_2) + sum(r[2] for r in RETURNS_PERIOD_1 + RETURNS_PERIOD_2)
        net_due = total_debits - total_credits

        self.stdout.write(self.style.SUCCESS(f"\nSuccessfully imported {created_tx} entries for Birtamode Branch!"))
        self.stdout.write(f"Total Sales (Debit):    NPR {total_debits:,.2f}")
        self.stdout.write(f"Total Received + Return: NPR {total_credits:,.2f}")
        self.stdout.write(self.style.SUCCESS(f"Current Net Due Amount: NPR {net_due:,.2f} (matches Excel NPR 2,159,918.00)"))
