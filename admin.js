const orderStatusOptions = [
  "Awaiting payment",
  "New",
  "Processing",
  "Ready for pickup",
  "Delivered",
  "Cancelled",
];

const paymentStatusOptions = [
  "Awaiting payment",
  "Pending",
  "Awaiting confirmation",
  "Paid",
  "Failed",
  "Abandoned",
  "Refunded",
];

const state = {
  authenticated: false,
  user: null,
  products: [],
  orders: [],
  dashboard: null,
  inquiries: [],
  stream: null,
  refreshTimer: null,
  refreshInFlight: false,
  queuedRefresh: false,
};

const loginShell = document.querySelector("#login-shell");
const adminApp = document.querySelector("#admin-app");
const loginForm = document.querySelector("#login-form");
const loginStatus = document.querySelector("#login-status");
const logoutButton = document.querySelector("#logout-button");
const authBadge = document.querySelector("#auth-badge");
const liveStatusBadge = document.querySelector("#live-status-badge");
const streamStatusChip = document.querySelector("#stream-status-chip");
const lastSyncLabel = document.querySelector("#last-sync-label");
const metricsRoot = document.querySelector("#admin-metrics");
const inventoryList = document.querySelector("#inventory-list");
const ordersBody = document.querySelector("#orders-body");
const paymentBreakdown = document.querySelector("#payment-breakdown");
const orderBreakdown = document.querySelector("#order-breakdown");
const inquiriesList = document.querySelector("#inquiries-list");
const productForm = document.querySelector("#product-form");
const productFormStatus = document.querySelector("#product-form-status");
const ordersStatus = document.querySelector("#orders-status");
const salesFeed = document.querySelector("#sales-feed");
const topProductsList = document.querySelector("#top-products-list");
const navToggle = document.querySelector(".nav-toggle");
const siteNav = document.querySelector("#site-nav");

document.querySelector("#year").textContent = new Date().getFullYear();

bootstrap().catch(() => {
  loginStatus.textContent = "Unable to initialize the admin portal right now.";
});

async function bootstrap() {
  setupRevealAnimation();
  setupNavigation();
  bindStaticHandlers();
  await hydrateSession();
}

function bindStaticHandlers() {
  loginForm.addEventListener("submit", handleLoginSubmit);
  productForm.addEventListener("submit", handleProductSubmit);
  logoutButton.addEventListener("click", handleLogout);
}

async function hydrateSession() {
  try {
    const sessionState = await fetchJson("/api/admin/auth/session");
    state.authenticated = sessionState.authenticated;
    state.user = sessionState.user;
    renderAccessState();

    if (state.authenticated) {
      await syncDashboard("initial");
      startLiveTracking();
    }
  } catch (error) {
    state.authenticated = false;
    state.user = null;
    renderAccessState();
    loginStatus.textContent = "Unable to verify admin session.";
  }
}

function renderAccessState() {
  loginShell.classList.toggle("is-hidden", state.authenticated);
  adminApp.classList.toggle("is-hidden", !state.authenticated);
  logoutButton.hidden = !state.authenticated;
  liveStatusBadge.hidden = !state.authenticated;

  if (state.authenticated && state.user) {
    authBadge.textContent = `Signed in: ${state.user.displayName}`;
    authBadge.className = "status-chip is-success";
  } else {
    authBadge.textContent = "Portal locked";
    authBadge.className = "status-chip is-neutral";
    setStreamStatus("Locked");
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  loginStatus.textContent = "";

  const payload = {
    username: loginForm.elements.username.value.trim(),
    password: loginForm.elements.password.value,
  };

  if (!payload.username || !payload.password) {
    loginStatus.textContent = "Please provide both username and password.";
    return;
  }

  const submitButton = loginForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Signing in...";

  try {
    const result = await fetchJson("/api/admin/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    state.authenticated = true;
    state.user = result.user;
    loginForm.reset();
    loginStatus.textContent = "";
    renderAccessState();
    await syncDashboard("login");
    startLiveTracking();
  } catch (error) {
    loginStatus.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Log in";
  }
}

async function handleLogout() {
  try {
    await fetchJson("/api/admin/auth/logout", {
      method: "DELETE",
    });
  } catch (error) {
    logoutButton.blur();
  } finally {
    stopLiveTracking();
    state.authenticated = false;
    state.user = null;
    state.products = [];
    state.orders = [];
    state.dashboard = null;
    state.inquiries = [];
    renderAccessState();
    loginStatus.textContent = "You have been logged out.";
  }
}

async function syncDashboard(reason = "manual") {
  if (!state.authenticated) {
    return;
  }

  if (state.refreshInFlight) {
    state.queuedRefresh = true;
    return;
  }

  state.refreshInFlight = true;

  try {
    const [products, orders, dashboard, inquiries] = await Promise.all([
      fetchJson("/api/admin/products"),
      fetchJson("/api/admin/orders"),
      fetchJson("/api/admin/dashboard"),
      fetchJson("/api/admin/inquiries"),
    ]);

    state.products = products;
    state.orders = orders;
    state.dashboard = dashboard;
    state.inquiries = inquiries;
    renderDashboard();
    setStreamStatus(reason === "initial" ? "Live" : "Updated");
    lastSyncLabel.textContent = `Last sync: ${formatDate(dashboard.lastUpdated || new Date().toISOString())}`;
  } catch (error) {
    if (error.code === 401) {
      stopLiveTracking();
      state.authenticated = false;
      state.user = null;
      renderAccessState();
      loginStatus.textContent = "Your admin session expired. Please sign in again.";
      return;
    }

    ordersStatus.textContent = error.message;
    setStreamStatus("Issue");
  } finally {
    state.refreshInFlight = false;

    if (state.queuedRefresh) {
      state.queuedRefresh = false;
      await syncDashboard("queued");
    }
  }
}

function renderDashboard() {
  renderMetrics();
  renderSalesFeed();
  renderTopProducts();
  renderInventory();
  renderBreakdowns();
  renderOrders();
  renderInquiries();
}

function renderMetrics() {
  const metrics = state.dashboard?.metrics || {};

  metricsRoot.innerHTML = [
    {
      label: "Products",
      value: metrics.productCount ?? 0,
      copy: "Items currently published to the storefront.",
    },
    {
      label: "Low Stock",
      value: metrics.lowStockCount ?? 0,
      copy: "Products with three or fewer units remaining.",
    },
    {
      label: "Orders",
      value: metrics.totalOrders ?? 0,
      copy: "Customer purchases captured by the checkout flow.",
    },
    {
      label: "Units Sold",
      value: metrics.unitsSold ?? 0,
      copy: "Total non-cancelled units sold across all recorded orders.",
    },
    {
      label: "Pending Payments",
      value: metrics.pendingPayments ?? 0,
      copy: "Orders still waiting for payment confirmation or settlement.",
    },
    {
      label: "Paid Revenue",
      value: formatCurrency(metrics.paidRevenue ?? 0),
      copy: "Revenue already marked paid in the system.",
    },
    {
      label: "Outstanding",
      value: formatCurrency(metrics.outstandingRevenue ?? 0),
      copy: "Order value still pending confirmation or payment.",
    },
    {
      label: "Today",
      value: `${metrics.todayOrders ?? 0} orders / ${formatCurrency(metrics.todayRevenue ?? 0)}`,
      copy: "Current day order count and paid revenue snapshot.",
    },
  ]
    .map(
      (metric) => `
        <article class="metric-card">
          <span class="metric-label">${escapeHtml(metric.label)}</span>
          <strong>${escapeHtml(String(metric.value))}</strong>
          <span>${escapeHtml(metric.copy)}</span>
        </article>
      `
    )
    .join("");
}

function renderSalesFeed() {
  const recentSales = state.dashboard?.recentSales || [];

  if (recentSales.length === 0) {
    salesFeed.innerHTML = '<p class="empty-state">No purchases recorded yet.</p>';
    return;
  }

  salesFeed.innerHTML = recentSales
    .map(
      (sale) => `
        <article class="feed-item">
          <strong>${escapeHtml(sale.customerName)} - ${formatCurrency(sale.total)}</strong>
          <span>${escapeHtml(sale.itemsSummary)}</span>
          <span>${escapeHtml(sale.paymentStatus)} / ${escapeHtml(sale.orderStatus)} - ${formatDate(sale.createdAt)}</span>
        </article>
      `
    )
    .join("");
}

function renderTopProducts() {
  const topProducts = state.dashboard?.topProducts || [];

  if (topProducts.length === 0) {
    topProductsList.innerHTML = '<p class="empty-state">No product sales recorded yet.</p>';
    return;
  }

  topProductsList.innerHTML = topProducts
    .map(
      (product) => `
        <article class="feed-item">
          <strong>${escapeHtml(product.name)}</strong>
          <span>${product.unitsSold} units sold - ${formatCurrency(product.revenue)}</span>
          <span>${escapeHtml(product.category)} - Last sale ${formatDate(product.lastSoldAt)}</span>
        </article>
      `
    )
    .join("");
}

function renderInventory() {
  if (state.products.length === 0) {
    inventoryList.innerHTML = '<p class="empty-state">No products available yet.</p>';
    return;
  }

  inventoryList.innerHTML = state.products
    .map((product) => {
      const lowStock = product.stock <= 3;

      return `
        <article class="inventory-card">
          <div class="inventory-topline">
            <div>
              <h3>${escapeHtml(product.name)}</h3>
              <span class="inventory-category">${escapeHtml(product.category)}</span>
            </div>
            <strong>${formatCurrency(product.price)}</strong>
          </div>
          <p>${escapeHtml(product.description)}</p>
          <div class="inventory-meta">
            <span class="status-chip ${lowStock ? "is-warning" : "is-success-soft"}">
              ${lowStock ? `Low stock: ${product.stock}` : `In stock: ${product.stock}`}
            </span>
            <span class="status-chip">${escapeHtml(product.badge || "Product")}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderBreakdowns() {
  paymentBreakdown.innerHTML = renderMiniCards(
    state.dashboard?.paymentBreakdown,
    "No payment data yet."
  );
  orderBreakdown.innerHTML = renderMiniCards(
    state.dashboard?.orderBreakdown,
    "No order data yet."
  );
}

function renderMiniCards(source, emptyText) {
  const entries = Object.entries(source || {});

  if (entries.length === 0) {
    return `<p class="empty-state">${escapeHtml(emptyText)}</p>`;
  }

  return entries
    .map(
      ([label, value]) => `
        <article class="mini-card">
          <strong>${escapeHtml(String(value))}</strong>
          <span>${escapeHtml(label)}</span>
        </article>
      `
    )
    .join("");
}

function renderOrders() {
  if (state.orders.length === 0) {
    ordersBody.innerHTML = `
      <tr>
        <td colspan="8" class="table-empty">No orders have been placed yet.</td>
      </tr>
    `;
    return;
  }

  ordersBody.innerHTML = state.orders
    .map(
      (order) => `
        <tr>
          <td>
            <strong>${escapeHtml(order.id)}</strong>
            <span class="table-subline">${formatDate(order.createdAt)}</span>
          </td>
          <td>
            <strong>${escapeHtml(order.customer.name)}</strong>
            <span class="table-subline">${escapeHtml(order.customer.phone || order.customer.email || "")}</span>
          </td>
          <td>
            <strong>${order.items.length} lines</strong>
            <span class="table-subline">${escapeHtml(order.items.map((item) => `${item.name} x${item.quantity}`).join(", "))}</span>
          </td>
          <td>${formatCurrency(order.totals.subtotal)}</td>
          <td>
            <strong>${escapeHtml(order.payment.method)}</strong>
            <span class="table-subline">${escapeHtml(order.payment.status)}</span>
            <span class="table-subline">${escapeHtml(order.payment.reference || order.payment.provider || "Manual checkout")}</span>
          </td>
          <td>
            <select data-order-id="${escapeAttribute(order.id)}" data-field="orderStatus">
              ${orderStatusOptions
                .map(
                  (status) => `
                    <option value="${escapeAttribute(status)}" ${status === order.orderStatus ? "selected" : ""}>
                      ${escapeHtml(status)}
                    </option>
                  `
                )
                .join("")}
            </select>
          </td>
          <td>
            <select data-order-id="${escapeAttribute(order.id)}" data-field="paymentStatus">
              ${paymentStatusOptions
                .map(
                  (status) => `
                    <option value="${escapeAttribute(status)}" ${status === order.payment.status ? "selected" : ""}>
                      ${escapeHtml(status)}
                    </option>
                  `
                )
                .join("")}
            </select>
          </td>
          <td>
            <button class="button ghost table-button" type="button" data-update-order="${escapeAttribute(order.id)}">
              Update
            </button>
          </td>
        </tr>
      `
    )
    .join("");

  ordersBody.querySelectorAll("[data-update-order]").forEach((button) => {
    button.addEventListener("click", () => handleOrderUpdate(button.dataset.updateOrder));
  });
}

function renderInquiries() {
  if (state.inquiries.length === 0) {
    inquiriesList.innerHTML = '<p class="empty-state">No enquiries received yet.</p>';
    return;
  }

  inquiriesList.innerHTML = state.inquiries
    .slice(0, 6)
    .map(
      (inquiry) => `
        <article class="feed-item">
          <strong>${escapeHtml(inquiry.name)}</strong>
          <span>${escapeHtml(inquiry.phone || inquiry.email || "No contact provided")}</span>
          <p>${escapeHtml(inquiry.message)}</p>
        </article>
      `
    )
    .join("");
}

async function handleProductSubmit(event) {
  event.preventDefault();
  productFormStatus.textContent = "";

  const payload = {
    name: productForm.elements.name.value.trim(),
    category: productForm.elements.category.value.trim(),
    price: productForm.elements.price.value,
    stock: productForm.elements.stock.value,
    badge: productForm.elements.badge.value.trim(),
    tag: productForm.elements.tag.value.trim(),
    description: productForm.elements.description.value.trim(),
    image: productForm.elements.image.value.trim(),
    visualStart: productForm.elements.visualStart.value.trim(),
    visualEnd: productForm.elements.visualEnd.value.trim(),
  };

  if (!payload.name || !payload.category || !payload.price || !payload.description) {
    productFormStatus.textContent = "Please complete the product name, category, price, and description.";
    return;
  }

  const submitButton = productForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Adding product...";

  try {
    const result = await fetchJson("/api/admin/products", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    productForm.reset();
    productFormStatus.textContent = result.message;
    await syncDashboard("product");
  } catch (error) {
    productFormStatus.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Add product";
  }
}

async function handleOrderUpdate(orderId) {
  ordersStatus.textContent = "";

  const orderStatusSelect = document.querySelector(
    `select[data-order-id="${cssEscape(orderId)}"][data-field="orderStatus"]`
  );
  const paymentStatusSelect = document.querySelector(
    `select[data-order-id="${cssEscape(orderId)}"][data-field="paymentStatus"]`
  );

  if (!orderStatusSelect || !paymentStatusSelect) {
    return;
  }

  try {
    const result = await fetchJson(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        orderStatus: orderStatusSelect.value,
        paymentStatus: paymentStatusSelect.value,
      }),
    });

    ordersStatus.textContent = result.message;
    await syncDashboard("order");
  } catch (error) {
    ordersStatus.textContent = error.message;
  }
}

function startLiveTracking() {
  stopLiveTracking();
  setStreamStatus("Connecting");
  liveStatusBadge.textContent = "Live sync active";
  liveStatusBadge.className = "status-chip is-success";

  state.stream = new EventSource("/api/admin/stream");

  state.stream.onopen = () => {
    setStreamStatus("Live");
  };

  state.stream.onmessage = async () => {
    await syncDashboard("live");
  };

  state.stream.onerror = () => {
    setStreamStatus("Reconnecting");
  };

  state.refreshTimer = window.setInterval(() => {
    syncDashboard("poll");
  }, 30000);
}

function stopLiveTracking() {
  if (state.stream) {
    state.stream.close();
    state.stream = null;
  }

  if (state.refreshTimer) {
    window.clearInterval(state.refreshTimer);
    state.refreshTimer = null;
  }
}

function setStreamStatus(status) {
  streamStatusChip.textContent = status;

  if (status === "Live" || status === "Updated") {
    streamStatusChip.className = "status-chip is-success";
    return;
  }

  if (status === "Issue") {
    streamStatusChip.className = "status-chip is-danger";
    return;
  }

  if (status === "Locked") {
    streamStatusChip.className = "status-chip is-neutral";
    return;
  }

  streamStatusChip.className = "status-chip is-warning";
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
      throw new Error("The admin API returned invalid JSON.");
    }
  } else if (bodyText.trim().startsWith("<")) {
    throw new Error(
      "The admin portal must be opened through `node index.js`, not a static preview or direct HTML open."
    );
  }

  if (!result) {
    throw new Error("The admin API did not return JSON.");
  }

  if (!response.ok) {
    const error = new Error(result.error || "Request failed.");
    error.code = response.status;
    throw error;
  }

  return result;
}

function formatCurrency(amount) {
  return `GHS ${Number(amount || 0).toLocaleString()}`;
}

function formatDate(value) {
  return new Date(value).toLocaleString();
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

function cssEscape(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
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
