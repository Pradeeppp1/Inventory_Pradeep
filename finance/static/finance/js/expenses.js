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
  expTotalExpenses: document.getElementById("expTotalExpenses"),
  expTotalIncome: document.getElementById("expTotalIncome"),
  expNetBalance: document.getElementById("expNetBalance"),
  expensesBody: document.getElementById("expensesBody"),
  expRecordCount: document.getElementById("expRecordCount"),
  expFilterType: document.getElementById("expFilterType"),
  expFilterCategory: document.getElementById("expFilterCategory"),
  expFilterCustomer: document.getElementById("expFilterCustomer"),
  expFilterFrom: document.getElementById("expFilterFrom"),
  expFilterTo: document.getElementById("expFilterTo"),
  expAddBtn: document.getElementById("expAddBtn"),
  expModal: document.getElementById("expModal"),
  expModalTitle: document.getElementById("expModalTitle"),
  expForm: document.getElementById("expForm"),
  expId: document.getElementById("expId"),
  expType: document.getElementById("expType"),
  expDate: document.getElementById("expDate"),
  expTitle: document.getElementById("expTitle"),
  expAmount: document.getElementById("expAmount"),
  expCategory: document.getElementById("expCategory"),
  expCustomer: document.getElementById("expCustomer"),
  expDescription: document.getElementById("expDescription"),
  expFormError: document.getElementById("expFormError"),
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
  if (!response.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

function formatMoney(value) {
  const num = Number(value);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "NPR" }).format(Number.isFinite(num) ? num : 0);
}

function formatDate(isoDate) {
  return new Date(isoDate + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  els.toast.classList.add("is-visible");
  setTimeout(() => { els.toast.classList.remove("is-visible"); els.toast.hidden = true; }, 2800);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}

function populateCategorySelect(selectEl, type, selectedId = "") {
  selectEl.innerHTML = "";
  const filtered = state.categories.filter((c) => !type || c.type === type);
  if (!filtered.length) {
    selectEl.innerHTML = '<option value="">No categories</option>';
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

function populateDropdowns() {
  // Filter category
  els.expFilterCategory.innerHTML = '<option value="">All Categories</option>';
  state.categories.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = `${cat.name} (${cat.type})`;
    els.expFilterCategory.appendChild(opt);
  });

  // Filter customer & Modal customer
  els.expFilterCustomer.innerHTML = '<option value="">All Customers</option>';
  els.expCustomer.innerHTML = '<option value="">None / General</option>';
  state.customers.forEach((c) => {
    const opt1 = document.createElement("option");
    opt1.value = c.id;
    opt1.textContent = c.name;
    els.expFilterCustomer.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = c.id;
    opt2.textContent = c.name;
    els.expCustomer.appendChild(opt2);
  });
}

function renderExpenses() {
  const rows = state.transactions;
  els.expRecordCount.textContent = `${rows.length} record${rows.length === 1 ? "" : "s"}`;

  if (!rows.length) {
    els.expensesBody.innerHTML = '<tr><td colspan="7" class="empty-state">No matching expenses found.</td></tr>';
    return;
  }

  els.expensesBody.innerHTML = rows
    .map(
      (tx) => `
      <tr>
        <td>${formatDate(tx.date)}</td>
        <td><strong>${escapeHtml(tx.title)}</strong>${tx.description ? `<br><small style="color:var(--text-muted);">${escapeHtml(tx.description)}</small>` : ""}</td>
        <td><span style="font-size:0.85rem; padding: 0.2rem 0.5rem; background: var(--surface-2); border-radius:4px;">${escapeHtml(tx.category_name)}</span></td>
        <td>${escapeHtml(tx.customer_name || "-")}</td>
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

async function loadSummary() {
  const data = await apiFetch(API.summary);
  els.expTotalExpenses.textContent = formatMoney(data.total_expense);
  els.expTotalIncome.textContent = formatMoney(data.total_income);
  els.expNetBalance.textContent = formatMoney(data.net_balance);
  els.expNetBalance.style.color = Number(data.net_balance) >= 0 ? "var(--income)" : "var(--expense)";
}

async function loadExpenses() {
  const params = new URLSearchParams();
  if (els.expFilterType.value) params.set("type", els.expFilterType.value);
  if (els.expFilterCategory.value) params.set("category", els.expFilterCategory.value);
  if (els.expFilterCustomer.value) params.set("customer", els.expFilterCustomer.value);
  if (els.expFilterFrom.value) params.set("date_from", els.expFilterFrom.value);
  if (els.expFilterTo.value) params.set("date_to", els.expFilterTo.value);

  const query = params.toString();
  const url = query ? `${API.transactions}?${query}` : API.transactions;
  const data = await apiFetch(url);
  state.transactions = data.transactions;
  renderExpenses();
}

async function refreshAll() {
  const [sumRes, catRes, custRes] = await Promise.all([
    apiFetch(API.summary),
    apiFetch(API.categories),
    apiFetch(API.customers),
  ]);
  state.categories = catRes.categories;
  state.customers = custRes.customers;
  
  els.expTotalExpenses.textContent = formatMoney(sumRes.total_expense);
  els.expTotalIncome.textContent = formatMoney(sumRes.total_income);
  els.expNetBalance.textContent = formatMoney(sumRes.net_balance);
  els.expNetBalance.style.color = Number(sumRes.net_balance) >= 0 ? "var(--income)" : "var(--expense)";

  populateDropdowns();
  await loadExpenses();
}

function openModal(mode = "add", tx = null) {
  state.editingId = mode === "edit" ? tx.id : null;
  els.expModalTitle.textContent = mode === "edit" ? "Edit Expense / Transaction" : "Record Expense / Transaction";
  els.expFormError.hidden = true;

  const type = tx?.type || "expense";
  els.expType.value = type;
  els.expDate.value = tx?.date || new Date().toISOString().slice(0, 10);
  els.expTitle.value = tx?.title || "";
  els.expAmount.value = tx?.amount || "";
  els.expCustomer.value = tx?.customer_id || "";
  els.expDescription.value = tx?.description || "";
  els.expId.value = tx?.id || "";

  populateCategorySelect(els.expCategory, type, tx?.category_id);
  els.expModal.classList.add("is-open");
}

function closeModal() {
  els.expModal.classList.remove("is-open");
  els.expForm.reset();
  state.editingId = null;
}

async function saveExpense(e) {
  e.preventDefault();
  els.expFormError.hidden = true;

  const payload = {
    type: els.expType.value,
    title: els.expTitle.value,
    amount: els.expAmount.value,
    date: els.expDate.value,
    category_id: Number(els.expCategory.value),
    customer_id: els.expCustomer.value ? Number(els.expCustomer.value) : null,
    description: els.expDescription.value,
  };

  try {
    if (state.editingId) {
      await apiFetch(API.transaction(state.editingId), { method: "PUT", body: JSON.stringify(payload) });
      showToast("Expense updated");
    } else {
      await apiFetch(API.transactions, { method: "POST", body: JSON.stringify(payload) });
      showToast("Expense recorded");
    }
    closeModal();
    await refreshAll();
  } catch (err) {
    els.expFormError.textContent = err.message;
    els.expFormError.hidden = false;
  }
}

async function deleteExpense(id) {
  if (!confirm("Are you sure you want to delete this record?")) return;
  try {
    await apiFetch(API.transaction(id), { method: "DELETE" });
    showToast("Record deleted");
    await refreshAll();
  } catch (err) {
    showToast(err.message);
  }
}

els.expAddBtn.addEventListener("click", () => openModal("add"));
els.expForm.addEventListener("submit", saveExpense);
els.expType.addEventListener("change", () => populateCategorySelect(els.expCategory, els.expType.value));

document.querySelectorAll("[data-close-exp-modal]").forEach((el) => el.addEventListener("click", closeModal));

els.expensesBody.addEventListener("click", (e) => {
  const editBtn = e.target.closest("[data-edit]");
  const deleteBtn = e.target.closest("[data-delete]");
  if (editBtn) {
    const tx = state.transactions.find((t) => String(t.id) === editBtn.dataset.edit);
    if (tx) openModal("edit", tx);
  }
  if (deleteBtn) deleteExpense(deleteBtn.dataset.delete);
});

[els.expFilterType, els.expFilterCategory, els.expFilterCustomer, els.expFilterFrom, els.expFilterTo].forEach((el) => {
  el.addEventListener("change", loadExpenses);
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
  els.expensesBody.innerHTML = `<tr><td colspan="7" class="empty-state">Failed to load: ${escapeHtml(err.message)}</td></tr>`;
});
