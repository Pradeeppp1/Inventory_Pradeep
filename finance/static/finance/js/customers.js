/* ═══════════════════════════════════════════════
   Customer Ledger — customers.js
   Ecolith Enterprises
════════════════════════════════════════════════ */

const API = {
  customers:    "/api/customers/",
  ledger:       (id) => `/api/customers/${id}/ledger/`,
  transactions: "/api/transactions/",
  categories:   "/api/categories/",
};

const state = {
  customers:        [],
  selectedCustomer: null,
  categories:       [],
  ledgerData:       null,   // last fetched ledger API response
};

// ── Safe element references ───────────────────────
function el(id) { return document.getElementById(id); }

// ── Utilities ─────────────────────────────────────
function getCookie(name) {
  const m = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[2]) : null;
}

async function apiFetch(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const csrf = getCookie("csrftoken");
  if (csrf && options.method && options.method !== "GET") headers["X-CSRFToken"] = csrf;
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) { window.location.href = "/login/"; throw new Error("Session expired"); }
  if (res.status === 403) { throw new Error("Account not approved yet"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
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

function formatDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function esc(t) {
  const d = document.createElement("div");
  d.textContent = t || "";
  return d.innerHTML;
}

function showToast(msg, ok = true) {
  const t = el("toast");
  if (!t) return;
  t.textContent = msg;
  t.style.background = ok ? "var(--primary)" : "#ef4444";
  t.hidden = false;
  t.classList.add("is-visible");
  setTimeout(() => { t.classList.remove("is-visible"); t.hidden = true; }, 2800);
}

// ── Load all data ─────────────────────────────────
async function loadInitialData() {
  const listEl = el("customerList");
  try {
    const [custRes, catRes] = await Promise.all([
      apiFetch(API.customers),
      apiFetch(API.categories),
    ]);
    state.customers  = custRes.customers  || [];
    state.categories = catRes.categories  || [];
    renderCustomerList();
    if (state.customers.length) {
      selectCustomer(state.customers[0].id);
    }
  } catch (err) {
    if (listEl) listEl.innerHTML = `<div class="empty-state" style="color:#ef4444;">
      <i class="fa-solid fa-triangle-exclamation"></i> Failed to load: ${esc(err.message)}
    </div>`;
  }
}

// ── Render customer sidebar ───────────────────────
function renderCustomerList() {
  const listEl = el("customerList");
  if (!listEl) return;
  const query    = (el("searchCustomer")?.value || "").toLowerCase();
  const filtered = state.customers.filter(c =>
    c.name.toLowerCase().includes(query) || (c.phone && c.phone.includes(query))
  );

  if (!filtered.length) {
    listEl.innerHTML = `<div class="empty-state">No customers found. <button onclick="el('addCustomerBtn').click()" style="color:var(--primary);background:none;border:none;cursor:pointer;font-family:inherit;font-size:inherit;text-decoration:underline;">Add one?</button></div>`;
    return;
  }

  listEl.innerHTML = filtered.map(c => {
    const isW = c.customer_type === "wholesale";
    const typeBadge = isW
      ? '<span style="font-size:0.68rem;background:rgba(6,182,212,0.18);color:var(--cyan);padding:0.1rem 0.4rem;border-radius:4px;font-weight:700;margin-left:0.4rem;">WHOLESALE</span>'
      : '<span style="font-size:0.68rem;background:var(--surface-3);color:var(--text-muted);padding:0.1rem 0.4rem;border-radius:4px;font-weight:600;margin-left:0.4rem;">RETAIL</span>';
    const active = state.selectedCustomer === c.id ? "active" : "";
    return `
      <div class="customer-item ${active}" data-id="${c.id}">
        <h4>${esc(c.name)}${typeBadge}</h4>
        <p><i class="fa-solid fa-phone"></i> ${esc(c.phone || "No phone")}${c.email ? ` &nbsp;|&nbsp; ${esc(c.email)}` : ""}</p>
      </div>`;
  }).join("");
}

// ── Select customer + render ledger ───────────────
async function selectCustomer(id) {
  state.selectedCustomer = id;
  renderCustomerList();

  const cust = state.customers.find(c => c.id === id);
  if (cust) {
    const typeTag = cust.customer_type === "wholesale" ? " [Wholesale Account]" : " [Retail Account]";
    const nameEl = el("custDetailName");
    const metaEl = el("custDetailMeta");
    if (nameEl) nameEl.textContent = cust.name + typeTag;
    if (metaEl) {
      const parts = [];
      if (cust.pan_vat) parts.push(`PAN/VAT: ${cust.pan_vat}`);
      parts.push(`Phone: ${cust.phone || "N/A"}`);
      parts.push(`Email: ${cust.email || "N/A"}`);
      metaEl.textContent = parts.join(" | ");
    }
  }

  const bodyEl = el("ledgerBody");
  if (bodyEl) bodyEl.innerHTML = `<tr><td colspan="6" class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading ledger...</td></tr>`;

  try {
    const data = await apiFetch(API.ledger(id));
    state.ledgerData = data;   // cache for print

    const debitsEl  = el("custTotalDebits");
    const creditsEl = el("custTotalCredits");
    const netEl     = el("custNetBalance");
    if (debitsEl)  debitsEl.textContent  = formatMoney(data.summary.total_debits);
    if (creditsEl) creditsEl.textContent = formatMoney(data.summary.total_credits);

    const net = Number(data.summary.total_debits) - Number(data.summary.total_credits);
    if (netEl) {
      netEl.textContent = formatMoney(net);
      netEl.style.color = net > 0 ? "#ef4444" : (net < 0 ? "#10b981" : "var(--text)");
    }

    // Merge bills + credit transactions, sorted by date
    const billEntries = (data.bills || []).map(b => ({ _t: "bill", date: b.date, ts: b.date, d: b }));
    const txEntries   = (data.transactions || []).map(t => ({ _t: "tx", date: t.date, ts: t.created_at, d: t }));
    const all = [...billEntries, ...txEntries].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.ts || "") < (b.ts || "") ? -1 : 1;
    });

    if (!all.length) {
      if (bodyEl) bodyEl.innerHTML = `<tr><td colspan="6" class="empty-state">
        No entries yet — create a <a href="/sales-bills/" style="color:var(--primary);">Sales Bill</a> for this customer.
      </td></tr>`;
      return;
    }

    let runBal = 0;
    if (bodyEl) bodyEl.innerHTML = all.map(entry => {
      if (entry._t === "bill") {
        const b   = entry.d;
        const amt = Number(b.amount);
        runBal += amt;
        const itemsSummary = b.items_summary
          ? `<br><small style="color:var(--text-muted);">${esc(b.items_summary)}</small>` : "";
        const payBadge = `<span style="font-size:0.63rem;background:var(--surface-2);color:var(--text-muted);padding:0.1rem 0.3rem;border-radius:3px;margin-left:0.3rem;">${b.payment_mode || "cash"}</span>`;
        const balColor = runBal > 0 ? "#ef4444" : runBal < 0 ? "#10b981" : "var(--text)";
        return `
          <tr>
            <td>${formatDate(b.date)}</td>
            <td>
              <strong style="color:var(--primary);"><i class="fa-solid fa-file-invoice" style="margin-right:0.3rem;"></i>${esc(b.bill_number)}</strong>
              <span style="background:rgba(16,185,129,0.12);color:var(--primary);font-size:0.62rem;padding:0.1rem 0.4rem;border-radius:4px;margin-left:0.3rem;font-weight:700;">AUTO</span>
              ${payBadge}${itemsSummary}
              ${b.notes ? `<br><small style="color:var(--text-muted);">${esc(b.notes)}</small>` : ""}
            </td>
            <td style="text-align:center;color:var(--text-muted);">${b.items_count || "—"} items</td>
            <td class="text-right" style="color:#ef4444;font-weight:600;">${formatMoney(amt)}</td>
            <td class="text-right" style="color:#10b981;">—</td>
            <td class="text-right" style="font-weight:700;color:${balColor};">${formatMoney(runBal)}</td>
          </tr>`;
      }

      // Credit/payment transaction
      const tx     = entry.d;
      const amt    = Number(tx.amount);
      const isInc  = tx.type === "income";
      const isExp  = tx.type === "expense";
      if (isExp) runBal += amt;
      else if (isInc) runBal -= amt;

      const balColor = runBal > 0 ? "#ef4444" : runBal < 0 ? "#10b981" : "var(--text)";
      const discStr  = Number(tx.discount || 0) > 0
        ? `<br><small style="color:var(--primary);">Disc: ${tx.discount_type === "percent" ? tx.discount + "%" : formatMoney(tx.discount)}</small>` : "";
      const titleStr = tx.item_name
        ? `<strong style="color:var(--cyan);">${esc(tx.item_name)}</strong><small style="color:var(--text-muted);margin-left:0.3rem;">(${esc(tx.item_sku || "")})</small>${discStr}`
        : `<strong>${esc(tx.title)}</strong>`;

      return `
        <tr>
          <td>${formatDate(tx.date)}</td>
          <td>
            ${isInc ? '<span style="background:rgba(16,185,129,0.12);color:#10b981;font-size:0.62rem;padding:0.1rem 0.4rem;border-radius:4px;font-weight:700;margin-right:0.3rem;">PAYMENT</span>' : ""}
            ${titleStr}
            ${tx.description ? `<br><small style="color:var(--text-muted);">${esc(tx.description)}</small>` : ""}
          </td>
          <td style="text-align:center;">${tx.item_quantity > 1 ? `${tx.item_quantity} pcs` : (tx.item_name ? "1 pc" : "—")}</td>
          <td class="text-right" style="color:#ef4444;">${isExp ? formatMoney(amt) : "—"}</td>
          <td class="text-right" style="color:#10b981;font-weight:600;">${isInc ? formatMoney(amt) : "—"}</td>
          <td class="text-right" style="font-weight:700;color:${balColor};">${formatMoney(runBal)}</td>
        </tr>`;
    }).join("");

  } catch (err) {
    if (bodyEl) bodyEl.innerHTML = `<tr><td colspan="6" class="empty-state" style="color:#ef4444;">Error: ${esc(err.message)}</td></tr>`;
  }
}

// ── Customer list events ──────────────────────────
el("customerList").addEventListener("click", (e) => {
  const item = e.target.closest(".customer-item");
  if (item) selectCustomer(Number(item.dataset.id));
});

const searchEl = el("searchCustomer");
if (searchEl) searchEl.addEventListener("input", renderCustomerList);

// ── Add Customer modal ────────────────────────────
el("addCustomerBtn").addEventListener("click", () => {
  el("custFormError").hidden = true;
  el("customerForm").reset();
  el("customerModal").classList.add("is-open");
});

document.querySelectorAll("[data-close-cust-modal]").forEach(e =>
  e.addEventListener("click", () => el("customerModal").classList.remove("is-open"))
);

el("customerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  el("custFormError").hidden = true;
  const payload = {
    name:          el("custName").value.trim(),
    customer_type: el("custType")?.value || "retail",
    phone:         el("custPhone").value.trim(),
    pan_vat:       (el("custPanVat")?.value || "").trim(),
    email:         el("custEmail").value.trim(),
  };
  if (!payload.name) {
    el("custFormError").textContent = "Customer name is required.";
    el("custFormError").hidden = false;
    return;
  }
  try {
    const res = await apiFetch(API.customers, { method: "POST", body: JSON.stringify(payload) });
    showToast("Customer created!");
    el("customerModal").classList.remove("is-open");
    await loadInitialData();
    selectCustomer(res.customer.id);
  } catch (err) {
    el("custFormError").textContent = err.message;
    el("custFormError").hidden = false;
  }
});

// ── Record Payment (Credit) ───────────────────────
const creditBtn = el("btnRecordCredit");
if (creditBtn) {
  creditBtn.addEventListener("click", async () => {
    if (!state.selectedCustomer) { alert("Select a customer first."); return; }
    const cust = state.customers.find(c => c.id === state.selectedCustomer);

    const amtStr = prompt(`Enter CREDIT amount (payment received from ${cust?.name || "customer"}):`);
    if (!amtStr || isNaN(amtStr) || Number(amtStr) <= 0) return;

    const title = prompt("Description / Particulars:", "Cash Payment Received");
    if (!title) return;

    const incomeCat = state.categories.find(c => c.type === "income") || state.categories[0];
    const payload = {
      type:        "income",
      title,
      amount:      Number(amtStr),
      date:        new Date().toISOString().slice(0, 10),
      category_id: incomeCat?.id || 1,
      customer_id: state.selectedCustomer,
      description: "Credit payment received",
    };
    try {
      await apiFetch(API.transactions, { method: "POST", body: JSON.stringify(payload) });
      showToast("Payment recorded!");
      selectCustomer(state.selectedCustomer);
    } catch (err) {
      alert("Error: " + err.message);
    }
  });
}

// ── Theme toggle ──────────────────────────────────
(function initTheme() {
  const btn = el("themeToggleBtn");
  if (!btn) return;
  const update = () => {
    const dark = (document.documentElement.getAttribute("data-theme") || "dark") === "dark";
    btn.innerHTML = dark ? '<i class="fa-solid fa-sun" style="color:#f59e0b;"></i>' : '<i class="fa-solid fa-moon"></i>';
  };
  update();
  btn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    update();
  });
})();

// ── Print Statement ───────────────────────────────
function printStatement() {
  if (!state.selectedCustomer || !state.ledgerData) {
    alert("Please select a customer to print their statement.");
    return;
  }

  const data = state.ledgerData;
  const cust = data.customer;
  const summ = data.summary;
  const printDate = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  // Merge + sort entries exactly as in the ledger view
  const billEntries = (data.bills || []).map(b => ({ _t: "bill", date: b.date, ts: b.date, d: b }));
  const txEntries   = (data.transactions || []).map(t => ({ _t: "tx", date: t.date, ts: t.created_at, d: t }));
  const all = [...billEntries, ...txEntries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return (a.ts || "") < (b.ts || "") ? -1 : 1;
  });

  let runBal = 0;
  const rows = all.map(entry => {
    if (entry._t === "bill") {
      const b   = entry.d;
      const amt = Number(b.amount);
      runBal += amt;
      const balClass = runBal > 0 ? "neg" : runBal < 0 ? "pos" : "";
      return `<tr>
        <td>${formatDate(b.date)}</td>
        <td><strong>${esc(b.bill_number)}</strong>${b.items_summary ? `<br><small class="muted">${esc(b.items_summary)}</small>` : ""}${b.notes ? `<br><small class="muted">${esc(b.notes)}</small>` : ""}<span class="pill">${b.payment_mode || "cash"}</span></td>
        <td class="center">${b.items_count || "—"}</td>
        <td class="num neg">${formatMoney(amt)}</td>
        <td class="num">—</td>
        <td class="num ${balClass}"><strong>${formatMoney(runBal)}</strong></td>
      </tr>`;
    }
    const tx    = entry.d;
    const amt   = Number(tx.amount);
    const isInc = tx.type === "income";
    const isExp = tx.type === "expense";
    if (isExp) runBal += amt;
    else if (isInc) runBal -= amt;
    const balClass = runBal > 0 ? "neg" : runBal < 0 ? "pos" : "";
    const label = tx.item_name
      ? `${esc(tx.item_name)} <small class="muted">(${esc(tx.item_sku || "")})</small>`
      : `${esc(tx.title)}`;
    return `<tr>
      <td>${formatDate(tx.date)}</td>
      <td>${isInc ? '<span class="pill pay">PAYMENT</span> ' : ""}${label}${tx.description ? `<br><small class="muted">${esc(tx.description)}</small>` : ""}</td>
      <td class="center">${tx.item_quantity > 1 ? `${tx.item_quantity} pcs` : (tx.item_name ? "1 pc" : "—")}</td>
      <td class="num neg">${isExp ? formatMoney(amt) : "—"}</td>
      <td class="num pos">${isInc ? formatMoney(amt) : "—"}</td>
      <td class="num ${balClass}"><strong>${formatMoney(runBal)}</strong></td>
    </tr>`;
  }).join("");

  const net     = Number(summ.total_debits) - Number(summ.total_credits);
  const netStr  = formatMoney(Math.abs(net));
  const netLabel = net > 0 ? "Amount Receivable (Customer Owes)" : net < 0 ? "Advance / Overpaid" : "Account Settled";
  const netClass = net > 0 ? "neg" : net < 0 ? "pos" : "";

  const custTypeBadge = (cust.customer_type || "retail") === "wholesale" ? "Wholesale Account" : "Retail Account";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Customer Statement — ${esc(cust.name)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 13px;
    color: #1a1a2e;
    background: #fff;
    padding: 32px 40px;
  }

  /* ── Letterhead ── */
  .letterhead {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 28px;
    padding-bottom: 20px;
    border-bottom: 2px solid #10b981;
  }
  .company-name {
    font-size: 22px;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.03em;
    margin-bottom: 4px;
  }
  .company-sub {
    font-size: 12px;
    color: #64748b;
    line-height: 1.6;
  }
  .doc-meta {
    text-align: right;
  }
  .doc-meta .doc-title {
    font-size: 18px;
    font-weight: 700;
    color: #10b981;
    letter-spacing: -0.02em;
  }
  .doc-meta .doc-date {
    font-size: 11.5px;
    color: #64748b;
    margin-top: 4px;
  }

  /* ── Customer Info ── */
  .info-row {
    display: flex;
    gap: 24px;
    margin-bottom: 22px;
  }
  .info-box {
    flex: 1;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 14px 16px;
  }
  .info-box h3 {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #94a3b8;
    margin-bottom: 8px;
  }
  .info-box p {
    font-size: 13px;
    color: #334155;
    line-height: 1.65;
  }
  .info-box .cust-name {
    font-size: 16px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 4px;
  }
  .badge {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 8px;
    border-radius: 4px;
    margin-left: 6px;
    vertical-align: middle;
    background: #e0f2fe;
    color: #0369a1;
  }

  /* ── Summary ── */
  .summary-box {
    display: flex;
    gap: 1px;
    margin-bottom: 22px;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    overflow: hidden;
  }
  .summary-cell {
    flex: 1;
    padding: 14px 18px;
    background: #f8fafc;
    text-align: center;
  }
  .summary-cell:not(:last-child) {
    border-right: 1px solid #e2e8f0;
  }
  .summary-cell .s-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #94a3b8;
    margin-bottom: 6px;
  }
  .summary-cell .s-value {
    font-size: 16px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .summary-cell.net-cell { background: #fff; }
  .summary-cell.net-cell .s-label { color: #475569; }

  /* ── Table ── */
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  thead tr { background: #0f172a; color: #fff; }
  th {
    padding: 9px 12px;
    text-align: left;
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    white-space: nowrap;
  }
  td {
    padding: 8px 12px;
    border-bottom: 1px solid #f1f5f9;
    font-size: 12.5px;
    color: #334155;
    vertical-align: top;
  }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  tbody tr:last-child td { border-bottom: none; }
  .center { text-align: center; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .neg { color: #dc2626; }
  .pos { color: #16a34a; }
  small.muted { color: #94a3b8; font-size: 11px; }
  .pill {
    display: inline-block;
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 1px 5px;
    border-radius: 3px;
    margin-left: 5px;
    background: #e2e8f0;
    color: #475569;
    vertical-align: middle;
  }
  .pill.pay { background: #dcfce7; color: #16a34a; }

  /* ── Net Balance Banner ── */
  .net-banner {
    border-radius: 8px;
    padding: 14px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    border: 1.5px solid #e2e8f0;
    background: #f8fafc;
  }
  .net-banner .net-label { font-size: 13px; font-weight: 600; color: #475569; }
  .net-banner .net-amount { font-size: 20px; font-weight: 800; letter-spacing: -0.03em; }

  /* ── Footer ── */
  .footer {
    margin-top: 32px;
    padding-top: 14px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: #94a3b8;
  }

  @media print {
    body { padding: 16px 20px; }
    @page { margin: 14mm 12mm; size: A4; }
  }
</style>
</head>
<body>

  <div class="letterhead">
    <div>
      <div class="company-name">Ecolith Enterprises</div>
      <div class="company-sub">
        Itahari, Sunsari, Nepal<br>
        Customer Ledger Statement
      </div>
    </div>
    <div class="doc-meta">
      <div class="doc-title">Account Statement</div>
      <div class="doc-date">Printed: ${printDate}</div>
    </div>
  </div>

  <div class="info-row">
    <div class="info-box">
      <h3>Customer</h3>
      <div class="cust-name">${esc(cust.name)}<span class="badge">${custTypeBadge}</span></div>
      <p>
        ${cust.phone ? `<strong>Phone:</strong> ${esc(cust.phone)}<br>` : ""}
        ${cust.email ? `<strong>Email:</strong> ${esc(cust.email)}` : ""}
        ${!cust.phone && !cust.email ? "No contact details on file." : ""}
      </p>
    </div>
    <div class="info-box">
      <h3>Statement period</h3>
      <p>All transactions on record as of<br><strong>${printDate}</strong></p>
    </div>
  </div>

  <div class="summary-box">
    <div class="summary-cell">
      <div class="s-label">Total Debit</div>
      <div class="s-value neg">${formatMoney(summ.total_debits)}</div>
    </div>
    <div class="summary-cell">
      <div class="s-label">Total Credit</div>
      <div class="s-value pos">${formatMoney(summ.total_credits)}</div>
    </div>
    <div class="summary-cell net-cell">
      <div class="s-label">Net Balance</div>
      <div class="s-value ${netClass}">${formatMoney(net)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:100px">Date</th>
        <th>Particulars</th>
        <th style="width:60px;text-align:center">Qty</th>
        <th style="width:120px;text-align:right">Debit (DR)</th>
        <th style="width:120px;text-align:right">Credit (CR)</th>
        <th style="width:130px;text-align:right">Running Balance</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="6" style="text-align:center;padding:24px;color:#94a3b8;">No transactions on record.</td></tr>`}
    </tbody>
  </table>

  <div class="net-banner">
    <span class="net-label">${netLabel}</span>
    <span class="net-amount ${netClass}">${netStr}</span>
  </div>

  <div class="footer">
    <span>Ecolith Enterprises · Itahari, Sunsari, Nepal</span>
    <span>Generated ${printDate} · This is a computer-generated statement.</span>
  </div>

</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) { alert("Please allow pop-ups for this site to print statements."); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  // Short delay so styles render before the print dialog opens
  setTimeout(() => { win.print(); }, 400);
}

const printBtn = el("printLedgerBtn");
if (printBtn) {
  printBtn.addEventListener("click", printStatement);
}

// ── Boot ──────────────────────────────────────────
loadInitialData().catch(err => {
  const listEl = el("customerList");
  if (listEl) listEl.innerHTML = `<div class="empty-state" style="color:#ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(err.message)}</div>`;
});
