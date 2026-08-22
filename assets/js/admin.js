import { STORE_CONFIG } from "./config.js";
import { escapeHtml, formatRupiah, getProducts, isSupabaseConfigured } from "./catalog.js";
import { requireSupabase } from "./supabase.js";

const loginView = document.getElementById("login-view");
const dashboardView = document.getElementById("dashboard-view");
const productList = document.getElementById("product-list");
const editor = document.getElementById("editor");
const form = document.getElementById("product-form");
const toast = document.getElementById("toast");
let currentCategory = "food";
let products = [];
let toastTimer;

if (!isSupabaseConfigured) {
  document.getElementById("auth-message").innerHTML = "Supabase belum dikonfigurasi. Ikuti <code>SETUP.md</code>.";
  document.getElementById("login-button").disabled = true;
} else {
  boot();
}

async function boot() {
  const client = requireSupabase();
  const { data: { session } } = await client.auth.getSession();
  await setSession(session);
  client.auth.onAuthStateChange((_event, nextSession) => {
    window.setTimeout(() => setSession(nextSession), 0);
  });
}

async function setSession(session) {
  if (!session) {
    loginView.classList.remove("hidden");
    dashboardView.classList.add("hidden");
    return;
  }

  const client = requireSupabase();
  const { data: admin, error } = await client
    .from("admins")
    .select("user_id")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (error || !admin) {
    await client.auth.signOut();
    document.getElementById("auth-message").textContent = "Akun ini tidak memiliki akses admin.";
    return;
  }

  document.getElementById("admin-email").textContent = session.user.email;
  loginView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
  await loadProducts();
}

async function loadProducts() {
  productList.innerHTML = '<div class="state-box">Memuat produk...</div>';
  try {
    products = await getProducts(currentCategory, { includeInactive: true });
    renderProductList();
  } catch (error) {
    console.error(error);
    productList.innerHTML = `<div class="state-box">${escapeHtml(error.message || "Produk gagal dimuat.")}</div>`;
  }
}

function productPrice(product) {
  const prices = product.product_variants.map((variant) => variant.price);
  return prices.length ? Math.min(...prices) : product.base_price;
}

function renderProductList() {
  if (!products.length) {
    productList.innerHTML = '<div class="state-box">Belum ada produk di kategori ini.</div>';
    return;
  }

  productList.innerHTML = products.map((product) => `
    <article class="admin-product ${product.is_active ? "" : "inactive"}" data-product-id="${escapeHtml(product.id)}">
      <img src="${escapeHtml(product.image_url || "")}" alt="${escapeHtml(product.name)}">
      <div>
        <h3>${escapeHtml(product.name)}</h3>
        <p>${formatRupiah(productPrice(product))}${product.product_variants.length ? ` • ${product.product_variants.length} varian` : ""}</p>
        <span class="status-pill ${product.is_active ? "" : "inactive"}">${product.is_active ? "Tampil" : "Disembunyikan"}</span>
      </div>
      <div class="admin-product__actions">
        <button class="mini-btn" type="button" data-action="edit">Edit</button>
        <button class="mini-btn" type="button" data-action="toggle">${product.is_active ? "Sembunyikan" : "Tampilkan"}</button>
        <button class="mini-btn mini-btn--danger" type="button" data-action="delete">Hapus</button>
      </div>
    </article>
  `).join("");

  productList.querySelectorAll("img").forEach((image) => {
    image.addEventListener("error", () => image.removeAttribute("src"), { once: true });
  });
}

function addVariantRow(value = {}) {
  const row = document.createElement("div");
  row.className = "repeater-row variant-row";
  row.innerHTML = `
    <input data-variant-name maxlength="80" placeholder="Nama varian" value="${escapeHtml(value.name || "")}">
    <input data-variant-price type="number" min="0" step="100" placeholder="Harga" value="${value.price ?? ""}">
    <button class="remove-row" type="button" aria-label="Hapus varian">×</button>
  `;
  document.getElementById("variant-rows").appendChild(row);
}

function addOptionRow(value = {}) {
  const row = document.createElement("div");
  row.className = "repeater-row option-row";
  row.innerHTML = `
    <input data-option-group maxlength="50" placeholder="Grup (Level)" value="${escapeHtml(value.group_name || "")}">
    <input data-option-name maxlength="80" placeholder="Pilihan (Level 1)" value="${escapeHtml(value.name || "")}">
    <input data-option-price type="number" step="100" placeholder="Tambah harga" value="${value.price_adjustment ?? 0}">
    <button class="remove-row" type="button" aria-label="Hapus pilihan">×</button>
  `;
  document.getElementById("option-rows").appendChild(row);
}

function resetForm(product = null) {
  form.reset();
  document.getElementById("variant-rows").innerHTML = "";
  document.getElementById("option-rows").innerHTML = "";
  document.getElementById("product-id").value = product?.id || "";
  document.getElementById("product-category").value = product?.category || currentCategory;
  document.getElementById("product-name").value = product?.name || "";
  document.getElementById("product-description").value = product?.description || "";
  document.getElementById("product-price").value = product?.base_price ?? 0;
  document.getElementById("product-sort").value = product?.sort_order ?? products.length;
  document.getElementById("product-image-url").value = product?.image_url || "";
  document.getElementById("product-image-file").value = "";
  document.getElementById("product-active").checked = product?.is_active ?? true;
  document.getElementById("product-featured").checked = product?.is_featured ?? false;
  document.getElementById("editor-title").textContent = product ? "Edit Produk" : "Tambah Produk";
  updateImagePreview(product?.image_url);
  product?.product_variants.forEach(addVariantRow);
  product?.product_options.forEach(addOptionRow);
}

function updateImagePreview(url) {
  const preview = document.getElementById("image-preview");
  preview.innerHTML = url ? `<img src="${escapeHtml(url)}" alt="Preview produk">` : "Belum ada gambar";
}

function openEditor(product = null) {
  resetForm(product);
  editor.classList.add("open");
  document.body.style.overflow = "hidden";
  window.setTimeout(() => document.getElementById("product-name").focus(), 50);
}

function closeEditor() {
  editor.classList.remove("open");
  document.body.style.overflow = "";
}

function showToast(message, isError = false) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.remove("hidden");
  toastTimer = window.setTimeout(() => toast.classList.add("hidden"), 3500);
}

async function uploadImage(file, category) {
  if (!file) return document.getElementById("product-image-url").value.trim() || null;
  if (!file.type.startsWith("image/")) throw new Error("File harus berupa gambar.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Ukuran gambar maksimal 5 MB.");
  const extension = (file.name.split(".").pop() || "webp").toLowerCase().replace(/[^a-z0-9]/g, "") || "webp";
  const path = `${category}/${crypto.randomUUID()}.${extension}`;
  const client = requireSupabase();
  const { error } = await client.storage.from(STORE_CONFIG.imageBucket).upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  return client.storage.from(STORE_CONFIG.imageBucket).getPublicUrl(path).data.publicUrl;
}

function collectVariants() {
  return [...document.querySelectorAll(".variant-row")].map((row, index) => ({
    name: row.querySelector("[data-variant-name]").value.trim(),
    price: Number.parseInt(row.querySelector("[data-variant-price]").value, 10),
    sort_order: index,
    is_active: true,
  })).filter((item) => item.name && Number.isFinite(item.price) && item.price >= 0);
}

function collectOptions() {
  return [...document.querySelectorAll(".option-row")].map((row, index) => ({
    group_name: row.querySelector("[data-option-group]").value.trim(),
    name: row.querySelector("[data-option-name]").value.trim(),
    price_adjustment: Number.parseInt(row.querySelector("[data-option-price]").value, 10) || 0,
    sort_order: index,
    is_active: true,
  })).filter((item) => item.group_name && item.name);
}

async function saveProduct(event) {
  event.preventDefault();
  const saveButton = document.getElementById("save-button");
  saveButton.disabled = true;
  saveButton.textContent = "Menyimpan...";
  const client = requireSupabase();

  try {
    const id = document.getElementById("product-id").value || null;
    const category = document.getElementById("product-category").value;
    const imageUrl = await uploadImage(document.getElementById("product-image-file").files[0], category);
    const payload = {
      category,
      name: document.getElementById("product-name").value.trim(),
      description: document.getElementById("product-description").value.trim() || null,
      base_price: Number.parseInt(document.getElementById("product-price").value, 10) || 0,
      sort_order: Number.parseInt(document.getElementById("product-sort").value, 10) || 0,
      image_url: imageUrl,
      is_active: document.getElementById("product-active").checked,
      is_featured: document.getElementById("product-featured").checked,
      updated_at: new Date().toISOString(),
    };

    let productId = id;
    if (id) {
      const { error } = await client.from("products").update(payload).eq("id", id);
      if (error) throw error;
    } else {
      const { data, error } = await client.from("products").insert(payload).select("id").single();
      if (error) throw error;
      productId = data.id;
    }

    const variants = collectVariants().map((item) => ({ ...item, product_id: productId }));
    const options = collectOptions().map((item) => ({ ...item, product_id: productId }));
    const { error: variantDeleteError } = await client.from("product_variants").delete().eq("product_id", productId);
    if (variantDeleteError) throw variantDeleteError;
    const { error: optionDeleteError } = await client.from("product_options").delete().eq("product_id", productId);
    if (optionDeleteError) throw optionDeleteError;
    if (variants.length) {
      const { error } = await client.from("product_variants").insert(variants);
      if (error) throw error;
    }
    if (options.length) {
      const { error } = await client.from("product_options").insert(options);
      if (error) throw error;
    }

    currentCategory = category;
    syncTabs();
    closeEditor();
    await loadProducts();
    showToast(id ? "Produk berhasil diperbarui." : "Produk berhasil ditambahkan.");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Produk gagal disimpan.", true);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Simpan Produk";
  }
}

async function toggleProduct(product) {
  const client = requireSupabase();
  const { error } = await client.from("products").update({ is_active: !product.is_active, updated_at: new Date().toISOString() }).eq("id", product.id);
  if (error) throw error;
  await loadProducts();
  showToast(product.is_active ? "Produk disembunyikan." : "Produk ditampilkan.");
}

async function deleteProduct(product) {
  if (!confirm(`Hapus permanen produk “${product.name}”? Tindakan ini tidak dapat dibatalkan.`)) return;
  const client = requireSupabase();
  const { error } = await client.from("products").delete().eq("id", product.id);
  if (error) throw error;
  await loadProducts();
  showToast("Produk berhasil dihapus.");
}

function syncTabs() {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.category === currentCategory));
}

document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.getElementById("login-button");
  const message = document.getElementById("auth-message");
  button.disabled = true;
  message.textContent = "";
  const { error } = await requireSupabase().auth.signInWithPassword({
    email: document.getElementById("login-email").value.trim(),
    password: document.getElementById("login-password").value,
  });
  if (error) message.textContent = "Email atau password salah.";
  button.disabled = false;
});

document.getElementById("logout-button").addEventListener("click", () => requireSupabase().auth.signOut());
document.getElementById("new-product-button").addEventListener("click", () => openEditor());
document.getElementById("close-editor").addEventListener("click", closeEditor);
document.getElementById("cancel-editor").addEventListener("click", closeEditor);
document.getElementById("add-variant").addEventListener("click", () => addVariantRow());
document.getElementById("add-option").addEventListener("click", () => addOptionRow());
document.getElementById("product-image-url").addEventListener("input", (event) => updateImagePreview(event.target.value.trim()));
document.getElementById("product-image-file").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) updateImagePreview(URL.createObjectURL(file));
});
document.getElementById("variant-rows").addEventListener("click", (event) => event.target.closest(".remove-row")?.closest(".repeater-row")?.remove());
document.getElementById("option-rows").addEventListener("click", (event) => event.target.closest(".remove-row")?.closest(".repeater-row")?.remove());
form.addEventListener("submit", saveProduct);

document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", async () => {
  currentCategory = tab.dataset.category;
  syncTabs();
  await loadProducts();
}));

productList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  const card = event.target.closest("[data-product-id]");
  if (!button || !card) return;
  const product = products.find((item) => item.id === card.dataset.productId);
  if (!product) return;
  try {
    if (button.dataset.action === "edit") openEditor(product);
    if (button.dataset.action === "toggle") await toggleProduct(product);
    if (button.dataset.action === "delete") await deleteProduct(product);
  } catch (error) {
    console.error(error);
    showToast(error.message || "Tindakan gagal dilakukan.", true);
  }
});

editor.addEventListener("click", (event) => { if (event.target === editor) closeEditor(); });
