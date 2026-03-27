// engine.js
// Headless engine for products, orders, customers, staff, coupons, messaging, and QR verification.
// No UI, no auth, no branding. Plug into any app and own the front-end yourself.

const Engine = (function () {
  // ---------- Storage Layer (can be swapped) ----------

  let storageAdapter = {
    get(key) {
      if (typeof localStorage === "undefined") return null;
      return localStorage.getItem(key);
    },
    set(key, value) {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(key, value);
    }
  };

  function setStorageAdapter(adapter) {
    storageAdapter = adapter;
  }

  function loadCollection(key) {
    const raw = storageAdapter.get(key);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  function saveCollection(key, items) {
    storageAdapter.set(key, JSON.stringify(items));
  }

  function generateId(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  const KEYS = {
    CLIENT_CONFIG: "engine_client_config",
    PRODUCTS: "engine_products",
    ORDERS: "engine_orders",
    CUSTOMERS: "engine_customers",
    STAFF: "engine_staff",
    COUPONS: "engine_coupons",
    MESSAGES: "engine_messages"
  };

  // ---------- Client Config / Features ----------

  const defaultClientConfig = {
    id: "default-client",
    name: "Default Client",
    features: {
      rentals: true,
      tickets: true,
      products: true,
      coupons: true,
      staff_messaging: true
    },
    meta: {}
  };

  function loadClientConfig() {
    const raw = storageAdapter.get(KEYS.CLIENT_CONFIG);
    if (!raw) return { ...defaultClientConfig };
    try {
      return JSON.parse(raw);
    } catch {
      return { ...defaultClientConfig };
    }
  }

  function saveClientConfig(cfg) {
    storageAdapter.set(KEYS.CLIENT_CONFIG, JSON.stringify(cfg));
  }

  function configureClient(partialConfig) {
    const current = loadClientConfig();
    const merged = {
      ...current,
      ...partialConfig,
      features: {
        ...current.features,
        ...(partialConfig.features || {})
      }
    };
    saveClientConfig(merged);
    return merged;
  }

  function getClientConfig() {
    return loadClientConfig();
  }

  // ---------- Products ----------

  function listProducts() {
    return loadCollection(KEYS.PRODUCTS);
  }

  function createProduct({ name, type, price, currency, meta }) {
    if (!name) throw new Error("Product name is required");
    const items = listProducts();
    const id = generateId("prod");
    const product = {
      id,
      name,
      type: type || "product",
      price: Number(price || 0),
      currency: currency || "USD",
      meta: meta || {}
    };
    items.push(product);
    saveCollection(KEYS.PRODUCTS, items);
    return product;
  }

  function getProduct(id) {
    return listProducts().find(p => p.id === id) || null;
  }

  // ---------- Customers ----------

  function listCustomers() {
    return loadCollection(KEYS.CUSTOMERS);
  }

  function createCustomer({ name, email, phone }) {
    if (!name) throw new Error("Customer name is required");
    const items = listCustomers();
    const id = generateId("cust");
    const customer = {
      id,
      name,
      email: email || "",
      phone: phone || ""
    };
    items.push(customer);
    saveCollection(KEYS.CUSTOMERS, items);
    return customer;
  }

  // ---------- Staff ----------

  function listStaff() {
    return loadCollection(KEYS.STAFF);
  }

  function createStaff({ name, role }) {
    if (!name) throw new Error("Staff name is required");
    const items = listStaff();
    const id = generateId("staff");
    const staff = {
      id,
      name,
      role: role || "staff"
    };
    items.push(staff);
    saveCollection(KEYS.STAFF, items);
    return staff;
  }

  // ---------- Coupons ----------

  function listCoupons() {
    return loadCollection(KEYS.COUPONS);
  }

  function createCoupon({ code, type, value, usageLimit }) {
    if (!code) throw new Error("Coupon code is required");
    const coupons = listCoupons();
    const coupon = {
      id: generateId("coupon"),
      code: code.toUpperCase(),
      type: type || "percent", // "percent" or "fixed"
      value: Number(value || 0),
      usageLimit: Number(usageLimit || 0), // 0 = unlimited
      timesUsed: 0
    };
    coupons.push(coupon);
    saveCollection(KEYS.COUPONS, coupons);
    return coupon;
  }

  function applyCouponToTotal(total, code) {
    if (!code) return { total, applied: false, coupon: null };

    const coupons = listCoupons();
    const c = coupons.find(x => x.code === code.toUpperCase());
    if (!c) return { total, applied: false, coupon: null };

    if (c.usageLimit && c.timesUsed >= c.usageLimit) {
      return { total, applied: false, coupon: null };
    }

    let newTotal = total;
    if (c.type === "percent") newTotal = total - (total * c.value / 100);
    if (c.type === "fixed") newTotal = Math.max(0, total - c.value);

    c.timesUsed += 1;
    saveCollection(KEYS.COUPONS, coupons);

    return { total: newTotal, applied: true, coupon: c };
  }

  // ---------- Messages (Staff Messaging) ----------

  function listMessages() {
    return loadCollection(KEYS.MESSAGES).slice().sort((a, b) => {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  function postMessage({ senderId, senderName, body }) {
    if (!body) throw new Error("Message body is required");
    const msgs = loadCollection(KEYS.MESSAGES);
    const msg = {
      id: generateId("msg"),
      senderId: senderId || null,
      senderName: senderName || "",
      body,
      createdAt: new Date().toISOString()
    };
    msgs.push(msg);
    saveCollection(KEYS.MESSAGES, msgs);
    return msg;
  }

  // ---------- Orders + QR Tokens ----------

  function listOrders() {
    return loadCollection(KEYS.ORDERS);
  }

  function createOrder({ customerName, customerEmail, customerPhone, productId, quantity, totalAmount, meta }) {
    if (!productId) throw new Error("productId is required");
    if (!quantity || quantity <= 0) throw new Error("quantity must be > 0");

    const product = getProduct(productId);
    if (!product) throw new Error("Product not found");

    const orders = listOrders();
    const id = generateId("order");
    const qrToken = generateId("qr");

    const order = {
      id,
      qrToken,
      status: "paid",
      createdAt: new Date().toISOString(),
      productId,
      quantity,
      totalAmount: Number(totalAmount || product.price * quantity),
      customerName: customerName || "",
      customerEmail: customerEmail || "",
      customerPhone: customerPhone || "",
      meta: meta || {}
    };

    orders.push(order);
    saveCollection(KEYS.ORDERS, orders);

    // auto‑capture customer
    if (customerName || customerEmail || customerPhone) {
      createCustomer({
        name: customerName || customerEmail || customerPhone || "Customer",
        email: customerEmail,
        phone: customerPhone
      });
    }

    return order;
  }

  function findOrderByQrToken(qrToken) {
    return listOrders().find(o => o.qrToken === qrToken) || null;
  }

  function verifyQrToken(qrToken) {
    const order = findOrderByQrToken(qrToken);
    if (!order) return null;
    const product = getProduct(order.productId);
    return { order, product };
  }

  // ---------- Public Purchase Flow (no auth) ----------

  function publicListProducts() {
    return listProducts();
  }

  function publicPurchase({ productId, quantity, name, email, couponCode }) {
    const product = getProduct(productId);
    if (!product) throw new Error("Product not found");

    const baseTotal = product.price * quantity;
    const { total: finalTotal, applied, coupon } = applyCouponToTotal(baseTotal, couponCode);

    const order = createOrder({
      customerName: name,
      customerEmail: email,
      customerPhone: "",
      productId,
      quantity,
      totalAmount: finalTotal,
      meta: {
        couponApplied: applied,
        couponCode: coupon ? coupon.code : null
      }
    });

    return {
      order,
      couponApplied: applied,
      coupon: coupon || null
    };
  }

  // ---------- Email Confirmation Template (headless) ----------

  function buildConfirmationEmail(orderIdOrQrToken) {
    const orders = listOrders();
    let order = orders.find(o => o.id === orderIdOrQrToken);
    if (!order) {
      order = orders.find(o => o.qrToken === orderIdOrQrToken);
    }
    if (!order) throw new Error("Order not found");

    const product = getProduct(order.productId);
    const client = getClientConfig();

    const subject = `Your confirmation for ${product ? product.name : "your purchase"}`;

    const text = [
      `Thank you for your purchase from ${client.name}.`,
      ``,
      `Order ID: ${order.id}`,
      `QR Token: ${order.qrToken}`,
      `Item: ${product ? product.name : "N/A"}`,
      `Quantity: ${order.quantity}`,
      `Total: ${order.totalAmount} ${product ? product.currency : ""}`,
      ``,
      `Show this QR token or code to staff: ${order.qrToken}`
    ].join("\n");

    const html = `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; color:#111;">
        <h2>Thank you for your purchase from ${client.name}</h2>
        <p><strong>Order ID:</strong> ${order.id}</p>
        <p><strong>QR Token:</strong> ${order.qrToken}</p>
        <p><strong>Item:</strong> ${product ? product.name : "N/A"}</p>
        <p><strong>Quantity:</strong> ${order.quantity}</p>
        <p><strong>Total:</strong> ${order.totalAmount} ${product ? product.currency : ""}</p>
        <p>Show this email or the QR token to staff on arrival.</p>
      </div>
    `;

    return { subject, text, html, order, product, client };
  }

  // ---------- Public API ----------

  return {
    // storage
    setStorageAdapter,

    // client config
    configureClient,
    getClientConfig,

    // products
    products: {
      list: listProducts,
      create: createProduct,
      get: getProduct
    },

    // customers
    customers: {
      list: listCustomers,
      create: createCustomer
    },

    // staff
    staff: {
      list: listStaff,
      create: createStaff
    },

    // coupons
    coupons: {
      list: listCoupons,
      create: createCoupon,
      applyToTotal: applyCouponToTotal
    },

    // messaging
    messaging: {
      list: listMessages,
      post: postMessage
    },

    // orders
    orders: {
      list: listOrders,
      create: createOrder,
      findByQr: findOrderByQrToken
    },

    // verification
    verify: {
      qrToken: verifyQrToken
    },

    // public flow
    public: {
      listProducts: publicListProducts,
      purchase: publicPurchase
    },

    // email template
    email: {
      buildConfirmation: buildConfirmationEmail
    }
  };
})();
