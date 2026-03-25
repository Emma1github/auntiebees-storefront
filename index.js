const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

loadEnvFile(path.join(__dirname, ".env"));

const host = process.env.HOST || "0.0.0.0";
const port = process.env.PORT || 3000;
const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const maxBodySize = 1024 * 1024;
const sessionCookieName = "ab_admin_session";
const sessionTtlMs = 1000 * 60 * 60 * 12;
const appBaseUrl = process.env.APP_BASE_URL || `http://${host}:${port}`;
const defaultAdminUsername = process.env.ADMIN_USERNAME || "admin";
const defaultAdminPassword = process.env.ADMIN_PASSWORD || "BeePortal2026!";
const defaultAdminDisplayName = process.env.ADMIN_DISPLAY_NAME || "Auntie Bee Admin";
const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY || "";
const paystackPublicKey = process.env.PAYSTACK_PUBLIC_KEY || "";
const paystackCurrency = process.env.PAYSTACK_CURRENCY || "GHS";
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID || "";
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN || "";
const twilioMessagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || "";
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER || "";
const adminAlertPhone = process.env.ADMIN_ALERT_PHONE || "";

const filePaths = {
  admins: path.join(dataDir, "admins.json"),
  inquiries: path.join(dataDir, "inquiries.json"),
  products: path.join(dataDir, "products.json"),
  orders: path.join(dataDir, "orders.json"),
};

const sessions = new Map();
const adminStreamClients = new Map();

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const defaultVisuals = {
  Casual: ["#dde5d8", "#708066"],
  Official: ["#f1dec6", "#bd8d58"],
  Footwear: ["#f2dcc7", "#cb7a3d"],
  Grooming: ["#dee8e1", "#708875"],
  Accessories: ["#e8ddd0", "#8d6f55"],
};

const orderStatuses = new Set([
  "Awaiting payment",
  "New",
  "Processing",
  "Ready for pickup",
  "Delivered",
  "Cancelled",
]);

const paymentStatuses = new Set([
  "Awaiting payment",
  "Pending",
  "Awaiting confirmation",
  "Paid",
  "Failed",
  "Abandoned",
  "Refunded",
]);

const paymentMethods = new Set([
  "Paystack - Mobile Money",
  "Paystack - Card/Bank",
  "Mobile money",
  "Bank transfer",
  "Pay on delivery",
  "Pay in store",
]);

const seedProducts = [
  {
    id: "PRD-OFFICIAL-01",
    name: "Executive Shirt Set",
    category: "Official",
    badge: "Workwear",
    price: 320,
    stock: 8,
    tag: "Polished weekday fit",
    description: "Clean shirt and trouser pairing for office, church, and formal events.",
    image: "assets/products/official-shirt.jpg",
    visual: ["#f1dec6", "#bd8d58"],
    createdAt: "2026-03-24T09:00:00.000Z",
    updatedAt: "2026-03-24T09:00:00.000Z",
  },
  {
    id: "PRD-CASUAL-01",
    name: "Weekend Casual Combo",
    category: "Casual",
    badge: "Casual",
    price: 280,
    stock: 12,
    tag: "Easy everyday style",
    description: "Relaxed polo and denim combination that still feels put together.",
    image: "assets/products/casual-outfit.jpg",
    visual: ["#dde5d8", "#708066"],
    createdAt: "2026-03-24T09:00:00.000Z",
    updatedAt: "2026-03-24T09:00:00.000Z",
  },
  {
    id: "PRD-FOOTWEAR-01",
    name: "Jordan Street Pair",
    category: "Footwear",
    badge: "Sneakers",
    price: 650,
    stock: 5,
    tag: "Top-brand appeal",
    description: "A bold sneaker option for customers who want premium statement footwear.",
    image: "assets/products/sneakers.jpg",
    visual: ["#f2dcc7", "#cb7a3d"],
    createdAt: "2026-03-24T09:00:00.000Z",
    updatedAt: "2026-03-24T09:00:00.000Z",
  },
  {
    id: "PRD-FOOTWEAR-02",
    name: "Versace Edge Runner",
    category: "Footwear",
    badge: "Luxury mood",
    price: 720,
    stock: 4,
    tag: "Fashion-first profile",
    description: "For shoppers asking for standout designer-inspired sneaker energy.",
    image: "assets/products/sneakers.jpg",
    visual: ["#e3d8cd", "#8d6f55"],
    createdAt: "2026-03-24T09:00:00.000Z",
    updatedAt: "2026-03-24T09:00:00.000Z",
  },
  {
    id: "PRD-FOOTWEAR-03",
    name: "Gucci Signature Step",
    category: "Footwear",
    badge: "Premium",
    price: 760,
    stock: 3,
    tag: "Statement finish",
    description: "A premium-style shoe pick for clients who want attention on the footwear.",
    image: "assets/products/sneakers.jpg",
    visual: ["#dfe5d5", "#506043"],
    createdAt: "2026-03-24T09:00:00.000Z",
    updatedAt: "2026-03-24T09:00:00.000Z",
  },
  {
    id: "PRD-OFFICIAL-02",
    name: "Ceremony Loafer Pair",
    category: "Official",
    badge: "Occasion",
    price: 410,
    stock: 7,
    tag: "Event-ready footwear",
    description: "Dress shoes for weddings, meetings, and clean official looks.",
    image: "assets/products/formal-shoes.jpg",
    visual: ["#f5e4cf", "#ab6a38"],
    createdAt: "2026-03-24T09:00:00.000Z",
    updatedAt: "2026-03-24T09:00:00.000Z",
  },
  {
    id: "PRD-GROOMING-01",
    name: "Gentleman Grooming Pack",
    category: "Grooming",
    badge: "Essentials",
    price: 150,
    stock: 15,
    tag: "Add-on purchase",
    description: "Sprays and deodorants that increase basket value and complete the buy.",
    image: "assets/products/grooming-pack.jpg",
    visual: ["#dee8e1", "#708875"],
    createdAt: "2026-03-24T09:00:00.000Z",
    updatedAt: "2026-03-24T09:00:00.000Z",
  },
  {
    id: "PRD-FOOTWEAR-04",
    name: "Luxury Slide Slippers",
    category: "Footwear",
    badge: "Comfort",
    price: 190,
    stock: 10,
    tag: "Fast-moving item",
    description: "Easy-selling slippers for casual outings, home comfort, and gifting.",
    image: "assets/products/slippers.jpg",
    visual: ["#f2ddcb", "#976848"],
    createdAt: "2026-03-24T09:00:00.000Z",
    updatedAt: "2026-03-24T09:00:00.000Z",
  },
];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();

    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

ensureDataStore();

const server = http.createServer(async (request, response) => {
  try {
    purgeExpiredSessions();

    const parsedUrl = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    if (pathname.startsWith("/api/")) {
      await handleApiRequest(request, response, pathname, parsedUrl);
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }

    serveStaticFile(request, response, pathname);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Something went wrong on the server." });
  }
});

server.listen(port, host, () => {
  console.log(`Auntie Bee's Boutique is running at http://${host}:${port}`);
});

async function handleApiRequest(request, response, pathname, parsedUrl) {
  if (pathname === "/api/contact" && request.method === "POST") {
    await handleContactRequest(request, response);
    return;
  }

  if (pathname === "/api/products" && request.method === "GET") {
    sendJson(response, 200, readData(filePaths.products));
    return;
  }

  if (pathname === "/api/orders" && request.method === "POST") {
    await handleCreateOrderRequest(request, response);
    return;
  }

  if (pathname === "/api/payments/paystack/initialize" && request.method === "POST") {
    await handleInitializePaystackPaymentRequest(request, response);
    return;
  }

  if (pathname === "/api/payments/paystack/verify" && request.method === "GET") {
    await handleVerifyPaystackPaymentRequest(response, parsedUrl);
    return;
  }

  if (pathname === "/api/payments/paystack/cancel" && request.method === "POST") {
    await handleCancelPaystackPaymentRequest(request, response);
    return;
  }

  if (pathname === "/api/payments/paystack/webhook" && request.method === "POST") {
    await handlePaystackWebhookRequest(request, response);
    return;
  }

  if (pathname === "/api/admin/auth/session" && request.method === "GET") {
    handleAdminSessionStateRequest(request, response);
    return;
  }

  if (pathname === "/api/admin/auth/login" && request.method === "POST") {
    await handleAdminLoginRequest(request, response);
    return;
  }

  if (pathname === "/api/admin/auth/logout" && request.method === "DELETE") {
    handleAdminLogoutRequest(request, response);
    return;
  }

  if (pathname === "/api/admin/stream" && request.method === "GET") {
    handleAdminStreamRequest(request, response);
    return;
  }

  if (pathname.startsWith("/api/admin/")) {
    const session = requireAdminSession(request, response);

    if (!session) {
      return;
    }

    if (pathname === "/api/admin/products" && request.method === "GET") {
      sendJson(response, 200, sortByNewest(readData(filePaths.products)));
      return;
    }

    if (pathname === "/api/admin/products" && request.method === "POST") {
      await handleCreateProductRequest(request, response, session);
      return;
    }

    if (pathname === "/api/admin/orders" && request.method === "GET") {
      sendJson(response, 200, sortByNewest(readData(filePaths.orders)));
      return;
    }

    if (pathname.startsWith("/api/admin/orders/") && request.method === "PATCH") {
      const orderId = pathname.split("/").pop();
      await handleUpdateOrderRequest(request, response, orderId, session);
      return;
    }

    if (pathname === "/api/admin/dashboard" && request.method === "GET") {
      sendJson(response, 200, getDashboardData());
      return;
    }

    if (pathname === "/api/admin/inquiries" && request.method === "GET") {
      sendJson(response, 200, sortByNewest(readData(filePaths.inquiries)));
      return;
    }
  }

  sendJson(response, 404, { error: "API route not found." });
}

function ensureDataStore() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  ensureJsonFile(filePaths.admins, [createSeedAdmin()]);
  ensureJsonFile(filePaths.inquiries, []);
  ensureJsonFile(filePaths.products, seedProducts);
  ensureJsonFile(filePaths.orders, []);
}

function ensureJsonFile(filePath, seedValue) {
  if (!fs.existsSync(filePath)) {
    writeData(filePath, seedValue);
  }
}

function createSeedAdmin() {
  const salt = "ab_admin_salt_v1";
  const username = normalizeUsername(defaultAdminUsername);
  const now = new Date().toISOString();

  return {
    id: "ADM-DEFAULT-01",
    username,
    displayName: defaultAdminDisplayName,
    passwordSalt: salt,
    passwordHash: hashPassword(defaultAdminPassword, salt),
    createdAt: now,
    updatedAt: now,
  };
}

async function handleContactRequest(request, response) {
  const payload = await getJsonPayload(request, response);

  if (!payload) {
    return;
  }

  const cleaned = {
    name: safeText(payload.name, 120),
    email: safeText(payload.email, 120),
    phone: safeText(payload.phone, 40),
    interest: safeText(payload.interest, 120),
    message: safeText(payload.message, 3000),
    shortlist: Array.isArray(payload.shortlist)
      ? payload.shortlist
          .map((item) => ({
            name: safeText(item.name, 160),
            price: safeAmount(item.price),
          }))
          .filter((item) => item.name)
      : [],
  };

  if (!cleaned.name || (!cleaned.email && !cleaned.phone) || !cleaned.message) {
    sendJson(response, 400, {
      error: "Please provide your name, a phone number or email, and a message.",
    });
    return;
  }

  if (cleaned.email && !isValidEmail(cleaned.email)) {
    sendJson(response, 400, { error: "Please enter a valid email address." });
    return;
  }

  const inquiries = readData(filePaths.inquiries);
  const enquiry = {
    id: createReference("ENQ"),
    createdAt: new Date().toISOString(),
    ...cleaned,
  };

  inquiries.push(enquiry);
  writeData(filePaths.inquiries, inquiries);
  broadcastAdminEvent({
    type: "enquiry-created",
    inquiryId: enquiry.id,
    timestamp: enquiry.createdAt,
  });

  sendJson(response, 201, {
    message: "Thanks. Your enquiry has been received.",
    enquiryId: enquiry.id,
  });
}

async function handleCreateProductRequest(request, response, session) {
  const payload = await getJsonPayload(request, response);

  if (!payload) {
    return;
  }

  const name = safeText(payload.name, 160);
  const category = safeText(payload.category, 60);
  const badge = safeText(payload.badge, 60) || category || "New arrival";
  const tag = safeText(payload.tag, 80) || "Fresh pick";
  const description = safeText(payload.description, 320);
  const image = safeProductImage(payload.image);
  const price = safeAmount(payload.price);
  const stock = safeInteger(payload.stock);
  const visual = resolveVisual(category, payload.visualStart, payload.visualEnd);
  const now = new Date().toISOString();

  if (!name || !category || !description || price <= 0) {
    sendJson(response, 400, {
      error: "Please provide a product name, category, price, and description.",
    });
    return;
  }

  const products = readData(filePaths.products);
  const product = {
    id: createReference("PRD"),
    name,
    category,
    badge,
    price,
    stock,
    tag,
    description,
    image,
    visual,
    createdAt: now,
    updatedAt: now,
  };

  products.push(product);
  writeData(filePaths.products, products);
  broadcastAdminEvent({
    type: "product-created",
    productId: product.id,
    timestamp: now,
    actor: session.displayName,
  });

  sendJson(response, 201, {
    message: "Product added successfully.",
    product,
  });
}

async function handleCreateOrderRequest(request, response) {
  const payload = await getJsonPayload(request, response);

  if (!payload) {
    return;
  }

  const orderInput = getOrderInput(payload);
  const orderError = validateOrderInput(orderInput);

  if (orderError) {
    sendJson(response, 400, { error: orderError });
    return;
  }

  if (shouldUsePaystack(orderInput.paymentMethod)) {
    sendJson(response, 400, {
      error: "Use the Paystack checkout flow for this payment method.",
    });
    return;
  }

  const products = readData(filePaths.products);
  const itemResult = buildOrderItemsSnapshot(products, orderInput.requestedItems);

  if (itemResult.error) {
    sendJson(response, 400, { error: itemResult.error });
    return;
  }

  const now = new Date().toISOString();
  const order = createOrderRecord({
    id: createReference("ORD"),
    createdAt: now,
    customer: orderInput.customer,
    items: itemResult.items,
    totals: calculateOrderTotals(itemResult.items),
    note: orderInput.note,
    orderStatus: "New",
    payment: {
      method: orderInput.paymentMethod,
      provider: "manual",
      status: getInitialPaymentStatus(orderInput.paymentMethod),
      updatedAt: now,
    },
  });

  reserveInventory(products, order.items, now);

  const orders = readData(filePaths.orders);
  orders.push(order);
  await persistOrderChanges(products, orders, order, "order-created");

  sendJson(response, 201, {
    message: "Your order has been received.",
    orderId: order.id,
    paymentStatus: order.payment.status,
  });
}

async function handleInitializePaystackPaymentRequest(request, response) {
  if (!paystackSecretKey) {
    sendJson(response, 503, {
      error: "Paystack is not configured yet. Add PAYSTACK_SECRET_KEY on the server first.",
    });
    return;
  }

  const payload = await getJsonPayload(request, response);

  if (!payload) {
    return;
  }

  const orderInput = getOrderInput(payload);
  const orderError = validateOrderInput(orderInput);

  if (orderError) {
    sendJson(response, 400, { error: orderError });
    return;
  }

  if (!shouldUsePaystack(orderInput.paymentMethod)) {
    sendJson(response, 400, {
      error: "Select a Paystack payment method before starting secure checkout.",
    });
    return;
  }

  if (!orderInput.customer.email) {
    sendJson(response, 400, {
      error: "Email address is required for Paystack checkout.",
    });
    return;
  }

  const products = readData(filePaths.products);
  const itemResult = buildOrderItemsSnapshot(products, orderInput.requestedItems);

  if (itemResult.error) {
    sendJson(response, 400, { error: itemResult.error });
    return;
  }

  const now = new Date().toISOString();
  const orderId = createReference("ORD");
  const paymentReference = createReference("PST");
  const totals = calculateOrderTotals(itemResult.items);
  const callbackUrl = createPaystackReturnUrl({ paystack: "1" });
  const cancelUrl = createPaystackReturnUrl({
    paystack_cancel: "1",
    reference: paymentReference,
  });

  try {
    const paystackResponse = await initializePaystackTransaction({
      amount: totals.subtotal,
      email: orderInput.customer.email,
      reference: paymentReference,
      paymentMethod: orderInput.paymentMethod,
      callbackUrl,
      metadata: {
        cancel_action: cancelUrl,
        orderId,
        customerName: orderInput.customer.name,
        customerPhone: orderInput.customer.phone,
        paymentMethod: orderInput.paymentMethod,
      },
    });

    const order = createOrderRecord({
      id: orderId,
      createdAt: now,
      customer: orderInput.customer,
      items: itemResult.items,
      totals,
      note: orderInput.note,
      orderStatus: "Awaiting payment",
      payment: {
        method: orderInput.paymentMethod,
        provider: "paystack",
        status: "Awaiting payment",
        providerStatus: "initialized",
        reference: paymentReference,
        accessCode: safeText(paystackResponse.access_code, 120),
        authorizationUrl: safeText(paystackResponse.authorization_url, 500),
        channelPreference: getPaystackChannelLabel(orderInput.paymentMethod),
        currency: paystackCurrency,
        updatedAt: now,
      },
    });

    reserveInventory(products, order.items, now);

    const orders = readData(filePaths.orders);
    orders.push(order);
    await persistOrderChanges(products, orders, order, "order-created");

    sendJson(response, 201, {
      message: "Secure payment initialized.",
      orderId: order.id,
      paymentStatus: order.payment.status,
      reference: paymentReference,
      authorizationUrl: order.payment.authorizationUrl,
    });
  } catch (error) {
    console.error(error);
    sendJson(response, 502, {
      error: error.message || "Unable to start Paystack checkout right now.",
    });
  }
}

async function handleVerifyPaystackPaymentRequest(response, parsedUrl) {
  if (!paystackSecretKey) {
    sendJson(response, 503, {
      error: "Paystack is not configured yet. Add PAYSTACK_SECRET_KEY on the server first.",
    });
    return;
  }

  const reference = safeText(parsedUrl.searchParams.get("reference") || parsedUrl.searchParams.get("trxref"), 120);

  if (!reference) {
    sendJson(response, 400, { error: "Missing Paystack payment reference." });
    return;
  }

  try {
    const verification = await verifyPaystackTransaction(reference);
    const orders = readData(filePaths.orders);
    const products = readData(filePaths.products);
    const order = orders.find((entry) => entry.payment?.reference === reference);

    if (!order) {
      sendJson(response, 404, { error: "No matching order was found for this payment reference." });
      return;
    }

    const updateResult = applyPaystackVerificationToOrder(order, products, verification, "verify");
    await persistOrderChanges(products, orders, order, updateResult.eventType);

    sendJson(response, 200, {
      message: updateResult.message,
      orderId: order.id,
      orderStatus: order.orderStatus,
      paymentStatus: order.payment.status,
      reference,
    });
  } catch (error) {
    console.error(error);
    sendJson(response, 502, {
      error: error.message || "Unable to verify the Paystack transaction right now.",
    });
  }
}

async function handleCancelPaystackPaymentRequest(request, response) {
  if (!paystackSecretKey) {
    sendJson(response, 503, {
      error: "Paystack is not configured yet. Add PAYSTACK_SECRET_KEY on the server first.",
    });
    return;
  }

  const payload = await getJsonPayload(request, response);

  if (!payload) {
    return;
  }

  const reference = safeText(payload.reference, 120);

  if (!reference) {
    sendJson(response, 400, { error: "Missing Paystack payment reference." });
    return;
  }

  try {
    const verification = await verifyPaystackTransaction(reference);
    const orders = readData(filePaths.orders);
    const products = readData(filePaths.products);
    const order = orders.find((entry) => entry.payment?.reference === reference);

    if (!order) {
      sendJson(response, 404, { error: "No matching order was found for this payment reference." });
      return;
    }

    const updateResult = applyPaystackVerificationToOrder(order, products, verification, "cancel");
    await persistOrderChanges(products, orders, order, updateResult.eventType);

    sendJson(response, 200, {
      message: updateResult.message,
      orderId: order.id,
      orderStatus: order.orderStatus,
      paymentStatus: order.payment.status,
      reference,
    });
  } catch (error) {
    console.error(error);
    sendJson(response, 502, {
      error: error.message || "Unable to reconcile the cancelled payment right now.",
    });
  }
}

async function handlePaystackWebhookRequest(request, response) {
  if (!paystackSecretKey) {
    sendJson(response, 503, { error: "Paystack is not configured." });
    return;
  }

  try {
    const rawBody = await readRequestBody(request);
    const signature = String(request.headers["x-paystack-signature"] || "");
    const expectedSignature = crypto
      .createHmac("sha512", paystackSecretKey)
      .update(rawBody)
      .digest("hex");

    if (!signature || signature !== expectedSignature) {
      sendJson(response, 401, { error: "Invalid Paystack signature." });
      return;
    }

    const payload = JSON.parse(rawBody || "{}");

    if (payload.event !== "charge.success" || !payload.data?.reference) {
      sendJson(response, 200, { received: true });
      return;
    }

    const reference = safeText(payload.data.reference, 120);
    const orders = readData(filePaths.orders);
    const products = readData(filePaths.products);
    const order = orders.find((entry) => entry.payment?.reference === reference);

    if (!order) {
      sendJson(response, 200, { received: true });
      return;
    }

    const updateResult = applyPaystackVerificationToOrder(order, products, payload.data, "webhook");
    await persistOrderChanges(products, orders, order, updateResult.eventType);

    sendJson(response, 200, { received: true });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Unable to process the Paystack webhook." });
  }
}

async function handleUpdateOrderRequest(request, response, orderId, session) {
  const payload = await getJsonPayload(request, response);

  if (!payload) {
    return;
  }

  const orders = readData(filePaths.orders);
  const products = readData(filePaths.products);
  const order = orders.find((entry) => entry.id === orderId);

  if (!order) {
    sendJson(response, 404, { error: "Order not found." });
    return;
  }

  const requestedOrderStatus = payload.orderStatus ? safeText(payload.orderStatus, 40) : "";
  const requestedPaymentStatus = payload.paymentStatus ? safeText(payload.paymentStatus, 40) : "";
  const requestedPaymentMethod = payload.paymentMethod ? safeText(payload.paymentMethod, 40) : "";

  if (requestedOrderStatus && !orderStatuses.has(requestedOrderStatus)) {
    sendJson(response, 400, { error: "Unsupported order status." });
    return;
  }

  if (requestedPaymentStatus && !paymentStatuses.has(requestedPaymentStatus)) {
    sendJson(response, 400, { error: "Unsupported payment status." });
    return;
  }

  if (requestedPaymentMethod && !paymentMethods.has(requestedPaymentMethod)) {
    sendJson(response, 400, { error: "Unsupported payment method." });
    return;
  }

  if (!requestedOrderStatus && !requestedPaymentStatus && !requestedPaymentMethod) {
    sendJson(response, 400, { error: "No order update was provided." });
    return;
  }

  const wasCancelled = order.orderStatus === "Cancelled";
  const willBeCancelled = requestedOrderStatus ? requestedOrderStatus === "Cancelled" : wasCancelled;
  const previousPaymentStatus = order.payment?.status || "";

  if (!wasCancelled && willBeCancelled) {
    releaseInventory(products, order.items, new Date().toISOString());
    order.inventoryReservation = "released";
  }

  if (wasCancelled && !willBeCancelled) {
    for (const item of order.items) {
      const product = products.find((entry) => entry.id === item.id);

      if (!product || product.stock < item.quantity) {
        sendJson(response, 400, {
          error: `Cannot restore ${order.id} because ${item.name} does not have enough stock.`,
        });
        return;
      }
    }

    reserveInventory(products, order.items, new Date().toISOString());
    order.inventoryReservation = "reserved";
  }

  const now = new Date().toISOString();

  if (requestedOrderStatus) {
    order.orderStatus = requestedOrderStatus;
  }

  if (requestedPaymentStatus) {
    order.payment.status = requestedPaymentStatus;
    order.payment.updatedAt = now;
  }

  if (requestedPaymentMethod) {
    order.payment.method = requestedPaymentMethod;
    order.payment.updatedAt = now;
  }

  order.updatedAt = now;

  await persistOrderChanges(products, orders, order, "order-updated", {
    actor: session.displayName,
  });

  if (previousPaymentStatus !== "Paid" && order.payment.status === "Paid") {
    await notifyOrderPaymentConfirmed(order, orders);
  }

  sendJson(response, 200, {
    message: "Order updated successfully.",
    order,
  });
}

function getOrderInput(payload) {
  return {
    customer: {
      name: safeText(payload.name, 120),
      phone: safeText(payload.phone, 40),
      email: safeText(payload.email, 120),
      address: safeText(payload.address, 220),
    },
    paymentMethod: sanitizePaymentMethod(payload.paymentMethod),
    note: safeText(payload.note, 400),
    requestedItems: Array.isArray(payload.items)
      ? payload.items
          .map((item) => ({
            id: safeText(item.id, 120),
            quantity: Math.max(1, safeInteger(item.quantity) || 1),
          }))
          .filter((item) => item.id)
      : [],
  };
}

function validateOrderInput(orderInput) {
  if (
    !orderInput.customer.name ||
    (!orderInput.customer.phone && !orderInput.customer.email) ||
    !orderInput.customer.address
  ) {
    return "Please provide your name, contact details, and delivery address.";
  }

  if (orderInput.customer.email && !isValidEmail(orderInput.customer.email)) {
    return "Please enter a valid email address.";
  }

  if (orderInput.requestedItems.length === 0) {
    return "Please select at least one item before ordering.";
  }

  return "";
}

function buildOrderItemsSnapshot(products, requestedItems) {
  const items = [];

  for (const requestedItem of requestedItems) {
    const product = products.find((entry) => entry.id === requestedItem.id);

    if (!product) {
      return { error: "One of the selected items is no longer available." };
    }

    if (product.stock < requestedItem.quantity) {
      return {
        error: `${product.name} only has ${product.stock} left in stock.`,
      };
    }

    items.push({
      id: product.id,
      name: product.name,
      category: product.category,
      price: product.price,
      quantity: requestedItem.quantity,
      lineTotal: product.price * requestedItem.quantity,
    });
  }

  return { items };
}

function calculateOrderTotals(items) {
  return {
    items: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0),
  };
}

function createOrderRecord({
  id,
  createdAt,
  customer,
  items,
  totals,
  note,
  orderStatus,
  payment,
}) {
  return {
    id,
    createdAt,
    updatedAt: createdAt,
    customer,
    items,
    totals,
    note,
    orderStatus,
    inventoryReservation: "reserved",
    payment,
    notifications: {
      orderCreatedCustomerAt: "",
      orderCreatedAdminAt: "",
      paymentConfirmedCustomerAt: "",
      paymentConfirmedAdminAt: "",
      lastError: "",
    },
  };
}

function reserveInventory(products, items, timestamp) {
  for (const item of items) {
    const product = products.find((entry) => entry.id === item.id);

    if (product) {
      product.stock -= item.quantity;
      product.updatedAt = timestamp;
    }
  }
}

function releaseInventory(products, items, timestamp) {
  for (const item of items) {
    const product = products.find((entry) => entry.id === item.id);

    if (product) {
      product.stock += item.quantity;
      product.updatedAt = timestamp;
    }
  }
}

function canReserveInventory(products, items) {
  for (const item of items) {
    const product = products.find((entry) => entry.id === item.id);

    if (!product || product.stock < item.quantity) {
      return {
        ok: false,
        error: `${item.name} no longer has enough stock to re-attach this paid order.`,
      };
    }
  }

  return { ok: true };
}

function createPaystackReturnUrl(params = {}) {
  const baseUrl = new URL(appBaseUrl.endsWith("/") ? appBaseUrl : `${appBaseUrl}/`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      baseUrl.searchParams.set(key, String(value));
    }
  });

  return baseUrl.toString();
}

function shouldUsePaystack(paymentMethod) {
  return paymentMethod.startsWith("Paystack - ");
}

function getPaystackChannelLabel(paymentMethod) {
  if (paymentMethod === "Paystack - Mobile Money") {
    return "mobile_money";
  }

  return "card_bank";
}

function getPaystackChannels(paymentMethod) {
  if (paymentMethod === "Paystack - Mobile Money") {
    return ["mobile_money"];
  }

  return ["card", "bank"];
}

async function initializePaystackTransaction({
  amount,
  email,
  reference,
  paymentMethod,
  callbackUrl,
  metadata,
}) {
  const body = {
    email,
    amount: String(Math.round(Number(amount || 0) * 100)),
    currency: paystackCurrency,
    reference,
    callback_url: callbackUrl,
    channels: getPaystackChannels(paymentMethod),
    metadata: JSON.stringify(metadata),
  };
  const result = await makeJsonRequest({
    hostname: "api.paystack.co",
    path: "/transaction/initialize",
    method: "POST",
    headers: {
      Authorization: `Bearer ${paystackSecretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!result.status || !result.data?.authorization_url || !result.data?.access_code) {
    throw new Error(result.message || "Paystack did not return a valid authorization URL.");
  }

  return result.data;
}

async function verifyPaystackTransaction(reference) {
  const result = await makeJsonRequest({
    hostname: "api.paystack.co",
    path: `/transaction/verify/${encodeURIComponent(reference)}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${paystackSecretKey}`,
    },
  });

  if (!result.status || !result.data?.reference) {
    throw new Error(result.message || "Paystack verification did not return transaction data.");
  }

  return result.data;
}

function applyPaystackVerificationToOrder(order, products, verification, source) {
  const providerStatus = safeText(verification.status, 60).toLowerCase();
  const now = new Date().toISOString();
  const previousPaymentStatus = order.payment?.status || "";
  const previousOrderStatus = order.orderStatus;
  let eventType = "payment-updated";
  let message = "Payment status refreshed.";

  ensureNotificationState(order);
  order.updatedAt = now;
  order.payment.updatedAt = now;
  order.payment.provider = "paystack";
  order.payment.providerStatus = providerStatus || order.payment.providerStatus || "";
  order.payment.reference = safeText(verification.reference || order.payment.reference, 120);
  order.payment.currency = safeText(verification.currency || order.payment.currency || paystackCurrency, 10);
  order.payment.gatewayResponse = safeText(
    verification.gateway_response || verification.gatewayResponse,
    120
  );
  order.payment.channel = safeText(verification.channel || order.payment.channel, 60);
  order.payment.transactionId = verification.id ? String(verification.id) : order.payment.transactionId || "";
  order.payment.verifiedAt = now;
  order.payment.paidAt =
    safeText(verification.paid_at || verification.paidAt, 60) || order.payment.paidAt || "";

  if (providerStatus === "success") {
    if (order.inventoryReservation === "released") {
      const inventoryCheck = canReserveInventory(products, order.items);

      if (inventoryCheck.ok) {
        reserveInventory(products, order.items, now);
      } else {
        order.payment.inventoryAlert = inventoryCheck.error;
      }
    }

    order.payment.status = "Paid";

    if (order.orderStatus === "Awaiting payment" || order.orderStatus === "Cancelled") {
      order.orderStatus = "New";
    }

    order.inventoryReservation = "reserved";
    eventType = previousPaymentStatus === "Paid" ? "payment-verified" : "payment-paid";
    message = "Payment confirmed successfully.";
  } else if (providerStatus === "abandoned") {
    if (order.inventoryReservation !== "released") {
      releaseInventory(products, order.items, now);
      order.inventoryReservation = "released";
    }

    if (order.payment.status !== "Paid") {
      order.payment.status = "Abandoned";
      order.orderStatus = "Cancelled";
    }

    eventType = "payment-abandoned";
    message =
      source === "cancel"
        ? "Checkout was cancelled before payment was completed."
        : "Payment was abandoned.";
  } else if (providerStatus === "failed" || providerStatus === "reversed") {
    if (order.inventoryReservation !== "released") {
      releaseInventory(products, order.items, now);
      order.inventoryReservation = "released";
    }

    if (order.payment.status !== "Paid") {
      order.payment.status = "Failed";
      order.orderStatus = "Cancelled";
    }

    eventType = "payment-failed";
    message = "Payment could not be completed.";
  } else if (
    providerStatus === "ongoing" ||
    providerStatus === "pending" ||
    providerStatus === "processing" ||
    providerStatus === "queued"
  ) {
    order.payment.status = "Awaiting confirmation";

    if (order.orderStatus === "Cancelled" && previousPaymentStatus !== "Paid") {
      order.orderStatus = "Awaiting payment";
    }

    eventType = "payment-pending";
    message = "Payment is still being processed.";
  } else {
    order.payment.status = "Awaiting payment";
    eventType = "payment-pending";
    message = "Payment is still awaiting completion.";
  }

  if (previousOrderStatus !== order.orderStatus || previousPaymentStatus !== order.payment.status) {
    order.updatedAt = now;
  }

  return { eventType, message };
}

async function persistOrderChanges(products, orders, order, eventType, extraEvent = {}) {
  writeData(filePaths.products, products);
  writeData(filePaths.orders, orders);

  if (eventType === "order-created") {
    await notifyOrderCreated(order, orders);
    broadcastAdminEvent({
      type: "order-created",
      orderId: order.id,
      timestamp: order.createdAt,
      total: order.totals.subtotal,
      paymentStatus: order.payment.status,
      ...extraEvent,
    });
    return;
  }

  if (eventType === "payment-paid") {
    await notifyOrderPaymentConfirmed(order, orders);
  }

  broadcastAdminEvent({
    type: eventType || "order-updated",
    orderId: order.id,
    timestamp: new Date().toISOString(),
    total: order.totals.subtotal,
    orderStatus: order.orderStatus,
    paymentStatus: order.payment.status,
    ...extraEvent,
  });
}

function ensureNotificationState(order) {
  if (!order.notifications || typeof order.notifications !== "object") {
    order.notifications = {};
  }

  order.notifications.orderCreatedCustomerAt = order.notifications.orderCreatedCustomerAt || "";
  order.notifications.orderCreatedAdminAt = order.notifications.orderCreatedAdminAt || "";
  order.notifications.paymentConfirmedCustomerAt =
    order.notifications.paymentConfirmedCustomerAt || "";
  order.notifications.paymentConfirmedAdminAt = order.notifications.paymentConfirmedAdminAt || "";
  order.notifications.lastError = order.notifications.lastError || "";
}

async function notifyOrderCreated(order, orders) {
  ensureNotificationState(order);

  await maybeSendOrderSms({
    order,
    orders,
    recipient: "customer",
    key: "orderCreatedCustomerAt",
    phone: order.customer.phone,
    message: buildOrderCreatedCustomerMessage(order),
  });

  await maybeSendOrderSms({
    order,
    orders,
    recipient: "admin",
    key: "orderCreatedAdminAt",
    phone: adminAlertPhone,
    message: buildOrderCreatedAdminMessage(order),
  });
}

async function notifyOrderPaymentConfirmed(order, orders) {
  ensureNotificationState(order);

  await maybeSendOrderSms({
    order,
    orders,
    recipient: "customer",
    key: "paymentConfirmedCustomerAt",
    phone: order.customer.phone,
    message: buildPaymentConfirmedCustomerMessage(order),
  });

  await maybeSendOrderSms({
    order,
    orders,
    recipient: "admin",
    key: "paymentConfirmedAdminAt",
    phone: adminAlertPhone,
    message: buildPaymentConfirmedAdminMessage(order),
  });
}

async function maybeSendOrderSms({ order, orders, recipient, key, phone, message }) {
  if (!isSmsConfigured() || !phone || order.notifications[key]) {
    return;
  }

  try {
    await sendSms(phone, message);
    order.notifications[key] = new Date().toISOString();
    order.notifications.lastError = "";
    writeData(filePaths.orders, orders);
  } catch (error) {
    order.notifications.lastError = `${recipient}: ${safeText(error.message, 160)}`;
    writeData(filePaths.orders, orders);
    console.error(`SMS delivery failed for ${order.id} (${recipient})`, error);
  }
}

function buildOrderCreatedCustomerMessage(order) {
  return [
    `Auntie Bee's Boutique: We received order ${order.id}.`,
    `Total ${formatMoney(order.totals.subtotal)}.`,
    `Payment ${order.payment.status}.`,
    "We will contact you shortly.",
  ].join(" ");
}

function buildOrderCreatedAdminMessage(order) {
  return [
    `Auntie Bee's Boutique: New order ${order.id}.`,
    `${order.customer.name}.`,
    `${formatMoney(order.totals.subtotal)}.`,
    `Payment ${order.payment.status}.`,
  ].join(" ");
}

function buildPaymentConfirmedCustomerMessage(order) {
  return [
    `Auntie Bee's Boutique: Payment confirmed for ${order.id}.`,
    "We are preparing your items now.",
  ].join(" ");
}

function buildPaymentConfirmedAdminMessage(order) {
  return [
    `Auntie Bee's Boutique: Payment confirmed for ${order.id}.`,
    `${order.customer.name}.`,
    `${formatMoney(order.totals.subtotal)}.`,
  ].join(" ");
}

function isSmsConfigured() {
  return Boolean(twilioAccountSid && twilioAuthToken && (twilioMessagingServiceSid || twilioPhoneNumber));
}

function normalizePhoneNumber(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return "";
  }

  const cleaned = raw.replace(/[^\d+]/g, "");

  if (cleaned.startsWith("+")) {
    return /^\+\d{8,15}$/.test(cleaned) ? cleaned : "";
  }

  const digits = cleaned.replace(/\D/g, "");

  if (digits.startsWith("233") && digits.length === 12) {
    return `+${digits}`;
  }

  if (digits.startsWith("0") && digits.length === 10) {
    return `+233${digits.slice(1)}`;
  }

  if (digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  return "";
}

async function sendSms(phone, message) {
  const to = normalizePhoneNumber(phone);

  if (!to) {
    throw new Error("SMS phone number is invalid.");
  }

  const body = new URLSearchParams({
    To: to,
    Body: safeText(message, 1200),
  });

  if (twilioMessagingServiceSid) {
    body.set("MessagingServiceSid", twilioMessagingServiceSid);
  } else if (twilioPhoneNumber) {
    body.set("From", twilioPhoneNumber);
  }

  const auth = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64");
  const result = await makeJsonRequest({
    hostname: "api.twilio.com",
    path: `/2010-04-01/Accounts/${encodeURIComponent(twilioAccountSid)}/Messages.json`,
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (result.error_code) {
    throw new Error(result.message || "Twilio rejected the SMS request.");
  }

  return result;
}

function makeJsonRequest({ hostname, path: requestPath, method, headers = {}, body = "" }) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname,
        path: requestPath,
        method,
        headers: {
          Accept: "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...headers,
        },
      },
      (response) => {
        let rawBody = "";

        response.on("data", (chunk) => {
          rawBody += chunk;
        });

        response.on("end", () => {
          try {
            const parsed = rawBody ? JSON.parse(rawBody) : {};

            if (response.statusCode >= 400) {
              reject(new Error(parsed.message || `Request failed with status ${response.statusCode}.`));
              return;
            }

            resolve(parsed);
          } catch (error) {
            reject(new Error("External service returned invalid JSON."));
          }
        });
      }
    );

    request.on("error", reject);

    if (body) {
      request.write(body);
    }

    request.end();
  });
}

function handleAdminSessionStateRequest(request, response) {
  const session = getAdminSession(request);

  sendJson(response, 200, {
    authenticated: Boolean(session),
    user: session ? getSafeUser(session) : null,
  });
}

async function handleAdminLoginRequest(request, response) {
  const payload = await getJsonPayload(request, response);

  if (!payload) {
    return;
  }

  const username = normalizeUsername(payload.username);
  const password = String(payload.password || "");

  if (!username || !password) {
    sendJson(response, 400, { error: "Please provide both username and password." });
    return;
  }

  const admins = readData(filePaths.admins);
  const admin = admins.find((entry) => normalizeUsername(entry.username) === username);

  if (!admin || hashPassword(password, admin.passwordSalt) !== admin.passwordHash) {
    sendJson(response, 401, { error: "Invalid admin username or password." });
    return;
  }

  const sessionId = createSession(admin);

  sendJson(
    response,
    200,
    {
      message: "Admin login successful.",
      authenticated: true,
      user: getSafeUser(admin),
    },
    {
      "Set-Cookie": serializeCookie(sessionCookieName, sessionId, {
        httpOnly: true,
        maxAge: Math.floor(sessionTtlMs / 1000),
        path: "/",
        sameSite: "Lax",
      }),
    }
  );
}

function handleAdminLogoutRequest(request, response) {
  const sessionId = getSessionId(request);

  if (sessionId) {
    sessions.delete(sessionId);
    closeStreamsForSession(sessionId);
  }

  sendJson(
    response,
    200,
    { message: "Logged out successfully." },
    {
      "Set-Cookie": serializeCookie(sessionCookieName, "", {
        httpOnly: true,
        maxAge: 0,
        path: "/",
        sameSite: "Lax",
      }),
    }
  );
}

function handleAdminStreamRequest(request, response) {
  const session = requireAdminSession(request, response);

  if (!session) {
    return;
  }

  const clientId = crypto.randomUUID();
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.write(": connected\n\n");
  response.write(
    `data: ${JSON.stringify({
      type: "connected",
      timestamp: new Date().toISOString(),
    })}\n\n`
  );

  adminStreamClients.set(clientId, {
    response,
    sessionId: session.sessionId,
  });

  request.on("close", () => {
    adminStreamClients.delete(clientId);
  });
}

function getDashboardData() {
  const products = readData(filePaths.products);
  const orders = readData(filePaths.orders);
  const inquiries = readData(filePaths.inquiries);
  const activeOrders = orders.filter((order) => order.orderStatus !== "Cancelled");
  const paidOrders = activeOrders.filter((order) => order.payment.status === "Paid");
  const pendingPayments = activeOrders.filter((order) => order.payment.status !== "Paid");
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartTime = todayStart.getTime();
  const todayOrders = activeOrders.filter((order) => new Date(order.createdAt).getTime() >= todayStartTime);
  const todayPaidOrders = paidOrders.filter(
    (order) => new Date(order.createdAt).getTime() >= todayStartTime
  );
  const productSales = aggregateProductSales(activeOrders);

  return {
    metrics: {
      productCount: products.length,
      lowStockCount: products.filter((product) => product.stock <= 3).length,
      totalOrders: orders.length,
      pendingPayments: pendingPayments.length,
      paidRevenue: paidOrders.reduce((sum, order) => sum + order.totals.subtotal, 0),
      outstandingRevenue: pendingPayments.reduce((sum, order) => sum + order.totals.subtotal, 0),
      inquiryCount: inquiries.length,
      unitsSold: activeOrders.reduce((sum, order) => sum + order.totals.items, 0),
      todayOrders: todayOrders.length,
      todayRevenue: todayPaidOrders.reduce((sum, order) => sum + order.totals.subtotal, 0),
    },
    paymentBreakdown: countBy(orders, (order) => order.payment.status),
    orderBreakdown: countBy(orders, (order) => order.orderStatus),
    recentOrders: sortByNewest(orders).slice(0, 6),
    recentInquiries: sortByNewest(inquiries).slice(0, 6),
    recentSales: sortByNewest(activeOrders).slice(0, 8).map((order) => ({
      id: order.id,
      createdAt: order.createdAt,
      customerName: order.customer.name,
      total: order.totals.subtotal,
      units: order.totals.items,
      orderStatus: order.orderStatus,
      paymentStatus: order.payment.status,
      itemsSummary: order.items.map((item) => `${item.name} x${item.quantity}`).join(", "),
    })),
    topProducts: productSales.slice(0, 6),
    lastUpdated: new Date().toISOString(),
  };
}

function serveStaticFile(request, response, pathname) {
  const requestPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(rootDir, requestPath);
  const relativePath = path.relative(rootDir, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    sendJson(response, 403, { error: "Forbidden." });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found.");
        return;
      }

      sendJson(response, 500, { error: "Unable to load this page right now." });
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType = contentTypes[extension] || "application/octet-stream";

    response.writeHead(200, { "Content-Type": contentType });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    response.end(content);
  });
}

async function getJsonPayload(request, response) {
  try {
    const rawBody = await readRequestBody(request);
    return JSON.parse(rawBody || "{}");
  } catch (error) {
    sendJson(response, 400, { error: "Please send valid JSON data." });
    return null;
  }
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > maxBodySize) {
        request.destroy();
        reject(new Error("Request body too large."));
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function readData(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeData(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

function safeText(value, maxLength = 3000) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function safeProductImage(value) {
  const image = safeText(value, 500);

  if (!image) {
    return "";
  }

  if (/^(https?:)?\/\//i.test(image) || image.startsWith("assets/")) {
    return image;
  }

  return "";
}

function safeAmount(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    return 0;
  }

  return Math.round(amount * 100) / 100;
}

function safeInteger(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    return 0;
  }

  return Math.floor(amount);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function createReference(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}

function resolveVisual(category, visualStart, visualEnd) {
  const defaults = defaultVisuals[category] || ["#ead7c2", "#8b6b4e"];
  const start = safeText(visualStart, 20) || defaults[0];
  const end = safeText(visualEnd, 20) || defaults[1];
  return [start, end];
}

function sanitizePaymentMethod(value) {
  const method = safeText(value, 40);
  return paymentMethods.has(method) ? method : "Mobile money";
}

function getInitialPaymentStatus(paymentMethod) {
  if (shouldUsePaystack(paymentMethod)) {
    return "Awaiting payment";
  }

  if (paymentMethod === "Bank transfer" || paymentMethod === "Mobile money") {
    return "Awaiting confirmation";
  }

  return "Pending";
}

function formatMoney(amount) {
  return `GHS ${Number(amount || 0).toLocaleString()}`;
}

function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = selector(item) || "Unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function sortByNewest(items) {
  return [...items].sort((left, right) => {
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

function aggregateProductSales(orders) {
  const salesMap = new Map();

  for (const order of orders) {
    for (const item of order.items) {
      const key = item.id;
      const current = salesMap.get(key) || {
        id: item.id,
        name: item.name,
        category: item.category,
        unitsSold: 0,
        revenue: 0,
        lastSoldAt: order.createdAt,
      };

      current.unitsSold += item.quantity;
      current.revenue += item.lineTotal;
      current.lastSoldAt =
        new Date(order.createdAt).getTime() > new Date(current.lastSoldAt).getTime()
          ? order.createdAt
          : current.lastSoldAt;
      salesMap.set(key, current);
    }
  }

  return [...salesMap.values()].sort((left, right) => {
    if (right.unitsSold !== left.unitsSold) {
      return right.unitsSold - left.unitsSold;
    }

    return right.revenue - left.revenue;
  });
}

function normalizeUsername(value) {
  return safeText(value, 120).toLowerCase();
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
}

function parseCookies(headerValue) {
  return String(headerValue || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const [name, ...rest] = part.split("=");
      cookies[name] = decodeURIComponent(rest.join("="));
      return cookies;
    }, {});
}

function serializeCookie(name, value, options = {}) {
  const segments = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    segments.push(`Max-Age=${options.maxAge}`);
  }

  if (options.path) {
    segments.push(`Path=${options.path}`);
  }

  if (options.httpOnly) {
    segments.push("HttpOnly");
  }

  if (options.sameSite) {
    segments.push(`SameSite=${options.sameSite}`);
  }

  return segments.join("; ");
}

function getSessionId(request) {
  const cookies = parseCookies(request.headers.cookie);
  return cookies[sessionCookieName] || "";
}

function createSession(admin) {
  const sessionId = crypto.randomBytes(24).toString("hex");
  sessions.set(sessionId, {
    sessionId,
    adminId: admin.id,
    username: admin.username,
    displayName: admin.displayName,
    expiresAt: Date.now() + sessionTtlMs,
  });
  return sessionId;
}

function getAdminSession(request) {
  const sessionId = getSessionId(request);

  if (!sessionId) {
    return null;
  }

  const session = sessions.get(sessionId);

  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    closeStreamsForSession(sessionId);
    return null;
  }

  session.expiresAt = Date.now() + sessionTtlMs;
  return session;
}

function requireAdminSession(request, response) {
  const session = getAdminSession(request);

  if (!session) {
    sendJson(response, 401, { error: "Admin login required." });
    return null;
  }

  return session;
}

function getSafeUser(user) {
  return {
    username: user.username,
    displayName: user.displayName,
  };
}

function purgeExpiredSessions() {
  for (const [sessionId, session] of sessions.entries()) {
    if (session.expiresAt <= Date.now()) {
      sessions.delete(sessionId);
      closeStreamsForSession(sessionId);
    }
  }
}

function closeStreamsForSession(sessionId) {
  for (const [clientId, client] of adminStreamClients.entries()) {
    if (client.sessionId === sessionId) {
      client.response.end();
      adminStreamClients.delete(clientId);
    }
  }
}

function broadcastAdminEvent(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;

  for (const [clientId, client] of adminStreamClients.entries()) {
    try {
      client.response.write(payload);
    } catch (error) {
      client.response.end();
      adminStreamClients.delete(clientId);
    }
  }
}
