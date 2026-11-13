# Company Finance — Income & Expenses

A Django-backed web app to track company income and expenses with a clean HTML/CSS/JS frontend.

## Features

- Dashboard with total income, total expenses, and net balance
- Add, edit, and delete transactions
- Filter by type, category, and date range
- Pre-seeded categories for common business use cases
- Django admin for advanced management

## Quick start

```bash
# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run migrations and seed default categories
python manage.py migrate
python manage.py seed_categories

# Start the development server
python manage.py runserver
```

Open [http://127.0.0.1:8000/](http://127.0.0.1:8000/) in your browser.

## Data model

| Model | Fields |
|-------|--------|
| **Category** | name, type (income/expense) |
| **Transaction** | type, title, amount, date, category, description |

## API endpoints

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/summary/` | Income, expense, and net totals |
| GET | `/api/categories/` | List categories (`?type=income\|expense`) |
| GET | `/api/transactions/` | List transactions (supports filters) |
| POST | `/api/transactions/` | Create a transaction |
| GET/PUT/DELETE | `/api/transactions/<id>/` | Read, update, or delete |

## Admin

Create a superuser to access Django admin at `/admin/`:

```bash
python manage.py createsuperuser
```

## Project structure

```
Expenses_Business/
├── config/              # Django project settings
├── finance/             # Main app (models, views, templates, static)
├── manage.py
└── requirements.txt
```

<!-- Trigger deploy -->
