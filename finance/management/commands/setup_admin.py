import os
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from finance.models import UserProfile

class Command(BaseCommand):
    help = "Auto-creates or resets an admin user from environment variables"

    def handle(self, *args, **options):
        username = os.environ.get("ADMIN_USERNAME", "admin").strip()
        email = os.environ.get("ADMIN_EMAIL", "admin@ecolith.com").strip()
        password = os.environ.get("ADMIN_PASSWORD", "AdminPass1234!").strip()

        user, created = User.objects.get_or_create(
            username=username,
            defaults={"email": email, "is_staff": True, "is_superuser": True}
        )

        user.set_password(password)
        user.is_staff = True
        user.is_superuser = True
        user.is_active = True
        user.save()

        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.role = UserProfile.Role.ADMIN
        profile.is_approved = True
        profile.save()

        action = "Created" if created else "Updated"
        self.stdout.write(self.style.SUCCESS(f"{action} admin user '{username}' successfully."))
