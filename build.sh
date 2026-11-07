#!/usr/bin/env bash
# Exit immediately if a command exits with a non-zero status
set -o errexit

echo "📦 Installing Python dependencies..."
pip install -r requirements.txt

echo "🎨 Collecting static files with WhiteNoise..."
python manage.py collectstatic --no-input

echo "🗄️ Applying database migrations..."
python manage.py migrate

echo "🌱 Ensuring default categories are seeded..."
python manage.py seed_categories || true

echo "👤 Ensuring Admin account is configured..."
python manage.py setup_admin || true

echo "🏢 Importing Birtamode Branch data..."
python manage.py import_birtamode || true

echo "✅ Build completed successfully!"
