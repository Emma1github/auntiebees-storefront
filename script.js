const state = {
  products: [],
  activeFilter: "All",
  cart: [],
  previewMode: false,
};

const categoryImageFallbacks = {
  Casual: "assets/products/casual-outfit.jpg",
  Official: "assets/products/official-shirt.jpg",
  Footwear: "assets/products/sneakers.jpg",
  Grooming: "assets/products/grooming-pack.jpg",
};

const filterGroup = document.querySelector("#filter-group");
const productGrid = document.querySelector("#product-grid");
const cartList = document.querySelector("#cart-list");
const cartCount = document.querySelector("#cart-count");
const cartTotal = document.querySelector("#cart-total");
const goToCheckoutButton = document.querySelector("#go-to-checkout");
const sendCartEnquiryButton = document.querySelector("#send-cart-enquiry");
const checkoutSummary = document.querySelector("#checkout-summary");
const orderForm = document.querySelector("#order-form");
const orderStatus = document.querySelector("#order-status");
const contactForm = document.querySelector("#contact-form");
const formStatus = document.querySelector("#form-status");
const navToggle = document.querySelector(".nav-toggle");
const siteNav = document.querySelector("#site-nav");

document.querySelector("#year").textContent = new Date().getFullYear();

init().catch((error) => {
  console.error(error);
  productGrid.innerHTML = `<p class="empty-state">${escapeHtml(
    error?.message || "Unable to load products right now."
  )}</p>`;
  renderCart();
  renderCheckoutSummary();
  setupNavigation();
});

async function init() {
  setupRevealAnimation();
  setupNavigation();
  await loadProducts();
  renderFilters();
  renderProducts();
  renderCart();
  renderCheckoutSummary();
  await reconcilePaystackReturn();

  goToCheckoutButton.addEventListener("click", handleGoToCheckout);
  sendCartEnquiryButton.addEventListener("click", copyCartToContactForm);
  orderForm.addEventListener("submit", handleOrderSubmit);
  contactForm.addEventListener("submit", handleContactSubmit);
}

async function loadProducts() {
  try {
    const products = await fetchJson("/api/products");
    state.products = products;
    state.previewMode = false;
  } catch (apiError) {
    const products = await fetchJson("data/products.json");
    state.products = products;
    state.previewMode = true;
    showPreviewModeNotice(apiError);
  }
}

function getFilters() {
  return ["All", ...new Set(state.products.map((product) => product.category))];
}

function renderFilters() {
  filterGroup.innerHTML = getFilters()
    .map(
      (filter) => `
        <button
          type="button"
          class="filter-button ${filter === state.activeFilter ? "is-active" : ""}"
          data-filter="${escapeHtml(filter)}"
        >
          ${escapeHtml(filter)}
        </button>
      `
    )
    .join("");

  filterGroup.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeFilter = button.dataset.filter;
      renderFilters();
      renderProducts();
    });
  });
}

function renderProducts() {
  const visibleProducts =
    state.activeFilter === "All"
      ? state.products
      : state.products.filter((product) => product.category === state.activeFilter);

  if (visibleProducts.length === 0) {
    productGrid.innerHTML = '<p class="empty-state">No products found in this category.</p>';
    return;
  }

  productGrid.innerHTML = visibleProducts
    .map((product) => {
      const cartItem = state.cart.find((item) => item.id === product.id);
      const isSoldOut = product.stock <= 0;
      const productImage = getProductImage(product);

      return `
        <article class="product-card">
          <div
            class="product-visual"
            style="--visual-start: ${escapeAttribute(product.visual?.[0] || "#ead7c2")}; --visual-end: ${escapeAttribute(product.visual?.[1] || "#8b6b4e")};"
          >
            ${
              productImage
                ? `<img
                    class="product-photo"
                    src="${escapeAttribute(productImage)}"
                    alt="${escapeAttribute(product.name)}"
                    loading="lazy"
                  />`
                : ""
            }
            <span class="product-badge">${escapeHtml(product.badge || product.category)}</span>
          </div>
          <div class="product-meta">
            <div class="product-topline">
              <div>
                <h4>${escapeHtml(product.name)}</h4>
                <span class="product-tag">${escapeHtml(product.category)}</span>
              </div>
              <span class="product-price">${formatCurrency(product.price)}</span>
            </div>
            <p class="product-description">${escapeHtml(product.description)}</p>
            <div class="product-stock ${isSoldOut ? "is-empty" : ""}">
              ${isSoldOut ? "Out of stock" : `${product.stock} in stock`}
            </div>
          </div>
          <div class="product-footer">
            <span class="product-tag">${escapeHtml(product.tag || "Fresh pick")}</span>
            <button
              class="product-action ${cartItem ? "is-selected" : ""}"
              type="button"
              data-product-id="${escapeAttribute(product.id)}"
              ${isSoldOut ? "disabled" : ""}
            >
              ${isSoldOut ? "Sold out" : cartItem ? `Add another (${cartItem.quantity})` : "Add to bag"}
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  productGrid.querySelectorAll("[data-product-id]").forEach((button) => {
    button.addEventListener("click", () => addToCart(button.dataset.productId));
  });
}

function addToCart(productId) {
  const product = state.products.find((entry) => entry.id === productId);

  if (!product || product.stock <= 0) {
    return;
  }

  const existingItem = state.cart.find((item) => item.id === productId);
  const nextQuantity = (existingItem?.quantity || 0) + 1;

  if (nextQuantity > product.stock) {
    orderStatus.textContent = `${product.name} only has ${product.stock} left in stock.`;
    return;
  }

  if (existingItem) {
    existingItem.quantity = nextQuantity;
  } else {
    state.cart.push({
      id: product.id,
      name: product.name,
      category: product.category,
      price: product.price,
      quantity: 1,
    });
  }

  orderStatus.textContent = "";
  renderProducts();
  renderCart();
  renderCheckoutSummary();
}

function updateCartQuantity(productId, delta) {
  const cartItem = state.cart.find((item) => item.id === productId);
  const product = state.products.find((entry) => entry.id === productId);

  if (!cartItem || !product) {
    return;
  }

  const nextQuantity = cartItem.quantity + delta;

  if (nextQuantity <= 0) {
    removeFromCart(productId);
    return;
  }

  if (nextQuantity > product.stock) {
    orderStatus.textContent = `${product.name} only has ${product.stock} left in stock.`;
    return;
  }

  cartItem.quantity = nextQuantity;
  orderStatus.textContent = "";
  renderProducts();
  renderCart();
  renderCheckoutSummary();
}

function removeFromCart(productId) {
  state.cart = state.cart.filter((item) => item.id !== productId);
  renderProducts();
  renderCart();
  renderCheckoutSummary();
}

function renderCart() {
  const totals = getCartTotals();

  if (state.cart.length === 0) {
    cartList.innerHTML = '<li class="empty-state">No items added yet.</li>';
    cartCount.textContent = "0";
    cartTotal.textContent = "GHS 0";
    return;
  }

  cartList.innerHTML = state.cart
    .map(
      (item) => `
        <li class="enquiry-item">
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <span>${escapeHtml(item.category)} - ${formatCurrency(item.price)} each</span>
          </div>
          <div class="quantity-controls">
            <button type="button" class="qty-button" data-cart-action="decrease" data-product-id="${escapeAttribute(item.id)}">-</button>
            <span class="qty-pill">${item.quantity}</span>
            <button type="button" class="qty-button" data-cart-action="increase" data-product-id="${escapeAttribute(item.id)}">+</button>
            <button type="button" class="remove-item" data-cart-action="remove" data-product-id="${escapeAttribute(item.id)}">Remove</button>
          </div>
        </li>
      `
    )
    .join("");

  cartList.querySelectorAll("[data-cart-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const { cartAction, productId } = button.dataset;

      if (cartAction === "increase") {
        updateCartQuantity(productId, 1);
      }

      if (cartAction === "decrease") {
        updateCartQuantity(productId, -1);
      }

      if (cartAction === "remove") {
        removeFromCart(productId);
      }
    });
  });

  cartCount.textContent = String(totals.items);
  cartTotal.textContent = formatCurrency(totals.total);
}

function renderCheckoutSummary() {
  const totals = getCartTotals();

  if (state.cart.length === 0) {
    checkoutSummary.innerHTML = '<p class="empty-state">Your bag is empty.</p>';
    return;
  }

  checkoutSummary.innerHTML = `
    <ul class="summary-list">
      ${state.cart
        .map(
          (item) => `
            <li class="summary-item">
              <div>
                <strong>${escapeHtml(item.name)}</strong>
                <span>${item.quantity} x ${formatCurrency(item.price)}</span>
              </div>
              <strong>${formatCurrency(item.price * item.quantity)}</strong>
            </li>
          `
        )
        .join("")}
    </ul>
    <div class="summary-total">
      <span>${totals.items} units</span>
      <strong>${formatCurrency(totals.total)}</strong>
    </div>
  `;
}

function handleGoToCheckout() {
  if (state.cart.length === 0) {
    orderStatus.textContent = "Add items to the bag before going to checkout.";
    document.querySelector("#collections").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  document.querySelector("#checkout").scrollIntoView({ behavior: "smooth", block: "start" });
}

function copyCartToContactForm() {
  const messageField = contactForm.elements.message;
  const interestField = contactForm.elements.interest;

  if (state.cart.length === 0) {
    formStatus.textContent = "Add items to the bag first, then send them as an enquiry.";
    document.querySelector("#collections").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (!interestField.value && state.cart.length === 1) {
    const [selected] = state.cart;
    const interestMap = {
      Casual: "Casual wear",
      Official: "Official clothing",
      Footwear: "Sneakers and footwear",
      Grooming: "Grooming essentials",
    };
    interestField.value = interestMap[selected.category] || "";
  }

  const cartLines = state.cart
    .map((item) => `- ${item.name} (${item.quantity} x ${formatCurrency(item.price)})`)
    .join("\n");

  messageField.value = `Hello Auntie Bee's Boutique,\n\nI would like to ask about these selected items:\n${cartLines}\n\nPlease share availability, sizes, and delivery details.`;

  formStatus.textContent = "Selected items copied into the contact form.";
  document.querySelector("#contact").scrollIntoView({ behavior: "smooth", block: "start" });
  messageField.focus();
}

async function handleOrderSubmit(event) {
  event.preventDefault();
  orderStatus.textContent = "";

  if (state.previewMode) {
    orderStatus.textContent =
      "Checkout is disabled in preview mode. Run `npm start` and open http://127.0.0.1:3000/ for live ordering.";
    return;
  }

  if (state.cart.length === 0) {
    orderStatus.textContent = "Add at least one item to the bag before placing an order.";
    return;
  }

  const payload = {
    name: orderForm.elements.name.value.trim(),
    phone: orderForm.elements.phone.value.trim(),
    email: orderForm.elements.email.value.trim(),
    address: orderForm.elements.address.value.trim(),
    paymentMethod: orderForm.elements.paymentMethod.value,
    note: orderForm.elements.note.value.trim(),
    items: state.cart.map(({ id, quantity }) => ({ id, quantity })),
  };

  if (!payload.name || !payload.phone || !payload.address) {
    orderStatus.textContent = "Please provide name, phone number, and delivery address.";
    return;
  }

  if (isPaystackMethod(payload.paymentMethod) && !payload.email) {
    orderStatus.textContent = "Email address is required for Paystack checkout.";
    return;
  }

  const submitButton = orderForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = isPaystackMethod(payload.paymentMethod)
    ? "Starting secure checkout..."
    : "Submitting order...";

  try {
    if (isPaystackMethod(payload.paymentMethod)) {
      const result = await fetchJson("/api/payments/paystack/initialize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      orderStatus.textContent = `Order ${result.orderId} created. Redirecting to secure payment...`;
      window.location.assign(result.authorizationUrl);
      return;
    }

    const result = await fetchJson("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    await finalizeSuccessfulOrder(result);
  } catch (error) {
    orderStatus.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Place order";
  }
}

async function handleContactSubmit(event) {
  event.preventDefault();
  formStatus.textContent = "";

  if (state.previewMode) {
    formStatus.textContent =
      "Enquiries are disabled in preview mode. Run `npm start` and open http://127.0.0.1:3000/ for live forms.";
    return;
  }

  const payload = {
    name: contactForm.elements.name.value.trim(),
    phone: contactForm.elements.phone.value.trim(),
    email: contactForm.elements.email.value.trim(),
    interest: contactForm.elements.interest.value,
    message: contactForm.elements.message.value.trim(),
    shortlist: state.cart.map(({ name, price, quantity }) => ({
      name: `${name} x${quantity}`,
      price: price * quantity,
    })),
  };

  if (!payload.name || !payload.message || (!payload.phone && !payload.email)) {
    formStatus.textContent = "Please add your name, a phone number or email, and a message.";
    return;
  }

  const submitButton = contactForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Sending...";

  try {
    const result = await fetchJson("/api/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    contactForm.reset();
    formStatus.textContent = `${result.message} Reference: ${result.enquiryId}`;
  } catch (error) {
    formStatus.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Send enquiry";
  }
}

function getCartTotals() {
  return state.cart.reduce(
    (totals, item) => {
      totals.items += item.quantity;
      totals.total += item.price * item.quantity;
      return totals;
    },
    { items: 0, total: 0 }
  );
}

function formatCurrency(amount) {
  return `GHS ${Number(amount || 0).toLocaleString()}`;
}

function showPreviewModeNotice(apiError) {
  const message = apiError?.message || "";

  if (!message) {
    return;
  }

  const previewMessage =
    "Catalog loaded in preview mode. For live products, checkout, and admin, run `npm start` and open http://127.0.0.1:3000/.";
  orderStatus.textContent = previewMessage;
  formStatus.textContent = previewMessage;
}

function getProductImage(product) {
  return safeAssetPath(product.image) || categoryImageFallbacks[product.category] || "";
}

function isPaystackMethod(paymentMethod) {
  return paymentMethod.startsWith("Paystack - ");
}

async function finalizeSuccessfulOrder(result) {
  orderForm.reset();
  state.cart = [];
  await loadProducts();
  renderFilters();
  renderProducts();
  renderCart();
  renderCheckoutSummary();
  orderStatus.textContent = `${result.message} Reference: ${result.orderId}. Payment: ${result.paymentStatus}.`;
}

async function reconcilePaystackReturn() {
  const currentUrl = new URL(window.location.href);
  const wasCancelled = currentUrl.searchParams.get("paystack_cancel") === "1";
  const reference =
    currentUrl.searchParams.get("reference") || currentUrl.searchParams.get("trxref") || "";
  const shouldVerify = currentUrl.searchParams.get("paystack") === "1" || Boolean(reference);

  if (!wasCancelled && !shouldVerify) {
    return;
  }

  orderStatus.textContent = wasCancelled
    ? "Checking the cancelled Paystack payment..."
    : "Verifying your Paystack payment...";

  try {
    const result = wasCancelled
      ? await fetchJson("/api/payments/paystack/cancel", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ reference }),
        })
      : await fetchJson(`/api/payments/paystack/verify?reference=${encodeURIComponent(reference)}`);

    await loadProducts();
    renderFilters();
    renderProducts();
    renderCart();
    renderCheckoutSummary();
    orderStatus.textContent = `${result.message} Reference: ${result.orderId}. Payment: ${result.paymentStatus}.`;
    document.querySelector("#checkout").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    orderStatus.textContent = error.message;
  } finally {
    ["paystack", "paystack_cancel", "reference", "trxref"].forEach((key) => {
      currentUrl.searchParams.delete(key);
    });
    window.history.replaceState({}, document.title, currentUrl.pathname + currentUrl.search);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function safeAssetPath(value) {
  const path = String(value || "").trim();

  if (!path) {
    return "";
  }

  if (/^(https?:)?\/\//i.test(path)) {
    return path;
  }

  if (path.startsWith("assets/")) {
    return path;
  }

  return "";
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  const bodyText = await response.text();
  let result = null;

  if (contentType.includes("application/json")) {
    try {
      result = JSON.parse(bodyText);
    } catch (error) {
      throw new Error("The storefront API returned invalid JSON.");
    }
  } else if (bodyText.trim().startsWith("<")) {
    throw new Error(
      "Open the site through `node index.js`, not a static preview or direct HTML file."
    );
  }

  if (!result) {
    throw new Error("The storefront API did not return JSON.");
  }

  if (!response.ok) {
    throw new Error(result.error || "Request failed.");
  }

  return result;
}

function setupRevealAnimation() {
  const revealables = document.querySelectorAll("[data-reveal]");
  document.documentElement.classList.add("reveal-enhanced");

  if (!("IntersectionObserver" in window)) {
    revealables.forEach((element) => element.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.12,
    }
  );

  revealables.forEach((element) => observer.observe(element));
}

function setupNavigation() {
  if (!navToggle || !siteNav) {
    return;
  }

  navToggle.addEventListener("click", () => {
    const isOpen = siteNav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  siteNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      siteNav.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });
}
