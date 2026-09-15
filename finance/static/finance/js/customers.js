const API = {
  customers: "/api/customers/",
  ledger: (id) => `/api/customers/${id}/ledger/`,
  inventory: "/api/inventory/",
  transactions: "/api/transactions/",
  categories: "/api/categories/",
};

const state = {
  customers: [],
  selectedCustomer: null,
  inventoryItems: [],
  categories: [],
};

const els = {
  customerList: document.getElementById("customerList"),
  searchCustomer: document.getElementById("searchCustomer"),
  custDetailName: document.getElementById("custDetailName"),
  custDetailMeta: document.getElementById("custDetailMeta"),
  custTotalDebits: document.getElementById("custTotalDebits"),
  custTotalCredits: document.getElementById("custTotalCredits"),
  custNetBalance: document.getElementById("custNetBalance"),
  ledgerBody: document.getElementById("ledgerBody"),
  addCustomerBtn: document.getElementById("addCustomerBtn"),
  customerModal: document.getElementById("customerModal"),
  customerForm: document.getElementById("customerForm"),
  custName: document.getElementById("custName"),
  custType: document.getElementById("custType"),
  custPhone: document.getElementById("custPhone"),
  custEmail: document.getElementById("custEmail"),
  custFormError: document.getElementById("custFormError"),
  toast: document.getElementById("toast"),
  btnRecordItemInvoice: document.getElementById("btnRecordItemInvoice"),
  btnRecordCredit: document.getElementById("btnRecordCredit"),
  itemInvoiceModal: document.getElementById("itemInvoiceModal"),
  itemInvoiceForm: document.getElementById("itemInvoiceForm"),
  invoiceItemSelect: document.getElementById("invoiceItemSelect"),
  invoiceSaleType: document.getElementById("invoiceSaleType"),
  invoiceItemQty: document.getElementById("invoiceItemQty"),
  invoiceUnitPrice: document.getElementById("invoiceUnitPrice"),
  invoiceSubtotal: document.getElementById("invoiceSubtotal"),
  invoiceDiscountType: document.getElementById("invoiceDiscountType"),
  invoiceDiscount: document.getElementById("invoiceDiscount"),
  invoiceDate: document.getElementById("invoiceDate"),
  invoiceTotalAmount: document.getElementById("invoiceTotalAmount"),
  invoiceNotes: document.getElementById("invoiceNotes"),
  invoiceFormError: document.getElementById("invoiceFormError"),
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

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  els.toast.classList.add("is-visible");
  setTimeout(() => { els.toast.classList.remove("is-visible"); els.toast.hidden = true; }, 2800);
}

async function loadInitialData() {
  try {
    const [custRes, invRes, catRes] = await Promise.all([
      apiFetch(API.customers),
      apiFetch(API.inventory),
      apiFetch(API.categories),
    ]);

    state.customers = custRes.customers;
    state.inventoryItems = invRes.inventory;
    state.categories = catRes.categories;

    populateInvoiceItemSelect();
    renderCustomerList();

    if (state.customers.length && !state.selectedCustomer) {
      selectCustomer(state.customers[0].id);
    }
  } catch (err) {
    els.customerList.innerHTML = `<div class="empty-state">Error loading data: ${escapeHtml(err.message)}</div>`;
  }
}

function populateInvoiceItemSelect() {
  els.invoiceItemSelect.innerHTML = '<option value="">-- Choose Item from Inventory --</option>';
  state.inventoryItems.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item.id;
    opt.dataset.retailPrice = item.selling_price;
    opt.dataset.wholesalePrice = item.wholesale_price || item.selling_price;
    opt.dataset.stock = item.quantity;
    opt.dataset.unit = item.unit;
    opt.textContent = `${item.name} (${item.sku}) - Retail: ${formatMoney(item.selling_price)} | Wholesale: ${formatMoney(item.wholesale_price || item.selling_price)} [Stock: ${item.quantity} ${item.unit}]`;
    els.invoiceItemSelect.appendChild(opt);
  });
}

function renderCustomerList() {
  const query = (els.searchCustomer?.value || "").toLowerCase();
  const filtered = state.customers.filter(c => c.name.toLowerCase().includes(query) || (c.phone && c.phone.includes(query)));

  if (!filtered.length) {
    els.customerList.innerHTML = `<div class="empty-state">No matching customers found.</div>`;
    return;
  }

  els.customerList.innerHTML = filtered.map(c => {
    const isWholesale = c.customer_type === "wholesale";
    const typeBadge = isWholesale
      ? '<span style="font-size:0.7rem; background:rgba(6,182,212,0.18); color:var(--cyan); padding:0.1rem 0.4rem; border-radius:4px; font-weight:700; margin-left:0.5rem;">WHOLESALE</span>'
      : '<span style="font-size:0.7rem; background:var(--surface-3); color:var(--text-muted); padding:0.1rem 0.4rem; border-radius:4px; font-weight:600; margin-left:0.5rem;">RETAIL</span>';

    return `
      <div class="customer-item ${state.selectedCustomer === c.id ? 'active' : ''}" data-id="${c.id}">
        <h4>${escapeHtml(c.name)} ${typeBadge}</h4>
        <p><i class="fa-solid fa-phone"></i> ${escapeHtml(c.phone || "No phone")} ${c.email ? ` | ${escapeHtml(c.email)}` : ""}</p>
      </div>
    `;
  }).join("");
}

async function selectCustomer(id) {
  state.selectedCustomer = id;
  renderCustomerList();

  const cust = state.customers.find(c => c.id === id);
  if (cust) {
    const typeTag = cust.customer_type === "wholesale" ? " [Wholesale Account]" : " [Retail Account]";
    els.custDetailName.textContent = cust.name + typeTag;
    els.custDetailMeta.textContent = `Phone: ${cust.phone || "N/A"} | Email: ${cust.email || "N/A"}`;
  }

  try {
    const data = await apiFetch(API.ledger(id));
    els.custTotalDebits.textContent = formatMoney(data.summary.total_debits);
    els.custTotalCredits.textContent = formatMoney(data.summary.total_credits);

    const net = Number(data.summary.total_debits) - Number(data.summary.total_credits);
    els.custNetBalance.textContent = formatMoney(net);
    els.custNetBalance.style.color = net > 0 ? "#ef4444" : (net < 0 ? "#10b981" : "var(--text)");

    let runningBal = 0;
    if (!data.transactions.length) {
      els.ledgerBody.innerHTML = `<tr><td colspan="6" class="empty-state">No credit or debit entries recorded yet for this customer.</td></tr>`;
    } else {
      els.ledgerBody.innerHTML = data.transactions.map(tx => {
        const amt = Number(tx.amount);
        const isExpense = tx.type === "expense"; // Debit
        const isIncome = tx.type === "income";   // Credit

        if (isExpense) runningBal += amt;
        else if (isIncome) runningBal -= amt;

        const saleTypeBadge = tx.sale_type === "wholesale"
          ? '<span class="badge" style="background:rgba(6,182,212,0.15); color:var(--cyan); font-size:0.68rem;">Wholesale</span>'
          : '<span class="badge" style="background:var(--surface-2); color:var(--text-muted); font-size:0.68rem;">Retail</span>';

        const discountStr = Number(tx.discount || 0) > 0 
          ? `<br><small style="color:var(--primary);">Discount: ${tx.discount_type === 'percent' ? `${tx.discount}%` : formatMoney(tx.discount)}</small>`
          : '';

        const itemStr = tx.item_name 
          ? `<strong style="color:var(--cyan);">${escapeHtml(tx.item_name)}</strong> ${saleTypeBadge} <small style="color:var(--text-muted);">(${escapeHtml(tx.item_sku || '')})</small>${discountStr}`
          : `<strong>${escapeHtml(tx.title)}</strong> ${saleTypeBadge}`;

        const qtyStr = tx.item_quantity > 1 ? `${tx.item_quantity} pcs` : (tx.item_name ? "1 pc" : "-");

        return `
          <tr>
            <td>${formatDate(tx.date)}</td>
            <td>${itemStr} ${tx.description ? `<br><small style="color:var(--text-muted);">${escapeHtml(tx.description)}</small>` : ""}</td>
            <td>${qtyStr}</td>
            <td class="text-right" style="color:#ef4444;">${isExpense ? formatMoney(amt) : "-"}</td>
            <td class="text-right" style="color:#10b981;">${isIncome ? formatMoney(amt) : "-"}</td>
            <td class="text-right" style="font-weight:700; color:${runningBal > 0 ? '#ef4444' : (runningBal < 0 ? '#10b981' : 'var(--text)')}">
              ${formatMoney(runningBal)}
            </td>
          </tr>
        `;
      }).join("");
    }
  } catch (err) {
    els.ledgerBody.innerHTML = `<tr><td colspan="6" class="empty-state">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

els.customerList.addEventListener("click", (e) => {
  const item = e.target.closest(".customer-item");
  if (item) selectCustomer(Number(item.dataset.id));
});

if (els.searchCustomer) {
  els.searchCustomer.addEventListener("input", renderCustomerList);
}

// Add Customer
els.addCustomerBtn.addEventListener("click", () => {
  els.custFormError.hidden = true;
  els.customerForm.reset();
  els.customerModal.classList.add("is-open");
});

document.querySelectorAll("[data-close-cust-modal]").forEach((el) => {
  el.addEventListener("click", () => els.customerModal.classList.remove("is-open"));
});

els.customerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.custFormError.hidden = true;

  const payload = {
    name: els.custName.value,
    customer_type: els.custType ? els.custType.value : "retail",
    phone: els.custPhone.value,
    email: els.custEmail.value,
  };

  try {
    const res = await apiFetch(API.customers, { method: "POST", body: JSON.stringify(payload) });
    showToast("Customer created successfully!");
    els.customerModal.classList.remove("is-open");
    await loadInitialData();
    selectCustomer(res.customer.id);
  } catch (err) {
    els.custFormError.textContent = err.message;
    els.custFormError.hidden = false;
  }
});

// Record Item Invoice Modal Logic
els.btnRecordItemInvoice.addEventListener("click", () => {
  if (!state.selectedCustomer) {
    alert("Please select a customer first!");
    return;
  }
  els.invoiceFormError.hidden = true;
  els.itemInvoiceForm.reset();
  
  const cust = state.customers.find(c => c.id === state.selectedCustomer);
  if (cust && els.invoiceSaleType) {
    els.invoiceSaleType.value = cust.customer_type === "wholesale" ? "wholesale" : "retail";
  }

  delete els.invoiceUnitPrice.dataset.userEdited;
  els.invoiceDate.value = new Date().toISOString().slice(0, 10);
  els.itemInvoiceModal.classList.add("is-open");
});

document.querySelectorAll("[data-close-invoice-modal]").forEach((el) => {
  el.addEventListener("click", () => els.itemInvoiceModal.classList.remove("is-open"));
});

function calculateInvoiceTotal() {
  const opt = els.invoiceItemSelect.options[els.invoiceItemSelect.selectedIndex];
  if (!opt || !opt.value) return;

  const saleType = els.invoiceSaleType ? els.invoiceSaleType.value : "retail";
  const defaultRate = saleType === "wholesale"
    ? Number(opt.dataset.wholesalePrice || opt.dataset.retailPrice || 0)
    : Number(opt.dataset.retailPrice || 0);

  if (!els.invoiceUnitPrice.dataset.userEdited) {
    els.invoiceUnitPrice.value = defaultRate.toFixed(2);
  }

  const unitRate = Number(els.invoiceUnitPrice.value || 0);
  const qty = Number(els.invoiceItemQty.value || 1);
  const subtotal = unitRate * qty;
  els.invoiceSubtotal.value = subtotal.toFixed(2);

  const discountType = els.invoiceDiscountType ? els.invoiceDiscountType.value : "amount";
  const discountVal = Number(els.invoiceDiscount ? els.invoiceDiscount.value : 0);

  let discAmt = 0;
  if (discountType === "percent") {
    discAmt = subtotal * (discountVal / 100);
  } else {
    discAmt = discountVal;
  }

  const netTotal = Math.max(0, subtotal - discAmt);
  els.invoiceTotalAmount.value = netTotal.toFixed(2);
}

els.invoiceUnitPrice.addEventListener("input", () => {
  els.invoiceUnitPrice.dataset.userEdited = "true";
  calculateInvoiceTotal();
});

els.invoiceSaleType.addEventListener("change", () => {
  delete els.invoiceUnitPrice.dataset.userEdited;
  calculateInvoiceTotal();
});

els.invoiceItemSelect.addEventListener("change", () => {
  delete els.invoiceUnitPrice.dataset.userEdited;
  calculateInvoiceTotal();
});

els.invoiceItemQty.addEventListener("input", calculateInvoiceTotal);
els.invoiceDiscountType.addEventListener("change", calculateInvoiceTotal);
els.invoiceDiscount.addEventListener("input", calculateInvoiceTotal);

els.itemInvoiceForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.invoiceFormError.hidden = true;

  const opt = els.invoiceItemSelect.options[els.invoiceItemSelect.selectedIndex];
  if (!opt || !opt.value) {
    els.invoiceFormError.textContent = "Please select an inventory item";
    els.invoiceFormError.hidden = false;
    return;
  }

  const itemId = Number(opt.value);
  const qty = Number(els.invoiceItemQty.value);
  const stock = Number(opt.dataset.stock || 0);

  if (qty > stock) {
    if (!confirm(`Warning: Requested quantity (${qty}) exceeds current stock (${stock}). Proceed anyway?`)) {
      return;
    }
  }

  const expenseCat = state.categories.find(c => c.type === "expense") || state.categories[0];

  const payload = {
    type: "expense",
    sale_type: els.invoiceSaleType ? els.invoiceSaleType.value : "retail",
    title: `Sale (${els.invoiceSaleType.value.toUpperCase()}): ${opt.text.split(" - ")[0]}`,
    subtotal: els.invoiceSubtotal.value,
    discount: els.invoiceDiscount ? els.invoiceDiscount.value : "0.00",
    discount_type: els.invoiceDiscountType ? els.invoiceDiscountType.value : "amount",
    amount: els.invoiceTotalAmount.value,
    date: els.invoiceDate.value,
    category_id: expenseCat ? expenseCat.id : 1,
    customer_id: state.selectedCustomer,
    item_id: itemId,
    item_quantity: qty,
    description: els.invoiceNotes.value || `Issued ${qty} unit(s) [${els.invoiceSaleType.value.toUpperCase()} rate]`,
  };

  try {
    await apiFetch(API.transactions, { method: "POST", body: JSON.stringify(payload) });
    showToast("Item sale posted & inventory stock updated!");
    els.itemInvoiceModal.classList.remove("is-open");
    await loadInitialData();
    selectCustomer(state.selectedCustomer);
  } catch (err) {
    els.invoiceFormError.textContent = err.message;
    els.invoiceFormError.hidden = false;
  }
});

// Quick Record Payment / Credit
if (els.btnRecordCredit) {
  els.btnRecordCredit.addEventListener("click", async () => {
    if (!state.selectedCustomer) {
      alert("Please select a customer first!");
      return;
    }
    const amountStr = prompt("Enter CREDIT Amount (Payment received from customer):");
    if (!amountStr || isNaN(amountStr) || Number(amountStr) <= 0) return;

    const titleStr = prompt("Enter Description / Particulars:", "Cash Payment Received");
    if (!titleStr) return;

    const incomeCat = state.categories.find(c => c.type === "income") || state.categories[0];

    const payload = {
      type: "income", // Customer Credit
      title: titleStr,
      amount: Number(amountStr),
      date: new Date().toISOString().slice(0, 10),
      category_id: incomeCat ? incomeCat.id : 1,
      customer_id: state.selectedCustomer,
      description: "Credit payment received",
    };

    try {
      await apiFetch(API.transactions, { method: "POST", body: JSON.stringify(payload) });
      showToast("Payment credit recorded!");
      await loadInitialData();
      selectCustomer(state.selectedCustomer);
    } catch (err) {
      alert("Error: " + err.message);
    }
  });
}

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

loadInitialData();
