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
  const shippingModeSelect = document.getElementById("shipping-mode");
  const deliveryLocation = document.getElementById("delivery-location");
  const locationButton = document.getElementById("location-button");
  const shippingStatus = document.getElementById("shipping-status");
  const orderId = `ALUNA-${Date.now().toString().slice(-6)}`;
  let cart = readCart(cartKey);
  let resolvedItems = [];
  let productTotal = 0;
  let shippingFee = 0;
  let shippingDistanceKm = null;
  let customerLocation = null;
  let deliveryOutsideRange = false;

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

  function isDelivery() {
    return category === "food" && shippingModeSelect?.value === "delivery";
  }

  function shippingCost() {
    return category === "food" ? shippingFee : 0;
  }

  function updateTotal() {
    totalContainer.textContent = formatRupiah(productTotal + shippingCost());
  }

  function toRadians(value) {
    return value * (Math.PI / 180);
  }

  function distanceKmBetween(lat1, lon1, lat2, lon2) {
    const earthRadiusKm = 6371;
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
  }

  function feeForDistance(distanceKm) {
    const tier = STORE_CONFIG.shipping?.tiers?.find((item) => distanceKm <= item.maxKm);
    return tier ? tier.fee : null;
  }

  function setShippingStatus(message, type = "") {
    if (!shippingStatus) return;
    shippingStatus.textContent = message;
    shippingStatus.className = "shipping-status";
    if (type) shippingStatus.classList.add(`shipping-status--${type}`);
  }

  function resetDeliveryCalculation() {
    shippingFee = 0;
    shippingDistanceKm = null;
    customerLocation = null;
    deliveryOutsideRange = false;
    setShippingStatus("Lokasi belum dihitung.");
    updateTotal();
  }

  function handleShippingModeChange() {
    if (!deliveryLocation) return;
    if (isDelivery()) {
      deliveryLocation.hidden = false;
      resetDeliveryCalculation();
    } else {
      deliveryLocation.hidden = true;
      resetDeliveryCalculation();
    }
  }

  function locationErrorMessage(error) {
    if (!error) return "Lokasi tidak dapat dibaca. Coba lagi.";
    if (error.code === error.PERMISSION_DENIED) return "Akses lokasi ditolak. Izinkan lokasi di browser lalu coba lagi.";
    if (error.code === error.POSITION_UNAVAILABLE) return "Lokasi tidak tersedia. Pastikan GPS aktif lalu coba lagi.";
    if (error.code === error.TIMEOUT) return "Pencarian lokasi terlalu lama. Coba lagi di tempat dengan sinyal GPS lebih baik.";
    return "Lokasi tidak dapat dibaca. Coba lagi.";
  }

  function calculateShippingFromPosition(position) {
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    const accuracyMeters = Math.round(position.coords.accuracy || 0);
    const store = STORE_CONFIG.storeLocation;
    const distanceKm = distanceKmBetween(store.latitude, store.longitude, latitude, longitude);
    const fee = feeForDistance(distanceKm);

    shippingDistanceKm = distanceKm;
    customerLocation = { latitude, longitude, accuracyMeters };

    if (fee === null || distanceKm > STORE_CONFIG.shipping.maxDeliveryKm) {
      shippingFee = 0;
      deliveryOutsideRange = true;
      setShippingStatus(
        `Jarak sekitar ${distanceKm.toFixed(2)} km. Lokasi di luar radius pengantaran maksimal ${STORE_CONFIG.shipping.maxDeliveryKm} km.`,
        "error",
      );
      updateTotal();
      return;
    }

    shippingFee = fee;
    deliveryOutsideRange = false;
    const accuracyText = accuracyMeters ? ` • akurasi GPS ±${accuracyMeters} m` : "";
    setShippingStatus(
      `Jarak sekitar ${distanceKm.toFixed(2)} km • Ongkir ${formatRupiah(fee)}${accuracyText}`,
      "success",
    );
    updateTotal();
  }

  function requestCustomerLocation() {
    if (!navigator.geolocation) {
      setShippingStatus("Browser ini tidak mendukung akses lokasi.", "error");
      return;
    }

    if (locationButton) {
      locationButton.disabled = true;
      locationButton.textContent = "Mencari lokasi...";
    }
    setShippingStatus("Sedang mengambil lokasi GPS...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        calculateShippingFromPosition(position);
        if (locationButton) {
          locationButton.disabled = false;
          locationButton.textContent = "📍 Perbarui Lokasi Saya";
        }
      },
      (error) => {
        resetDeliveryCalculation();
        setShippingStatus(locationErrorMessage(error), "error");
        if (locationButton) {
          locationButton.disabled = false;
          locationButton.textContent = "📍 Coba Ambil Lokasi Lagi";
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      },
    );
  }

  function validateFoodDelivery() {
    if (!isDelivery()) return true;
    if (deliveryOutsideRange) {
      alert(`Alamat berada di luar radius pengantaran maksimal ${STORE_CONFIG.shipping.maxDeliveryKm} km.`);
      return false;
    }
    if (shippingDistanceKm === null || !customerLocation) {
      alert("Klik 'Gunakan Lokasi Saya' untuk menghitung ongkir terlebih dahulu.");
      return false;
    }
    return true;
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
    if (!validateFoodDelivery()) return null;

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

    if (isDelivery()) {
      const mapsLink = `https://www.google.com/maps?q=${customerLocation.latitude},${customerLocation.longitude}`;
      lines.push(
        "",
        "🚚 Diantar",
        `📏 Jarak estimasi: ${shippingDistanceKm.toFixed(2)} km`,
        `📌 Pin lokasi: ${mapsLink}`,
        `Ongkir: ${formatRupiah(shippingCost())}`,
        `*Total: ${formatRupiah(productTotal + shippingCost())}*`,
      );
    } else {
      lines.push("", "🚚 Ambil sendiri", "Ongkir: Rp0", `*Total: ${formatRupiah(productTotal)}*`);
    }

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

  shippingModeSelect?.addEventListener("change", handleShippingModeChange);
  locationButton?.addEventListener("click", requestCustomerLocation);

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
