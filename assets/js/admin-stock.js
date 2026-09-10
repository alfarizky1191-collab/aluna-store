import { escapeHtml, getProducts, isProductSoldOut, productStockLabel } from "./catalog.js";
import { requireSupabase } from "./supabase.js";

const stockList = document.getElementById("stock-list");
const tabs = [...document.querySelectorAll(".tab[data-category]")];
let currentCategory = document.querySelector(".tab.active")?.dataset.category || "food";
let products = [];
let loadToken = 0;

async function hasAdminSession() {
  const client = requireSupabase();
  const { data: { session } } = await client.auth.getSession();
  if (!session) return false;

  const { data: admin, error } = await client
    .from("admins")
    .select("user_id")
    .eq("user_id", session.user.id)
    .maybeSingle();

  return !error && Boolean(admin);
}

function stockValue(product) {
  return product.stock_quantity === null ? "" : String(product.stock_quantity);
}

function render() {
  if (!products.length) {
    stockList.innerHTML = '<div class="state-box">Belum ada produk di kategori ini.</div>';
    return;
  }

  stockList.innerHTML = products.map((product) => {
    const soldOut = isProductSoldOut(product);
    const statusClass = soldOut ? "stock-status--sold-out" : "stock-status--available";
    const statusText = soldOut ? "SOLD OUT" : "Tersedia";
    return `
      <article class="stock-card" data-stock-product-id="${escapeHtml(product.id)}">
        <div class="stock-card__info">
          <img src="${escapeHtml(product.image_url || "")}" alt="${escapeHtml(product.name)}">
          <div>
            <h3>${escapeHtml(product.name)}</h3>
            <div class="stock-meta">
              <span class="stock-status ${statusClass}">${statusText}</span>
              <span>${escapeHtml(productStockLabel(product))}</span>
            </div>
          </div>
        </div>
        <div class="stock-controls">
          <label>
            <span>Jumlah stok</span>
            <input data-stock-input type="number" min="0" step="1" inputmode="numeric" placeholder="∞" value="${escapeHtml(stockValue(product))}">
          </label>
          <button class="primary-btn stock-save" type="button" data-stock-action="save">Simpan</button>
          <button class="secondary-btn" type="button" data-stock-action="sold-out">SOLD OUT</button>
          <button class="secondary-btn" type="button" data-stock-action="unlimited">Tanpa batas</button>
        </div>
      </article>
    `;
  }).join("");

  stockList.querySelectorAll("img").forEach((image) => {
    image.addEventListener("error", () => image.removeAttribute("src"), { once: true });
  });
}

async function loadStock(category = currentCategory) {
  const token = ++loadToken;
  currentCategory = category;
  stockList.innerHTML = '<div class="state-box">Memuat stok...</div>';

  try {
    if (!(await hasAdminSession())) {
      if (token === loadToken) stockList.innerHTML = '<div class="state-box">Masuk sebagai admin untuk mengelola stok.</div>';
      return;
    }

    const nextProducts = await getProducts(currentCategory, { includeInactive: true });
    if (token !== loadToken) return;
    products = nextProducts;
    render();
  } catch (error) {
    console.error(error);
    if (token === loadToken) {
      stockList.innerHTML = `<div class="state-box">${escapeHtml(error.message || "Stok gagal dimuat.")}</div>`;
    }
  }
}

async function updateStock(product, quantity) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("products")
    .update({ stock_quantity: quantity, updated_at: new Date().toISOString() })
    .eq("id", product.id)
    .select("id, stock_quantity")
    .single();

  if (error) throw error;
  product.stock_quantity = data.stock_quantity === null ? null : Number(data.stock_quantity);
  render();
}

stockList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-stock-action]");
  const card = event.target.closest("[data-stock-product-id]");
  if (!button || !card) return;

  const product = products.find((item) => item.id === card.dataset.stockProductId);
  if (!product) return;

  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Menyimpan...";

  try {
    const action = button.dataset.stockAction;
    if (action === "sold-out") {
      await updateStock(product, 0);
      return;
    }
    if (action === "unlimited") {
      await updateStock(product, null);
      return;
    }

    const rawValue = card.querySelector("[data-stock-input]").value.trim();
    if (rawValue === "") {
      await updateStock(product, null);
      return;
    }

    const quantity = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new Error("Stok harus berupa angka 0 atau lebih.");
    }
    await updateStock(product, quantity);
  } catch (error) {
    console.error(error);
    window.alert(error.message || "Stok gagal diperbarui.");
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => loadStock(tab.dataset.category));
});

requireSupabase().auth.onAuthStateChange((_event, session) => {
  if (session) window.setTimeout(() => loadStock(currentCategory), 0);
  else stockList.innerHTML = '<div class="state-box">Masuk sebagai admin untuk mengelola stok.</div>';
});

loadStock();
