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
  const num = Number.isFinite(Number(value)) ? Number(value) : 0;
  const hasCents = num % 1 !== 0;
  return "NPR " + num.toLocaleString("en-US", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}

// Distinct accessible colors for charts
const CHART_COLORS = [
  "#10b981", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6",
  "#06b6d4", "#f97316", "#14b8a6", "#6366f1", "#84cc16",
];

function renderPieChart(containerId, items, centerTitle = "TOTAL", centerVal = "") {
  const container = document.getElementById(containerId);
  if (!container) return;

  const validItems = (items || []).filter(it => Number(it.value) > 0);
  const total = validItems.reduce((sum, it) => sum + Number(it.value), 0);

  if (!total || !validItems.length) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 2rem 1rem;">
        <i class="fa-solid fa-chart-pie" style="font-size: 1.8rem; margin-bottom: 0.5rem; opacity: 0.4;"></i>
        <p>No expense data recorded yet.</p>
      </div>`;
    return;
  }

  const radius = 68;
  const circumference = 2 * Math.PI * radius; // ~427.2566
  let offsetAccum = 0;

  let circles = "";
  if (validItems.length === 1) {
    // Single 100% item: draw a clean full ring
    const item = validItems[0];
    const color = item.color || CHART_COLORS[0];
    circles = `
      <circle cx="85" cy="85" r="${radius}"
              fill="none"
              stroke="${color}"
              stroke-width="26"
              style="transition: stroke-width 0.2s;"
              data-label="${escapeHtml(item.label)}"
              data-val="${escapeHtml(formatMoney(item.value))}">
      </circle>
    `;
  } else {
    circles = validItems.map((item, idx) => {
      const fraction = Number(item.value) / total;
      const strokeDash = fraction * circumference;
      const gap = Math.max(0, circumference - strokeDash);
      const strokeOffset = -offsetAccum;
      offsetAccum += strokeDash;
      const color = item.color || CHART_COLORS[idx % CHART_COLORS.length];

      return `
        <circle cx="85" cy="85" r="${radius}"
                fill="none"
                stroke="${color}"
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

  const legend = validItems.map((item, idx) => {
    const pct = ((Number(item.value) / total) * 100).toFixed(1);
    const color = item.color || CHART_COLORS[idx % CHART_COLORS.length];
    return `
      <div class="donut-legend-item">
        <div class="donut-legend-left">
          <span class="donut-legend-dot" style="background:${color};"></span>
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

function renderBarChart(containerId, bars) {
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

    // 1. Render Pie / Donut Chart for Expense Categories
    const pieItems = (data.category_breakdown || []).map((cat, i) => ({
      label: cat.name,
      value: Number(cat.total),
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
    renderPieChart("repPieChartWrapper", pieItems, "EXPENSES", formatMoney(fin.operating_expenses));

    // 2. Render Bar Chart comparing Revenue vs Expenses vs Net Profit/Loss
    const netVal = Number(fin.net_profit);
    const barItems = [
      { label: "Revenue", value: Number(fin.gross_revenue), color: "#10b981" },
      { label: "Expenses", value: Number(fin.operating_expenses), color: "#f43f5e" },
      {
        label: netVal >= 0 ? "Profit" : "Loss",
        value: Math.abs(netVal),
        color: netVal >= 0 ? "#0ea5e9" : "#ef4444"
      },
      { label: "Due", value: Number(fin.total_receivables), color: "#f59e0b" },
    ];
    renderBarChart("repBarChartWrapper", barItems);

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
