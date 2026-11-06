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
  const num = Number.isFinite(Number(value)) ? Number(value) : 0;
  const hasCents = num % 1 !== 0;
  return "NPR " + num.toLocaleString("en-US", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  });
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

function renderDashPieChart(containerId, items, centerTitle = "CASH FLOW", centerVal = "") {
  const container = document.getElementById(containerId);
  if (!container) return;

  const validItems = (items || []).filter(it => Number(it.value) > 0);
  const total = validItems.reduce((sum, it) => sum + Number(it.value), 0);

  if (!total || !validItems.length) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 2rem 1rem;">
        <i class="fa-solid fa-chart-pie" style="font-size: 1.8rem; margin-bottom: 0.5rem; opacity: 0.4;"></i>
        <p>No transaction data recorded yet.</p>
      </div>`;
    return;
  }

  const radius = 68;
  const circumference = 2 * Math.PI * radius;
  let offsetAccum = 0;

  let circles = "";
  if (validItems.length === 1) {
    const item = validItems[0];
    circles = `
      <circle cx="85" cy="85" r="${radius}"
              fill="none"
              stroke="${item.color || '#10b981'}"
              stroke-width="26"
              style="transition: stroke-width 0.2s;"
              data-label="${escapeHtml(item.label)}"
              data-val="${escapeHtml(formatMoney(item.value))}">
      </circle>
    `;
  } else {
    circles = validItems.map(item => {
      const fraction = Number(item.value) / total;
      const strokeDash = fraction * circumference;
      const gap = Math.max(0, circumference - strokeDash);
      const strokeOffset = -offsetAccum;
      offsetAccum += strokeDash;

      return `
        <circle cx="85" cy="85" r="${radius}"
                fill="none"
                stroke="${item.color}"
                stroke-width="26"
                stroke-dasharray="${strokeDash.toFixed(2)} ${gap.toFixed(2)}"
                stroke-dashoffset="${strokeOffset.toFixed(2)}"
                stroke-linecap="butt"
                style="transition: stroke-width 0.2s;"
                data-label="${escapeHtml(item.label)}"
                data-val="${escapeHtml(formatMoney(item.value))}">
        </circle>
      `;
    }).join("");
  }

  const legend = validItems.map(item => {
    const pct = ((Number(item.value) / total) * 100).toFixed(1);
    return `
      <div class="donut-legend-item">
        <div class="donut-legend-left">
          <span class="donut-legend-dot" style="background:${item.color};"></span>
          <span style="max-width:110px;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span>
        </div>
        <span class="donut-legend-val">${pct}%</span>
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <div class="donut-layout">
      <div class="donut-svg-wrap">
        <svg viewBox="0 0 170 170" width="170" height="170">
          <g transform="rotate(-90 85 85)">
            ${circles}
          </g>
        </svg>
        <div class="donut-center-label">
          <span class="center-title">${escapeHtml(centerTitle)}</span>
          <span class="center-val">${escapeHtml(centerVal || formatMoney(total))}</span>
        </div>
      </div>
      <div class="donut-legend">
        ${legend}
      </div>
    </div>
  `;
}

function renderDashBarChart(containerId, bars) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const validBars = (bars || []).map(b => ({
    label: b.label,
    value: Math.max(0, Number(b.value) || 0),
    color: b.color || "#10b981",
  }));
  const maxVal = Math.max(...validBars.map(b => b.value), 1);
  const totalVal = validBars.reduce((s, b) => s + b.value, 0);

  if (totalVal === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 2rem 1rem;">
        <i class="fa-solid fa-chart-column" style="font-size: 1.8rem; margin-bottom: 0.5rem; opacity: 0.4;"></i>
        <p>No financial data to compare yet.</p>
      </div>`;
    return;
  }

  const chartHeight = 140;
  const svgWidth = 320;
  const svgHeight = 205;
  const barWidth = 42;
  const gap = (svgWidth - (validBars.length * barWidth)) / (validBars.length + 1);

  const rects = validBars.map((b, idx) => {
    const val = b.value;
    const h = Math.max(4, (val / maxVal) * chartHeight);
    const x = gap + idx * (barWidth + gap);
    const y = (chartHeight - h) + 24;

    return `
      <g>
        <text x="${(x + barWidth / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}"
              font-size="10" font-weight="700" text-anchor="middle"
              style="fill: var(--text, #f8fafc); font-family: Inter, -apple-system, sans-serif;">
          ${formatMoney(val).replace("NPR ", "")}
        </text>
        <rect class="bar-rect" x="${x.toFixed(1)}" y="${y.toFixed(1)}"
              width="${barWidth}" height="${h.toFixed(1)}" rx="6"
              style="fill: ${b.color};"
              data-label="${escapeHtml(b.label)}" data-val="${escapeHtml(formatMoney(val))}">
          <title>${escapeHtml(b.label)}: ${formatMoney(val)}</title>
        </rect>
        <text x="${(x + barWidth / 2).toFixed(1)}" y="${(chartHeight + 42).toFixed(1)}"
              font-size="11" font-weight="600" text-anchor="middle"
              style="fill: var(--text-muted, #94a3b8); font-family: Inter, -apple-system, sans-serif;">
          ${escapeHtml(b.label)}
        </text>
      </g>
    `;
  }).join("");

  container.innerHTML = `
    <div class="bar-chart-wrap">
      <svg class="bar-chart-svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%" height="100%">
        <!-- Baseline -->
        <line x1="8" y1="${chartHeight + 24}" x2="${svgWidth - 8}" y2="${chartHeight + 24}"
              style="stroke: var(--border, rgba(255,255,255,0.12)); stroke-width: 1.5px;" />
        ${rects}
      </svg>
    </div>
  `;
}

async function loadSummary() {
  const data = await apiFetch(API.summary);
  if (els.totalIncome) {
    els.totalIncome.textContent = formatMoney(data.total_income);
    els.totalIncome.title = formatMoney(data.total_income);
  }
  if (els.totalExpense) {
    els.totalExpense.textContent = formatMoney(data.total_expense);
    els.totalExpense.title = formatMoney(data.total_expense);
  }
  if (els.netBalance) {
    els.netBalance.textContent = formatMoney(data.net_balance);
    els.netBalance.title = formatMoney(data.net_balance);
    els.netBalance.style.color = Number(data.net_balance) >= 0 ? "var(--income)" : "var(--expense)";
  }
  if (els.custReceivables) {
    els.custReceivables.textContent = formatMoney(data.customer_receivables || 0);
    els.custReceivables.title = formatMoney(data.customer_receivables || 0);
  }
  if (els.custPayables) {
    els.custPayables.textContent = formatMoney(data.customer_payables || 0);
    els.custPayables.title = formatMoney(data.customer_payables || 0);
  }

  // Render Bar Chart on Dashboard
  const netBal = Number(data.net_balance || 0);
  const barData = [
    { label: "Revenue", value: Number(data.total_income || 0), color: "#10b981" },
    { label: "Expenses", value: Number(data.total_expense || 0), color: "#f43f5e" },
    {
      label: netBal >= 0 ? "Profit" : "Loss",
      value: Math.abs(netBal),
      color: netBal >= 0 ? "#0ea5e9" : "#ef4444"
    },
    { label: "Due", value: Number(data.customer_receivables || 0), color: "#f59e0b" },
  ];
  renderDashBarChart("dashBarChartWrapper", barData);

  // Render Donut Chart on Dashboard
  const pieData = [
    { label: "Revenue", value: Number(data.total_income || 0), color: "#10b981" },
    { label: "Expenses", value: Number(data.total_expense || 0), color: "#f43f5e" },
    { label: "Receivables", value: Number(data.customer_receivables || 0), color: "#f59e0b" },
    { label: "Payables", value: Number(data.customer_payables || 0), color: "#6366f1" },
  ];
  renderDashPieChart("dashPieChartWrapper", pieData, "BALANCE", formatMoney(data.net_balance || 0));
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
