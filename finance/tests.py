import json
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.cache import cache
from django.db.models import ProtectedError
from django.test import TestCase
from django.urls import reverse

from .models import AuditEvent, Category, Customer, InventoryItem, SalesBill, Transaction, UserProfile


class SecurityRegressionTests(TestCase):
    def setUp(self):
        cache.clear()
        self.expense_cat = Category.objects.create(name="Sales Invoice", type=Category.Type.EXPENSE)
        self.income_cat = Category.objects.create(name="Payment", type=Category.Type.INCOME)
        self.user = self._approved_user("owner", UserProfile.Role.MANAGER)
        self.other = self._approved_user("other", UserProfile.Role.MANAGER)
        self.client.force_login(self.user)

    def _approved_user(self, username, role):
        user = User.objects.create_user(username=username, password="StrongPass12345")
        profile = user.userprofile
        profile.role = role
        profile.is_approved = True
        profile.save()
        return user

    def _json(self, method, url, payload):
        return getattr(self.client, method)(
            url,
            data=json.dumps(payload),
            content_type="application/json",
        )

    def test_transaction_detail_is_shared_with_approved_coworker(self):
        tx = Transaction.objects.create(
            user=self.other,
            type=Transaction.Type.EXPENSE,
            title="Other sale",
            amount=Decimal("100.00"),
            subtotal=Decimal("100.00"),
            date="2026-10-10",
            category=self.expense_cat,
        )

        response = self.client.get(reverse("api_transaction_detail", args=[tx.pk]))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["transaction"]["id"], tx.pk)

    def test_transaction_rejects_unsafe_amounts_and_discounts(self):
        payload = {
            "type": "expense",
            "title": "Bad discount",
            "amount": "100",
            "subtotal": "100",
            "discount": "101",
            "discount_type": "percent",
            "date": "2026-10-10",
            "category_id": self.expense_cat.pk,
        }

        response = self._json("post", reverse("api_transactions"), payload)

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Transaction.objects.exists())

    def test_posted_transaction_delete_is_blocked_for_audit(self):
        tx = Transaction.objects.create(
            user=self.user,
            type=Transaction.Type.INCOME,
            title="Payment",
            amount=Decimal("50.00"),
            subtotal=Decimal("50.00"),
            date="2026-10-10",
            category=self.income_cat,
        )

        response = self.client.delete(reverse("api_transaction_detail", args=[tx.pk]))

        self.assertEqual(response.status_code, 405)
        self.assertTrue(Transaction.objects.filter(pk=tx.pk).exists())

    def test_inventory_sku_is_company_unique_and_non_negative(self):
        payload = {
            "sku": "SKU-1",
            "name": "Tile",
            "category": "Flooring",
            "unit": "pcs",
            "cost_price": "10",
            "selling_price": "12",
            "wholesale_price": "11",
            "quantity": 5,
            "reorder_level": 1,
        }

        first = self._json("post", reverse("api_inventory"), payload)
        duplicate = self._json("post", reverse("api_inventory"), payload)
        negative = self._json("post", reverse("api_inventory"), {**payload, "sku": "SKU-2", "quantity": -1})

        self.assertEqual(first.status_code, 201)
        self.assertEqual(duplicate.status_code, 400)
        self.assertEqual(negative.status_code, 400)

    def test_customers_inventory_and_bills_are_shared_company_records(self):
        customer = Customer.objects.create(user=self.other, name="Shared Buyer")
        item = InventoryItem.objects.create(
            user=self.other,
            sku="SHARED-1",
            name="Shared Panel",
            cost_price=Decimal("10.00"),
            selling_price=Decimal("15.00"),
            wholesale_price=Decimal("14.00"),
            quantity=5,
        )
        bill = SalesBill.objects.create(
            user=self.other,
            customer=customer,
            date="2026-10-10",
            payment_mode=SalesBill.PaymentMode.CASH,
            subtotal=Decimal("15.00"),
            grand_total=Decimal("15.00"),
        )

        customers_response = self.client.get(reverse("api_customers"))
        inventory_response = self.client.get(reverse("api_inventory"))
        bill_response = self.client.get(reverse("api_sales_bill_detail", args=[bill.pk]))

        self.assertEqual(customers_response.status_code, 200)
        self.assertIn(customer.pk, [c["id"] for c in customers_response.json()["customers"]])
        self.assertEqual(inventory_response.status_code, 200)
        self.assertIn(item.pk, [i["id"] for i in inventory_response.json()["inventory"]])
        self.assertEqual(bill_response.status_code, 200)
        self.assertEqual(bill_response.json()["bill"]["id"], bill.pk)

    def test_salesman_can_view_shared_inventory_but_cannot_edit_it(self):
        salesman = self._approved_user("salesman", UserProfile.Role.SALESMAN)
        item = InventoryItem.objects.create(
            user=self.other,
            sku="VIEW-1",
            name="View Only Panel",
            cost_price=Decimal("10.00"),
            selling_price=Decimal("15.00"),
            wholesale_price=Decimal("14.00"),
            quantity=5,
        )
        self.client.force_login(salesman)

        list_response = self.client.get(reverse("api_inventory"))
        adjust_response = self._json("post", reverse("api_inventory_adjust", args=[item.pk]), {"change": 1})

        self.assertEqual(list_response.status_code, 200)
        self.assertIn(item.pk, [i["id"] for i in list_response.json()["inventory"]])
        self.assertEqual(adjust_response.status_code, 403)

    def test_sales_bill_oversell_is_rejected_and_rolled_back(self):
        customer = Customer.objects.create(user=self.user, name="Buyer")
        item = InventoryItem.objects.create(
            user=self.user,
            sku="SKU-3",
            name="Panel",
            cost_price=Decimal("10.00"),
            selling_price=Decimal("15.00"),
            wholesale_price=Decimal("14.00"),
            quantity=2,
        )
        payload = {
            "date": "2026-10-10",
            "customer_id": customer.pk,
            "payment_mode": "cash",
            "items": [
                {
                    "inventory_item_id": item.pk,
                    "quantity": 3,
                    "unit_price": "15.00",
                }
            ],
        }

        response = self._json("post", reverse("api_sales_bills"), payload)
        item.refresh_from_db()

        self.assertEqual(response.status_code, 400)
        self.assertEqual(item.quantity, 2)
        self.assertFalse(SalesBill.objects.exists())

    def test_sales_bill_delete_is_blocked_and_cancel_restores_stock_once(self):
        customer = Customer.objects.create(user=self.user, name="Buyer")
        item = InventoryItem.objects.create(
            user=self.user,
            sku="SKU-4",
            name="Panel",
            cost_price=Decimal("10.00"),
            selling_price=Decimal("15.00"),
            wholesale_price=Decimal("14.00"),
            quantity=5,
        )
        payload = {
            "date": "2026-10-10",
            "customer_id": customer.pk,
            "payment_mode": "cash",
            "items": [{"inventory_item_id": item.pk, "quantity": 2, "unit_price": "15.00"}],
        }
        create_response = self._json("post", reverse("api_sales_bills"), payload)
        bill_id = create_response.json()["bill"]["id"]
        item.refresh_from_db()
        self.assertEqual(item.quantity, 3)

        delete_response = self.client.delete(reverse("api_sales_bill_detail", args=[bill_id]))
        cancel_response = self._json("post", reverse("api_cancel_bill", args=[bill_id]), {"reason": "Wrong bill"})
        second_cancel = self._json("post", reverse("api_cancel_bill", args=[bill_id]), {"reason": "Again"})
        item.refresh_from_db()

        self.assertEqual(delete_response.status_code, 405)
        self.assertEqual(cancel_response.status_code, 200)
        self.assertEqual(second_cancel.status_code, 400)
        self.assertEqual(item.quantity, 5)
        self.assertTrue(AuditEvent.objects.filter(action="sales_bill.cancel").exists())

    def test_employee_user_with_records_cannot_be_deleted(self):
        Customer.objects.create(user=self.user, name="Retained customer")

        with self.assertRaises(ProtectedError):
            self.user.delete()

    def test_successful_login_is_audited_and_remember_sets_session_age(self):
        self.client.logout()

        response = self.client.post(
            reverse("login"),
            {"username": "owner", "password": "StrongPass12345", "remember": "on"},
        )

        self.assertRedirects(response, reverse("dashboard"))
        self.assertTrue(AuditEvent.objects.filter(action="auth.login.success", target_id=str(self.user.pk)).exists())
        self.assertGreater(self.client.session.get_expiry_age(), 60 * 60 * 7)

    def test_unremembered_login_expires_on_browser_close(self):
        self.client.logout()

        response = self.client.post(
            reverse("login"),
            {"username": "owner", "password": "StrongPass12345"},
        )

        self.assertRedirects(response, reverse("dashboard"))
        self.assertEqual(self.client.session.get_expire_at_browser_close(), True)

    def test_account_login_lockout_follows_identifier_across_ips(self):
        self.client.logout()
        login_url = reverse("login")

        for idx in range(5):
            response = self.client.post(
                login_url,
                {"username": "owner", "password": "wrong-password"},
                REMOTE_ADDR=f"10.0.0.{idx + 1}",
            )
            self.assertEqual(response.status_code, 200)

        locked_response = self.client.post(
            login_url,
            {"username": "owner", "password": "StrongPass12345"},
            REMOTE_ADDR="10.0.0.99",
        )

        self.assertEqual(locked_response.status_code, 200)
        self.assertContains(locked_response, "Too many failed attempts")
        self.assertFalse("_auth_user_id" in self.client.session)
        self.assertTrue(AuditEvent.objects.filter(action="auth.login.locked").exists())
