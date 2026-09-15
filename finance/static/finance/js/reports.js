const API = {
  reports: "/api/reports/",
};

const els = {
  repGrossRevenue: document.getElementById("repGrossRevenue"),
  repOperatingExpenses: document.getElementById("repOperatingExpenses"),
  repNetProfit: document.getElementById("repNetProfit"),
  repProfitMargin: document.getElementById("repProfitMargin"),
  categoryBreakdownList: document.getElementById("categoryBreakdownList"),
  repTotalReceivables: document.getElementById("repTotalReceivables"),
  repTotalPayables: document.getElementById("repTotalPayables"),
  repCustomerBody: document.getElementById("repCustomerBody"),
  repCustomerCount: document.getElementById("repCustomerCount"),
};

function formatMoney(value) {
  const num = Number(value);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "NPR" }).format(Number.isFinite(num) ? num : 0);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}

async function loadReports() {
  try {
    const res = await fetch(API.reports);
    const data = await res.json();
    const fin = data.financial_summary;

    els.repGrossRevenue.textContent = formatMoney(fin.gross_revenue);
    els.repOperatingExpenses.textContent = formatMoney(fin.operating_expenses);
    els.repNetProfit.textContent = formatMoney(fin.net_profit);
    els.repNetProfit.style.color = Number(fin.net_profit) >= 0 ? "var(--income)" : "var(--expense)";
    els.repProfitMargin.textContent = `${fin.profit_margin}%`;

    els.repTotalReceivables.textContent = formatMoney(fin.total_receivables);
    els.repTotalPayables.textContent = formatMoney(fin.total_payables);

    // Render Category Breakdown Progress Bars
    if (!data.category_breakdown.length) {
      els.categoryBreakdownList.innerHTML = `<div class="empty-state">No expense categories recorded yet.</div>`;
    } else {
      els.categoryBreakdownList.innerHTML = data.category_breakdown.map(cat => `
        <div style="margin-bottom: 1.25rem;">
          <div style="display: flex; justify-content: space-between; font-size: 0.9rem; font-weight: 500;">
            <span>${escapeHtml(cat.name)}</span>
            <span>${formatMoney(cat.total)} (${cat.percentage}%)</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${cat.percentage}%;"></div>
          </div>
        </div>
      `).join("");
    }

    // Render Customer Outstanding Balances Report
    const custs = data.customer_statements;
    els.repCustomerCount.textContent = `${custs.length} customer${custs.length === 1 ? "" : "s"}`;

    if (!custs.length) {
      els.repCustomerBody.innerHTML = `<tr><td colspan="6" class="empty-state">No customer accounts registered.</td></tr>`;
    } else {
      els.repCustomerBody.innerHTML = custs.map(c => {
        const net = Number(c.net_balance);
        let badgeClass = "badge--settled";
        if (net > 0) badgeClass = "badge--debit";
        else if (net < 0) badgeClass = "badge--credit";

        return `
          <tr>
            <td><strong>${escapeHtml(c.name)}</strong></td>
            <td>${escapeHtml(c.phone || c.email || "-")}</td>
            <td class="text-right" style="color: #ef4444;">${formatMoney(c.total_debit)}</td>
            <td class="text-right" style="color: #22c55e;">${formatMoney(c.total_credit)}</td>
            <td class="text-right" style="font-weight: 700; color: ${net > 0 ? '#ef4444' : (net < 0 ? '#22c55e' : 'var(--text)')}">
              ${formatMoney(net)}
            </td>
            <td><span class="badge ${badgeClass}">${c.status}</span></td>
          </tr>
        `;
      }).join("");
    }

  } catch (err) {
    els.categoryBreakdownList.innerHTML = `<div class="empty-state">Error loading report data: ${escapeHtml(err.message)}</div>`;
  }
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

loadReports();
