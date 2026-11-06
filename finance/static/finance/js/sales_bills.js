/* ═══════════════════════════════════════════════
   Sales Bills — sales_bills.js
   Ecolith Enterprises — Professional Edition
════════════════════════════════════════════════ */

const API = {
  customers:     "/api/customers/",
  inventory:     "/api/inventory/",
  bills:         "/api/sales-bills/",
  bill:          (id) => `/api/sales-bills/${id}/`,
  cancel:        (id) => `/api/sales-bills/${id}/cancel/`,
  updatePayment: (id) => `/api/sales-bills/${id}/update-payment/`,
};

const state = {
  customers:    [],
  inventory:    [],
  bills:        [],
  currentBill:  null,
  rowCounter:   0,
  suggestedNum: "BILL-0001",
};

// ── Utility ──────────────────────────────────────
function getCookie(name) {
  const m = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[2]) : null;
}

async function apiFetch(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const csrf = getCookie("csrftoken");
  if (csrf && options.method && options.method !== "GET") headers["X-CSRFToken"] = csrf;
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

function fmt(val) {
  const n = Number.isFinite(Number(val)) ? Number(val) : 0;
  const hasCents = n % 1 !== 0;
  return "NPR " + n.toLocaleString("en-US", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

function fmtN(val) {
  const n = Number.isFinite(Number(val)) ? Number(val) : 0;
  const hasCents = n % 1 !== 0;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function esc(t) {
  const d = document.createElement("div");
  d.textContent = t || "";
  return d.innerHTML;
}

function showToast(msg, ok = true) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.style.background = ok ? "var(--primary)" : "#ef4444";
  t.hidden = false;
  t.classList.add("is-visible");
  setTimeout(() => { t.classList.remove("is-visible"); t.hidden = true; }, 3200);
}

// ── Number to Words in Nepali / Indian format ─────
function numberToWords(amount) {
  const n = Math.round(Number(amount) || 0);
  if (n <= 0) return "शून्य रुपैयाँ मात्र (Zero Only)";

  const ones = ["", "एक", "दुई", "तीन", "चार", "पाँच", "छ", "सात", "आठ", "नौ",
    "दश", "एघार", "बाह्र", "तेह्र", "चौध", "पन्ध्र", "सोह्र", "सत्र", "अठार", "उन्नाइस",
    "बीस", "एक्काइस", "बाइस", "तेइस", "चौबीस", "पच्चीस", "छब्बीस", "सत्ताइस", "अट्ठाइस", "उनन्तीस",
    "तीस", "एकतीस", "बत्तीस", "तेत्तीस", "चौतीस", "पैंतीस", "छत्तीस", "सैंतीस", "अठतीस", "उनन्चालीस",
    "चालीस", "एकचालीस", "बयालीस", "त्रिचालीस", "चवालीस", "पैंतालीस", "छयालीस", "सत्चालीस", "अठचालीस", "उनञ्चास",
    "पचास", "एकाउन्न", "बाउन्न", "त्रिपन्न", "चउन्न", "पचपन्न", "छपन्न", "सन्ताउन्न", "अन्ठाउन्न", "उनन्साठी",
    "साठी", "एकसट्ठी", "बासट्ठी", "त्रिसट्ठी", "चौंसट्ठी", "पैंसट्ठी", "छयसट्ठी", "सत्सट्ठी", "अठसट्ठी", "उनन्सत्तरी",
    "सत्तरी", "एकहत्तर", "बहत्तर", "त्रिहत्तर", "चौहत्तर", "पचहत्तर", "छयहत्तर", "सतहत्तर", "अठहत्तर", "उनासी",
    "असी", "एकासी", "बयासी", "त्रियासी", "चौरासी", "पचासी", "छयासी", "सतासी", "अठासी", "उनान्नब्बे",
    "नब्बे", "एकान्नब्बे", "बयानब्बे", "त्रियान्नब्बे", "चौरान्नब्बे", "पञ्चान्नब्बे", "छयान्नब्बे", "सन्तानब्बे", "अन्ठान्ब्बे", "उनान्सय"];

  function convertBelowHundred(num) {
    return ones[num] || "";
  }

  let words = [];
  let remaining = n;

  if (remaining >= 10000000) {
    const crore = Math.floor(remaining / 10000000);
    words.push((crore < 100 ? convertBelowHundred(crore) : crore) + " करोड");
    remaining %= 10000000;
  }
  if (remaining >= 100000) {
    const lakh = Math.floor(remaining / 100000);
    words.push(convertBelowHundred(lakh) + " लाख");
    remaining %= 100000;
  }
  if (remaining >= 1000) {
    const thousand = Math.floor(remaining / 1000);
    words.push(convertBelowHundred(thousand) + " हजार");
    remaining %= 1000;
  }
  if (remaining >= 100) {
    const hundred = Math.floor(remaining / 100);
    words.push(convertBelowHundred(hundred) + " सय");
    remaining %= 100;
  }
  if (remaining > 0) {
    words.push(convertBelowHundred(remaining));
  }

  return words.join(" ") + " रुपैयाँ मात्र ।";
}

// ── Theme toggle ──────────────────────────────────
function initTheme() {
  const btn = document.getElementById("themeToggleBtn");
  if (!btn) return;
  const update = () => {
    const dark = (document.documentElement.getAttribute("data-theme") || "dark") === "dark";
    btn.innerHTML = dark ? '<i class="fa-solid fa-sun" style="color:#f59e0b;"></i>' : '<i class="fa-solid fa-moon"></i>';
  };
  update();
  btn.addEventListener("click", () => {
    const next = (document.documentElement.getAttribute("data-theme") || "dark") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    update();
  });
}

// ── Populate customer dropdowns ───────────────────
function populateCustomerDropdowns() {
  const filterSel = document.getElementById("sbFilterCustomer");
  const modalSel  = document.getElementById("sbCustomer");

  if (filterSel) filterSel.innerHTML = '<option value="">All Customers</option>';
  if (modalSel)  modalSel.innerHTML  = '<option value="" disabled selected>— Select Customer —</option>';

  state.customers.forEach(c => {
    const label = `${c.name} (${c.customer_type})`;
    if (filterSel) filterSel.appendChild(new Option(label, c.id));
    if (modalSel) {
      const o2 = new Option(label, c.id);
      o2.dataset.type = c.customer_type;
      o2.dataset.phone = c.phone || "";
      o2.dataset.pan = c.pan_vat || "";
      modalSel.appendChild(o2);
    }
  });
}

// ── Render bills table ────────────────────────────
function renderBills() {
  const tbody = document.getElementById("sbBody");
  const bills = state.bills;
  const activeBills = bills.filter(b => b.status !== "cancelled");
  const recordCountEl = document.getElementById("sbRecordCount");
  if (recordCountEl) {
    recordCountEl.textContent =
      `${activeBills.length} active bill${activeBills.length === 1 ? "" : "s"}${bills.length !== activeBills.length ? ` (+${bills.length - activeBills.length} cancelled)` : ""}`;
  }

  if (!bills.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No sales bills found. Create your first bill!</td></tr>';
    return;
  }

  tbody.innerHTML = bills.map(b => {
    const isCancelled = b.status === "cancelled";
    const statusBadge = isCancelled
      ? '<span class="badge--cancelled"><i class="fa-solid fa-ban"></i> Cancelled</span>'
      : '<span class="badge--active"><i class="fa-solid fa-circle-check"></i> Active</span>';

    const due = Number(b.balance_due || 0);
    const paid = Number(b.amount_paid || 0);

    let paymentBadge = "";
    if (b.payment_status === "paid" || due <= 0) {
      paymentBadge = `<span class="badge badge--cash badge--small"><i class="fa-solid fa-circle-check"></i> Fully Paid (${b.payment_mode})</span>`;
    } else if (paid > 0 && due > 0) {
      paymentBadge = `
        <span class="badge" style="background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.3);font-size:0.75rem;padding:0.2rem 0.5rem;display:inline-block;line-height:1.2;">
          <i class="fa-solid fa-scale-unbalanced"></i> Partial (${b.payment_mode})<br>
          <span style="color:var(--income);font-weight:600;">Paid: ${fmt(paid)}</span> |
          <span style="color:#f43f5e;font-weight:700;">Due: ${fmt(due)}</span>
        </span>`;
    } else {
      paymentBadge = `
        <span class="badge badge--credit badge--small">
          <i class="fa-solid fa-clock"></i> Credit (Due ${fmt(b.grand_total)})
        </span>`;
    }

    return `
      <tr class="${isCancelled ? "bill-cancelled" : ""}">
        <td>
          <strong style="color:var(--primary);letter-spacing:0.5px;font-size:0.92rem;">${esc(b.bill_number)}</strong>
        </td>
        <td>${fmtDate(b.date)}</td>
        <td>
          <strong>${esc(b.customer_name || "Walk-in")}</strong>
          ${b.billing_address ? `<div style="color:var(--text-muted);font-size:0.75rem;margin-top:2px;"><i class="fa-solid fa-location-dot" style="color:var(--primary);"></i> ${esc(b.billing_address)}</div>` : ""}
        </td>
        <td style="text-align:center;">
          <span style="background:var(--surface-2);border:1px solid var(--border);border-radius:4px;padding:0.2rem 0.5rem;font-size:0.82rem;">
            ${b.items.length} item${b.items.length === 1 ? "" : "s"}
          </span>
        </td>
        <td>${paymentBadge}</td>
        <td>${statusBadge}</td>
        <td class="text-right">
          <div class="amount--income" style="font-weight:700;font-size:0.95rem;">${fmt(b.grand_total)}</div>
          ${due > 0 ? `<div style="font-size:0.75rem;color:#f43f5e;font-weight:600;">Remaining: ${fmt(due)}</div>` : ""}
        </td>
        <td>
          <div style="display:inline-flex;gap:0.35rem;align-items:center;">
            <button type="button" class="btn btn--edit" data-view="${b.id}" title="View Details"><i class="fa-solid fa-eye"></i></button>
            ${!isCancelled ? `<button type="button" class="btn btn--ghost" data-pay-btn="${b.id}" style="color:var(--primary);border-color:var(--border);" title="Update Payment / Method"><i class="fa-solid fa-money-bill-transfer"></i></button>` : ""}
            ${!isCancelled ? `<button type="button" class="btn btn--danger" style="background:rgba(245,158,11,0.12);border-color:rgba(245,158,11,0.3);color:#f59e0b;" data-cancel-btn="${b.id}" title="Cancel Bill"><i class="fa-solid fa-ban"></i></button>` : ""}
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// ── Load & refresh ─────────────────────────────────
async function loadBills() {
  const params = new URLSearchParams();
  const fc = document.getElementById("sbFilterCustomer")?.value;
  const fp = document.getElementById("sbFilterPayment")?.value;
  const ff = document.getElementById("sbFilterFrom")?.value;
  const ft = document.getElementById("sbFilterTo")?.value;
  const showCancelled = document.getElementById("sbShowCancelled")?.checked;

  if (fc) params.set("customer", fc);
  if (fp) params.set("payment_mode", fp);
  if (ff) params.set("date_from", ff);
  if (ft) params.set("date_to", ft);
  if (showCancelled) params.set("include_cancelled", "true");

  const qs = params.toString();
  const data = await apiFetch(qs ? `${API.bills}?${qs}` : API.bills);
  state.bills = data.bills;
  state.suggestedNum = data.suggested_bill_number || "BILL-0001";

  // Update summary cards
  const tbEl = document.getElementById("sbTotalBills");
  const trEl = document.getElementById("sbTotalRevenue");
  const cpEl = document.getElementById("sbCreditPending");
  if (tbEl) tbEl.textContent = data.summary.total_bills;
  if (trEl) trEl.textContent = fmt(data.summary.total_revenue);
  if (cpEl) cpEl.textContent = fmt(data.summary.credit_pending);

  renderBills();
}

async function refreshAll() {
  const [custData, invData] = await Promise.all([
    apiFetch(API.customers),
    apiFetch(API.inventory),
  ]);
  state.customers = custData.customers;
  state.inventory  = invData.inventory;
  populateCustomerDropdowns();
  await loadBills();
}

// ── Line-item row builder ─────────────────────────
function getCustomerType() {
  const sel = document.getElementById("sbCustomer");
  if (!sel) return "retail";
  const opt = sel.options[sel.selectedIndex];
  return opt ? (opt.dataset.type || "retail") : "retail";
}

function buildItemOptions() {
  return state.inventory.map(item =>
    `<option value="${item.id}"
      data-name="${esc(item.name)}"
      data-sku="${esc(item.sku)}"
      data-unit="${esc(item.unit)}"
      data-retail="${item.selling_price}"
      data-wholesale="${item.wholesale_price}"
      data-stock="${item.quantity}">
      ${esc(item.name)} (${esc(item.sku)}) — Stock: ${item.quantity}
    </option>`
  ).join("");
}

function recalcRow(tr) {
  const qty   = parseFloat(tr.querySelector(".row-qty").value)   || 0;
  const price = parseFloat(tr.querySelector(".row-price").value) || 0;
  tr.querySelector(".row-line-total").textContent = fmt(qty * price);
  recalcTotals();
}

function recalcTotals() {
  let subtotal = 0;
  document.querySelectorAll("#sbItemsBody tr").forEach(tr => {
    const qty   = parseFloat(tr.querySelector(".row-qty")?.value)   || 0;
    const price = parseFloat(tr.querySelector(".row-price")?.value) || 0;
    subtotal += qty * price;
  });
  const subDisp = document.getElementById("sbSubtotalDisplay");
  if (subDisp) subDisp.textContent = fmt(subtotal);

  const discountVal  = parseFloat(document.getElementById("sbDiscount")?.value) || 0;
  const discountType = document.getElementById("sbDiscountType")?.value || "amount";
  const discAmt = discountType === "percent" ? subtotal * (discountVal / 100) : discountVal;
  const grandTotal = Math.max(0, subtotal - discAmt);

  const gtDisp = document.getElementById("sbGrandTotalDisplay");
  if (gtDisp) gtDisp.textContent = fmt(grandTotal);

  // Auto-sync amount paid with payment mode if not manually altered
  const payModeSel = document.getElementById("sbPaymentMode");
  const amtPaidInput = document.getElementById("sbAmountPaid");
  const balDueDisp = document.getElementById("sbBalanceDueDisplay");

  if (amtPaidInput && balDueDisp) {
    if (amtPaidInput.dataset.touched !== "true") {
      if (payModeSel && payModeSel.value === "credit") {
        amtPaidInput.value = "0";
      } else {
        amtPaidInput.value = grandTotal.toFixed(2);
      }
    }
    const currentPaid = parseFloat(amtPaidInput.value) || 0;
    const due = Math.max(0, grandTotal - currentPaid);
    balDueDisp.textContent = fmt(due);
  }
}

function addItemRow(prefill = null) {
  const id = ++state.rowCounter;
  const tr = document.createElement("tr");
  tr.dataset.rowId = id;
  tr.innerHTML = `
    <td class="col-item">
      <select class="row-item-sel">
        <option value="">— select item —</option>
        ${buildItemOptions()}
      </select>
    </td>
    <td class="col-hsn">
      <input type="text" class="row-hsn" placeholder="e.g. 8507"
             maxlength="20" value="${prefill?.hsn_code || ""}"
             title="HSN / HS Code for this item">
    </td>
    <td class="col-qty"><input type="number" class="row-qty" min="0.01" step="0.01" value="${prefill?.quantity || 1}" placeholder="1"></td>
    <td class="col-price"><input type="number" class="row-price" min="0" step="0.01" value="${prefill?.unit_price || ''}" placeholder="0.00"></td>
    <td class="col-total"><span class="line-total-display row-line-total">${fmt((prefill?.quantity || 1) * (prefill?.unit_price || 0))}</span></td>
    <td class="col-rm"><button type="button" class="btn--rm" title="Remove row"><i class="fa-solid fa-xmark"></i></button></td>
  `;

  if (prefill && prefill.inventory_item_id) {
    const opt = tr.querySelector(`.row-item-sel option[value="${prefill.inventory_item_id}"]`);
    if (opt) opt.selected = true;
  }

  tr.querySelector(".row-item-sel").addEventListener("change", (e) => {
    const opt = e.target.options[e.target.selectedIndex];
    if (!opt.value) return;
    const ct = getCustomerType();
    const price = ct === "wholesale" ? parseFloat(opt.dataset.wholesale) : parseFloat(opt.dataset.retail);
    tr.querySelector(".row-price").value = price || "";
    if (opt.dataset.sku && !tr.querySelector(".row-hsn").value) {
      tr.querySelector(".row-hsn").value = opt.dataset.sku;
    }
    recalcRow(tr);
  });

  tr.querySelector(".row-qty").addEventListener("input",   () => recalcRow(tr));
  tr.querySelector(".row-price").addEventListener("input", () => recalcRow(tr));
  tr.querySelector(".btn--rm").addEventListener("click", () => { tr.remove(); recalcTotals(); });

  document.getElementById("sbItemsBody").appendChild(tr);
  recalcTotals();
}

// ── Open / close new bill modal ───────────────────
function openNewBillModal() {
  document.getElementById("sbItemsBody").innerHTML = "";
  document.getElementById("sbBillNumber").value   = "";
  document.getElementById("sbBillNumber").placeholder = state.suggestedNum;

  // Initialize BS date picker to today
  const today = new Date();
  populateBsDateSelects({
    yearSel:  document.getElementById("sbDateBsYear"),
    monthSel: document.getElementById("sbDateBsMonth"),
    daySel:   document.getElementById("sbDateBsDay"),
    hiddenAd: document.getElementById("sbDate"),
    adHint:   document.getElementById("sbDateAdHint"),
    initBs:   adToBs(today.getFullYear(), today.getMonth() + 1, today.getDate()),
  });

  document.getElementById("sbCustomer").value      = "";
  document.getElementById("sbPaymentMode").value   = "cash";
  document.getElementById("sbDiscount").value      = "0";
  document.getElementById("sbDiscountType").value  = "amount";
  document.getElementById("sbNotes").value         = "";
  document.getElementById("sbFormError").hidden    = true;

  const panEl = document.getElementById("sbCustomerPan");
  if (panEl) panEl.value = "";
  const addrEl = document.getElementById("sbBillingAddress");
  if (addrEl) addrEl.value = "";

  const amtPaidInput = document.getElementById("sbAmountPaid");
  if (amtPaidInput) {
    amtPaidInput.dataset.touched = "false";
    amtPaidInput.value = "0";
  }

  // Reset new-customer section
  document.getElementById("sbNewCustSection").style.display = "none";
  document.getElementById("sbCustomer").style.display       = "";
  document.getElementById("sbNewCustToggle").style.display  = "";
  document.getElementById("sbNewCustName").value  = "";
  document.getElementById("sbNewCustPhone").value = "";
  document.getElementById("sbNewCustType").value  = "retail";

  state.rowCounter = 0;
  addItemRow();
  recalcTotals();
  document.getElementById("sbModal").classList.add("is-open");
  setTimeout(() => document.getElementById("sbBillNumber").focus(), 150);
}

function closeNewBillModal() {
  document.getElementById("sbModal").classList.remove("is-open");
  document.getElementById("sbForm").reset();
}

// ── Save bill ─────────────────────────────────────
async function saveBill(e) {
  e.preventDefault();
  const errEl = document.getElementById("sbFormError");
  errEl.hidden = true;

  const rows = [...document.querySelectorAll("#sbItemsBody tr")];
  if (!rows.length) {
    errEl.textContent = "Add at least one item.";
    errEl.hidden = false;
    return;
  }

  const items = [];
  for (const tr of rows) {
    const sel   = tr.querySelector(".row-item-sel");
    const qty   = parseFloat(tr.querySelector(".row-qty").value);
    const price = parseFloat(tr.querySelector(".row-price").value);

    if (!sel.value && !qty) continue;
    if (!sel.value) {
      errEl.textContent = "Please select an item from inventory for each row.";
      errEl.hidden = false;
      return;
    }
    if (!qty || qty <= 0) {
      errEl.textContent = "Quantity must be greater than 0.";
      errEl.hidden = false;
      return;
    }
    const opt = sel.options[sel.selectedIndex];
    const hsnVal = (tr.querySelector(".row-hsn")?.value || "").trim();
    items.push({
      inventory_item_id: parseInt(sel.value),
      item_name: opt.dataset.name || opt.textContent.split("(")[0].trim(),
      item_sku:  hsnVal || opt.dataset.sku || "",
      hsn_code:  hsnVal,
      unit:      opt.dataset.unit || "Pcs",
      quantity:  qty,
      unit_price: price || 0,
    });
  }

  if (!items.length) {
    errEl.textContent = "Add at least one valid item.";
    errEl.hidden = false;
    return;
  }

  // ── Customer is mandatory ──────────────────────────────
  const newCustVisible = document.getElementById("sbNewCustSection").style.display !== "none";
  const customerSelectVal = document.getElementById("sbCustomer").value;

  if (newCustVisible) {
    const custName = document.getElementById("sbNewCustName").value.trim();
    if (!custName) {
      errEl.textContent = "Customer Name is compulsory. Please enter the customer name.";
      errEl.hidden = false;
      document.getElementById("sbNewCustName").focus();
      return;
    }
  } else if (!customerSelectVal) {
    errEl.textContent = "Customer Name is compulsory. Please select an existing customer or click 'Add new customer instead'.";
    errEl.hidden = false;
    document.getElementById("sbCustomer").focus();
    return;
  }

  const manualNum = document.getElementById("sbBillNumber").value.trim();
  const customerPan = (document.getElementById("sbCustomerPan")?.value || "").trim();
  const billingAddress = (document.getElementById("sbBillingAddress")?.value || "").trim();
  const amountPaidVal = parseFloat(document.getElementById("sbAmountPaid")?.value) || 0;

  // Resolve customer (existing or new inline)
  let resolvedCustomerId = customerSelectVal
    ? parseInt(customerSelectVal) : null;

  const btn = document.getElementById("sbSaveBtn");
  try {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    if (newCustVisible) {
      const custName = document.getElementById("sbNewCustName").value.trim();
      const custRes = await apiFetch(API.customers, {
        method: "POST",
        body: JSON.stringify({
          name:          custName,
          customer_type: document.getElementById("sbNewCustType").value,
          phone:         document.getElementById("sbNewCustPhone").value.trim(),
          pan_vat:       customerPan,
          email:         "",
        }),
      });
      resolvedCustomerId = custRes.customer.id;
    }

    const notesText = (document.getElementById("sbNotes").value || "").trim();

    const payload = {
      bill_number:     manualNum || null,
      date:            document.getElementById("sbDate").value,
      customer_id:     resolvedCustomerId,
      customer_pan:    customerPan,
      billing_address: billingAddress,
      payment_mode:    document.getElementById("sbPaymentMode").value,
      amount_paid:     amountPaidVal,
      discount:        parseFloat(document.getElementById("sbDiscount").value) || 0,
      discount_type:   document.getElementById("sbDiscountType").value,
      notes:           notesText,
      items,
    };

    const res = await apiFetch(API.bills, { method: "POST", body: JSON.stringify(payload) });
    showToast(`✔ ${res.bill.bill_number} saved successfully!`);
    closeNewBillModal();
    await refreshAll();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Save Bill';
  }
}

// ── View bill modal ───────────────────────────────
function openViewModal(bill) {
  state.currentBill = bill;
  const isCancelled = bill.status === "cancelled";
  const discLabel = bill.discount_type === "percent"
    ? `${bill.discount}%`
    : fmt(bill.discount);

  const itemsHtml = bill.items.map((it, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>
        <strong>${esc(it.item_name)}</strong>
        ${it.item_sku ? `<br><small style="color:var(--text-muted);"><i class="fa-solid fa-barcode"></i> HSN/SKU: ${esc(it.item_sku)}</small>` : ""}
      </td>
      <td style="text-align:center;">${it.quantity} ${esc(it.unit)}</td>
      <td style="text-align:right;">${fmt(it.unit_price)}</td>
      <td>${fmt(it.line_total)}</td>
    </tr>
  `).join("");

  const cancelBox = isCancelled ? `
    <div class="cancel-reason-box">
      <strong><i class="fa-solid fa-ban"></i> This bill has been CANCELLED</strong>
      ${bill.cancel_reason ? `Reason: ${esc(bill.cancel_reason)}` : "No reason provided."}
    </div>` : "";

  const due = Number(bill.balance_due || 0);
  const paid = Number(bill.amount_paid || 0);

  document.getElementById("sbViewContent").innerHTML = `
    ${cancelBox}
    <div class="bill-header-row">
      <div style="width:100%;">
        <div class="bill-number-badge" style="display:flex;justify-content:space-between;align-items:center;">
          <span>${esc(bill.bill_number)}</span>
          ${isCancelled ? '<span class="badge--cancelled"><i class="fa-solid fa-ban"></i> Cancelled</span>' : '<span class="badge--active"><i class="fa-solid fa-circle-check"></i> Active</span>'}
        </div>
        <div class="bill-meta" style="margin-top:0.75rem;display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:0.5rem;">
          <div class="bill-meta-chip"><i class="fa-solid fa-user"></i> <span>Customer:</span> <strong>${esc(bill.customer_name || "Walk-in / General")}</strong></div>
          <div class="bill-meta-chip"><i class="fa-solid fa-calendar"></i> <span>Date:</span> <strong>${fmtDate(bill.date)}</strong></div>
          ${bill.billing_address ? `<div class="bill-meta-chip"><i class="fa-solid fa-location-dot"></i> <span>Address:</span> <strong>${esc(bill.billing_address)}</strong></div>` : ""}
          ${bill.customer_pan ? `<div class="bill-meta-chip"><i class="fa-solid fa-id-card"></i> <span>PAN/VAT:</span> <strong>${esc(bill.customer_pan)}</strong></div>` : ""}
          <div class="bill-meta-chip"><i class="fa-solid fa-credit-card"></i> <span>Payment Mode:</span> <strong style="text-transform:capitalize;">${esc(bill.payment_mode)}</strong></div>
          <div class="bill-meta-chip"><i class="fa-solid fa-circle-check" style="color:var(--income);"></i> <span>Paid Amount:</span> <strong style="color:var(--income);">${fmt(paid)}</strong></div>
          <div class="bill-meta-chip"><i class="fa-solid fa-clock" style="color:#f43f5e;"></i> <span>Balance Due:</span> <strong style="color:#f43f5e;">${fmt(due)}</strong></div>
        </div>
        ${bill.notes ? `<div style="margin-top:0.6rem;background:var(--surface-2);border-radius:6px;padding:0.45rem 0.75rem;color:var(--text-muted);font-size:0.82rem;"><i class="fa-solid fa-note-sticky" style="color:var(--primary);margin-right:0.35rem;"></i>${esc(bill.notes)}</div>` : ""}
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>#</th><th>Item / Description</th><th style="text-align:center;">Qty</th>
          <th style="text-align:right;">Unit Price</th><th>Line Total</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <div class="view-totals">
      <div class="vrow"><label>Subtotal</label><span>${fmt(bill.subtotal)}</span></div>
      <div class="vrow"><label>Discount (${esc(discLabel)})</label><span>- ${fmt(Number(bill.subtotal) - Number(bill.grand_total))}</span></div>
      <div class="vrow grand"><label>Grand Total</label><span>${fmt(bill.grand_total)}</span></div>
      <div class="vrow" style="color:var(--income);"><label>Amount Paid</label><span>${fmt(paid)}</span></div>
      <div class="vrow" style="color:#f43f5e;font-weight:700;"><label>Balance Due</label><span>${fmt(due)}</span></div>
    </div>
  `;

  // Buttons visibility
  const cancelBtn = document.getElementById("sbCancelBillBtn");
  const updatePayBtn = document.getElementById("sbViewUpdatePayBtn");
  if (cancelBtn) cancelBtn.style.display = isCancelled ? "none" : "";
  if (updatePayBtn) updatePayBtn.style.display = isCancelled ? "none" : "";

  document.getElementById("sbViewModal").classList.add("is-open");
}

function closeViewModal() {
  document.getElementById("sbViewModal").classList.remove("is-open");
  state.currentBill = null;
}

// ── Payment Update Modal ───────────────────────────
function openPaymentModal(bill) {
  state.currentBill = bill;
  const modal = document.getElementById("sbPaymentModal");
  if (!modal) return;

  document.getElementById("sbPayModalBillNum").textContent = bill.bill_number;
  document.getElementById("sbPayModalCustomer").textContent = bill.customer_name || "Walk-in";

  const gt = Number(bill.grand_total || 0);
  const paid = Number(bill.amount_paid || 0);
  const due = Number(bill.balance_due || 0);

  document.getElementById("sbPayModalGrandTotal").textContent = fmt(gt);
  document.getElementById("sbPayModalCurrentPaid").textContent = fmt(paid);
  document.getElementById("sbPayModalCurrentDue").textContent = fmt(due);

  document.getElementById("sbPayModalMode").value = bill.payment_mode || "cash";
  const amtInput = document.getElementById("sbPayModalAmount");
  amtInput.value = paid.toFixed(2);
  amtInput.max = gt;

  const addrInput = document.getElementById("sbPayModalAddress");
  if (addrInput) addrInput.value = bill.billing_address || "";

  const noteInput = document.getElementById("sbPayModalNote");
  if (noteInput) noteInput.value = "";

  const newDueEl = document.getElementById("sbPayModalNewDue");
  const updateNewDue = () => {
    const val = parseFloat(amtInput.value) || 0;
    const rem = Math.max(0, gt - val);
    if (newDueEl) newDueEl.textContent = fmt(rem);
  };
  amtInput.oninput = updateNewDue;
  updateNewDue();

  document.getElementById("sbPayModalFullSettleBtn").onclick = () => {
    amtInput.value = gt.toFixed(2);
    updateNewDue();
  };

  document.getElementById("sbPayModalError").hidden = true;
  modal.classList.add("is-open");
}

function closePaymentModal() {
  const modal = document.getElementById("sbPaymentModal");
  if (modal) modal.classList.remove("is-open");
}

async function savePaymentUpdate(e) {
  e.preventDefault();
  const bill = state.currentBill;
  if (!bill) return;

  const errEl = document.getElementById("sbPayModalError");
  errEl.hidden = true;
  const btn = document.getElementById("sbSavePaymentBtn");

  try {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    const mode = document.getElementById("sbPayModalMode").value;
    const paid = parseFloat(document.getElementById("sbPayModalAmount").value) || 0;
    const addr = (document.getElementById("sbPayModalAddress")?.value || "").trim();
    const note = (document.getElementById("sbPayModalNote")?.value || "").trim();

    const res = await apiFetch(API.updatePayment(bill.id), {
      method: "POST",
      body: JSON.stringify({
        payment_mode: mode,
        amount_paid: paid,
        billing_address: addr,
        payment_note: note,
      }),
    });

    showToast(`✔ ${bill.bill_number} payment updated successfully!`);
    closePaymentModal();
    closeViewModal();
    await refreshAll();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Save Payment Update';
  }
}

// ── Cancel bill modal ──────────────────────────────
function openCancelModal() {
  document.getElementById("sbCancelReason").value = "";
  document.getElementById("sbCancelError").hidden = true;
  document.getElementById("sbCancelModal").classList.add("is-open");
}

function closeCancelModal() {
  document.getElementById("sbCancelModal").classList.remove("is-open");
}

async function confirmCancelBill() {
  const bill = state.currentBill;
  if (!bill) return;

  const reason = document.getElementById("sbCancelReason").value.trim();
  const errEl  = document.getElementById("sbCancelError");
  errEl.hidden = true;

  const btn = document.getElementById("sbConfirmCancelBtn");
  try {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cancelling...';
    await apiFetch(API.cancel(bill.id), { method: "POST", body: JSON.stringify({ reason }) });
    showToast(`✔ ${bill.bill_number} cancelled — stock restored.`);
    closeCancelModal();
    closeViewModal();
    await refreshAll();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-ban"></i> Yes, Cancel Bill & Restore Stock';
  }
}

// ── Quick handlers from table row ──────────────────
function quickCancelFromTable(id) {
  const bill = state.bills.find(b => String(b.id) === String(id));
  if (!bill) return;
  state.currentBill = bill;
  openCancelModal();
}

function quickPaymentFromTable(id) {
  const bill = state.bills.find(b => String(b.id) === String(id));
  if (!bill) return;
  openPaymentModal(bill);
}

// ── Print Choice Modal ─────────────────────────────
function openPrintChoiceModal() {
  if (!state.currentBill) return;
  const modal = document.getElementById("sbPrintChoiceModal");
  if (modal) modal.classList.add("is-open");
}

function closePrintChoiceModal() {
  const modal = document.getElementById("sbPrintChoiceModal");
  if (modal) modal.classList.remove("is-open");
}

// ═══════════════════════════════════════════════════
// 1. VAT BILL — OFFICIAL NEPALI TAX INVOICE (कर बिजक)
// ═══════════════════════════════════════════════════
function printVatBill(bill) {
  if (!bill) bill = state.currentBill;
  if (!bill) return;

  const subtotal  = Number(bill.subtotal || 0);
  const grandTotal = Number(bill.grand_total || 0);
  const discAmt   = Math.max(0, subtotal - grandTotal);
  const taxableAmt = grandTotal;
  const vatAmt     = parseFloat((taxableAmt * 0.13).toFixed(2));
  const totalWithVat = parseFloat((taxableAmt + vatAmt).toFixed(2));
  const paidAmt    = Number(bill.amount_paid || 0);
  const dueAmt     = Number(bill.balance_due || 0);

  // Seller PAN: 9 boxes
  const SELLER_VAT = "623351804";
  const sellerVatBoxes = SELLER_VAT.split("").map(d =>
    `<span class="p-box">${d}</span>`
  ).join("");

  // Customer PAN: 9 boxes
  const custPanStr = (bill.customer_pan || "").replace(/[^0-9A-Za-z]/g, "");
  let custVatBoxes = "";
  for (let i = 0; i < 9; i++) {
    const digit = custPanStr[i] || "&nbsp;";
    custVatBoxes += `<span class="p-box">${digit}</span>`;
  }

  const payMap = {
    cash:   "नगद (Cash)",
    credit: "उधारो (Credit / Due)",
    online: "अनलाइन / चेक (Online / Fonepay / Cheque)",
    mixed:  "आंशिक भुक्तानी (Partial Payment)",
  };
  const payLabel = payMap[bill.payment_mode] || bill.payment_mode;

  const today = new Date();
  const printDateStr = today.toISOString().slice(0, 10);
  const billDateStr = bill.date || printDateStr;

  const itemRows = bill.items.map((it, idx) => `
    <tr>
      <td class="tc font-bold">${idx + 1}</td>
      <td class="tc font-mono text-xs">${esc(it.item_sku || "—")}</td>
      <td class="tl font-semibold">${esc(it.item_name)}</td>
      <td class="tc">${fmtN(it.quantity)}</td>
      <td class="tc">${esc(it.unit || "Pcs")}</td>
      <td class="tr font-mono">${fmtN(it.unit_price)}</td>
      <td class="tr font-mono font-bold">${fmtN(it.line_total)}</td>
    </tr>
  `).join("");

  const padCount = Math.max(0, 6 - bill.items.length);
  let padRows = "";
  for (let i = 0; i < padCount; i++) {
    padRows += `<tr class="pad-row"><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;
  }

  const wordsNepali = numberToWords(totalWithVat);

  const html = `<!DOCTYPE html>
<html lang="ne">
<head>
<meta charset="UTF-8">
<title>कर बिजक — ${esc(bill.bill_number)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Mukta:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Mukta', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #111827; background: #fff; padding: 24px 30px; font-size: 13.5px; line-height: 1.45;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .invoice-container {
    max-width: 820px; margin: 0 auto; border: 2px solid #1e293b; padding: 22px 24px 18px; background: #ffffff; position: relative;
  }
  .gov-subtext { text-align: center; font-size: 11px; color: #4b5563; font-weight: 600; margin-bottom: 4px; letter-spacing: 0.2px; }
  .invoice-badge-wrap { text-align: center; margin-bottom: 8px; }
  .invoice-badge {
    display: inline-block; border: 2px solid #0f172a; background: #0f172a; color: #ffffff;
    font-size: 14px; font-weight: 800; padding: 3px 22px; border-radius: 4px; letter-spacing: 1px; text-transform: uppercase;
  }
  .header-main { text-align: center; margin-bottom: 12px; border-bottom: 2px solid #cbd5e1; padding-bottom: 10px; }
  .company-title-np { font-size: 26px; font-weight: 800; color: #0f172a; line-height: 1.2; letter-spacing: -0.3px; }
  .company-title-en { font-size: 15px; font-weight: 700; color: #334155; letter-spacing: 0.8px; text-transform: uppercase; margin-top: 1px; }
  .company-contacts { font-size: 12px; color: #475569; margin-top: 3px; }
  .info-grid { display: grid; grid-template-columns: 1.2fr 0.9fr; gap: 14px; margin-bottom: 12px; }
  .info-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; background: #f8fafc; }
  .info-card-title {
    font-size: 11.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a;
    border-bottom: 1px dashed #cbd5e1; padding-bottom: 3px; margin-bottom: 6px; display: flex; justify-content: space-between;
  }
  .field-row { display: flex; align-items: baseline; font-size: 12.5px; margin-bottom: 4px; }
  .field-label { min-width: 120px; font-weight: 600; color: #334155; white-space: nowrap; }
  .field-val { flex: 1; font-weight: 700; color: #0f172a; }
  .pan-wrap { display: inline-flex; align-items: center; gap: 2.5px; vertical-align: middle; }
  .p-box {
    display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 22px;
    border: 1.5px solid #1e293b; background: #ffffff; font-size: 12.5px; font-weight: 800; font-family: 'Inter', monospace; border-radius: 2px;
  }
  table.bill-table { width: 100%; border-collapse: collapse; border: 1.5px solid #0f172a; margin-bottom: 0; }
  table.bill-table th, table.bill-table td { border: 1px solid #334155; padding: 6px 8px; font-size: 12.5px; vertical-align: middle; }
  table.bill-table th { background: #0f172a; color: #ffffff; font-weight: 700; font-size: 12px; text-align: center; letter-spacing: 0.3px; }
  table.bill-table td.tc { text-align: center; }
  table.bill-table td.tl { text-align: left; }
  table.bill-table td.tr { text-align: right; }
  table.bill-table tbody tr:nth-child(even) { background: #fbfcfe; }
  table.bill-table tr.pad-row td { height: 26px; }
  .summary-wrap { display: grid; grid-template-columns: 1fr 280px; border: 1.5px solid #0f172a; border-top: none; }
  .summary-left { padding: 10px 14px; border-right: 1.5px solid #0f172a; display: flex; flex-direction: column; justify-content: space-between; background: #fdfdfe; }
  .in-words-box { margin-bottom: 10px; border-left: 3px solid #0f172a; padding-left: 8px; font-size: 12px; }
  .in-words-label { font-weight: 700; color: #475569; font-size: 11px; text-transform: uppercase; }
  .in-words-text { font-weight: 700; color: #0f172a; margin-top: 2px; }
  .payment-breakdown-card { background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 10px; margin-top: auto; }
  .p-stat-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 2px; }
  .summary-right { background: #ffffff; }
  .tot-row { display: flex; justify-content: space-between; align-items: center; padding: 5px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12.5px; }
  .tot-row:last-child { border-bottom: none; }
  .tot-row .t-lbl { font-weight: 600; color: #334155; }
  .tot-row .t-val { font-weight: 700; font-family: 'Inter', monospace; text-align: right; }
  .tot-row.grand-tot { background: #0f172a; color: #ffffff; font-weight: 800; font-size: 14.5px; border-top: 2px solid #0f172a; }
  .tot-row.grand-tot .t-lbl, .tot-row.grand-tot .t-val { color: #ffffff; }
  .sig-container { display: flex; justify-content: space-between; border: 1.5px solid #0f172a; border-top: none; padding: 24px 20px 8px; background: #ffffff; }
  .sig-box { text-align: center; width: 180px; }
  .sig-line { border-top: 1.5px dashed #475569; margin-bottom: 4px; }
  .sig-title { font-size: 11.5px; font-weight: 700; color: #1e293b; }
  .legal-footer { text-align: center; font-size: 11px; color: #64748b; border: 1.5px solid #0f172a; border-top: none; padding: 6px 12px; background: #f8fafc; font-weight: 600; }
  @media print {
    body { padding: 0; background: #fff; }
    .invoice-container { border: 2px solid #000; padding: 16px 18px 12px; max-width: 100%; }
    @page { margin: 6mm 8mm; size: A4 portrait; }
  }
</style>
</head>
<body>
<div class="invoice-container">
  <div class="gov-subtext">अनुसूची-५ (नियम २६ को उपनियम (१) सँग सम्बन्धित) — नेपाल सरकार आन्तरिक राजस्व विभाग</div>
  <div class="invoice-badge-wrap"><div class="invoice-badge">कर बिजक (TAX INVOICE)</div></div>
  <div class="header-main" style="display:flex;align-items:center;justify-content:center;gap:18px;">
    <img src="/static/finance/images/logo.png" alt="Ecolith" style="width:58px;height:58px;border-radius:12px;object-fit:cover;background:#000;border:1.5px solid #10b981;box-shadow:0 2px 6px rgba(0,0,0,0.15);flex-shrink:0;">
    <div>
      <div class="company-title-np">इकोलिथ इन्टरप्राइजेज</div>
      <div class="company-title-en">Ecolith Enterprises</div>
      <div class="company-contacts">
        ठेगाना: इटहरी-२, सुनसरी, कोशी प्रदेश, नेपाल &nbsp;|&nbsp; सम्पर्क: +९७७-९८०२३०१००० &nbsp;|&nbsp; इमेल: contact@ecolith.com.np
      </div>
    </div>
  </div>
  <div class="info-grid">
    <div class="info-card">
      <div class="info-card-title">
        <span>क्रेताको विवरण (Buyer Details)</span>
        <span style="font-weight:600;color:#64748b;">${bill.customer_type ? `[${bill.customer_type.toUpperCase()}]` : ""}</span>
      </div>
      <div class="field-row"><span class="field-label">क्रेताको नाम:</span><span class="field-val" style="font-size:13.5px;">${esc(bill.customer_name || "Walk-in / General Customer")}</span></div>
      <div class="field-row"><span class="field-label">ठेगाना (Address):</span><span class="field-val">${esc(bill.billing_address || "—")}</span></div>
      <div class="field-row"><span class="field-label">क्रेताको पान/भ्याट नं.:</span><div class="pan-wrap">${custVatBoxes}</div></div>
      <div class="field-row"><span class="field-label">सम्पर्क फोन:</span><span class="field-val">${esc(bill.customer_phone || "—")}</span></div>
    </div>
    <div class="info-card">
      <div class="info-card-title"><span>बिजक विवरण (Invoice Meta)</span></div>
      <div class="field-row"><span class="field-label">बिजक नं. (Invoice #):</span><span class="field-val font-mono" style="font-size:14px;">${esc(bill.bill_number)}</span></div>
      <div class="field-row"><span class="field-label">कारोबार मिति:</span><span class="field-val">${billDateStr}</span></div>
      <div class="field-row"><span class="field-label">बिजक जारी मिति:</span><span class="field-val">${printDateStr}</span></div>
      <div class="field-row"><span class="field-label">बिक्रेताको पान नं.:</span><div class="pan-wrap">${sellerVatBoxes}</div></div>
      <div class="field-row"><span class="field-label">भुक्तानीको माध्यम:</span><span class="field-val" style="color:#2563eb;">${payLabel}</span></div>
    </div>
  </div>
  <table class="bill-table">
    <thead>
      <tr>
        <th style="width:38px;">क्र.सं.<br><span style="font-size:10px;">S.N.</span></th>
        <th style="width:85px;">एच.एस. कोड<br><span style="font-size:10px;">HSN/SKU</span></th>
        <th>सामानको विवरण<br><span style="font-size:10px;">Particulars / Description</span></th>
        <th style="width:70px;">परिमाण<br><span style="font-size:10px;">Qty</span></th>
        <th style="width:60px;">इकाई<br><span style="font-size:10px;">Unit</span></th>
        <th style="width:110px;">दर (रु.)<br><span style="font-size:10px;">Rate (NPR)</span></th>
        <th style="width:125px;">जम्मा रकम (रु.)<br><span style="font-size:10px;">Total (NPR)</span></th>
      </tr>
    </thead>
    <tbody>${itemRows}${padRows}</tbody>
  </table>
  <div class="summary-wrap">
    <div class="summary-left">
      <div class="in-words-box">
        <div class="in-words-label">अक्षरेपी (In Words):</div>
        <div class="in-words-text">${wordsNepali}</div>
      </div>
      ${bill.notes ? `<div style="font-size:11.5px;color:#475569;margin-bottom:8px;"><strong>कैफियत (Remarks):</strong> ${esc(bill.notes)}</div>` : ""}
      <div class="payment-breakdown-card">
        <div class="p-stat-row">
          <span style="font-weight:600;color:#334155;">भुक्तानी स्थिति:</span>
          <strong style="color:${dueAmt <= 0 ? '#10b981' : '#f43f5e'};">
            ${dueAmt <= 0 ? '✔ चुक्ता (Paid)' : (paidAmt > 0 ? '⚠ आंशिक भुक्तानी (Partial)' : '⏳ बाँकी (Unpaid)')}
          </strong>
        </div>
        <div class="p-stat-row"><span style="color:#64748b;">प्राप्त रकम (Amount Paid):</span><strong class="font-mono" style="color:#059669;">NPR ${fmtN(paidAmt)}</strong></div>
        <div class="p-stat-row"><span style="color:#64748b;">बाँकी रकम (Balance Due):</span><strong class="font-mono" style="color:#e11d48;">NPR ${fmtN(dueAmt)}</strong></div>
      </div>
    </div>
    <div class="summary-right">
      <div class="tot-row"><span class="t-lbl">जम्मा रकम (Subtotal)</span><span class="t-val">${fmtN(subtotal)}</span></div>
      <div class="tot-row"><span class="t-lbl">छुट (Discount)</span><span class="t-val">${discAmt > 0 ? `- ${fmtN(discAmt)}` : "0.00"}</span></div>
      <div class="tot-row"><span class="t-lbl">कर लाग्ने मूल्य (Taxable Amount)</span><span class="t-val">${fmtN(taxableAmt)}</span></div>
      <div class="tot-row"><span class="t-lbl">१३% मू.अ.कर (13% VAT)</span><span class="t-val">${fmtN(vatAmt)}</span></div>
      <div class="tot-row grand-tot"><span class="t-lbl">कूल जम्मा (Grand Total)</span><span class="t-val">${fmtN(totalWithVat)}</span></div>
    </div>
  </div>
  <div class="sig-container">
    <div class="sig-box"><div class="sig-line"></div><div class="sig-title">क्रेताको हस्ताक्षर</div><div style="font-size:10px;color:#64748b;">Buyer's Signature</div></div>
    <div class="sig-box"><div class="sig-line"></div><div class="sig-title">तयार गर्ने</div><div style="font-size:10px;color:#64748b;">Prepared By</div></div>
    <div class="sig-box"><div class="sig-line"></div><div class="sig-title">अधिकृत बिक्रेताको सही र छाप</div><div style="font-size:10px;color:#64748b;">Authorized Signatory</div></div>
  </div>
  <div class="legal-footer">॥ भूलचूक लिनेदिने ॥ (E. & O.E.) &nbsp;|&nbsp; सामान फिर्ता गर्दा ७ दिनभित्र सक्कल बिल सहित सम्पर्क राख्नुपर्नेछ । &nbsp;|&nbsp; धन्यवाद ! पुनः पाल्नुहोला ।</div>
</div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=880,height=980");
  if (!win) { alert("Please allow pop-ups to print bills."); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 350);
}

// ═══════════════════════════════════════════════════
// 2. ESTIMATE BILL — MATCHING USER REFERENCE TEMPLATE
// ═══════════════════════════════════════════════════
function printEstimateBill(bill) {
  if (!bill) bill = state.currentBill;
  if (!bill) return;

  const subtotal   = Number(bill.subtotal || 0);
  const grandTotal = Number(bill.grand_total || 0);
  const discAmt    = Math.max(0, subtotal - grandTotal);
  const paidAmt    = Number(bill.amount_paid || 0);
  const dueAmt     = Number(bill.balance_due || 0);

  const today = new Date();
  const printDateStr = today.toISOString().slice(0, 10);
  const billDateStr = bill.date || printDateStr;

  // Format date as DD/MM/YYYY
  const parts = billDateStr.split("-");
  const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : billDateStr;

  const itemRows = bill.items.map((it) => `
    <tr>
      <td class="col-qty">${Number(it.quantity)}</td>
      <td class="col-desc">
        <span class="item-name">${esc(it.item_name)}</span>
        ${it.item_sku ? `<span class="item-sub">HSN/SKU: ${esc(it.item_sku)}</span>` : ""}
      </td>
      <td class="col-price">${fmtN(it.unit_price)}</td>
      <td class="col-amount">${fmtN(it.line_total)}</td>
    </tr>
  `).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Estimate — ${esc(bill.bill_number)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Dancing+Script:wght@700&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #172b4d;
    background: #ffffff;
    padding: 40px 48px;
    font-size: 13.5px;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .estimate-page {
    max-width: 800px;
    margin: 0 auto;
    background: #ffffff;
    min-height: 1020px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  /* ── Header ── */
  .est-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 34px;
  }
  .est-header-left {
    max-width: 480px;
  }
  .est-main-title {
    font-size: 52px;
    font-weight: 900;
    color: #172b4d;
    letter-spacing: -1.5px;
    line-height: 1;
    margin-bottom: 14px;
    text-transform: uppercase;
  }
  .company-name {
    font-size: 15.5px;
    font-weight: 800;
    color: #172b4d;
    margin-bottom: 3px;
  }
  .company-address {
    font-size: 13px;
    color: #374151;
    line-height: 1.45;
  }

  /* Circular Logo Badge */
  .logo-circle {
    width: 92px;
    height: 92px;
    background: #000000;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    box-shadow: 0 4px 14px rgba(0,0,0,0.18);
    border: 2px solid #10b981;
  }
  .logo-circle img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* ── Metadata Grid (Bill To / Ship To / Estimate #) ── */
  .meta-grid {
    display: grid;
    grid-template-columns: 1.2fr 1.2fr 1.4fr 1.1fr;
    gap: 16px;
    margin-bottom: 36px;
    font-size: 13px;
  }
  .meta-col {
    display: flex;
    flex-direction: column;
  }
  .meta-label {
    font-size: 13px;
    font-weight: 800;
    color: #172b4d;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin-bottom: 6px;
  }
  .meta-val-name {
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 2px;
  }
  .meta-val-sub {
    color: #4b5563;
    line-height: 1.4;
  }

  .meta-row-item {
    display: flex;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .meta-row-label {
    font-weight: 800;
    color: #172b4d;
    text-transform: uppercase;
    font-size: 13px;
    letter-spacing: 0.2px;
  }
  .meta-row-val {
    font-weight: 600;
    color: #1f2937;
    text-align: right;
  }

  /* ── Items Table ── */
  .items-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 24px;
  }
  .items-table thead tr {
    border-top: 2px solid #de573d;
    border-bottom: 2px solid #de573d;
  }
  .items-table th {
    padding: 10px 10px;
    font-size: 13px;
    font-weight: 800;
    color: #172b4d;
    letter-spacing: 0.6px;
    text-transform: uppercase;
  }
  .items-table td {
    padding: 13px 10px;
    font-size: 13.5px;
    color: #1f2937;
    vertical-align: top;
  }
  .col-qty {
    width: 70px;
    text-align: center;
    font-weight: 700;
  }
  .col-desc {
    text-align: left;
  }
  .col-desc .item-name {
    display: block;
    font-weight: 600;
    color: #111827;
  }
  .col-desc .item-sub {
    display: block;
    font-size: 11.5px;
    color: #6b7280;
    margin-top: 2px;
  }
  .col-price {
    width: 130px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .col-amount {
    width: 130px;
    text-align: right;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  /* ── Totals & Signature ── */
  .totals-block {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    margin-top: 10px;
    margin-bottom: 30px;
  }
  .totals-table {
    width: 270px;
    margin-bottom: 18px;
  }
  .t-row {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
    font-size: 14px;
    color: #374151;
  }
  .t-row .t-lbl {
    font-weight: 500;
  }
  .t-row .t-val {
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .t-row-total {
    margin-top: 6px;
    padding-top: 6px;
    display: flex;
    justify-content: space-between;
    font-size: 20px;
    font-weight: 900;
    color: #172b4d;
  }
  .t-row-total .t-val {
    font-size: 21px;
    letter-spacing: -0.5px;
  }

  /* Handwritten Script Signature */
  .signature-container {
    margin-top: 6px;
    text-align: right;
    padding-right: 12px;
  }
  .handwritten-sig {
    font-family: 'Caveat', cursive;
    font-size: 46px;
    color: #111827;
    line-height: 1;
    transform: rotate(-3deg);
    display: inline-block;
  }

  /* ── Footer Strip (Thank you + Terms & Conditions) ── */
  .est-footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-top: auto;
    padding-top: 36px;
  }
  .thank-you-text {
    font-family: 'Dancing Script', cursive;
    font-size: 50px;
    color: #172b4d;
    font-weight: 700;
    line-height: 1;
    margin-bottom: 10px;
  }
  .terms-card {
    border-left: 2.5px solid #de573d;
    padding-left: 14px;
    max-width: 330px;
    font-size: 12px;
    color: #374151;
  }
  .terms-header {
    font-size: 13px;
    font-weight: 800;
    color: #de573d;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    margin-bottom: 8px;
  }
  .terms-body p {
    margin-bottom: 3px;
    line-height: 1.4;
  }
  .terms-body strong {
    color: #111827;
  }

  @media print {
    body { padding: 24px 30px; }
    .estimate-page { min-height: auto; }
    @page { margin: 8mm 10mm; size: A4 portrait; }
  }
</style>
</head>
<body>
<div class="estimate-page">
  <div>
    <!-- Top Header -->
    <div class="est-header">
      <div class="est-header-left">
        <h1 class="est-main-title">ESTIMATE</h1>
        <div class="company-name">Ecolith Enterprises</div>
        <div class="company-address">
          Itahari-2, Sunsari<br>
          Koshi Province, Nepal<br>
          Phone: +977-9802301000 &nbsp;|&nbsp; PAN: 623351804
        </div>
      </div>
      <div class="logo-circle">
        <img src="/static/finance/images/logo.png" alt="Ecolith" onerror="this.parentElement.innerHTML='ECOLITH'">
      </div>
    </div>

    <!-- Metadata Section -->
    <div class="meta-grid">
      <!-- BILL TO -->
      <div class="meta-col">
        <div class="meta-label">BILL TO</div>
        <div class="meta-val-name">${esc(bill.customer_name || "Walk-in Customer")}</div>
        <div class="meta-val-sub">
          ${esc(bill.billing_address || "Itahari, Sunsari")}<br>
          ${esc(bill.customer_phone || "")}
        </div>
      </div>

      <!-- SHIP TO -->
      <div class="meta-col">
        <div class="meta-label">SHIP TO</div>
        <div class="meta-val-name">${esc(bill.customer_name || "Walk-in Customer")}</div>
        <div class="meta-val-sub">
          ${esc(bill.billing_address || "Itahari, Sunsari")}<br>
          ${esc(bill.customer_phone || "")}
        </div>
      </div>

      <!-- ESTIMATE LABELS -->
      <div class="meta-col">
        <div class="meta-row-item">
          <span class="meta-row-label">ESTIMATE #</span>
        </div>
        <div class="meta-row-item">
          <span class="meta-row-label">ESTIMATE DATE</span>
        </div>
        <div class="meta-row-item">
          <span class="meta-row-label">P.O.#</span>
        </div>
      </div>

      <!-- ESTIMATE VALUES -->
      <div class="meta-col">
        <div class="meta-row-item" style="justify-content: flex-end;">
          <span class="meta-row-val font-bold">${esc(bill.bill_number)}</span>
        </div>
        <div class="meta-row-item" style="justify-content: flex-end;">
          <span class="meta-row-val">${formattedDate}</span>
        </div>
        <div class="meta-row-item" style="justify-content: flex-end;">
          <span class="meta-row-val">${esc(bill.payment_mode.toUpperCase())}</span>
        </div>
      </div>
    </div>

    <!-- Items Table -->
    <table class="items-table">
      <thead>
        <tr>
          <th class="col-qty">QTY</th>
          <th class="col-desc">DESCRIPTION</th>
          <th class="col-price">UNIT PRICE</th>
          <th class="col-amount">AMOUNT</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <!-- Totals Block -->
    <div class="totals-block">
      <div class="totals-table">
        <div class="t-row">
          <span class="t-lbl">Subtotal</span>
          <span class="t-val">${fmtN(subtotal)}</span>
        </div>
        ${discAmt > 0 ? `
        <div class="t-row">
          <span class="t-lbl">Discount</span>
          <span class="t-val">- ${fmtN(discAmt)}</span>
        </div>` : ""}
        <div class="t-row-total">
          <span class="t-lbl">TOTAL</span>
          <span class="t-val">NPR ${fmtN(grandTotal)}</span>
        </div>
        ${dueAmt > 0 ? `
        <div class="t-row" style="color: #059669; font-weight: 600; margin-top: 4px;">
          <span class="t-lbl">Amount Paid</span>
          <span class="t-val">NPR ${fmtN(paidAmt)}</span>
        </div>
        <div class="t-row" style="color: #e11d48; font-weight: 700;">
          <span class="t-lbl">Balance Due</span>
          <span class="t-val">NPR ${fmtN(dueAmt)}</span>
        </div>` : ""}
      </div>

      <!-- Handwritten Signature -->
      <div class="signature-container">
        <div class="handwritten-sig">Ecolith Enterprises</div>
      </div>
    </div>
  </div>

  <!-- Footer Strip -->
  <div class="est-footer">
    <div class="thank-you-text">Thank you</div>
    <div class="terms-card">
      <div class="terms-header">TERMS &amp; CONDITIONS</div>
      <div class="terms-body">
        <p>Payment is due within 15 days</p>
        <p>Name of Bank: <strong>Global IME Bank</strong></p>
        <p>Account name: <strong>Ecolith Enterprises</strong></p>
        <p>Account number: <strong>01201017500123</strong></p>
        <p>Branch: Itahari Branch</p>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=880,height=1020");
  if (!win) { alert("Please allow pop-ups to print bills."); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

// ── Event wiring ──────────────────────────────────
document.getElementById("sbNewBillBtn")?.addEventListener("click", openNewBillModal);
document.getElementById("sbAddRowBtn")?.addEventListener("click", () => addItemRow());
document.getElementById("sbForm")?.addEventListener("submit", saveBill);
document.getElementById("sbDiscount")?.addEventListener("input", recalcTotals);
document.getElementById("sbDiscountType")?.addEventListener("change", recalcTotals);
document.getElementById("sbPaymentMode")?.addEventListener("change", () => {
  const amtInput = document.getElementById("sbAmountPaid");
  if (amtInput) amtInput.dataset.touched = "false";
  recalcTotals();
});
document.getElementById("sbAmountPaid")?.addEventListener("input", () => {
  const amtInput = document.getElementById("sbAmountPaid");
  if (amtInput) amtInput.dataset.touched = "true";
  recalcTotals();
});

// Print triggers: open choice modal
document.getElementById("sbPrintBtn")?.addEventListener("click", openPrintChoiceModal);
document.getElementById("sbChooseVatBill")?.addEventListener("click", () => {
  closePrintChoiceModal();
  printVatBill(state.currentBill);
});
document.getElementById("sbChooseEstimateBill")?.addEventListener("click", () => {
  closePrintChoiceModal();
  printEstimateBill(state.currentBill);
});

document.getElementById("sbCancelBillBtn")?.addEventListener("click", openCancelModal);
document.getElementById("sbConfirmCancelBtn")?.addEventListener("click", confirmCancelBill);

// Update payment button in view modal
document.getElementById("sbViewUpdatePayBtn")?.addEventListener("click", () => {
  if (state.currentBill) openPaymentModal(state.currentBill);
});
document.getElementById("sbPaymentForm")?.addEventListener("submit", savePaymentUpdate);

// New customer toggle
document.getElementById("sbNewCustToggle")?.addEventListener("click", () => {
  document.getElementById("sbNewCustSection").style.display = "";
  document.getElementById("sbCustomer").style.display       = "none";
  document.getElementById("sbNewCustToggle").style.display  = "none";
  setTimeout(() => document.getElementById("sbNewCustName").focus(), 80);
});
document.getElementById("sbCancelNewCust")?.addEventListener("click", () => {
  document.getElementById("sbNewCustSection").style.display = "none";
  document.getElementById("sbCustomer").style.display       = "";
  document.getElementById("sbNewCustToggle").style.display  = "";
  document.getElementById("sbNewCustName").value  = "";
  document.getElementById("sbNewCustPhone").value = "";
});

document.getElementById("sbCustomer")?.addEventListener("change", (e) => {
  const opt = e.target.options[e.target.selectedIndex];
  if (opt && opt.dataset.pan) {
    const panEl = document.getElementById("sbCustomerPan");
    if (panEl) panEl.value = opt.dataset.pan;
  }
  document.querySelectorAll("#sbItemsBody tr").forEach(tr => {
    const sel = tr.querySelector(".row-item-sel");
    if (!sel || !sel.value) return;
    const rowOpt = sel.options[sel.selectedIndex];
    const ct  = getCustomerType();
    const price = ct === "wholesale" ? parseFloat(rowOpt.dataset.wholesale) : parseFloat(rowOpt.dataset.retail);
    if (price) tr.querySelector(".row-price").value = price;
    recalcRow(tr);
  });
});

document.querySelectorAll("[data-close-sb-modal]").forEach(el => el.addEventListener("click", closeNewBillModal));
document.querySelectorAll("[data-close-view-modal]").forEach(el => el.addEventListener("click", closeViewModal));
document.querySelectorAll("[data-close-cancel-modal]").forEach(el => el.addEventListener("click", closeCancelModal));
document.querySelectorAll("[data-close-pay-modal]").forEach(el => el.addEventListener("click", closePaymentModal));
document.querySelectorAll("[data-close-print-choice]").forEach(el => el.addEventListener("click", closePrintChoiceModal));

document.getElementById("sbBody")?.addEventListener("click", (e) => {
  const viewBtn   = e.target.closest("[data-view]");
  const payBtn    = e.target.closest("[data-pay-btn]");
  const cancelBtn = e.target.closest("[data-cancel-btn]");

  if (viewBtn) {
    const bill = state.bills.find(b => String(b.id) === viewBtn.dataset.view);
    if (bill) openViewModal(bill);
  }
  if (payBtn) {
    quickPaymentFromTable(payBtn.dataset.payBtn);
  }
  if (cancelBtn) {
    quickCancelFromTable(cancelBtn.dataset.cancelBtn);
  }
});

[
  document.getElementById("sbFilterCustomer"),
  document.getElementById("sbFilterPayment"),
  document.getElementById("sbFilterFrom"),
  document.getElementById("sbFilterTo"),
  document.getElementById("sbShowCancelled"),
].filter(Boolean).forEach(el => el.addEventListener("change", loadBills));

// ── Init ──────────────────────────────────────────
initTheme();
refreshAll().catch(err => {
  const tbody = document.getElementById("sbBody");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Failed to load: ${esc(err.message)}</td></tr>`;
  }
});

