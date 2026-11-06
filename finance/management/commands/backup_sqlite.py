import sqlite3
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone


class Command(BaseCommand):
    help = "Create a consistent SQLite backup using SQLite's online backup API."

    def add_arguments(self, parser):
        parser.add_argument(
            "--output-dir",
            default=str(settings.BASE_DIR / "backups"),
            help="Directory where the backup file will be written.",
        )

    def handle(self, *args, **options):
        db = settings.DATABASES["default"]
        if db["ENGINE"] != "django.db.backends.sqlite3":
            raise CommandError("backup_sqlite only supports the SQLite database backend.")

        source = Path(db["NAME"])
        if not source.exists():
            raise CommandError(f"SQLite database not found: {source}")

        output_dir = Path(options["output_dir"])
        output_dir.mkdir(parents=True, exist_ok=True)
        timestamp = timezone.now().strftime("%Y%m%d-%H%M%S")
        destination = output_dir / f"{source.stem}-{timestamp}.sqlite3"

        with sqlite3.connect(source) as src, sqlite3.connect(destination) as dst:
            src.backup(dst)

        self.stdout.write(self.style.SUCCESS(f"Backup created: {destination}"))
