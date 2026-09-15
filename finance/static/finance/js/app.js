const API = {
  summary: "/api/summary/",
  categories: "/api/categories/",
  customers: "/api/customers/",
  transactions: "/api/transactions/",
  transaction: (id) => `/api/transactions/${id}/`,
};

const state = {
  categories: [],
  customers: [],
  transactions: [],
  editingId: null,
};

const els = {
  totalIncome: document.getElementById("totalIncome"),
  totalExpense: document.getElementById("totalExpense"),
  netBalance: document.getElementById("netBalance"),
  custReceivables: document.getElementById("custReceivables"),
  custPayables: document.getElementById("custPayables"),
  transactionsBody: document.getElementById("transactionsBody"),
  transactionCount: document.getElementById("transactionCount"),
  filterType: document.getElementById("filterType"),
  filterCategory: document.getElementById("filterCategory"),
  filterDateFrom: document.getElementById("filterDateFrom"),
  filterDateTo: document.getElementById("filterDateTo"),
  clearFiltersBtn: document.getElementById("clearFiltersBtn"),
  addTransactionBtn: document.getElementById("addTransactionBtn"),
  modal: document.getElementById("transactionModal"),
  modalTitle: document.getElementById("modalTitle"),
  form: document.getElementById("transactionForm"),
  transactionId: document.getElementById("transactionId"),
  transactionType: document.getElementById("transactionType"),
  transactionDate: document.getElementById("transactionDate"),
  transactionTitle: document.getElementById("transactionTitle"),
  transactionAmount: document.getElementById("transactionAmount"),
  transactionCategory: document.getElementById("transactionCategory"),
  transactionCustomer: document.getElementById("transactionCustomer"),
  transactionDescription: document.getElementById("transactionDescription"),
  formError: document.getElementById("formError"),
  toast: document.getElementById("toast"),
};

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

async function apiFetch(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const csrf = getCookie("csrftoken");
  if (csrf && options.method && options.method !== "GET") {
    headers["X-CSRFToken"] = csrf;
  }
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Something went wrong");
  }
  return data;
}

function formatMoney(value) {
  const num = Number(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "NPR",
  }).format(Number.isFinite(num) ? num : 0);
}

function formatDate(isoDate) {
  return new Date(isoDate + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function showToast(message) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.hidden = false;
  els.toast.classList.add("is-visible");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    els.toast.classList.remove("is-visible");
    els.toast.hidden = true;
  }, 2800);
}

function populateCategorySelect(selectEl, type, selectedId = "") {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  const filtered = state.categories.filter((c) => !type || c.type === type);
  if (!filtered.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No categories available";
    selectEl.appendChild(opt);
    return;
  }
  filtered.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = cat.name;
    if (String(cat.id) === String(selectedId)) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

function populateFilterCategories() {
  if (!els.filterCategory) return;
  const current = els.filterCategory.value;
  els.filterCategory.innerHTML = '<option value="">All categories</option>';
  state.categories.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = `${cat.name} (${cat.type})`;
    els.filterCategory.appendChild(opt);
  });
  els.filterCategory.value = current;
}

function renderTransactions() {
  const rows = state.transactions;
  if (els.transactionCount) {
    els.transactionCount.textContent = `${rows.length} record${rows.length === 1 ? "" : "s"}`;
  }

  if (!rows.length) {
    if (els.transactionsBody) {
      els.transactionsBody.innerHTML =
        '<tr><td colspan="7" class="empty-state">No transactions recorded yet. Click "New Transaction" to add one!</td></tr>';
    }
    return;
  }

  if (els.transactionsBody) {
    els.transactionsBody.innerHTML = rows
      .map(
        (tx) => `
        <tr>
          <td>${formatDate(tx.date)}</td>
          <td><strong>${escapeHtml(tx.title)}</strong></td>
          <td>${escapeHtml(tx.customer_name || "-")}</td>
          <td>${escapeHtml(tx.category_name)}</td>
          <td><span class="badge badge--${tx.type}">${tx.type}</span></td>
          <td class="text-right amount--${tx.type}">${formatMoney(tx.amount)}</td>
          <td>
            <button type="button" class="btn btn--edit" data-edit="${tx.id}">Edit</button>
            <button type="button" class="btn btn--danger" data-delete="${tx.id}">Delete</button>
          </td>
        </tr>`
      )
      .join("");
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}

async function loadSummary() {
  const data = await apiFetch(API.summary);
  if (els.totalIncome) els.totalIncome.textContent = formatMoney(data.total_income);
  if (els.totalExpense) els.totalExpense.textContent = formatMoney(data.total_expense);
  if (els.netBalance) {
    els.netBalance.textContent = formatMoney(data.net_balance);
    els.netBalance.style.color = Number(data.net_balance) >= 0 ? "var(--income)" : "var(--expense)";
  }
  if (els.custReceivables) els.custReceivables.textContent = formatMoney(data.customer_receivables || 0);
  if (els.custPayables) els.custPayables.textContent = formatMoney(data.customer_payables || 0);
}

async function loadCategories() {
  const data = await apiFetch(API.categories);
  state.categories = data.categories;
  populateFilterCategories();
}

async function loadCustomers() {
  const data = await apiFetch(API.customers);
  state.customers = data.customers;
  
  if (els.transactionCustomer) {
    const current = els.transactionCustomer.value;
    els.transactionCustomer.innerHTML = '<option value="">None / General</option>';
    state.customers.forEach((cust) => {
      const opt = document.createElement("option");
      opt.value = cust.id;
      opt.textContent = cust.name;
      els.transactionCustomer.appendChild(opt);
    });
    els.transactionCustomer.value = current;
  }
}

async function loadTransactions() {
  const params = new URLSearchParams();
  if (els.filterType && els.filterType.value) params.set("type", els.filterType.value);
  if (els.filterCategory && els.filterCategory.value) params.set("category", els.filterCategory.value);
  if (els.filterDateFrom && els.filterDateFrom.value) params.set("date_from", els.filterDateFrom.value);
  if (els.filterDateTo && els.filterDateTo.value) params.set("date_to", els.filterDateTo.value);

  const query = params.toString();
  const url = query ? `${API.transactions}?${query}` : API.transactions;
  const data = await apiFetch(url);
  state.transactions = data.transactions;
  renderTransactions();
}

async function refreshAll() {
  await Promise.all([loadSummary(), loadCategories(), loadCustomers(), loadTransactions()]);
}

function openModal(mode = "add", transaction = null) {
  state.editingId = mode === "edit" ? transaction.id : null;
  if (els.modalTitle) els.modalTitle.textContent = mode === "edit" ? "Edit Transaction" : "Add Transaction";
  if (els.formError) els.formError.hidden = true;

  const type = transaction?.type || "income";
  if (els.transactionType) els.transactionType.value = type;
  if (els.transactionDate) els.transactionDate.value = transaction?.date || new Date().toISOString().slice(0, 10);
  if (els.transactionTitle) els.transactionTitle.value = transaction?.title || "";
  if (els.transactionAmount) els.transactionAmount.value = transaction?.amount || "";
  if (els.transactionCustomer) els.transactionCustomer.value = transaction?.customer_id || "";
  if (els.transactionDescription) els.transactionDescription.value = transaction?.description || "";
  if (els.transactionId) els.transactionId.value = transaction?.id || "";

  populateCategorySelect(els.transactionCategory, type, transaction?.category_id);
  if (els.modal) {
    els.modal.classList.add("is-open");
    els.modal.setAttribute("aria-hidden", "false");
  }
}

function closeModal() {
  if (els.modal) {
    els.modal.classList.remove("is-open");
    els.modal.setAttribute("aria-hidden", "true");
  }
  if (els.form) els.form.reset();
  state.editingId = null;
}

async function saveTransaction(event) {
  event.preventDefault();
  if (els.formError) els.formError.hidden = true;

  const payload = {
    type: els.transactionType.value,
    title: els.transactionTitle.value,
    amount: els.transactionAmount.value,
    date: els.transactionDate.value,
    category_id: Number(els.transactionCategory.value),
    customer_id: els.transactionCustomer.value ? Number(els.transactionCustomer.value) : null,
    description: els.transactionDescription.value,
  };

  try {
    if (state.editingId) {
      await apiFetch(API.transaction(state.editingId), {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      showToast("Transaction updated");
    } else {
      await apiFetch(API.transactions, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showToast("Transaction added");
    }
    closeModal();
    await refreshAll();
  } catch (err) {
    if (els.formError) {
      els.formError.textContent = err.message;
      els.formError.hidden = false;
    }
  }
}

async function deleteTransaction(id) {
  if (!confirm("Delete this transaction?")) return;
  try {
    await apiFetch(API.transaction(id), { method: "DELETE" });
    showToast("Transaction deleted");
    await refreshAll();
  } catch (err) {
    showToast(err.message);
  }
}

if (els.addTransactionBtn) els.addTransactionBtn.addEventListener("click", () => openModal("add"));
if (els.form) els.form.addEventListener("submit", saveTransaction);
if (els.transactionType) {
  els.transactionType.addEventListener("change", () => {
    populateCategorySelect(els.transactionCategory, els.transactionType.value);
  });
}

document.querySelectorAll("[data-close-modal]").forEach((el) => {
  el.addEventListener("click", closeModal);
});

if (els.transactionsBody) {
  els.transactionsBody.addEventListener("click", (event) => {
    const editBtn = event.target.closest("[data-edit]");
    const deleteBtn = event.target.closest("[data-delete]");
    if (editBtn) {
      const tx = state.transactions.find((t) => String(t.id) === editBtn.dataset.edit);
      if (tx) openModal("edit", tx);
    }
    if (deleteBtn) {
      deleteTransaction(deleteBtn.dataset.delete);
    }
  });
}

[els.filterType, els.filterCategory, els.filterDateFrom, els.filterDateTo].forEach((el) => {
  if (el) el.addEventListener("change", loadTransactions);
});

if (els.clearFiltersBtn) {
  els.clearFiltersBtn.addEventListener("click", () => {
    if (els.filterType) els.filterType.value = "";
    if (els.filterCategory) els.filterCategory.value = "";
    if (els.filterDateFrom) els.filterDateFrom.value = "";
    if (els.filterDateTo) els.filterDateTo.value = "";
    loadTransactions();
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && els.modal && els.modal.classList.contains("is-open")) {
    closeModal();
  }
});

function initThemeToggle() {
  const toggleBtn = document.getElementById("themeToggleBtn");
  if (!toggleBtn) return;
  const updateIcon = () => {
    const isDark = (document.documentElement.getAttribute("data-theme") || "dark") === "dark";
    toggleBtn.innerHTML = isDark ? '<i class="fa-solid fa-sun" style="color:#f59e0b;"></i>' : '<i class="fa-solid fa-moon"></i>';
  };
  updateIcon();
  toggleBtn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    updateIcon();
  });
}
document.addEventListener("DOMContentLoaded", initThemeToggle);
initThemeToggle();

refreshAll().catch((err) => {
  if (els.transactionsBody) {
    els.transactionsBody.innerHTML =
      `<tr><td colspan="7" class="empty-state">Failed to load: ${escapeHtml(err.message)}</td></tr>`;
  }
});
