const API = {
  inventory: "/api/inventory/",
  item: (id) => `/api/inventory/${id}/`,
  adjust: (id) => `/api/inventory/${id}/adjust/`,
};

const state = {
  items: [],
  editingId: null,
};

const els = {
  invTotalSKUs: document.getElementById("invTotalSKUs"),
  invCostValue: document.getElementById("invCostValue"),
  invSellValue: document.getElementById("invSellValue"),
  invLowStockAlerts: document.getElementById("invLowStockAlerts"),
  inventoryBody: document.getElementById("inventoryBody"),
  invItemCount: document.getElementById("invItemCount"),
  invSearch: document.getElementById("invSearch"),
  invFilterCategory: document.getElementById("invFilterCategory"),
  invFilterStock: document.getElementById("invFilterStock"),
  invClearFiltersBtn: document.getElementById("invClearFiltersBtn"),
  addItemBtn: document.getElementById("addItemBtn"),
  itemModal: document.getElementById("itemModal"),
  itemModalTitle: document.getElementById("itemModalTitle"),
  itemForm: document.getElementById("itemForm"),
  itemId: document.getElementById("itemId"),
  itemSKU: document.getElementById("itemSKU"),
  itemCategory: document.getElementById("itemCategory"),
  itemName: document.getElementById("itemName"),
  itemCostPrice: document.getElementById("itemCostPrice"),
  itemSellingPrice: document.getElementById("itemSellingPrice"),
  itemWholesalePrice: document.getElementById("itemWholesalePrice"),
  itemQuantity: document.getElementById("itemQuantity"),
  itemReorderLevel: document.getElementById("itemReorderLevel"),
  itemUnit: document.getElementById("itemUnit"),
  itemDescription: document.getElementById("itemDescription"),
  itemFormError: document.getElementById("itemFormError"),
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

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  els.toast.classList.add("is-visible");
  setTimeout(() => { els.toast.classList.remove("is-visible"); els.toast.hidden = true; }, 2800);
}

async function loadInventory() {
  try {
    const data = await apiFetch(API.inventory);
    state.items = data.inventory;
    populateCategoryFilter();
    renderSummary();
    renderItems();
  } catch (err) {
    els.inventoryBody.innerHTML = `<tr><td colspan="10" class="empty-state">Error loading inventory: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function populateCategoryFilter() {
  const categories = [...new Set(state.items.map((i) => i.category))].sort();
  const current = els.invFilterCategory.value;
  els.invFilterCategory.innerHTML = '<option value="">All Categories</option>';
  categories.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    els.invFilterCategory.appendChild(opt);
  });
  els.invFilterCategory.value = current;
}

function renderSummary() {
  const totalSKUs = state.items.length;
  const costVal = state.items.reduce((sum, i) => sum + Number(i.total_cost_value), 0);
  const sellVal = state.items.reduce((sum, i) => sum + Number(i.total_sell_value), 0);
  const lowStockCount = state.items.filter((i) => i.is_low_stock).length;

  els.invTotalSKUs.textContent = totalSKUs;
  els.invCostValue.textContent = formatMoney(costVal);
  els.invSellValue.textContent = formatMoney(sellVal);
  els.invLowStockAlerts.textContent = lowStockCount;
}

function renderItems() {
  const search = (els.invSearch.value || "").toLowerCase();
  const categoryFilter = els.invFilterCategory.value;
  const stockFilter = els.invFilterStock.value;

  const filtered = state.items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(search) || item.sku.toLowerCase().includes(search);
    const matchesCategory = !categoryFilter || item.category === categoryFilter;
    let matchesStock = true;
    if (stockFilter === "low_stock") matchesStock = item.is_low_stock && !item.is_out_of_stock;
    else if (stockFilter === "out_of_stock") matchesStock = item.is_out_of_stock;

    return matchesSearch && matchesCategory && matchesStock;
  });

  els.invItemCount.textContent = `${filtered.length} item${filtered.length === 1 ? "" : "s"}`;

  if (!filtered.length) {
    els.inventoryBody.innerHTML = `<tr><td colspan="10" class="empty-state">No inventory items match your search.</td></tr>`;
    return;
  }

  els.inventoryBody.innerHTML = filtered
    .map((item) => {
      let statusBadge = '<span class="badge badge--income">In Stock</span>';
      if (item.is_out_of_stock) statusBadge = '<span class="badge badge--expense">Out of Stock</span>';
      else if (item.is_low_stock) statusBadge = '<span class="badge badge--debit">Low Stock Alert</span>';

      return `
        <tr>
          <td><code style="background:var(--surface-2); padding:0.2rem 0.4rem; border-radius:4px; font-weight:600;">${escapeHtml(item.sku)}</code></td>
          <td><strong>${escapeHtml(item.name)}</strong>${item.description ? `<br><small style="color:var(--text-muted);">${escapeHtml(item.description)}</small>` : ""}</td>
          <td><span style="font-size:0.8rem; background:var(--surface-2); padding:0.2rem 0.5rem; border-radius:4px;">${escapeHtml(item.category)}</span></td>
          <td>${formatMoney(item.cost_price)}</td>
          <td><strong style="color:var(--primary);">${formatMoney(item.selling_price)}</strong></td>
          <td><strong style="color:var(--cyan);">${formatMoney(item.wholesale_price || item.selling_price)}</strong></td>
          <td class="text-right" style="font-weight:700;">${item.quantity} ${escapeHtml(item.unit)}</td>
          <td>${statusBadge}</td>
          <td class="text-right font-weight:600;">${formatMoney(item.total_cost_value)}</td>
          <td>
            ${window.CAN_EDIT_INVENTORY !== false ? `
              <button type="button" class="btn btn--ghost" style="padding:0.2rem 0.5rem; font-size:0.8rem;" data-adjust="${item.id}" data-change="1">+1</button>
              <button type="button" class="btn btn--ghost" style="padding:0.2rem 0.5rem; font-size:0.8rem;" data-adjust="${item.id}" data-change="-1">-1</button>
              <button type="button" class="btn btn--edit" data-edit="${item.id}">Edit</button>
              <button type="button" class="btn btn--danger" data-delete="${item.id}">Delete</button>
            ` : `<span style="font-size:0.75rem;color:var(--text-dim);font-style:italic;">View Only</span>`}
          </td>
        </tr>
      `;
    })
    .join("");
}

function openModal(mode = "add", item = null) {
  state.editingId = mode === "edit" ? item.id : null;
  els.itemModalTitle.textContent = mode === "edit" ? "Edit Inventory Item" : "Add Inventory Item";
  els.itemFormError.hidden = true;

  els.itemSKU.value = item?.sku || "";
  els.itemCategory.value = item?.category || "";
  els.itemName.value = item?.name || "";
  els.itemCostPrice.value = item?.cost_price || "";
  els.itemSellingPrice.value = item?.selling_price || "";
  els.itemWholesalePrice.value = item?.wholesale_price || item?.selling_price || "";
  els.itemQuantity.value = item !== null ? item.quantity : 0;
  els.itemReorderLevel.value = item !== null ? item.reorder_level : 5;
  els.itemUnit.value = item?.unit || "Pcs";
  els.itemDescription.value = item?.description || "";
  els.itemId.value = item?.id || "";

  els.itemModal.classList.add("is-open");
}

function closeModal() {
  els.itemModal.classList.remove("is-open");
  els.itemForm.reset();
  state.editingId = null;
}

async function saveItem(e) {
  e.preventDefault();
  els.itemFormError.hidden = true;

  const payload = {
    sku: els.itemSKU.value,
    category: els.itemCategory.value,
    name: els.itemName.value,
    cost_price: els.itemCostPrice.value,
    selling_price: els.itemSellingPrice.value,
    wholesale_price: els.itemWholesalePrice.value,
    quantity: Number(els.itemQuantity.value),
    reorder_level: Number(els.itemReorderLevel.value),
    unit: els.itemUnit.value,
    description: els.itemDescription.value,
  };

  try {
    if (state.editingId) {
      await apiFetch(API.item(state.editingId), { method: "PUT", body: JSON.stringify(payload) });
      showToast("Item updated successfully!");
    } else {
      await apiFetch(API.inventory, { method: "POST", body: JSON.stringify(payload) });
      showToast("Item added to inventory!");
    }
    closeModal();
    await loadInventory();
  } catch (err) {
    els.itemFormError.textContent = err.message;
    els.itemFormError.hidden = false;
  }
}

async function adjustStock(id, change) {
  try {
    await apiFetch(API.adjust(id), { method: "POST", body: JSON.stringify({ change }) });
    showToast(`Stock ${change > 0 ? "increased" : "decreased"}`);
    await loadInventory();
  } catch (err) {
    showToast(err.message);
  }
}

async function deleteItem(id) {
  if (!confirm("Are you sure you want to delete this inventory item?")) return;
  try {
    await apiFetch(API.item(id), { method: "DELETE" });
    showToast("Item removed from inventory");
    await loadInventory();
  } catch (err) {
    showToast(err.message);
  }
}

if (els.addItemBtn) {
  els.addItemBtn.addEventListener("click", () => openModal("add"));
}
els.itemForm.addEventListener("submit", saveItem);

document.querySelectorAll("[data-close-item-modal]").forEach((el) => el.addEventListener("click", closeModal));

els.inventoryBody.addEventListener("click", (e) => {
  const adjustBtn = e.target.closest("[data-adjust]");
  const editBtn = e.target.closest("[data-edit]");
  const deleteBtn = e.target.closest("[data-delete]");

  if (adjustBtn) {
    adjustStock(Number(adjustBtn.dataset.adjust), Number(adjustBtn.dataset.change));
  }
  if (editBtn) {
    const item = state.items.find((i) => String(i.id) === editBtn.dataset.edit);
    if (item) openModal("edit", item);
  }
  if (deleteBtn) {
    deleteItem(Number(deleteBtn.dataset.delete));
  }
});

[els.invSearch, els.invFilterCategory, els.invFilterStock].forEach((el) => {
  el.addEventListener("input", renderItems);
  el.addEventListener("change", renderItems);
});

els.invClearFiltersBtn.addEventListener("click", () => {
  els.invSearch.value = "";
  els.invFilterCategory.value = "";
  els.invFilterStock.value = "";
  renderItems();
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

loadInventory();
