import { isSupabaseConfigured, requireSupabase } from "./supabase.js";

export { isSupabaseConfigured };

const PRODUCT_SELECT = `
  id,
  category,
  name,
  description,
  image_url,
  base_price,
  is_featured,
  is_active,
  stock_quantity,
  sort_order,
  product_variants (
    id,
    name,
    price,
    is_active,
    sort_order
  ),
  product_options (
    id,
    group_name,
    name,
    price_adjustment,
    is_active,
    sort_order
  )
`;

export function formatRupiah(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeProduct(product) {
  const rawStock = product.stock_quantity;
  const stockQuantity = rawStock === null || rawStock === undefined
    ? null
    : Math.max(0, Number.parseInt(rawStock, 10) || 0);

  return {
    ...product,
    base_price: Number(product.base_price) || 0,
    stock_quantity: stockQuantity,
    product_variants: [...(product.product_variants || [])]
      .filter((variant) => variant.is_active)
      .map((variant) => ({ ...variant, price: Number(variant.price) || 0 }))
      .sort((a, b) => a.sort_order - b.sort_order),
    product_options: [...(product.product_options || [])]
      .filter((option) => option.is_active)
      .map((option) => ({
        ...option,
        price_adjustment: Number(option.price_adjustment) || 0,
      }))
      .sort((a, b) => a.sort_order - b.sort_order),
  };
}

export function isProductSoldOut(product) {
  return product.stock_quantity !== null && product.stock_quantity <= 0;
}

export function productStockLabel(product) {
  if (product.stock_quantity === null) return "Stok tidak dibatasi";
  if (product.stock_quantity <= 0) return "SOLD OUT";
  return `Stok ${product.stock_quantity}`;
}

export async function getProducts(category, { includeInactive = false } = {}) {
  const client = requireSupabase();
  let query = client
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("category", category)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (!includeInactive) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(normalizeProduct);
}

export async function getProductsByIds(ids) {
  if (!ids.length) return [];
  const client = requireSupabase();
  const { data, error } = await client
    .from("products")
    .select(PRODUCT_SELECT)
    .in("id", ids)
    .eq("is_active", true);

  if (error) throw error;
  return (data || []).map(normalizeProduct);
}

export function groupOptions(product) {
  return product.product_options.reduce((groups, option) => {
    if (!groups[option.group_name]) groups[option.group_name] = [];
    groups[option.group_name].push(option);
    return groups;
  }, {});
}

export function getSelection(product, root) {
  const variantSelect = root.querySelector("[data-variant]");
  const variantId = variantSelect?.value || null;
  const variant = product.product_variants.find((item) => item.id === variantId) || null;
  const options = [...root.querySelectorAll("[data-option-group]")]
    .map((select) => {
      const option = product.product_options.find((item) => item.id === select.value);
      return option
        ? {
            id: option.id,
            group_name: option.group_name,
            name: option.name,
            price_adjustment: option.price_adjustment,
          }
        : null;
    })
    .filter(Boolean);

  return { variant, options };
}

export function calculateUnitPrice(product, variant, options = []) {
  const startingPrice = variant ? variant.price : product.base_price;
  return options.reduce(
    (total, option) => total + (Number(option.price_adjustment) || 0),
    startingPrice,
  );
}

export function makeCartKey(productId, variantId, options = []) {
  const optionIds = options.map((option) => option.id).sort().join(",");
  return `${productId}:${variantId || "base"}:${optionIds}`;
}

export function readCart(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function writeCart(key, cart) {
  localStorage.setItem(key, JSON.stringify(cart));
}

export function resolveCart(cart, products) {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const remainingStock = new Map(products.map((product) => [
    product.id,
    product.stock_quantity === null ? Number.POSITIVE_INFINITY : product.stock_quantity,
  ]));
  const invalidKeys = [];
  const adjustedKeys = [];
  const items = [];

  for (const cartItem of cart) {
    const product = productsById.get(cartItem.product_id);
    if (!product || !product.is_active || isProductSoldOut(product)) {
      invalidKeys.push(cartItem.key);
      continue;
    }

    const variant = cartItem.variant_id
      ? product.product_variants.find((item) => item.id === cartItem.variant_id)
      : null;
    if (cartItem.variant_id && !variant) {
      invalidKeys.push(cartItem.key);
      continue;
    }

    const options = (cartItem.option_ids || [])
      .map((id) => product.product_options.find((option) => option.id === id))
      .filter(Boolean);
    if (options.length !== (cartItem.option_ids || []).length) {
      invalidKeys.push(cartItem.key);
      continue;
    }

    const requestedQty = Math.max(1, Number.parseInt(cartItem.qty, 10) || 1);
    const availableQty = remainingStock.get(product.id) ?? Number.POSITIVE_INFINITY;
    const qty = Math.min(requestedQty, availableQty);
    if (qty <= 0) {
      invalidKeys.push(cartItem.key);
      continue;
    }
    if (qty !== requestedQty) adjustedKeys.push(cartItem.key);
    remainingStock.set(product.id, availableQty - qty);

    const unitPrice = calculateUnitPrice(product, variant, options);
    items.push({
      key: cartItem.key,
      product,
      variant,
      options,
      qty,
      unitPrice,
      subtotal: unitPrice * qty,
    });
  }

  return { items, invalidKeys, adjustedKeys };
}

export function renderSetupState(container) {
  container.innerHTML = `
    <div class="state-card">
      <h2>Database belum dihubungkan</h2>
      <p>Ikuti <code>SETUP.md</code>, jalankan schema Supabase, lalu isi <code>assets/js/config.js</code>.</p>
    </div>
  `;
}

export function renderErrorState(container, error) {
  console.error(error);
  container.innerHTML = `
    <div class="state-card state-card--error">
      <h2>Produk belum bisa dimuat</h2>
      <p>${escapeHtml(error?.message || "Terjadi kesalahan.")}</p>
      <button type="button" onclick="location.reload()">Coba lagi</button>
    </div>
  `;
}
