import { STORE_CONFIG } from "./config.js";
import {
  escapeHtml,
  formatRupiah,
  getProductsByIds,
  isSupabaseConfigured,
  readCart,
  resolveCart,
  writeCart,
} from "./catalog.js";

export async function initCheckout({ category, cartKey }) {
  const itemsContainer = document.getElementById("checkout-items");
  const totalContainer = document.getElementById("checkout-total");
  const notice = document.getElementById("checkout-notice");
  const orderButton = document.getElementById("order-button");
  const shippingSelect = document.getElementById("shipping");
  const orderId = `ALUNA-${Date.now().toString().slice(-6)}`;
  let cart = readCart(cartKey);
  let resolvedItems = [];
  let productTotal = 0;

  document.getElementById("order-id").textContent = orderId;

  if (!isSupabaseConfigured) {
    notice.innerHTML = '<div class="notice notice--error">Database belum dikonfigurasi. Ikuti SETUP.md.</div>';
    itemsContainer.innerHTML = '<div class="empty-state">Produk belum dapat dimuat.</div>';
    return;
  }

  if (!cart.length) {
    showEmpty("Keranjang kosong. Silakan kembali dan pilih produk.");
    return;
  }

  try {
    const ids = [...new Set(cart.map((item) => item.product_id))];
    const products = (await getProductsByIds(ids)).filter((product) => product.category === category);
    const { items, invalidKeys } = resolveCart(cart, products);
    resolvedItems = items;

    if (invalidKeys.length) {
      cart = cart.filter((item) => !invalidKeys.includes(item.key));
      writeCart(cartKey, cart);
      notice.innerHTML = '<div class="notice">Beberapa produk berubah atau sudah tidak tersedia dan telah dikeluarkan dari keranjang.</div>';
    }

    if (!resolvedItems.length) {
      showEmpty("Produk di keranjang sudah tidak tersedia.");
      return;
    }

    renderItems();
    orderButton.disabled = false;
  } catch (error) {
    console.error(error);
    notice.innerHTML = `<div class="notice notice--error">${escapeHtml(error.message || "Checkout belum bisa dimuat.")}</div>`;
    showEmpty("Gagal membaca harga terbaru.");
  }

  function showEmpty(message) {
    itemsContainer.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
    totalContainer.textContent = formatRupiah(0);
    orderButton.disabled = true;
  }

  function itemDetail(item) {
    return [
      item.variant?.name,
      ...item.options.map((option) => `${option.group_name}: ${option.name}`),
    ].filter(Boolean).join(" • ");
  }

  function renderItems() {
    productTotal = resolvedItems.reduce((sum, item) => sum + item.subtotal, 0);
    itemsContainer.innerHTML = resolvedItems.map((item) => `
      <div class="checkout-item">
        <div>
          <strong>${escapeHtml(item.product.name)} × ${item.qty}</strong>
          ${itemDetail(item) ? `<small>${escapeHtml(itemDetail(item))}</small>` : ""}
        </div>
        <div class="checkout-item__price">${formatRupiah(item.subtotal)}</div>
      </div>
    `).join("");
    updateTotal();
  }

  function shippingCost() {
    return shippingSelect ? Number.parseInt(shippingSelect.value, 10) || 0 : 0;
  }

  function updateTotal() {
    totalContainer.textContent = formatRupiah(productTotal + shippingCost());
  }

  function foodMessage() {
    const name = document.getElementById("name").value.trim();
    const address = document.getElementById("address").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const notes = document.getElementById("notes").value.trim();
    if (!name || !address) {
      alert("Isi nama dan alamat terlebih dahulu.");
      return null;
    }

    const lines = [
      "*ORDER ALUNA EATS*",
      "",
      `🧾 ID: ${orderId}`,
      `👤 ${name}`,
      `📍 ${address}`,
    ];
    if (phone) lines.push(`📱 ${phone}`);
    lines.push("");
    resolvedItems.forEach((item) => {
      const detail = itemDetail(item);
      lines.push(`• ${item.product.name}${detail ? ` (${detail})` : ""} ×${item.qty} — ${formatRupiah(item.subtotal)}`);
    });
    lines.push("", `Ongkir: ${formatRupiah(shippingCost())}`, `*Total: ${formatRupiah(productTotal + shippingCost())}*`);
    if (notes) lines.push(`📝 ${notes}`);
    return lines.join("\n");
  }

  function appsMessage() {
    const name = document.getElementById("name").value.trim();
    const notes = document.getElementById("notes").value.trim();
    if (!name) {
      alert("Isi nama terlebih dahulu.");
      return null;
    }

    const lines = ["Halo, saya mau pesan:", "", `🧾 ID: ${orderId}`];
    resolvedItems.forEach((item) => {
      const detail = itemDetail(item);
      lines.push(`• ${item.product.name}${detail ? ` (${detail})` : ""} ×${item.qty} — ${formatRupiah(item.subtotal)}`);
    });
    lines.push("", `*Total: ${formatRupiah(productTotal)}*`, `Nama: ${name}`);
    if (notes) lines.push(`Catatan: ${notes}`);
    return lines.join("\n");
  }

  shippingSelect?.addEventListener("change", updateTotal);
  orderButton.addEventListener("click", () => {
    const message = category === "food" ? foodMessage() : appsMessage();
    if (!message) return;
    const popup = window.open(`https://wa.me/${STORE_CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    if (popup) localStorage.removeItem(cartKey);
  });
}

export const checkoutCartKeys = {
  food: STORE_CONFIG.foodCartKey,
  apps: STORE_CONFIG.appsCartKey,
};
