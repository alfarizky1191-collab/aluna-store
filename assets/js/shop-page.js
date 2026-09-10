import { STORE_CONFIG } from "./config.js";
import {
  calculateUnitPrice,
  escapeHtml,
  formatRupiah,
  getProducts,
  getSelection,
  groupOptions,
  isProductSoldOut,
  isSupabaseConfigured,
  makeCartKey,
  productStockLabel,
  readCart,
  renderErrorState,
  renderSetupState,
  resolveCart,
  writeCart,
} from "./catalog.js";

export async function initShop({ category, cartKey, checkoutUrl }) {
  const grid = document.getElementById("product-grid");
  const search = document.getElementById("search");
  const modal = document.getElementById("cart-modal");
  const cartList = document.getElementById("cart-list");
  let products = [];
  let cart = readCart(cartKey);

  if (!isSupabaseConfigured) {
    renderSetupState(grid);
    document.getElementById("cart-bar").disabled = true;
    return;
  }

  try {
    products = await getProducts(category);
    cleanCart();
    renderProducts(products);
    updateCartUi();
  } catch (error) {
    renderErrorState(grid, error);
    return;
  }

  function cleanCart() {
    const { items, invalidKeys, adjustedKeys } = resolveCart(cart, products);
    if (!invalidKeys.length && !adjustedKeys.length) return;
    const quantityByKey = new Map(items.map((item) => [item.key, item.qty]));
    cart = cart
      .filter((item) => !invalidKeys.includes(item.key) && quantityByKey.has(item.key))
      .map((item) => ({ ...item, qty: quantityByKey.get(item.key) }));
    writeCart(cartKey, cart);
  }

  function variantsMarkup(product) {
    if (!product.product_variants.length) return "";
    const disabled = isProductSoldOut(product) ? " disabled" : "";
    return `
      <label class="field-label">Pilih paket
        <select class="product-select" data-variant${disabled}>
          ${product.product_variants.map((variant) => `
            <option value="${escapeHtml(variant.id)}">${escapeHtml(variant.name)} — ${formatRupiah(variant.price)}</option>
          `).join("")}
        </select>
      </label>
    `;
  }

  function optionsMarkup(product) {
    const disabled = isProductSoldOut(product) ? " disabled" : "";
    return Object.entries(groupOptions(product)).map(([groupName, options]) => `
      <label class="field-label">${escapeHtml(groupName)}
        <select class="product-select" data-option-group="${escapeHtml(groupName)}"${disabled}>
          ${options.map((option) => `
            <option value="${escapeHtml(option.id)}">
              ${escapeHtml(option.name)}${option.price_adjustment ? ` (+${formatRupiah(option.price_adjustment)})` : ""}
            </option>
          `).join("")}
        </select>
      </label>
    `).join("");
  }

  function productMarkup(product) {
    const soldOut = isProductSoldOut(product);
    const firstVariant = product.product_variants[0] || null;
    const firstOptions = Object.values(groupOptions(product)).map((items) => items[0]).filter(Boolean);
    const startingPrice = calculateUnitPrice(product, firstVariant, firstOptions);
    const stockText = productStockLabel(product);
    return `
      <article class="product-card ${soldOut ? "product-card--sold-out" : ""}" data-product-id="${escapeHtml(product.id)}">
        ${product.is_featured && !soldOut ? '<span class="featured-badge">🔥 BEST</span>' : ""}
        ${soldOut ? '<span class="sold-out-badge">SOLD OUT</span>' : ""}
        <div class="product-card__image"><img src="${escapeHtml(product.image_url || "")}" alt="${escapeHtml(product.name)}" loading="lazy"></div>
        <div class="product-card__body">
          <h2 class="product-card__name">${escapeHtml(product.name)}</h2>
          ${product.description ? `<p class="product-card__description">${escapeHtml(product.description)}</p>` : ""}
          <div class="product-card__price" data-price>${formatRupiah(startingPrice)}</div>
          ${product.stock_quantity !== null ? `<div class="stock-label ${soldOut ? "stock-label--sold-out" : ""}">${escapeHtml(stockText)}</div>` : ""}
          ${variantsMarkup(product)}
          ${optionsMarkup(product)}
          <div class="qty-control">
            <button type="button" data-action="decrease" aria-label="Kurangi ${escapeHtml(product.name)}"${soldOut ? " disabled" : ""}>−</button>
            <span data-qty>0</span>
            <button type="button" data-action="increase" aria-label="Tambah ${escapeHtml(product.name)}"${soldOut ? " disabled" : ""}>+</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderProducts(list) {
    if (!list.length) {
      grid.innerHTML = '<div class="state-card"><h2>Belum ada produk</h2><p>Produk akan tampil setelah ditambahkan dari dashboard admin.</p></div>';
      return;
    }
    grid.innerHTML = list.map(productMarkup).join("");
    grid.querySelectorAll("img").forEach((image) => {
      image.addEventListener("error", () => {
        image.removeAttribute("src");
        image.alt = "Gambar belum tersedia";
      }, { once: true });
    });
    updateVisibleQuantities();
  }

  function getCardState(card) {
    const product = products.find((item) => item.id === card.dataset.productId);
    if (!product) return null;
    const { variant, options } = getSelection(product, card);
    const key = makeCartKey(product.id, variant?.id, options);
    return { product, variant, options, key };
  }

  function quantityInCartForProduct(productId) {
    return cart
      .filter((item) => item.product_id === productId)
      .reduce((sum, item) => sum + Math.max(0, Number.parseInt(item.qty, 10) || 0), 0);
  }

  function changeQuantity(card, delta) {
    const state = getCardState(card);
    if (!state || isProductSoldOut(state.product)) return;

    if (delta > 0 && state.product.stock_quantity !== null) {
      const currentProductQty = quantityInCartForProduct(state.product.id);
      if (currentProductQty >= state.product.stock_quantity) return;
    }

    const existing = cart.find((item) => item.key === state.key);
    if (existing) {
      existing.qty += delta;
      if (existing.qty <= 0) cart = cart.filter((item) => item.key !== state.key);
    } else if (delta > 0) {
      cart.push({
        key: state.key,
        product_id: state.product.id,
        variant_id: state.variant?.id || null,
        option_ids: state.options.map((option) => option.id),
        qty: 1,
      });
    }
    writeCart(cartKey, cart);
    updateVisibleQuantities();
    updateCartUi();
  }

  function updateVisibleQuantities() {
    grid.querySelectorAll(".product-card").forEach((card) => {
      const state = getCardState(card);
      if (!state) return;
      const cartItem = cart.find((item) => item.key === state.key);
      card.querySelector("[data-qty]").textContent = cartItem?.qty || 0;
      card.querySelector("[data-price]").textContent = formatRupiah(
        calculateUnitPrice(state.product, state.variant, state.options),
      );

      const increaseButton = card.querySelector('[data-action="increase"]');
      const decreaseButton = card.querySelector('[data-action="decrease"]');
      const soldOut = isProductSoldOut(state.product);
      if (increaseButton) {
        const atLimit = state.product.stock_quantity !== null
          && quantityInCartForProduct(state.product.id) >= state.product.stock_quantity;
        increaseButton.disabled = soldOut || atLimit;
      }
      if (decreaseButton) decreaseButton.disabled = soldOut || !cartItem?.qty;
    });
  }

  function updateCartUi() {
    const { items } = resolveCart(cart, products);
    const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
    const totalPrice = items.reduce((sum, item) => sum + item.subtotal, 0);
    document.getElementById("cart-count").textContent = totalQty;
    document.getElementById("cart-total").textContent = formatRupiah(totalPrice);
    document.getElementById("modal-total").textContent = formatRupiah(totalPrice);
    document.getElementById("checkout-button").disabled = items.length === 0;
  }

  function renderCart() {
    const { items } = resolveCart(cart, products);
    if (!items.length) {
      cartList.innerHTML = '<div class="empty-state">Keranjang masih kosong.</div>';
      updateCartUi();
      return;
    }
    cartList.innerHTML = items.map((item) => {
      const detail = [
        item.variant?.name,
        ...item.options.map((option) => `${option.group_name}: ${option.name}`),
      ].filter(Boolean).join(" • ");
      return `
        <div class="cart-item">
          <div>
            <strong>${escapeHtml(item.product.name)} × ${item.qty}</strong>
            ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
            <div class="cart-item__price">${formatRupiah(item.subtotal)}</div>
          </div>
          <button class="danger-link" type="button" data-remove-key="${escapeHtml(item.key)}">Hapus</button>
        </div>
      `;
    }).join("");
    updateCartUi();
  }

  function openModal() {
    cleanCart();
    renderCart();
    modal.classList.add("is-open");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    modal.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  grid.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]");
    if (!action || action.disabled) return;
    const card = action.closest(".product-card");
    changeQuantity(card, action.dataset.action === "increase" ? 1 : -1);
  });

  grid.addEventListener("change", (event) => {
    if (!event.target.matches("select")) return;
    updateVisibleQuantities();
  });

  search.addEventListener("input", () => {
    const keyword = search.value.trim().toLocaleLowerCase("id-ID");
    renderProducts(products.filter((product) =>
      `${product.name} ${product.description || ""}`.toLocaleLowerCase("id-ID").includes(keyword),
    ));
  });

  document.getElementById("cart-bar").addEventListener("click", openModal);
  document.getElementById("close-modal").addEventListener("click", closeModal);
  document.getElementById("continue-button").addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => { if (event.target === modal) closeModal(); });
  cartList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-key]");
    if (!button) return;
    cart = cart.filter((item) => item.key !== button.dataset.removeKey);
    writeCart(cartKey, cart);
    renderCart();
    updateVisibleQuantities();
  });
  document.getElementById("checkout-button").addEventListener("click", () => {
    if (!cart.length) return;
    cleanCart();
    if (!cart.length) {
      updateCartUi();
      return;
    }
    writeCart(cartKey, cart);
    window.location.href = checkoutUrl;
  });
}

export const cartKeys = {
  food: STORE_CONFIG.foodCartKey,
  apps: STORE_CONFIG.appsCartKey,
};
