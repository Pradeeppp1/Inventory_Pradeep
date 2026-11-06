import re

from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User

USERNAME_RE = re.compile(r"^[A-Za-z0-9._-]{3,32}$")
STAFF_NO_RE = re.compile(r"^[A-Za-z0-9._-]{2,20}$")


class CustomUserCreationForm(UserCreationForm):
    ROLE_CHOICES = (
        ("salesman", "🏷️ Salesperson — Sales Bills, POS & Customers"),
        ("accountant", "📊 Accountant — Expenses, Customer Ledgers & Billing"),
        ("receptionist", "🛎️ Receptionist — Front Desk, Inquiries & Invoices"),
        ("staff", "👤 General Staff — Daily Operations & Billing"),
        ("manager", "👔 Manager — Sales, Inventory & Financial Reports"),
        ("admin", "🛡️ Admin — Full System Control & Access Approval"),
    )

    full_name = forms.CharField(
        max_length=150,
        required=True,
        label="Full Name",
        widget=forms.TextInput(attrs={"placeholder": "e.g. Ramesh Karki", "autofocus": True}),
    )
    email = forms.EmailField(
        required=True,
        label="Gmail / Work Email",
        widget=forms.EmailInput(attrs={"placeholder": "e.g. yourname@gmail.com"}),
    )
    staff_number = forms.CharField(
        max_length=25,
        required=True,
        label="Staff No. / Employee ID",
        widget=forms.TextInput(attrs={"placeholder": "e.g. STF-014 or ECO-102"}),
    )
    phone = forms.CharField(
        max_length=20,
        required=False,
        label="Mobile Phone",
        widget=forms.TextInput(attrs={"placeholder": "e.g. 9801234567"}),
    )
    requested_role = forms.ChoiceField(
        choices=ROLE_CHOICES,
        initial="salesman",
        required=True,
        label="Requested Job Role",
    )

    class Meta(UserCreationForm.Meta):
        model = User
        fields = ("username", "full_name", "email", "staff_number", "phone", "requested_role")

    def clean_username(self):
        username = (self.cleaned_data.get("username") or "").strip()
        if not USERNAME_RE.fullmatch(username):
            raise forms.ValidationError(
                "Use 3–32 characters: letters, numbers, dots, hyphens, or underscores."
            )
        return username

    def clean_email(self):
        email = (self.cleaned_data.get("email") or "").strip().lower()
        if not email:
            raise forms.ValidationError("Please provide a valid Gmail or work email.")
        if User.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError("This email is already registered in the system.")
        return email

    def clean_staff_number(self):
        staff_no = (self.cleaned_data.get("staff_number") or "").strip().upper()
        if not STAFF_NO_RE.fullmatch(staff_no):
            raise forms.ValidationError(
                "Staff ID must be 2–20 alphanumeric characters (e.g. STF-014, ECO-102)."
            )
        for u in User.objects.exclude(last_name=""):
            existing = u.last_name.split("|")[0].strip().upper()
            if existing == staff_no:
                raise forms.ValidationError(f"Staff ID '{staff_no}' is already registered to another user.")
        return staff_no

    def clean_full_name(self):
        name = (self.cleaned_data.get("full_name") or "").strip()
        if len(name) < 2:
            raise forms.ValidationError("Please enter your full legal name.")
        return name

    def save(self, commit=True):
        user = super().save(commit=False)
        user.first_name = self.cleaned_data.get("full_name", "").strip()
        user.email = self.cleaned_data.get("email", "").strip().lower()

        staff_no = self.cleaned_data.get("staff_number", "").strip().upper()
        phone = (self.cleaned_data.get("phone") or "").strip()
        user.last_name = f"{staff_no}|{phone}" if phone else staff_no

        if commit:
            user.save()
        return user
