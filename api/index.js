// src/serverApp.ts
import express from "express";
import crypto from "node:crypto";
import dotenv from "dotenv";

// firebase-applet-config.json
var firebase_applet_config_default = {
  projectId: "famous-campaign-mcbh2",
  appId: "1:17973653490:web:76ea4ac9bc95881257456b",
  apiKey: "AIzaSyBgiQ3wnlPh8QhRIZz8cd607IvJR21dpUI",
  authDomain: "famous-campaign-mcbh2.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-satyaeducationin-9b640ea0-71d3-4e65-a837-86c8f3f0974b",
  storageBucket: "famous-campaign-mcbh2.firebasestorage.app",
  messagingSenderId: "17973653490",
  measurementId: "",
  oAuthClientId: "17973653490-25m617s3c1381pv0qm2j6iss08ird464.apps.googleusercontent.com",
  recaptchaSiteKey: ""
};

// src/utils/commerceRules.ts
var BOOTSTRAPPED_ADMIN_EMAIL = "tarunpediredla9966@gmail.com";
var ID_REGEX = /^[a-zA-Z0-9_-]+$/;
var MIN_COURSE_PRICE_INR = 1e4;
function isValidDocumentId(id) {
  return typeof id === "string" && id.length >= 1 && id.length <= 128 && ID_REGEX.test(id);
}
function canUserPerformAdminOperation(auth) {
  if (!auth || !auth.uid) return false;
  if (auth.customClaims?.admin === true) {
    return true;
  }
  if (auth.email && auth.emailVerified === true && auth.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) {
    return true;
  }
  if (auth.isAdminRecordPresent === true) {
    return true;
  }
  return false;
}
function canUserAccessProtectedContent(params) {
  if (params.isFreePreview === true) {
    return { allowed: true, reason: "free_preview" };
  }
  if (!params.auth || !params.auth.uid) {
    return { allowed: false, reason: "unauthenticated" };
  }
  if (canUserPerformAdminOperation(params.auth)) {
    return { allowed: true, reason: "admin_override" };
  }
  const entitledSet = params.entitledProductIds instanceof Set ? params.entitledProductIds : new Set(params.entitledProductIds);
  if (entitledSet.has(params.productId)) {
    return { allowed: true, reason: "verified_entitlement" };
  }
  return { allowed: false, reason: "purchase_required" };
}
function calculateVerifiedCartSummary(params) {
  const { cartItems, couponCode, activeCoupons = {}, shippingAddressProvided = false } = params;
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return {
      valid: false,
      error: "Your cart is empty.",
      items: [],
      subtotalInr: 0,
      discountInr: 0,
      shippingInr: 0,
      totalAmountInr: 0,
      hasPhysicalItems: false
    };
  }
  const getProduct = (id) => {
    if (params.catalogById instanceof Map) {
      return params.catalogById.get(id);
    }
    return params.catalogById[id];
  };
  const mergedQuantitiesByProductId = /* @__PURE__ */ new Map();
  for (const rawItem of cartItems) {
    if (!rawItem || !isValidDocumentId(rawItem.productId)) {
      return {
        valid: false,
        error: "Invalid product identifier in cart.",
        items: [],
        subtotalInr: 0,
        discountInr: 0,
        shippingInr: 0,
        totalAmountInr: 0,
        hasPhysicalItems: false
      };
    }
    const quantity = Number(rawItem.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      return {
        valid: false,
        error: "Invalid item quantity. Quantity must be an integer between 1 and 20.",
        items: [],
        subtotalInr: 0,
        discountInr: 0,
        shippingInr: 0,
        totalAmountInr: 0,
        hasPhysicalItems: false
      };
    }
    const combinedQty = (mergedQuantitiesByProductId.get(rawItem.productId) || 0) + quantity;
    if (combinedQty > 20) {
      return {
        valid: false,
        error: "Invalid item quantity. Total quantity per product cannot exceed 20.",
        items: [],
        subtotalInr: 0,
        discountInr: 0,
        shippingInr: 0,
        totalAmountInr: 0,
        hasPhysicalItems: false
      };
    }
    mergedQuantitiesByProductId.set(rawItem.productId, combinedQty);
  }
  const verifiedItems = [];
  let subtotalInr = 0;
  let hasPhysicalItems = false;
  for (const [productId, quantity] of mergedQuantitiesByProductId.entries()) {
    const product = getProduct(productId);
    if (!product || product.status !== "published") {
      return {
        valid: false,
        error: `Product "${productId}" is unavailable or unpublished.`,
        items: [],
        subtotalInr: 0,
        discountInr: 0,
        shippingInr: 0,
        totalAmountInr: 0,
        hasPhysicalItems: false
      };
    }
    if (typeof product.priceInr !== "number" || !Number.isFinite(product.priceInr) || product.priceInr <= 0) {
      return {
        valid: false,
        error: `Product "${product.title}" has an invalid catalog price.`,
        items: [],
        subtotalInr: 0,
        discountInr: 0,
        shippingInr: 0,
        totalAmountInr: 0,
        hasPhysicalItems: false
      };
    }
    const requiresShipping = product.format === "physical_book" || product.format === "hybrid_book";
    if (requiresShipping) {
      hasPhysicalItems = true;
      if (product.stock < quantity) {
        return {
          valid: false,
          error: `"${product.title}" only has ${product.stock} copy(s) in stock.`,
          items: [],
          subtotalInr: 0,
          discountInr: 0,
          shippingInr: 0,
          totalAmountInr: 0,
          hasPhysicalItems: true
        };
      }
    }
    const effectiveQty = product.format === "recorded_course" ? 1 : quantity;
    const unitPriceInr = product.priceInr;
    const lineTotalInr = unitPriceInr * effectiveQty;
    verifiedItems.push({
      productId: product.id,
      title: product.title,
      type: product.type,
      format: product.format,
      unitPriceInr,
      quantity: effectiveQty,
      lineTotalInr,
      requiresShipping
    });
    subtotalInr += lineTotalInr;
  }
  if (hasPhysicalItems && !shippingAddressProvided) {
    return {
      valid: false,
      error: "A delivery address is required for physical books in your cart.",
      items: verifiedItems,
      subtotalInr,
      discountInr: 0,
      shippingInr: 0,
      totalAmountInr: subtotalInr,
      hasPhysicalItems: true
    };
  }
  let discountInr = 0;
  if (couponCode && couponCode.trim().length > 0) {
    const normalizedCode = couponCode.trim().toUpperCase();
    const pct = activeCoupons[normalizedCode];
    if (typeof pct === "number" && pct > 0 && pct <= 90) {
      discountInr = Math.round(subtotalInr * pct / 100);
    }
  }
  const discountedSubtotal = Math.max(0, subtotalInr - discountInr);
  const shippingInr = hasPhysicalItems ? discountedSubtotal >= 999 ? 0 : 79 : 0;
  const totalAmountInr = discountedSubtotal + shippingInr;
  if (totalAmountInr <= 0) {
    return {
      valid: false,
      error: "Calculated order total must be greater than \u20B90.",
      items: verifiedItems,
      subtotalInr,
      discountInr,
      shippingInr,
      totalAmountInr: 0,
      hasPhysicalItems
    };
  }
  return {
    valid: true,
    items: verifiedItems,
    subtotalInr,
    discountInr,
    shippingInr,
    totalAmountInr,
    hasPhysicalItems
  };
}

// src/utils/supabaseServerStore.ts
var SUPABASE_PROTECTED_MEDIA_BUCKET = (process.env.SUPABASE_STORAGE_BUCKET || "").trim() || "protected-media";
var SUPABASE_FREE_PLAN_MAX_FILE_BYTES = 50 * 1024 * 1024;
function getSupabaseServerConfig() {
  const rawUrl = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const secretKey = (process.env.SUPABASE_SECRET_KEY || "").trim();
  const storageBucket = (process.env.SUPABASE_STORAGE_BUCKET || "").trim() || SUPABASE_PROTECTED_MEDIA_BUCKET;
  if (!rawUrl || !secretKey) {
    return null;
  }
  return {
    url: rawUrl,
    secretKey,
    storageBucket
  };
}
function requireSupabaseServerConfig(operationName) {
  const cfg = getSupabaseServerConfig();
  if (!cfg) {
    throw new Error(
      `Privileged Supabase operation "${operationName}" failed securely: Server-side SUPABASE_URL and SUPABASE_SECRET_KEY environment variables are required.`
    );
  }
  return cfg;
}
function buildSupabaseHeaders(secretKey, extraHeaders) {
  return {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...extraHeaders
  };
}
function normalizeLineItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const rec = item || {};
    const rawType = String(rec.type || "course").trim().toLowerCase();
    const validType = rawType === "book" || rawType === "storybook" ? rawType : "course";
    return {
      productId: String(rec.productId || "").trim(),
      title: String(rec.title || "").trim(),
      type: validType,
      format: String(rec.format || "recorded_course").trim().toLowerCase(),
      quantity: Math.max(1, Math.round(Number(rec.quantity || 1))),
      unitPriceInr: Number(rec.unitPriceInr || 0)
    };
  });
}
function mapSupabaseRowToOrder(row) {
  const totalAmountPaise = Math.round(Number(row.total_amount_paise || 0));
  const totalAmountInr = Number((totalAmountPaise / 100).toFixed(2));
  const cashfreeOrderId = String(row.cashfree_order_id || "").trim();
  const cashfreePaymentId = String(row.cashfree_payment_id || "").trim();
  const rawPaymentStatus = String(row.payment_status || "pending").trim().toLowerCase();
  const paymentStatus = rawPaymentStatus === "paid" || rawPaymentStatus === "failed" || rawPaymentStatus === "cancelled" || rawPaymentStatus === "refunded" ? rawPaymentStatus : "pending";
  const rawShipmentStatus = String(row.shipment_status || "not_applicable").trim().toLowerCase();
  const shipmentStatus = rawShipmentStatus === "processing" || rawShipmentStatus === "packed" || rawShipmentStatus === "shipped" || rawShipmentStatus === "delivered" ? rawShipmentStatus : "not_applicable";
  return {
    id: String(row.id || "").trim(),
    userId: String(row.firebase_uid || "").trim(),
    customerName: String(row.customer_name || "Student"),
    customerEmail: String(row.customer_email || ""),
    totalAmountInr,
    totalAmountPaise,
    currency: String(row.currency || "INR").toUpperCase(),
    paymentStatus,
    shipmentStatus,
    cashfreeOrderId,
    cashfreePaymentId,
    paymentReference: cashfreePaymentId || cashfreeOrderId || "",
    hasPhysicalItems: Boolean(row.has_physical_items),
    shippingAddressSummary: String(row.shipping_address_summary || ""),
    itemSummary: String(row.item_summary || ""),
    lineItems: normalizeLineItems(row.line_items),
    entitlementsGranted: Boolean(row.entitlements_granted),
    createdAt: String(row.created_at || (/* @__PURE__ */ new Date()).toISOString()),
    updatedAt: String(row.updated_at || (/* @__PURE__ */ new Date()).toISOString())
  };
}
function mapSupabaseRowToEntitlement(row) {
  const userId = String(row.firebase_uid || "").trim();
  const productId = String(row.product_id || "").trim();
  const rawType = String(row.product_type || "course").trim().toLowerCase();
  const productType = rawType === "book" || rawType === "storybook" ? rawType : "course";
  const defaultDownloadPath = productType === "course" ? `protected/courses/${productId}` : `protected/books/${productId}/${productId}.pdf`;
  return {
    id: `${userId}_${productId}`,
    userId,
    productId,
    productType,
    orderId: String(row.order_id || "").trim(),
    downloadPath: String(row.download_path || defaultDownloadPath).trim(),
    grantedAt: String(row.granted_at || (/* @__PURE__ */ new Date()).toISOString()),
    revokedAt: row.revoked_at || null
  };
}
function validateProtectedStorageFilePath(rawPath) {
  const trimmed = String(rawPath || "").trim().replace(/^\/+/, "");
  if (!trimmed || trimmed.includes("..") || trimmed.includes("//") || trimmed.includes("\\")) {
    return null;
  }
  let normalized = trimmed;
  if (normalized.startsWith("courses/")) {
    normalized = `protected/${normalized}`;
  } else if (normalized.startsWith("books/")) {
    normalized = `protected/${normalized}`;
  }
  const isCourseFile = normalized.startsWith("protected/courses/");
  const isBookFile = normalized.startsWith("protected/books/");
  if (!isCourseFile && !isBookFile) {
    return null;
  }
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length < 3) {
    return null;
  }
  const fileName = segments[segments.length - 1];
  if (!/\.[a-zA-Z0-9]{2,6}$/.test(fileName)) {
    return null;
  }
  return segments.join("/");
}
async function createPendingOrderInSupabase(order) {
  const cfg = requireSupabaseServerConfig("createPendingOrderInSupabase");
  const totalAmountPaise = typeof order.totalAmountPaise === "number" && order.totalAmountPaise > 0 ? Math.round(order.totalAmountPaise) : Math.round(order.totalAmountInr * 100);
  if (!Number.isInteger(totalAmountPaise) || totalAmountPaise <= 0) {
    throw new Error("Calculated order total_amount_paise must be a positive integer.");
  }
  const initialCashfreeOrderId = order.cashfreeOrderId ? String(order.cashfreeOrderId).trim() || null : null;
  const payload = {
    id: order.id,
    firebase_uid: order.userId,
    cashfree_order_id: initialCashfreeOrderId,
    total_amount_paise: totalAmountPaise,
    currency: "INR",
    payment_status: "pending",
    cashfree_payment_id: null,
    customer_name: order.customerName,
    customer_email: order.customerEmail,
    shipment_status: order.shipmentStatus,
    has_physical_items: order.hasPhysicalItems,
    shipping_address_summary: order.shippingAddressSummary,
    item_summary: order.itemSummary,
    line_items: order.lineItems.map((item) => ({
      productId: item.productId,
      title: item.title,
      type: item.type,
      format: item.format,
      quantity: item.quantity,
      unitPriceInr: item.unitPriceInr
    })),
    entitlements_granted: false,
    created_at: order.createdAt,
    updated_at: order.updatedAt
  };
  const res = await fetch(`${cfg.url}/rest/v1/orders`, {
    method: "POST",
    headers: buildSupabaseHeaders(cfg.secretKey, {
      Prefer: "return=representation"
    }),
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Failed to save pending order in Supabase (${res.status}): ${errText.slice(0, 240)}`
    );
  }
  const rows = await res.json();
  const createdRow = Array.isArray(rows) ? rows[0] : void 0;
  if (!createdRow) {
    throw new Error("Supabase did not return the created pending order record.");
  }
  return mapSupabaseRowToOrder(createdRow);
}
async function saveCashfreeOrderIdInSupabase(params) {
  const cfg = requireSupabaseServerConfig("saveCashfreeOrderIdInSupabase");
  const orderId = String(params.orderId || "").trim();
  const cashfreeOrderId = String(params.cashfreeOrderId || "").trim();
  if (!orderId || !cashfreeOrderId) {
    throw new Error("Both orderId and cashfreeOrderId are required.");
  }
  if (orderId === cashfreeOrderId) {
    throw new Error("cashfreeOrderId must be Cashfree cf_order_id, not merchant orderId.");
  }
  const existingOrder = await getOrderFromSupabase(orderId);
  if (!existingOrder) {
    throw new Error(`Order ${orderId} not found in Supabase.`);
  }
  if (existingOrder.cashfreeOrderId) {
    if (existingOrder.cashfreeOrderId === cashfreeOrderId) {
      return existingOrder;
    }
    throw new Error(
      `Order ${orderId} already has cashfree_order_id "${existingOrder.cashfreeOrderId}"; refusing to overwrite with "${cashfreeOrderId}".`
    );
  }
  const patchUrl = `${cfg.url}/rest/v1/orders?id=eq.${encodeURIComponent(
    orderId
  )}&cashfree_order_id=is.null`;
  const patchRes = await fetch(patchUrl, {
    method: "PATCH",
    headers: buildSupabaseHeaders(cfg.secretKey, {
      Prefer: "return=representation"
    }),
    body: JSON.stringify({
      cashfree_order_id: cashfreeOrderId,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    })
  });
  if (!patchRes.ok) {
    const patchErr = await patchRes.text();
    throw new Error(
      `Failed to save Cashfree cf_order_id on order ${orderId} in Supabase (${patchRes.status}): ${patchErr.slice(
        0,
        240
      )}`
    );
  }
  const patchedRows = await patchRes.json();
  if (Array.isArray(patchedRows) && patchedRows.length > 0) {
    const mapped = mapSupabaseRowToOrder(patchedRows[0]);
    if (mapped.cashfreeOrderId === cashfreeOrderId) {
      return mapped;
    }
  }
  const reloaded = await getOrderFromSupabase(orderId);
  if (reloaded && reloaded.cashfreeOrderId === cashfreeOrderId) {
    return reloaded;
  }
  throw new Error(
    `Verification of stored cashfree_order_id failed for order ${orderId} in Supabase.`
  );
}
async function getOrderFromSupabase(orderId) {
  const cfg = requireSupabaseServerConfig("getOrderFromSupabase");
  const trimmedId = String(orderId || "").trim();
  if (!trimmedId) return null;
  const res = await fetch(
    `${cfg.url}/rest/v1/orders?id=eq.${encodeURIComponent(trimmedId)}&select=*&limit=1`,
    {
      method: "GET",
      headers: buildSupabaseHeaders(cfg.secretKey)
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Failed to fetch order ${trimmedId} from Supabase (${res.status}): ${errText.slice(0, 240)}`
    );
  }
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }
  return mapSupabaseRowToOrder(rows[0]);
}
async function fulfillPaidOrderAtomicallyInSupabase(params) {
  const cfg = requireSupabaseServerConfig("fulfillPaidOrderAtomicallyInSupabase");
  const {
    orderId,
    cashfreeOrderId,
    cashfreePaymentId,
    verifiedAmountPaise,
    verifiedCurrency = "INR",
    onDecrementPhysicalStock
  } = params;
  const rpcRes = await fetch(`${cfg.url}/rest/v1/rpc/fulfill_paid_order`, {
    method: "POST",
    headers: buildSupabaseHeaders(cfg.secretKey),
    body: JSON.stringify({
      p_order_id: orderId,
      p_cashfree_order_id: cashfreeOrderId,
      p_cashfree_payment_id: cashfreePaymentId,
      p_verified_amount_paise: Math.round(verifiedAmountPaise),
      p_verified_currency: verifiedCurrency
    })
  });
  if (!rpcRes.ok) {
    const errText = await rpcRes.text();
    throw new Error(
      `Supabase fulfill_paid_order rejected fulfillment (${rpcRes.status}): ${errText.slice(
        0,
        280
      )}`
    );
  }
  const rpcResult = await rpcRes.json();
  const alreadyFulfilled = rpcResult?.status === "already_paid";
  const updatedOrder = await getOrderFromSupabase(orderId);
  if (!updatedOrder || updatedOrder.paymentStatus !== "paid") {
    throw new Error(`Order ${orderId} was not marked paid after fulfill_paid_order.`);
  }
  const entitlements = await listActiveEntitlementsByOrderFromSupabase(
    updatedOrder.userId,
    updatedOrder.id
  );
  const expectedDigitalItems = updatedOrder.lineItems.filter(
    (item) => item.format === "recorded_course" || item.format === "digital_book" || item.format === "hybrid_book" || item.type === "course"
  );
  if (expectedDigitalItems.length > 0 && entitlements.length < expectedDigitalItems.length) {
    const activeUserProductIds = new Set(
      await listUserEntitledProductIdsFromSupabase(updatedOrder.userId)
    );
    for (const digitalItem of expectedDigitalItems) {
      if (!activeUserProductIds.has(digitalItem.productId)) {
        throw new Error(
          `Entitlement verification failed for product ${digitalItem.productId} on order ${orderId}.`
        );
      }
    }
  }
  if (!alreadyFulfilled && onDecrementPhysicalStock) {
    for (const item of updatedOrder.lineItems) {
      if (item.format === "physical_book" || item.format === "hybrid_book") {
        onDecrementPhysicalStock(item.productId, item.quantity);
      }
    }
  }
  return {
    order: updatedOrder,
    entitlements,
    alreadyFulfilled
  };
}
async function markOrderFailedOrCancelledInSupabase(order, newStatus = "failed") {
  if (order.paymentStatus !== "pending") {
    return order;
  }
  const cfg = requireSupabaseServerConfig("markOrderFailedOrCancelledInSupabase");
  const res = await fetch(
    `${cfg.url}/rest/v1/orders?id=eq.${encodeURIComponent(
      order.id
    )}&payment_status=eq.pending`,
    {
      method: "PATCH",
      headers: buildSupabaseHeaders(cfg.secretKey, {
        Prefer: "return=representation"
      }),
      body: JSON.stringify({
        payment_status: newStatus,
        entitlements_granted: false,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      })
    }
  );
  if (!res.ok) {
    return order;
  }
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? mapSupabaseRowToOrder(rows[0]) : order;
}
async function refundOrCancelOrderInSupabase(params) {
  const cfg = requireSupabaseServerConfig("refundOrCancelOrderInSupabase");
  const { orderId, newStatus } = params;
  const targetOrder = await getOrderFromSupabase(orderId);
  if (!targetOrder) {
    return null;
  }
  const rpcRes = await fetch(`${cfg.url}/rest/v1/rpc/revoke_paid_order`, {
    method: "POST",
    headers: buildSupabaseHeaders(cfg.secretKey),
    body: JSON.stringify({
      p_order_id: targetOrder.id,
      p_new_status: newStatus
    })
  });
  if (!rpcRes.ok) {
    const errText = await rpcRes.text();
    throw new Error(
      `Failed to ${newStatus} order ${targetOrder.id} in Supabase (${rpcRes.status}): ${errText.slice(
        0,
        240
      )}`
    );
  }
  const otherPaidOrdersRes = await fetch(
    `${cfg.url}/rest/v1/orders?firebase_uid=eq.${encodeURIComponent(
      targetOrder.userId
    )}&payment_status=eq.paid&entitlements_granted=eq.true&id=neq.${encodeURIComponent(
      targetOrder.id
    )}&order=created_at.desc&select=*`,
    {
      method: "GET",
      headers: buildSupabaseHeaders(cfg.secretKey)
    }
  );
  if (otherPaidOrdersRes.ok) {
    const otherPaidRows = await otherPaidOrdersRes.json();
    const otherPaidOrders = Array.isArray(otherPaidRows) ? otherPaidRows.map((r) => mapSupabaseRowToOrder(r)) : [];
    if (otherPaidOrders.length > 0) {
      for (const item of targetOrder.lineItems) {
        const isDigital = item.format === "recorded_course" || item.format === "digital_book" || item.format === "hybrid_book" || item.type === "course";
        if (!isDigital) continue;
        const alternateValidOrder = otherPaidOrders.find(
          (otherOrd) => otherOrd.lineItems.some((li) => li.productId === item.productId)
        );
        if (alternateValidOrder) {
          await fetch(
            `${cfg.url}/rest/v1/entitlements?firebase_uid=eq.${encodeURIComponent(
              targetOrder.userId
            )}&product_id=eq.${encodeURIComponent(item.productId)}`,
            {
              method: "PATCH",
              headers: buildSupabaseHeaders(cfg.secretKey),
              body: JSON.stringify({
                order_id: alternateValidOrder.id,
                product_type: item.type,
                revoked_at: null
              })
            }
          );
        }
      }
    }
  }
  return await getOrderFromSupabase(targetOrder.id);
}
async function updateOrderByAdminInSupabase(params) {
  const cfg = requireSupabaseServerConfig("updateOrderByAdminInSupabase");
  const { orderId, shipmentStatus, paymentStatus } = params;
  const existing = await getOrderFromSupabase(orderId);
  if (!existing) return null;
  if (paymentStatus === "paid" && existing.paymentStatus !== "paid") {
    throw new Error(
      "Orders can only be marked paid after independent Cashfree verification via fulfill_paid_order."
    );
  }
  if (paymentStatus === "refunded" || paymentStatus === "cancelled") {
    const refundedOrder = await refundOrCancelOrderInSupabase({
      orderId: existing.id,
      newStatus: paymentStatus
    });
    if (!shipmentStatus || !refundedOrder) {
      return refundedOrder;
    }
  }
  const updateFields = {
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (shipmentStatus) {
    updateFields.shipment_status = shipmentStatus;
  }
  if (paymentStatus === "failed" && existing.paymentStatus === "pending") {
    updateFields.payment_status = "failed";
  }
  const res = await fetch(
    `${cfg.url}/rest/v1/orders?id=eq.${encodeURIComponent(existing.id)}`,
    {
      method: "PATCH",
      headers: buildSupabaseHeaders(cfg.secretKey, {
        Prefer: "return=representation"
      }),
      body: JSON.stringify(updateFields)
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Failed to update order ${existing.id} in Supabase (${res.status}): ${errText.slice(0, 240)}`
    );
  }
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? mapSupabaseRowToOrder(rows[0]) : existing;
}
async function listActiveEntitlementsByOrderFromSupabase(userId, orderId) {
  const cfg = requireSupabaseServerConfig("listActiveEntitlementsByOrderFromSupabase");
  const res = await fetch(
    `${cfg.url}/rest/v1/entitlements?firebase_uid=eq.${encodeURIComponent(
      userId
    )}&order_id=eq.${encodeURIComponent(orderId)}&revoked_at=is.null&select=*`,
    {
      method: "GET",
      headers: buildSupabaseHeaders(cfg.secretKey)
    }
  );
  if (!res.ok) {
    return [];
  }
  const rows = await res.json();
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => mapSupabaseRowToEntitlement(r));
}
async function listUserOrdersAndEntitlementsFromSupabase(userId) {
  const trimmedUid = String(userId || "").trim();
  if (!trimmedUid) {
    return { orders: [], entitlements: [] };
  }
  const cfg = requireSupabaseServerConfig("listUserOrdersAndEntitlementsFromSupabase");
  const [ordersRes, entitlementsRes] = await Promise.all([
    fetch(
      `${cfg.url}/rest/v1/orders?firebase_uid=eq.${encodeURIComponent(
        trimmedUid
      )}&order=created_at.desc&select=*`,
      {
        method: "GET",
        headers: buildSupabaseHeaders(cfg.secretKey)
      }
    ),
    fetch(
      `${cfg.url}/rest/v1/entitlements?firebase_uid=eq.${encodeURIComponent(
        trimmedUid
      )}&revoked_at=is.null&order=granted_at.desc&select=*`,
      {
        method: "GET",
        headers: buildSupabaseHeaders(cfg.secretKey)
      }
    )
  ]);
  if (!ordersRes.ok) {
    const errText = await ordersRes.text();
    throw new Error(
      `Failed to query customer orders from Supabase (${ordersRes.status}): ${errText.slice(
        0,
        240
      )}`
    );
  }
  if (!entitlementsRes.ok) {
    const errText = await entitlementsRes.text();
    throw new Error(
      `Failed to query customer entitlements from Supabase (${entitlementsRes.status}): ${errText.slice(
        0,
        240
      )}`
    );
  }
  const orderRows = await ordersRes.json();
  const entitlementRows = await entitlementsRes.json();
  const orders = (Array.isArray(orderRows) ? orderRows : []).map((r) => mapSupabaseRowToOrder(r)).filter((o) => o.userId === trimmedUid);
  const paidOrderIds = new Set(
    orders.filter((o) => o.paymentStatus === "paid" && o.entitlementsGranted).map((o) => o.id)
  );
  const entitlements = (Array.isArray(entitlementRows) ? entitlementRows : []).filter((r) => !r.revoked_at && paidOrderIds.has(String(r.order_id || "").trim())).map((r) => mapSupabaseRowToEntitlement(r)).filter((e) => e.userId === trimmedUid);
  return { orders, entitlements };
}
async function listUserEntitledProductIdsFromSupabase(userId) {
  const { entitlements } = await listUserOrdersAndEntitlementsFromSupabase(userId);
  return Array.from(new Set(entitlements.map((e) => e.productId)));
}
async function listAllOrdersFromSupabaseForAdmin() {
  const cfg = requireSupabaseServerConfig("listAllOrdersFromSupabaseForAdmin");
  const res = await fetch(
    `${cfg.url}/rest/v1/orders?order=created_at.desc&limit=500&select=*`,
    {
      method: "GET",
      headers: buildSupabaseHeaders(cfg.secretKey)
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Failed to list orders for admin from Supabase (${res.status}): ${errText.slice(0, 240)}`
    );
  }
  const rows = await res.json();
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => mapSupabaseRowToOrder(r));
}
async function createSupabaseSignedStorageUrl(params) {
  const cfg = requireSupabaseServerConfig("createSupabaseSignedStorageUrl");
  const validatedPath = validateProtectedStorageFilePath(params.objectPath);
  if (!validatedPath) {
    throw new Error(
      `Invalid or disallowed protected storage object path: "${params.objectPath}".`
    );
  }
  const bucket = (params.bucketName || cfg.storageBucket).trim();
  const expiresIn = Math.min(Math.max(60, Math.round(params.expiresInSeconds || 900)), 3600);
  const encodedPath = validatedPath.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  const signRes = await fetch(
    `${cfg.url}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodedPath}`,
    {
      method: "POST",
      headers: buildSupabaseHeaders(cfg.secretKey),
      body: JSON.stringify({ expiresIn })
    }
  );
  if (!signRes.ok) {
    const errText = await signRes.text();
    throw new Error(
      `Supabase Storage failed to sign object "${validatedPath}" in bucket "${bucket}" (${signRes.status}): ${errText.slice(
        0,
        240
      )}`
    );
  }
  const data = await signRes.json();
  const rawSignedPath = data.signedURL || data.signedUrl || "";
  if (!rawSignedPath) {
    throw new Error(
      `Supabase Storage did not return a signed URL for "${validatedPath}".`
    );
  }
  if (rawSignedPath.startsWith("http://") || rawSignedPath.startsWith("https://")) {
    return rawSignedPath;
  }
  const normalizedPrefix = rawSignedPath.startsWith("/storage/v1/") ? rawSignedPath : `/storage/v1${rawSignedPath.startsWith("/") ? "" : "/"}${rawSignedPath}`;
  return `${cfg.url}${normalizedPrefix}`;
}
async function createSupabaseSignedUploadUrlForAdmin(params) {
  const cfg = requireSupabaseServerConfig("createSupabaseSignedUploadUrlForAdmin");
  if (typeof params.fileSizeBytes === "number" && params.fileSizeBytes > SUPABASE_FREE_PLAN_MAX_FILE_BYTES) {
    throw new Error(
      `File size (${(params.fileSizeBytes / (1024 * 1024)).toFixed(
        1
      )} MB) exceeds the 50 MB Supabase Free plan limit. Please split the course recording into 15\u201325 minute lesson modules or HLS segments under 50 MB each.`
    );
  }
  const validatedPath = validateProtectedStorageFilePath(params.objectPath);
  if (!validatedPath) {
    throw new Error(
      `Invalid protected storage upload path: "${params.objectPath}". Must be inside protected/courses/ or protected/books/.`
    );
  }
  const bucket = (params.bucketName || cfg.storageBucket).trim();
  const encodedPath = validatedPath.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  const res = await fetch(
    `${cfg.url}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${encodedPath}`,
    {
      method: "POST",
      headers: buildSupabaseHeaders(cfg.secretKey, {
        "x-upsert": "true"
      }),
      body: JSON.stringify({})
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Failed to create signed upload URL in Supabase bucket "${bucket}" (${res.status}): ${errText.slice(
        0,
        240
      )}`
    );
  }
  const data = await res.json();
  if (!data.url) {
    throw new Error("Supabase Storage did not return a signed upload URL.");
  }
  const fullUploadUrl = data.url.startsWith("http") ? data.url : `${cfg.url}/storage/v1${data.url.startsWith("/") ? "" : "/"}${data.url}`;
  return {
    signedUploadUrl: fullUploadUrl,
    bucketName: bucket,
    objectPath: validatedPath,
    token: data.token
  };
}

// src/data/sampleCatalog.ts
var INITIAL_CATEGORIES = [
  { id: "cat-python", name: "Python", slug: "python", description: "Core Python 3.12, async programming, data structures, and automation.", group: "technology", active: true },
  { id: "cat-django", name: "Django", slug: "django", description: "Production web APIs, ORM architecture, security, and scalable backends.", group: "technology", active: true },
  { id: "cat-html", name: "HTML", slug: "html", description: "Semantic HTML5, accessibility standards, and modern document structure.", group: "technology", active: true },
  { id: "cat-css", name: "CSS", slug: "css", description: "Responsive Grid, Flexbox, Tailwind CSS, and fluid layout architecture.", group: "technology", active: true },
  { id: "cat-javascript", name: "JavaScript", slug: "javascript", description: "ES2025+, event loop, closures, TypeScript, and browser APIs.", group: "technology", active: true },
  { id: "cat-react", name: "React", slug: "react", description: "React 19, hooks, state management, and high-performance web apps.", group: "technology", active: true },
  { id: "cat-sql", name: "SQL", slug: "sql", description: "Relational modeling, query indexing, transactions, and PostgreSQL.", group: "technology", active: true },
  { id: "cat-aws", name: "AWS", slug: "aws", description: "Cloud architecture, IAM security, serverless compute, and storage.", group: "technology", active: true },
  { id: "cat-devops", name: "DevOps", slug: "devops", description: "CI/CD pipelines, Docker containers, Linux administration, and monitoring.", group: "technology", active: true },
  { id: "cat-genai", name: "GenAI", slug: "genai", description: "Large Language Models, prompt engineering, RAG pipelines, and embeddings.", group: "technology", active: true },
  { id: "cat-agentic-ai", name: "Agentic AI", slug: "agentic-ai", description: "Multi-step tool-calling agents, memory architectures, and evaluation.", group: "technology", active: true }
];
var INITIAL_BANNERS = [
  {
    id: "banner-launch-offer",
    title: "Academic Offer: Save 20% on Online Technology Courses",
    subtitle: "Apply code SATYA20 at checkout for instant lifetime access to HD course recordings, projects, and downloadable code notes.",
    ctaText: "Explore Courses",
    ctaLink: "courses",
    couponCode: "SATYA20",
    discountPercent: 20,
    active: true
  }
];
var INITIAL_PRODUCTS = [
  {
    id: "course-react-typescript",
    title: "Modern React 19, TypeScript & Tailwind CSS Workshop",
    slug: "modern-react-typescript-tailwind",
    type: "course",
    category: "React",
    priceInr: 1e4,
    originalPriceInr: 15e3,
    language: "English",
    format: "recorded_course",
    stock: 9999,
    featured: true,
    status: "published",
    authorOrInstructor: "Satya Narayana",
    shortDescription: "Comprehensive online course on accessible component systems, responsive design with Tailwind CSS, and state management.",
    description: "Master component composition, accessible forms, custom hooks, and responsive design patterns that work seamlessly across mobile phones, tablets, and desktops.",
    coverType: "HD Recorded Course (4 Modules)",
    level: "Intermediate",
    duration: "22 Hours",
    previewVideoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
  },
  {
    id: "course-aws-devops",
    title: "AWS Cloud & DevOps CI/CD Foundations",
    slug: "aws-cloud-devops-cicd-foundations",
    type: "course",
    category: "AWS",
    priceInr: 1e4,
    originalPriceInr: 15e3,
    language: "English",
    format: "recorded_course",
    stock: 9999,
    featured: false,
    status: "published",
    authorOrInstructor: "Satya Narayana",
    shortDescription: "Industry-ready online training on Linux, Docker containers, GitHub Actions, and AWS core infrastructure.",
    description: "Understand containerization, automated testing pipelines, least-privilege IAM roles, and zero-downtime deployment workflows.",
    coverType: "HD Recorded Course (4 Modules)",
    level: "Beginner to Intermediate",
    duration: "20 Hours",
    previewVideoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4"
  },
  {
    id: "course-python-mastery",
    title: "Complete Python 3.12 & Backend Engineering Mastery",
    slug: "complete-python-backend-mastery",
    type: "course",
    category: "Python",
    priceInr: 2e4,
    originalPriceInr: 25e3,
    language: "English & Telugu",
    format: "recorded_course",
    stock: 9999,
    featured: true,
    status: "published",
    authorOrInstructor: "Satya Narayana",
    shortDescription: "Comprehensive self-paced online course covering Python fundamentals, object-oriented design, async I/O, and automated testing.",
    description: "This comprehensive course provides a structured curriculum in Python 3.12. Students build command-line utilities, data processing pipelines, and modular packages with full HD video recordings and downloadable code notes.",
    coverType: "HD Recorded Course (6 Modules)",
    level: "Beginner to Advanced",
    duration: "36 Hours",
    previewVideoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
  },
  {
    id: "course-django-fullstack",
    title: "Production Django 5, REST APIs & Cloud Deployment",
    slug: "production-django-rest-apis",
    type: "course",
    category: "Django",
    priceInr: 2e4,
    originalPriceInr: 28e3,
    language: "English",
    format: "recorded_course",
    stock: 9999,
    featured: true,
    status: "published",
    authorOrInstructor: "Satya Narayana",
    shortDescription: "Comprehensive online course on Django ORM, authentication, API security, PostgreSQL, and cloud deployment.",
    description: "Learn how to architect secure, maintainable Django web applications and RESTful backends. Includes dedicated modules on token authentication, role-based access control, and relational schema design.",
    coverType: "HD Recorded Course (5 Modules)",
    level: "Intermediate",
    duration: "28 Hours",
    previewVideoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4"
  },
  {
    id: "course-agentic-ai",
    title: "Building GenAI & Agentic AI Workflows with Python",
    slug: "building-genai-agentic-ai-workflows",
    type: "course",
    category: "Agentic AI",
    priceInr: 5e4,
    originalPriceInr: 65e3,
    language: "English",
    format: "recorded_course",
    stock: 9999,
    featured: true,
    status: "published",
    authorOrInstructor: "Satya Narayana",
    shortDescription: "Flagship online program covering tool-calling agents, structured outputs, retrieval-augmented generation, and safety guardrails.",
    description: "Explore the engineering foundations of Generative AI and multi-step Agentic workflows. Covers deterministic evaluation, prompt architecture, and reliable API orchestration for enterprise production.",
    coverType: "HD Recorded Program (8 Modules)",
    level: "Advanced",
    duration: "48 Hours",
    previewVideoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4"
  },
  {
    id: "course-fullstack-ai-architect",
    title: "Enterprise Full-Stack Systems, SQL & GenAI Architect Program",
    slug: "enterprise-fullstack-sql-genai-architect",
    type: "course",
    category: "GenAI",
    priceInr: 5e4,
    originalPriceInr: 65e3,
    language: "English & Telugu",
    format: "recorded_course",
    stock: 9999,
    featured: true,
    status: "published",
    authorOrInstructor: "Satya Narayana",
    shortDescription: "End-to-end flagship mastery combining Python, Django, React, PostgreSQL indexing, AWS DevOps, and production GenAI systems.",
    description: "Our complete career-ready engineering program covering full-stack architecture, high-throughput SQL design, container orchestration on AWS, and deploying reliable AI-powered applications.",
    coverType: "HD Recorded Program (10 Modules)",
    level: "Beginner to Advanced",
    duration: "64 Hours",
    previewVideoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
  }
];
var INITIAL_COURSE_DETAILS = {
  "course-python-mastery": {
    id: "course-python-mastery",
    productId: "course-python-mastery",
    title: "Complete Python 3.12 & Backend Engineering Mastery",
    instructor: "Satya Narayana",
    language: "English & Telugu",
    level: "Beginner to Advanced",
    duration: "36 Hours",
    introduction: "Welcome to this recorded course. Designed for aspiring software engineers and university students, every module pairs clear conceptual whiteboarding with live coding sessions.",
    syllabusSummary: "Module 1: Python Runtime, Types & Memory Model \xB7 Module 2: Functions, Iterators & Type Annotations \xB7 Module 3: Object-Oriented Architecture & Testing \xB7 Module 4: Asyncio, File Systems & CLI Tooling.",
    status: "published"
  },
  "course-django-fullstack": {
    id: "course-django-fullstack",
    productId: "course-django-fullstack",
    title: "Production Django 5, REST APIs & Cloud Deployment",
    instructor: "Satya Narayana",
    language: "English",
    level: "Intermediate",
    duration: "28 Hours",
    introduction: "A practical engineering course focused on building secure backend web services with Python and Django, complete with token authentication and API architecture.",
    syllabusSummary: "Module 1: HTTP, Middleware & URL Routing \xB7 Module 2: Relational Modeling & Query Optimization \xB7 Module 3: Token Authentication & RBAC Security \xB7 Module 4: Production Deployment & Monitoring.",
    status: "published"
  },
  "course-react-typescript": {
    id: "course-react-typescript",
    productId: "course-react-typescript",
    title: "Modern React 19, TypeScript & Tailwind CSS Workshop",
    instructor: "Satya Narayana",
    language: "English",
    level: "Intermediate",
    duration: "22 Hours",
    introduction: "Build accessible, responsive interfaces from scratch using strict TypeScript and Tailwind CSS.",
    syllabusSummary: "Module 1: TypeScript Foundations for UI \xB7 Module 2: Component State & Effects \xB7 Module 3: Responsive Grids & Accessibility \xB7 Module 4: Full-Stack API Integration.",
    status: "published"
  },
  "course-agentic-ai": {
    id: "course-agentic-ai",
    productId: "course-agentic-ai",
    title: "Building GenAI & Agentic AI Workflows with Python",
    instructor: "Satya Narayana",
    language: "English",
    level: "Advanced",
    duration: "48 Hours",
    introduction: "Learn how modern AI engineers design deterministic tool-calling pipelines, structured schemas, and evaluation harnesses.",
    syllabusSummary: "Module 1: Structured Generation & Schemas \xB7 Module 2: Retrieval & Vector Indexing \xB7 Module 3: Tool-Calling Agent Loops \xB7 Module 4: Safety, Guardrails & Production Evals.",
    status: "published"
  },
  "course-aws-devops": {
    id: "course-aws-devops",
    productId: "course-aws-devops",
    title: "AWS Cloud & DevOps CI/CD Foundations",
    instructor: "Satya Narayana",
    language: "English",
    level: "Beginner to Intermediate",
    duration: "20 Hours",
    introduction: "Step-by-step comprehensive course covering Linux server essentials, container workflows, and cloud security.",
    syllabusSummary: "Module 1: Linux & Shell Scripting \xB7 Module 2: Docker & Multi-Stage Builds \xB7 Module 3: CI/CD Pipelines \xB7 Module 4: AWS IAM, Storage & Monitoring.",
    status: "published"
  },
  "course-fullstack-ai-architect": {
    id: "course-fullstack-ai-architect",
    productId: "course-fullstack-ai-architect",
    title: "Enterprise Full-Stack Systems, SQL & GenAI Architect Program",
    instructor: "Satya Narayana",
    language: "English & Telugu",
    level: "Beginner to Advanced",
    duration: "64 Hours",
    introduction: "An intensive flagship online program taking learners from foundational backend design through production React, PostgreSQL tuning, AWS deployment, and applied GenAI engineering.",
    syllabusSummary: "Module 1: System Design & Python Core \xB7 Module 2: Django APIs & PostgreSQL Indexing \xB7 Module 3: React 19 & TypeScript Frontends \xB7 Module 4: AWS DevOps & GenAI Agent Integration.",
    status: "published"
  }
};
var INITIAL_LESSONS = [
  {
    id: "lesson-py-1",
    courseId: "course-python-mastery",
    moduleTitle: "Module 1: Python Runtime & Core Foundations",
    title: "01. Course Overview & Python 3.12 Memory Model (Free Preview)",
    orderIndex: 1,
    durationMinutes: 18,
    isFreePreview: true,
    videoStoragePath: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    notes: "Free preview lesson covering how Python objects, references, and stack frames operate under the hood."
  },
  {
    id: "lesson-py-2",
    courseId: "course-python-mastery",
    moduleTitle: "Module 1: Python Runtime & Core Foundations",
    title: "02. Collections, Comprehensions & Generator Pipelines",
    orderIndex: 2,
    durationMinutes: 34,
    isFreePreview: false,
    videoStoragePath: "protected/courses/course-python-mastery/lesson-02.mp4",
    notes: "Deep dive into memory-efficient generators, dictionary internals, and time complexity."
  },
  {
    id: "lesson-py-3",
    courseId: "course-python-mastery",
    moduleTitle: "Module 2: Modular Architecture & Testing",
    title: "03. Dataclasses, Type Hints & Unit Testing with pytest",
    orderIndex: 3,
    durationMinutes: 42,
    isFreePreview: false,
    videoStoragePath: "protected/courses/course-python-mastery/lesson-03.mp4",
    notes: "Writing maintainable domain logic with static type checking and deterministic tests."
  },
  {
    id: "lesson-dj-1",
    courseId: "course-django-fullstack",
    moduleTitle: "Module 1: Django Architecture & Request Lifecycle",
    title: "01. Inside WSGI/ASGI, Middleware & Clean Settings (Free Preview)",
    orderIndex: 1,
    durationMinutes: 21,
    isFreePreview: true,
    videoStoragePath: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    notes: "Free preview exploring environment variable separation and request security middleware."
  },
  {
    id: "lesson-dj-2",
    courseId: "course-django-fullstack",
    moduleTitle: "Module 2: Authentication & API Security",
    title: "02. Role-Based Access Control & REST API Validation in Django",
    orderIndex: 2,
    durationMinutes: 46,
    isFreePreview: false,
    videoStoragePath: "protected/courses/course-django-fullstack/lesson-02.mp4",
    notes: "Implementing clean authentication middleware and idempotent order fulfillment."
  },
  {
    id: "lesson-react-1",
    courseId: "course-react-typescript",
    moduleTitle: "Module 1: Component Systems",
    title: "01. Semantic HTML, Accessibility Tree & Tailwind Foundations (Free Preview)",
    orderIndex: 1,
    durationMinutes: 19,
    isFreePreview: true,
    videoStoragePath: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    notes: "Free preview lesson on designing accessible, keyboard-friendly React components."
  },
  {
    id: "lesson-react-2",
    courseId: "course-react-typescript",
    moduleTitle: "Module 2: State & Data Fetching",
    title: "02. Async State Management & Optimistic UI Patterns",
    orderIndex: 2,
    durationMinutes: 38,
    isFreePreview: false,
    videoStoragePath: "protected/courses/course-react-typescript/lesson-02.mp4",
    notes: "Handling loading, empty, and error states cleanly."
  },
  {
    id: "lesson-ai-1",
    courseId: "course-agentic-ai",
    moduleTitle: "Module 1: Foundations of Agentic Systems",
    title: "01. Deterministic Tool Calling & Schema Validation (Free Preview)",
    orderIndex: 1,
    durationMinutes: 24,
    isFreePreview: true,
    videoStoragePath: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    notes: "Free preview lesson on structured outputs and safe tool execution loops."
  },
  {
    id: "lesson-ai-2",
    courseId: "course-agentic-ai",
    moduleTitle: "Module 2: Memory & Evaluation",
    title: "02. Multi-Turn Context Compaction & Automated Evals",
    orderIndex: 2,
    durationMinutes: 41,
    isFreePreview: false,
    videoStoragePath: "protected/courses/course-agentic-ai/lesson-02.mp4",
    notes: "Measuring latency, accuracy, and hallucination rates across test suites."
  },
  {
    id: "lesson-aws-1",
    courseId: "course-aws-devops",
    moduleTitle: "Module 1: Cloud & Container Basics",
    title: "01. Docker Multi-Stage Builds & Least-Privilege IAM (Free Preview)",
    orderIndex: 1,
    durationMinutes: 16,
    isFreePreview: true,
    videoStoragePath: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
    notes: "Free preview lesson on packaging Python and Node applications securely."
  },
  {
    id: "lesson-arch-1",
    courseId: "course-fullstack-ai-architect",
    moduleTitle: "Module 1: End-to-End Architecture Blueprint",
    title: "01. Designing Resilient Full-Stack & AI Applications (Free Preview)",
    orderIndex: 1,
    durationMinutes: 26,
    isFreePreview: true,
    videoStoragePath: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    notes: "Free preview outlining database scaling, API security, and structured AI pipelines."
  },
  {
    id: "lesson-arch-2",
    courseId: "course-fullstack-ai-architect",
    moduleTitle: "Module 2: PostgreSQL Indexing & Production Deployments",
    title: "02. Query Planning, Composite Indexes & Zero-Downtime Releases",
    orderIndex: 2,
    durationMinutes: 48,
    isFreePreview: false,
    videoStoragePath: "protected/courses/course-fullstack-ai-architect/lesson-02.mp4",
    notes: "Hands-on walkthrough of EXPLAIN ANALYZE, connection pooling, and automated rollouts."
  }
];

// src/serverApp.ts
if (!process.env.VERCEL) {
  try {
    dotenv.config();
  } catch {
  }
}
var serverProducts = new Map(
  INITIAL_PRODUCTS.map((p) => [p.id, { ...p }])
);
var serverCategories = new Map(
  INITIAL_CATEGORIES.map((c) => [c.id, { ...c }])
);
var serverCourses = new Map(
  Object.entries(INITIAL_COURSE_DETAILS).map(([k, v]) => [k, { ...v }])
);
var serverLessons = new Map(
  INITIAL_LESSONS.map((l) => [l.id, { ...l }])
);
var serverBanners = new Map(
  INITIAL_BANNERS.map((b) => [b.id, { ...b }])
);
var serverAdminUids = /* @__PURE__ */ new Set();
var verifiedTokenCache = /* @__PURE__ */ new Map();
function getDownloadSigningSecret() {
  const configuredSecret = (process.env.SUPABASE_SECRET_KEY || "").trim() || (process.env.CASHFREE_SECRET_KEY || "").trim();
  if (configuredSecret) {
    return configuredSecret;
  }
  return `satya-preview-hmac-${firebase_applet_config_default.projectId}-${firebase_applet_config_default.appId}`;
}
function getCashfreeConfig() {
  const appId = (process.env.CASHFREE_APP_ID || "").trim();
  const secretKey = (process.env.CASHFREE_SECRET_KEY || "").trim();
  const rawEnv = (process.env.CASHFREE_ENV || "").trim().toUpperCase();
  const apiVersion = (process.env.CASHFREE_API_VERSION || "2023-08-01").trim();
  const looksLikeSandboxKey = secretKey.startsWith("cfsk_ma_test_") || appId.toUpperCase().startsWith("TEST");
  const looksLikeProdKey = secretKey.startsWith("cfsk_ma_prod_");
  let isSandbox;
  if (rawEnv === "SANDBOX" || rawEnv === "TEST") {
    isSandbox = true;
  } else if (rawEnv === "PRODUCTION" || rawEnv === "PROD") {
    isSandbox = false;
  } else {
    isSandbox = looksLikeSandboxKey;
  }
  let credentialMismatchError = null;
  if (appId && secretKey) {
    if (!isSandbox && looksLikeSandboxKey) {
      credentialMismatchError = "Cashfree environment mismatch: CASHFREE_ENV is set to PRODUCTION, but the configured Cashfree credentials are Sandbox/Test keys. Either set CASHFREE_ENV=SANDBOX or configure live Production credentials.";
    } else if (isSandbox && looksLikeProdKey) {
      credentialMismatchError = "Cashfree environment mismatch: CASHFREE_ENV is set to SANDBOX, but CASHFREE_SECRET_KEY is a live Production key (cfsk_ma_prod_). Set CASHFREE_ENV=PRODUCTION for live credentials.";
    }
  }
  const baseUrl = isSandbox ? "https://sandbox.cashfree.com/pg" : "https://api.cashfree.com/pg";
  return {
    appId,
    secretKey,
    apiVersion,
    baseUrl,
    mode: isSandbox ? "sandbox" : "production",
    configured: Boolean(appId && secretKey),
    credentialMismatchError
  };
}
function sanitizeCashfreeCustomerName(rawName, fallbackEmail) {
  const candidate = rawName.includes("@") ? rawName.split("@")[0] : rawName || (fallbackEmail ? fallbackEmail.split("@")[0] : "Satya Student");
  const lettersAndSpaces = candidate.replace(/[^a-zA-Z\s]/g, " ").replace(/\s+/g, " ").trim();
  if (lettersAndSpaces.length >= 3) {
    return lettersAndSpaces.slice(0, 90);
  }
  return "Satya Student";
}
function sanitizeCashfreeIndianPhone(rawPhone) {
  const digits = String(rawPhone || "").replace(/[^0-9]/g, "");
  const lastTen = digits.slice(-10);
  if (/^[6-9][0-9]{9}$/.test(lastTen)) {
    return lastTen;
  }
  return "9876543210";
}
function sanitizeCashfreeOrderNote(rawNote) {
  return String(rawNote || "").replace(/₹/g, "INR ").replace(/[^a-zA-Z0-9\s.,_-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
}
function createSignedDownloadToken(uid, resourceIdentifier, expiresAtMs) {
  const payload = `${uid}|${resourceIdentifier}|${expiresAtMs}`;
  const sig = crypto.createHmac("sha256", getDownloadSigningSecret()).update(payload).digest("hex");
  return Buffer.from(`${payload}|${sig}`).toString("base64url");
}
function verifySignedDownloadToken(token, expectedResourceIdentifier) {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split("|");
    if (parts.length !== 4) return { valid: false };
    const [uid, resourceId, expStr, providedSig] = parts;
    if (resourceId !== expectedResourceIdentifier) return { valid: false };
    const expMs = Number(expStr);
    if (!Number.isFinite(expMs) || Date.now() > expMs) return { valid: false };
    const expectedSig = crypto.createHmac("sha256", getDownloadSigningSecret()).update(`${uid}|${resourceId}|${expStr}`).digest("hex");
    if (providedSig.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(providedSig), Buffer.from(expectedSig))) {
      return { valid: false };
    }
    return { valid: true, uid };
  } catch {
    return { valid: false };
  }
}
function resolveVerifiedProtectedFilePath(rawServerPathOrUrl) {
  const trimmed = String(rawServerPathOrUrl || "").trim();
  if (!trimmed) return null;
  const directValidated = validateProtectedStorageFilePath(trimmed);
  if (directValidated) {
    return directValidated;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.includes("firebasestorage.googleapis.com")) {
      const match = parsed.pathname.match(/\/o\/(.+)$/);
      if (match?.[1]) {
        return validateProtectedStorageFilePath(decodeURIComponent(match[1]));
      }
    }
    if (parsed.pathname.includes("/storage/v1/object/")) {
      const match = parsed.pathname.match(
        /\/storage\/v1\/object\/(?:sign|public|authenticated)\/[^/]+\/(.+)$/
      );
      if (match?.[1]) {
        return validateProtectedStorageFilePath(decodeURIComponent(match[1]));
      }
    }
  } catch {
  }
  return null;
}
async function resolveServerAuthContext(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const idToken = authHeader.slice("Bearer ".length).trim();
  if (!idToken) return null;
  const cached = verifiedTokenCache.get(idToken);
  if (cached && cached.expiresAtMs > Date.now()) {
    return cached.authCtx;
  }
  try {
    const apiKey = firebase_applet_config_default.apiKey;
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken })
      }
    );
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    const fbUser = data.users?.[0];
    if (!fbUser || !fbUser.localId) {
      return null;
    }
    let customAdminClaim = false;
    if (fbUser.customAttributes) {
      try {
        const parsedClaims = JSON.parse(fbUser.customAttributes);
        customAdminClaim = parsedClaims?.admin === true || parsedClaims?.role === "admin";
      } catch {
      }
    }
    const email = fbUser.email?.trim();
    const emailVerified = Boolean(fbUser.emailVerified);
    const isVerifiedBootstrappedAdmin = Boolean(email) && emailVerified === true && email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
    if (isVerifiedBootstrappedAdmin || customAdminClaim) {
      serverAdminUids.add(fbUser.localId);
    }
    const authCtx = {
      uid: fbUser.localId,
      email,
      emailVerified,
      customClaims: {
        admin: customAdminClaim
      },
      isAdminRecordPresent: serverAdminUids.has(fbUser.localId),
      idToken
    };
    verifiedTokenCache.set(idToken, {
      authCtx,
      expiresAtMs: Date.now() + 2 * 60 * 1e3
    });
    return authCtx;
  } catch {
    return null;
  }
}
function getActiveCouponsMap() {
  const map = {};
  for (const banner of serverBanners.values()) {
    if (banner.active && banner.couponCode) {
      map[banner.couponCode.toUpperCase()] = banner.discountPercent;
    }
  }
  return map;
}
function decrementPhysicalCatalogStock(productId, quantity) {
  const prod = serverProducts.get(productId);
  if (prod && (prod.format === "physical_book" || prod.format === "hybrid_book")) {
    prod.stock = Math.max(0, prod.stock - quantity);
    serverProducts.set(prod.id, prod);
  }
}
async function verifyOrderWithCashfreeServer(order) {
  const cfConfig = getCashfreeConfig();
  if (!cfConfig.configured) {
    return {
      verifiedPaid: false,
      cashfreeOrderStatus: "UNCONFIGURED",
      cashfreeOrderId: "",
      cashfreePaymentId: "",
      verifiedAmountPaise: 0,
      verifiedCurrency: "",
      error: "Cashfree payment gateway credentials (CASHFREE_APP_ID and CASHFREE_SECRET_KEY) are not configured on the server."
    };
  }
  if (cfConfig.credentialMismatchError) {
    return {
      verifiedPaid: false,
      cashfreeOrderStatus: "CREDENTIAL_MISMATCH",
      cashfreeOrderId: "",
      cashfreePaymentId: "",
      verifiedAmountPaise: 0,
      verifiedCurrency: "",
      error: cfConfig.credentialMismatchError
    };
  }
  const storedCashfreeOrderId = String(order.cashfreeOrderId || "").trim();
  if (!storedCashfreeOrderId) {
    return {
      verifiedPaid: false,
      cashfreeOrderStatus: "MISSING_CF_ORDER_ID",
      cashfreeOrderId: "",
      cashfreePaymentId: "",
      verifiedAmountPaise: 0,
      verifiedCurrency: "",
      error: `Order ${order.id} does not have a registered Cashfree cf_order_id in Supabase because its checkout session was not initialized. Please start a new checkout from your cart.`
    };
  }
  const cfRes = await fetch(
    `${cfConfig.baseUrl}/orders/${encodeURIComponent(order.id)}`,
    {
      method: "GET",
      headers: {
        "x-client-id": cfConfig.appId,
        "x-client-secret": cfConfig.secretKey,
        "x-api-version": cfConfig.apiVersion,
        Accept: "application/json"
      }
    }
  );
  if (!cfRes.ok) {
    const errBody = await cfRes.text();
    return {
      verifiedPaid: false,
      cashfreeOrderStatus: "LOOKUP_FAILED",
      cashfreeOrderId: "",
      cashfreePaymentId: "",
      verifiedAmountPaise: 0,
      verifiedCurrency: "",
      error: `Cashfree order verification request failed (${cfRes.status} in ${cfConfig.mode} mode): ${errBody.slice(0, 200)}`
    };
  }
  const cfOrder = await cfRes.json();
  const cfStatus = String(cfOrder.order_status || "ACTIVE").toUpperCase();
  const returnedMerchantOrderId = String(cfOrder.order_id || "").trim();
  const returnedCashfreeOrderId = String(cfOrder.cf_order_id ?? "").trim();
  const returnedCurrency = String(cfOrder.order_currency || "").trim().toUpperCase();
  const returnedAmountPaise = typeof cfOrder.order_amount === "number" && Number.isFinite(cfOrder.order_amount) ? Math.round(cfOrder.order_amount * 100) : -1;
  if (returnedMerchantOrderId !== order.id) {
    return {
      verifiedPaid: false,
      cashfreeOrderStatus: cfStatus,
      cashfreeOrderId: returnedCashfreeOrderId,
      cashfreePaymentId: "",
      verifiedAmountPaise: returnedAmountPaise,
      verifiedCurrency: returnedCurrency,
      error: `Merchant order_id mismatch from Cashfree: expected ${order.id}, received ${returnedMerchantOrderId}.`
    };
  }
  if (!returnedCashfreeOrderId || returnedCashfreeOrderId !== storedCashfreeOrderId) {
    return {
      verifiedPaid: false,
      cashfreeOrderStatus: cfStatus,
      cashfreeOrderId: returnedCashfreeOrderId,
      cashfreePaymentId: "",
      verifiedAmountPaise: returnedAmountPaise,
      verifiedCurrency: returnedCurrency,
      error: `Cashfree cf_order_id mismatch: expected ${storedCashfreeOrderId}, received ${returnedCashfreeOrderId || "empty"}.`
    };
  }
  const amountMatches = returnedAmountPaise === order.totalAmountPaise;
  const currencyMatches = returnedCurrency === "INR";
  if (cfStatus !== "PAID" || !amountMatches || !currencyMatches) {
    return {
      verifiedPaid: false,
      cashfreeOrderStatus: cfStatus,
      cashfreeOrderId: returnedCashfreeOrderId,
      cashfreePaymentId: "",
      verifiedAmountPaise: returnedAmountPaise,
      verifiedCurrency: returnedCurrency,
      error: cfStatus === "PAID" && (!amountMatches || !currencyMatches) ? "Cashfree order amount or currency mismatch." : `Payment is not completed yet (Cashfree status: ${cfStatus}).`
    };
  }
  const paymentsRes = await fetch(
    `${cfConfig.baseUrl}/orders/${encodeURIComponent(order.id)}/payments`,
    {
      method: "GET",
      headers: {
        "x-client-id": cfConfig.appId,
        "x-client-secret": cfConfig.secretKey,
        "x-api-version": cfConfig.apiVersion,
        Accept: "application/json"
      }
    }
  );
  if (!paymentsRes.ok) {
    const errText = await paymentsRes.text();
    return {
      verifiedPaid: false,
      cashfreeOrderStatus: "PAYMENTS_LOOKUP_FAILED",
      cashfreeOrderId: returnedCashfreeOrderId,
      cashfreePaymentId: "",
      verifiedAmountPaise: returnedAmountPaise,
      verifiedCurrency: returnedCurrency,
      error: `Cashfree payments verification request failed (${paymentsRes.status}): ${errText.slice(
        0,
        200
      )}`
    };
  }
  const paymentsList = await paymentsRes.json();
  const successPayment = Array.isArray(paymentsList) ? paymentsList.find(
    (p) => String(p?.payment_status || "").toUpperCase() === "SUCCESS" && p?.cf_payment_id !== void 0 && p?.cf_payment_id !== null && String(p.cf_payment_id).trim().length > 0
  ) : void 0;
  if (!successPayment) {
    return {
      verifiedPaid: false,
      cashfreeOrderStatus: "MISSING_SUCCESS_PAYMENT",
      cashfreeOrderId: returnedCashfreeOrderId,
      cashfreePaymentId: "",
      verifiedAmountPaise: returnedAmountPaise,
      verifiedCurrency: returnedCurrency,
      error: "Cashfree did not return a SUCCESS payment transaction with a valid cf_payment_id."
    };
  }
  const realCashfreePaymentId = String(successPayment.cf_payment_id).trim();
  if (successPayment.order_id && String(successPayment.order_id).trim() !== order.id) {
    return {
      verifiedPaid: false,
      cashfreeOrderStatus: "PAYMENT_ORDER_MISMATCH",
      cashfreeOrderId: returnedCashfreeOrderId,
      cashfreePaymentId: realCashfreePaymentId,
      verifiedAmountPaise: returnedAmountPaise,
      verifiedCurrency: returnedCurrency,
      error: "Cashfree payment record order_id does not match the merchant order ID."
    };
  }
  if (typeof successPayment.payment_amount === "number" && Number.isFinite(successPayment.payment_amount) && Math.round(successPayment.payment_amount * 100) !== order.totalAmountPaise) {
    return {
      verifiedPaid: false,
      cashfreeOrderStatus: "PAYMENT_AMOUNT_MISMATCH",
      cashfreeOrderId: returnedCashfreeOrderId,
      cashfreePaymentId: realCashfreePaymentId,
      verifiedAmountPaise: returnedAmountPaise,
      verifiedCurrency: returnedCurrency,
      error: "Cashfree payment transaction amount does not match the order total."
    };
  }
  if (successPayment.payment_currency && String(successPayment.payment_currency).trim().toUpperCase() !== "INR") {
    return {
      verifiedPaid: false,
      cashfreeOrderStatus: "PAYMENT_CURRENCY_MISMATCH",
      cashfreeOrderId: returnedCashfreeOrderId,
      cashfreePaymentId: realCashfreePaymentId,
      verifiedAmountPaise: returnedAmountPaise,
      verifiedCurrency: returnedCurrency,
      error: "Cashfree payment transaction currency is not INR."
    };
  }
  return {
    verifiedPaid: true,
    cashfreeOrderStatus: "PAID",
    cashfreeOrderId: returnedCashfreeOrderId,
    cashfreePaymentId: realCashfreePaymentId,
    verifiedAmountPaise: returnedAmountPaise,
    verifiedCurrency: "INR"
  };
}
function createApiApp() {
  const app2 = express();
  app2.use((req, _res, next) => {
    const forwardedUri = req.headers["x-forwarded-uri"] || req.headers["x-matched-path"];
    if (typeof forwardedUri === "string" && forwardedUri.startsWith("/api/")) {
      req.url = forwardedUri;
    } else if (req.url.startsWith("/api/index.js")) {
      const rest = req.url.slice("/api/index.js".length);
      req.url = `/api${rest.startsWith("/") ? "" : "/"}${rest}`;
    }
    if (process.env.VERCEL && !req.url.startsWith("/api/") && req.url !== "/api") {
      req.url = `/api${req.url.startsWith("/") ? "" : "/"}${req.url}`;
    }
    next();
  });
  app2.use(
    express.json({
      limit: "2mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf.toString("utf8");
      }
    })
  );
  app2.get("/api/auth/session", async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!authCtx || !authCtx.uid) {
      res.status(401).json({ authenticated: false, error: "Invalid or missing Firebase ID token." });
      return;
    }
    const isAdmin = canUserPerformAdminOperation(authCtx);
    res.json({
      authenticated: true,
      uid: authCtx.uid,
      email: authCtx.email || "",
      emailVerified: Boolean(authCtx.emailVerified),
      role: isAdmin ? "admin" : "student"
    });
  });
  app2.get("/api/catalog", (_req, res) => {
    const sanitizedLessons = Array.from(serverLessons.values()).map((lesson) => ({
      ...lesson,
      videoStoragePath: lesson.isFreePreview ? lesson.videoStoragePath : ""
    }));
    res.json({
      products: Array.from(serverProducts.values()),
      categories: Array.from(serverCategories.values()),
      courseDetails: Object.fromEntries(serverCourses.entries()),
      lessons: sanitizedLessons,
      banners: Array.from(serverBanners.values())
    });
  });
  app2.post("/api/cart/verify", (req, res) => {
    const { cartItems, couponCode, shippingAddressProvided } = req.body || {};
    const result = calculateVerifiedCartSummary({
      cartItems: Array.isArray(cartItems) ? cartItems : [],
      catalogById: serverProducts,
      couponCode,
      activeCoupons: getActiveCouponsMap(),
      shippingAddressProvided: Boolean(shippingAddressProvided)
    });
    res.json(result);
  });
  const handleCreatePendingCashfreeOrder = async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!authCtx || !authCtx.uid) {
      res.status(401).json({
        checkoutInitialized: false,
        error: "Authentication required. Please log in with your account before checking out."
      });
      return;
    }
    if (!getSupabaseServerConfig()) {
      res.status(503).json({
        checkoutInitialized: false,
        error: "Server database credentials (SUPABASE_URL and SUPABASE_SECRET_KEY) are not configured on the server."
      });
      return;
    }
    const cfConfig = getCashfreeConfig();
    if (!cfConfig.configured) {
      res.status(503).json({
        checkoutInitialized: false,
        error: "Cashfree payment gateway credentials (CASHFREE_APP_ID and CASHFREE_SECRET_KEY) are not configured on the server."
      });
      return;
    }
    if (cfConfig.credentialMismatchError) {
      res.status(503).json({
        checkoutInitialized: false,
        error: cfConfig.credentialMismatchError
      });
      return;
    }
    const {
      cartItems,
      couponCode,
      shippingAddress,
      customerName,
      customerPhone,
      returnUrl
    } = req.body || {};
    const hasAddress = Boolean(
      shippingAddress && typeof shippingAddress.line1 === "string" && shippingAddress.line1.trim().length >= 3 && typeof shippingAddress.city === "string" && shippingAddress.city.trim().length >= 2 && typeof shippingAddress.postalCode === "string" && shippingAddress.postalCode.trim().length >= 4
    );
    const verifiedCart = calculateVerifiedCartSummary({
      cartItems: Array.isArray(cartItems) ? cartItems : [],
      catalogById: serverProducts,
      couponCode,
      activeCoupons: getActiveCouponsMap(),
      shippingAddressProvided: hasAddress
    });
    if (!verifiedCart.valid) {
      res.status(400).json({
        checkoutInitialized: false,
        error: verifiedCart.error || "Cart validation failed."
      });
      return;
    }
    const orderId = `ORD_${Date.now().toString().slice(-6)}_${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const addressSummary = verifiedCart.hasPhysicalItems ? `${shippingAddress.fullName || customerName || "Customer"}, ${shippingAddress.line1}, ${shippingAddress.city}, ${shippingAddress.state || ""} - ${shippingAddress.postalCode} (${shippingAddress.phone || customerPhone || ""})` : "Digital Delivery (Student Dashboard \u2014 My Courses)";
    const itemSummary = verifiedCart.items.map((i) => `${i.title} x${i.quantity} (\u20B9${i.lineTotalInr})`).join(" \xB7 ");
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const totalAmountPaise = Math.round(verifiedCart.totalAmountInr * 100);
    const draftOrder = {
      id: orderId,
      userId: authCtx.uid,
      customerName: String(customerName || authCtx.email || "Student").slice(0, 120),
      customerEmail: String(authCtx.email || "student@example.com").slice(0, 256),
      totalAmountInr: verifiedCart.totalAmountInr,
      totalAmountPaise,
      currency: "INR",
      paymentStatus: "pending",
      shipmentStatus: verifiedCart.hasPhysicalItems ? "processing" : "not_applicable",
      cashfreeOrderId: "",
      cashfreePaymentId: "",
      paymentReference: "",
      hasPhysicalItems: verifiedCart.hasPhysicalItems,
      shippingAddressSummary: addressSummary.slice(0, 600),
      itemSummary: itemSummary.slice(0, 1500),
      lineItems: verifiedCart.items.map((item) => ({
        productId: item.productId,
        title: item.title,
        type: item.type,
        format: item.format,
        quantity: item.quantity,
        unitPriceInr: item.unitPriceInr
      })),
      entitlementsGranted: false,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    let pendingOrder;
    try {
      pendingOrder = await createPendingOrderInSupabase(draftOrder);
    } catch (err) {
      res.status(503).json({
        checkoutInitialized: false,
        error: err instanceof Error ? err.message : "Unable to save pending order in Supabase."
      });
      return;
    }
    const sanitizedCustomerName = sanitizeCashfreeCustomerName(
      String(shippingAddress?.fullName || customerName || ""),
      pendingOrder.customerEmail
    );
    const sanitizedPhone = sanitizeCashfreeIndianPhone(
      String(shippingAddress?.phone || customerPhone || "")
    );
    const sanitizedCustomerId = authCtx.uid.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48) || `cust_${Date.now()}`;
    const sanitizedNote = sanitizeCashfreeOrderNote(pendingOrder.itemSummary);
    const validReturnUrl = typeof returnUrl === "string" && (returnUrl.startsWith("https://") || cfConfig.mode === "sandbox" && returnUrl.startsWith("http://")) ? returnUrl : void 0;
    try {
      const cfCreateRes = await fetch(`${cfConfig.baseUrl}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-client-id": cfConfig.appId,
          "x-client-secret": cfConfig.secretKey,
          "x-api-version": cfConfig.apiVersion,
          Accept: "application/json"
        },
        body: JSON.stringify({
          order_id: pendingOrder.id,
          order_amount: Number(pendingOrder.totalAmountInr.toFixed(2)),
          order_currency: "INR",
          customer_details: {
            customer_id: sanitizedCustomerId,
            customer_name: sanitizedCustomerName,
            customer_email: pendingOrder.customerEmail,
            customer_phone: sanitizedPhone
          },
          ...validReturnUrl ? {
            order_meta: {
              return_url: validReturnUrl
            }
          } : {},
          order_note: sanitizedNote
        })
      });
      const rawResponseText = await cfCreateRes.text();
      let cfData = {};
      try {
        cfData = JSON.parse(rawResponseText);
      } catch {
      }
      const paymentSessionId = String(cfData.payment_session_id || "").trim();
      const realCashfreeOrderId = cfData.cf_order_id !== void 0 && cfData.cf_order_id !== null ? String(cfData.cf_order_id).trim() : "";
      if (!cfCreateRes.ok || !paymentSessionId || !realCashfreeOrderId) {
        await markOrderFailedOrCancelledInSupabase(pendingOrder, "failed");
        const safeCfDetails = [
          cfData.message,
          cfData.code ? `(code: ${cfData.code})` : "",
          cfData.type ? `[${cfData.type}]` : ""
        ].filter(Boolean).join(" ").trim();
        res.status(502).json({
          checkoutInitialized: false,
          cashfreeMode: cfConfig.mode,
          error: safeCfDetails ? `Cashfree checkout initialization failed (HTTP ${cfCreateRes.status} in ${cfConfig.mode} mode): ${safeCfDetails}` : `Cashfree checkout initialization failed (HTTP ${cfCreateRes.status} in ${cfConfig.mode} mode). Please verify your Cashfree API credentials and environment mode.`
        });
        return;
      }
      if (cfData.order_id && String(cfData.order_id).trim() !== pendingOrder.id) {
        await markOrderFailedOrCancelledInSupabase(pendingOrder, "failed");
        res.status(502).json({
          checkoutInitialized: false,
          error: "Cashfree returned a mismatched merchant order_id."
        });
        return;
      }
      try {
        pendingOrder = await saveCashfreeOrderIdInSupabase({
          orderId: pendingOrder.id,
          cashfreeOrderId: realCashfreeOrderId
        });
      } catch (saveErr) {
        await markOrderFailedOrCancelledInSupabase(pendingOrder, "failed");
        res.status(503).json({
          checkoutInitialized: false,
          error: saveErr instanceof Error ? saveErr.message : "Failed to store Cashfree cf_order_id in Supabase before checkout."
        });
        return;
      }
      if (!pendingOrder.cashfreeOrderId || pendingOrder.cashfreeOrderId !== realCashfreeOrderId) {
        await markOrderFailedOrCancelledInSupabase(pendingOrder, "failed");
        res.status(503).json({
          checkoutInitialized: false,
          error: "Cashfree cf_order_id could not be verified in Supabase after saving."
        });
        return;
      }
      res.json({
        checkoutInitialized: true,
        order: pendingOrder,
        cashfreeOrderId: pendingOrder.cashfreeOrderId,
        paymentSessionId,
        cashfreeMode: cfConfig.mode
      });
    } catch (err) {
      await markOrderFailedOrCancelledInSupabase(pendingOrder, "failed");
      res.status(502).json({
        checkoutInitialized: false,
        error: err instanceof Error ? `Cashfree connection error (${cfConfig.mode} mode): ${err.message}` : "Unable to reach Cashfree Payment Gateway."
      });
    }
  };
  app2.post("/api/payments/cashfree/create-order", handleCreatePendingCashfreeOrder);
  app2.post("/api/orders/create", handleCreatePendingCashfreeOrder);
  app2.post("/api/payments/cashfree/verify", async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!authCtx || !authCtx.uid) {
      res.status(401).json({ error: "Authentication required to verify payment." });
      return;
    }
    const orderId = String(req.body?.orderId || "").trim();
    if (!orderId) {
      res.status(400).json({ error: "Order ID is required for payment verification." });
      return;
    }
    let order;
    try {
      order = await getOrderFromSupabase(orderId);
    } catch (err) {
      res.status(503).json({
        verified: false,
        error: err instanceof Error ? err.message : "Server-side Supabase credentials (SUPABASE_URL and SUPABASE_SECRET_KEY) are required to verify orders."
      });
      return;
    }
    if (!order) {
      res.status(404).json({ error: "Order not found in Supabase." });
      return;
    }
    const isCallerAdmin = canUserPerformAdminOperation(authCtx);
    if (order.userId !== authCtx.uid && !isCallerAdmin) {
      res.status(403).json({ error: "Forbidden: You do not own this order." });
      return;
    }
    if (order.paymentStatus === "refunded" || order.paymentStatus === "cancelled") {
      res.status(409).json({
        verified: false,
        error: `Order ${order.id} has status "${order.paymentStatus}" and cannot be fulfilled or reactivated.`,
        order
      });
      return;
    }
    if (order.paymentStatus === "paid" && order.entitlementsGranted) {
      const { entitlements } = await listUserOrdersAndEntitlementsFromSupabase(order.userId);
      res.json({
        verified: true,
        order,
        entitlements: entitlements.filter((e) => e.orderId === order.id),
        alreadyFulfilled: true
      });
      return;
    }
    if (!order.cashfreeOrderId) {
      res.status(400).json({
        verified: false,
        cashfreeOrderStatus: "MISSING_CF_ORDER_ID",
        error: `Order ${order.id} never received a Cashfree checkout session (cashfree_order_id is NULL). Please start a new checkout from your cart.`,
        order
      });
      return;
    }
    const verification = await verifyOrderWithCashfreeServer(order);
    if (verification.verifiedPaid) {
      try {
        const fulfilled = await fulfillPaidOrderAtomicallyInSupabase({
          orderId: order.id,
          cashfreeOrderId: verification.cashfreeOrderId,
          cashfreePaymentId: verification.cashfreePaymentId,
          verifiedAmountPaise: verification.verifiedAmountPaise,
          verifiedCurrency: verification.verifiedCurrency,
          onDecrementPhysicalStock: decrementPhysicalCatalogStock
        });
        res.json({
          verified: true,
          order: fulfilled.order,
          entitlements: fulfilled.entitlements,
          alreadyFulfilled: fulfilled.alreadyFulfilled
        });
        return;
      } catch (err) {
        res.status(503).json({
          verified: false,
          error: err instanceof Error ? err.message : "Failed to persist verified payment and entitlements in Supabase."
        });
        return;
      }
    }
    let updatedOrder = order;
    if (verification.cashfreeOrderStatus === "EXPIRED" || verification.cashfreeOrderStatus === "TERMINATED") {
      updatedOrder = await markOrderFailedOrCancelledInSupabase(order, "failed");
    } else if (verification.cashfreeOrderStatus === "USER_DROPPED") {
      updatedOrder = await markOrderFailedOrCancelledInSupabase(order, "cancelled");
    }
    res.status(402).json({
      verified: false,
      cashfreeOrderStatus: verification.cashfreeOrderStatus,
      error: verification.error || "Payment has not been verified as PAID by Cashfree yet. Purchased content remains locked.",
      order: updatedOrder
    });
  });
  app2.post(
    "/api/payments/cashfree/webhook",
    async (req, res) => {
      const cfConfig = getCashfreeConfig();
      if (!cfConfig.configured) {
        res.status(503).json({ error: "Cashfree webhook secret not configured." });
        return;
      }
      const signature = String(req.headers["x-webhook-signature"] || "");
      const timestamp = String(req.headers["x-webhook-timestamp"] || "");
      const rawBody = req.rawBody || "";
      if (!signature || !timestamp || !rawBody) {
        res.status(400).json({ error: "Missing Cashfree webhook signature headers." });
        return;
      }
      const expectedSignature = crypto.createHmac("sha256", cfConfig.secretKey).update(`${timestamp}${rawBody}`).digest("base64");
      if (signature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        res.status(401).json({ error: "Invalid Cashfree webhook signature." });
        return;
      }
      const orderId = String(req.body?.data?.order?.order_id || "").trim();
      if (!orderId) {
        res.status(400).json({ error: "Missing order_id in Cashfree webhook payload." });
        return;
      }
      let order;
      try {
        order = await getOrderFromSupabase(orderId);
      } catch (err) {
        res.status(503).json({
          error: err instanceof Error ? err.message : "Server-side Supabase credentials are required to process webhooks."
        });
        return;
      }
      if (!order) {
        res.status(404).json({ error: "Order not found in Supabase." });
        return;
      }
      if (order.paymentStatus === "refunded" || order.paymentStatus === "cancelled") {
        res.json({
          received: true,
          orderId: order.id,
          paymentStatus: order.paymentStatus,
          ignored: true
        });
        return;
      }
      const verification = await verifyOrderWithCashfreeServer(order);
      if (verification.verifiedPaid) {
        try {
          const fulfilled = await fulfillPaidOrderAtomicallyInSupabase({
            orderId: order.id,
            cashfreeOrderId: verification.cashfreeOrderId,
            cashfreePaymentId: verification.cashfreePaymentId,
            verifiedAmountPaise: verification.verifiedAmountPaise,
            verifiedCurrency: verification.verifiedCurrency,
            onDecrementPhysicalStock: decrementPhysicalCatalogStock
          });
          res.json({
            received: true,
            orderId: fulfilled.order.id,
            paymentStatus: fulfilled.order.paymentStatus,
            alreadyFulfilled: fulfilled.alreadyFulfilled
          });
          return;
        } catch (err) {
          res.status(503).json({
            error: err instanceof Error ? err.message : "Failed to fulfill verified webhook order in Supabase."
          });
          return;
        }
      }
      res.json({ received: true, orderId: order.id, paymentStatus: order.paymentStatus });
    }
  );
  app2.get("/api/user/library", async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!authCtx || !authCtx.uid) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    try {
      const { orders, entitlements } = await listUserOrdersAndEntitlementsFromSupabase(
        authCtx.uid
      );
      res.json({
        orders,
        entitlements
      });
    } catch (err) {
      res.status(503).json({
        error: err instanceof Error ? err.message : "Unable to load customer orders and entitlements from Supabase."
      });
    }
  });
  app2.post("/api/content/signed-url", async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    const { productId, lessonId } = req.body || {};
    const product = serverProducts.get(String(productId || ""));
    if (!product) {
      res.status(404).json({ error: "Product not found." });
      return;
    }
    let isFreePreview = false;
    let lessonObj;
    if (product.type === "course") {
      if (lessonId) {
        const candidate = serverLessons.get(String(lessonId));
        if (candidate && candidate.courseId === product.id) {
          lessonObj = candidate;
        }
      } else {
        const courseLessons = Array.from(serverLessons.values()).filter((l) => l.courseId === product.id).sort((a, b) => a.orderIndex - b.orderIndex);
        lessonObj = courseLessons[0];
      }
      if (!lessonObj) {
        res.status(404).json({ error: "Requested course lesson not found." });
        return;
      }
      isFreePreview = Boolean(lessonObj.isFreePreview);
    }
    const isAdminCaller = canUserPerformAdminOperation(authCtx);
    let userEntitledProductIds = [];
    if (!isFreePreview && !isAdminCaller) {
      if (!authCtx?.uid) {
        res.status(403).json({
          error: "Access denied. Please sign in and purchase this item to access its content.",
          reason: "unauthenticated"
        });
        return;
      }
      try {
        userEntitledProductIds = await listUserEntitledProductIdsFromSupabase(authCtx.uid);
      } catch (err) {
        res.status(503).json({
          error: err instanceof Error ? err.message : "Supabase entitlement verification is required to access paid content."
        });
        return;
      }
    }
    const accessCheck = canUserAccessProtectedContent({
      auth: authCtx,
      productId: product.id,
      isFreePreview,
      entitledProductIds: userEntitledProductIds
    });
    if (!accessCheck.allowed) {
      res.status(403).json({
        error: "Access denied. You must purchase this item to access its recordings or files.",
        reason: accessCheck.reason
      });
      return;
    }
    if (!isFreePreview && !getSupabaseServerConfig()) {
      res.status(503).json({
        error: "Server-side Supabase credentials (SUPABASE_URL and SUPABASE_SECRET_KEY) are required to issue signed URLs for paid content."
      });
      return;
    }
    const expiresAt = Date.now() + 15 * 60 * 1e3;
    const subjectUid = authCtx?.uid || "preview";
    if (product.type === "course" && lessonObj) {
      if (!lessonObj.isFreePreview) {
        const verifiedFilePath = resolveVerifiedProtectedFilePath(lessonObj.videoStoragePath);
        if (!verifiedFilePath) {
          res.status(500).json({
            error: "Course lesson does not have a valid private storage file path configured on the server."
          });
          return;
        }
      }
      const resolvedLessonId = lessonObj.id;
      const streamToken = createSignedDownloadToken(
        subjectUid,
        `${product.id}:${resolvedLessonId}`,
        expiresAt
      );
      res.json({
        allowed: true,
        reason: accessCheck.reason,
        bucket: lessonObj.isFreePreview ? "public" : SUPABASE_PROTECTED_MEDIA_BUCKET,
        expiresAt: new Date(expiresAt).toISOString(),
        signedUrl: `/api/content/stream-video?productId=${encodeURIComponent(
          product.id
        )}&lessonId=${encodeURIComponent(resolvedLessonId)}&token=${encodeURIComponent(
          streamToken
        )}`
      });
      return;
    }
    const downloadToken = createSignedDownloadToken(subjectUid, product.id, expiresAt);
    res.json({
      allowed: true,
      reason: accessCheck.reason,
      bucket: SUPABASE_PROTECTED_MEDIA_BUCKET,
      expiresAt: new Date(expiresAt).toISOString(),
      signedUrl: `/api/content/download-book?productId=${encodeURIComponent(
        product.id
      )}&token=${encodeURIComponent(downloadToken)}`
    });
  });
  app2.get("/api/content/stream-video", async (req, res) => {
    const productId = String(req.query.productId || "");
    const lessonId = String(req.query.lessonId || "");
    const token = String(req.query.token || "");
    const product = serverProducts.get(productId);
    if (!product || product.type !== "course") {
      res.status(404).send("Course not found.");
      return;
    }
    const lessonObj = serverLessons.get(lessonId);
    if (!lessonObj || lessonObj.courseId !== product.id) {
      res.status(404).send("Course lesson not found.");
      return;
    }
    const verification = verifySignedDownloadToken(token, `${productId}:${lessonId}`);
    if (!verification.valid || !verification.uid) {
      res.status(403).send("Forbidden: Valid signed video playback token required.");
      return;
    }
    if (lessonObj.isFreePreview) {
      const previewUrl = lessonObj.videoStoragePath.startsWith("http") ? lessonObj.videoStoragePath : product.previewVideoUrl || "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
      res.setHeader("Cache-Control", "private, no-store");
      res.redirect(302, previewUrl);
      return;
    }
    const isAdminUid = serverAdminUids.has(verification.uid);
    if (!isAdminUid) {
      try {
        const entitledIds = await listUserEntitledProductIdsFromSupabase(verification.uid);
        if (!entitledIds.includes(product.id)) {
          res.status(403).send("Forbidden: Your entitlement for this course is inactive or was refunded.");
          return;
        }
      } catch (err) {
        res.status(503).send(
          err instanceof Error ? err.message : "Supabase entitlement verification unavailable."
        );
        return;
      }
    }
    const verifiedObjectPath = resolveVerifiedProtectedFilePath(lessonObj.videoStoragePath);
    if (!verifiedObjectPath) {
      res.status(500).send("Invalid private storage file path configured for this lesson.");
      return;
    }
    if (!getSupabaseServerConfig()) {
      res.status(503).send(
        "Server-side Supabase credentials (SUPABASE_URL and SUPABASE_SECRET_KEY) are required to stream protected course videos."
      );
      return;
    }
    try {
      const supabaseSignedUrl = await createSupabaseSignedStorageUrl({
        bucketName: SUPABASE_PROTECTED_MEDIA_BUCKET,
        objectPath: verifiedObjectPath,
        expiresInSeconds: 900
      });
      res.setHeader("Cache-Control", "private, no-store");
      res.redirect(302, supabaseSignedUrl);
      return;
    } catch {
      const fallbackUrl = product.previewVideoUrl || "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
      res.setHeader("Cache-Control", "private, no-store");
      res.redirect(302, fallbackUrl);
    }
  });
  app2.get("/api/content/download-book", async (req, res) => {
    const productId = String(req.query.productId || "");
    const token = String(req.query.token || "");
    const product = serverProducts.get(productId);
    if (!product) {
      res.status(404).send("Book not found.");
      return;
    }
    const verification = verifySignedDownloadToken(token, product.id);
    if (!verification.valid || !verification.uid) {
      res.status(403).send("Forbidden: Valid signed download token required.");
      return;
    }
    let entitledDownloadPath = `protected/books/${product.id}/${product.id}.pdf`;
    const isAdminUid = serverAdminUids.has(verification.uid);
    if (!isAdminUid) {
      try {
        const { entitlements } = await listUserOrdersAndEntitlementsFromSupabase(
          verification.uid
        );
        const matchingEntitlement = entitlements.find((e) => e.productId === product.id);
        if (!matchingEntitlement) {
          res.status(403).send("Forbidden: Your entitlement for this book is inactive or was refunded.");
          return;
        }
        const validated = resolveVerifiedProtectedFilePath(matchingEntitlement.downloadPath);
        if (validated) {
          entitledDownloadPath = validated;
        }
      } catch (err) {
        res.status(503).send(
          err instanceof Error ? err.message : "Supabase entitlement verification unavailable."
        );
        return;
      }
    }
    if (getSupabaseServerConfig()) {
      try {
        const signedBookUrl = await createSupabaseSignedStorageUrl({
          bucketName: SUPABASE_PROTECTED_MEDIA_BUCKET,
          objectPath: entitledDownloadPath,
          expiresInSeconds: 900
        });
        res.setHeader("Cache-Control", "private, no-store");
        res.redirect(302, signedBookUrl);
        return;
      } catch {
      }
    }
    const content = [
      `====================================================================`,
      `SATYA'S EDUCATION \u2014 DIGITAL EDITION`,
      `====================================================================`,
      `Title: ${product.title}`,
      `Author / Publisher: ${product.authorOrInstructor}`,
      `Category: ${product.category}`,
      `Language: ${product.language}`,
      `Format: ${product.coverType}`,
      `Licensed To Student UID: ${verification.uid}`,
      `Private Storage Path: ${entitledDownloadPath}`,
      `Issued At: ${(/* @__PURE__ */ new Date()).toISOString()}`,
      `--------------------------------------------------------------------`,
      `SYNOPSIS & CHAPTER CONTENT:`,
      product.description,
      ``,
      `Notice: This digital edition is licensed for personal educational use.`,
      `====================================================================`
    ].join("\n");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${product.slug}-satya-education.txt"`
    );
    res.send(content);
  });
  app2.get("/api/admin/overview", async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!canUserPerformAdminOperation(authCtx)) {
      res.status(403).json({
        error: "Forbidden: Verified administrator privileges required."
      });
      return;
    }
    let allOrders = [];
    try {
      allOrders = await listAllOrdersFromSupabaseForAdmin();
    } catch {
      allOrders = [];
    }
    const paidOrders = allOrders.filter((o) => o.paymentStatus === "paid");
    const totalSalesInr = paidOrders.reduce((acc, o) => acc + o.totalAmountInr, 0);
    res.json({
      metrics: {
        totalSalesInr,
        paidOrdersCount: paidOrders.length,
        totalOrdersCount: allOrders.length,
        productsCount: serverProducts.size,
        coursesCount: Array.from(serverProducts.values()).filter((p) => p.type === "course").length,
        booksCount: Array.from(serverProducts.values()).filter((p) => p.type === "book").length,
        storybooksCount: Array.from(serverProducts.values()).filter((p) => p.type === "storybook").length
      },
      orders: allOrders,
      products: Array.from(serverProducts.values()),
      categories: Array.from(serverCategories.values()),
      lessons: Array.from(serverLessons.values()),
      banners: Array.from(serverBanners.values())
    });
  });
  app2.post("/api/admin/storage/signed-upload-url", async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!canUserPerformAdminOperation(authCtx)) {
      res.status(403).json({
        error: "Forbidden: Only verified administrators can upload protected course or book media."
      });
      return;
    }
    const { objectPath, fileSizeBytes } = req.body || {};
    const numericSize = Number(fileSizeBytes || 0);
    if (numericSize > SUPABASE_FREE_PLAN_MAX_FILE_BYTES) {
      res.status(413).json({
        error: `File size (${(numericSize / (1024 * 1024)).toFixed(
          1
        )} MB) exceeds the 50 MB Supabase Free plan limit. Please split the course recording into 15\u201325 minute lesson modules or HLS segments under 50 MB each.`
      });
      return;
    }
    try {
      const signedUpload = await createSupabaseSignedUploadUrlForAdmin({
        objectPath: String(objectPath || ""),
        fileSizeBytes: numericSize,
        bucketName: SUPABASE_PROTECTED_MEDIA_BUCKET
      });
      res.json(signedUpload);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Unable to create signed upload URL for protected-media bucket."
      });
    }
  });
  app2.post("/api/admin/action", async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!canUserPerformAdminOperation(authCtx)) {
      res.status(403).json({
        error: "Forbidden: Only verified administrators can perform catalog or order mutations."
      });
      return;
    }
    const { action, payload } = req.body || {};
    if (action === "upsert_product") {
      const prod = payload;
      if (!prod || !prod.id || !prod.title) {
        res.status(400).json({ error: "Invalid course payload." });
        return;
      }
      if (prod.type !== "course" || prod.format !== "recorded_course") {
        res.status(400).json({ error: "Only online recorded courses are supported in this catalog." });
        return;
      }
      if (typeof prod.priceInr !== "number" || !Number.isFinite(prod.priceInr) || prod.priceInr < MIN_COURSE_PRICE_INR) {
        res.status(400).json({
          error: `Course price must be at least \u20B9${MIN_COURSE_PRICE_INR.toLocaleString("en-IN")}.`
        });
        return;
      }
      serverProducts.set(prod.id, {
        ...prod,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      const existingCourse = serverCourses.get(prod.id);
      serverCourses.set(prod.id, {
        id: prod.id,
        productId: prod.id,
        title: prod.title,
        instructor: prod.authorOrInstructor,
        language: prod.language,
        level: prod.level,
        duration: prod.duration,
        introduction: existingCourse?.introduction || prod.description,
        syllabusSummary: existingCourse?.syllabusSummary || "Module 1: Core Foundations \xB7 Module 2: Practical Implementation",
        status: prod.status
      });
      res.json({ status: "ok", product: serverProducts.get(prod.id) });
      return;
    }
    if (action === "update_product_status") {
      const { productId, status, featured, stock, priceInr } = payload || {};
      const existing = serverProducts.get(String(productId || ""));
      if (!existing) {
        res.status(404).json({ error: "Course not found." });
        return;
      }
      if (status) existing.status = status;
      if (typeof featured === "boolean") existing.featured = featured;
      if (typeof stock === "number" && stock >= 0) existing.stock = stock;
      if (typeof priceInr === "number") {
        if (priceInr < MIN_COURSE_PRICE_INR) {
          res.status(400).json({
            error: `Course price must be at least \u20B9${MIN_COURSE_PRICE_INR.toLocaleString("en-IN")}.`
          });
          return;
        }
        existing.priceInr = priceInr;
      }
      existing.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      serverProducts.set(existing.id, existing);
      res.json({ status: "ok", product: existing });
      return;
    }
    if (action === "add_lesson") {
      const lesson = payload;
      if (!lesson || !lesson.id || !lesson.courseId || !lesson.title) {
        res.status(400).json({ error: "Invalid lesson payload." });
        return;
      }
      if (!lesson.isFreePreview) {
        const verifiedPath = resolveVerifiedProtectedFilePath(lesson.videoStoragePath);
        if (!verifiedPath) {
          res.status(400).json({
            error: "Paid course lessons must specify a valid file path inside protected/courses/<courseId>/<filename>.mp4."
          });
          return;
        }
        lesson.videoStoragePath = verifiedPath;
      }
      serverLessons.set(lesson.id, lesson);
      res.json({ status: "ok", lesson });
      return;
    }
    if (action === "add_category") {
      const cat = payload;
      if (!cat || !cat.id || !cat.name) {
        res.status(400).json({ error: "Invalid category payload." });
        return;
      }
      serverCategories.set(cat.id, cat);
      res.json({ status: "ok", category: cat });
      return;
    }
    if (action === "update_order") {
      const { orderId, shipmentStatus, paymentStatus } = payload || {};
      try {
        const updated = await updateOrderByAdminInSupabase({
          orderId: String(orderId || ""),
          shipmentStatus,
          paymentStatus
        });
        if (!updated) {
          res.status(404).json({ error: "Order not found in Supabase." });
          return;
        }
        res.json({ status: "ok", order: updated });
        return;
      } catch (err) {
        res.status(503).json({
          error: err instanceof Error ? err.message : "Server-side Supabase credentials required to update orders."
        });
        return;
      }
    }
    if (action === "upsert_banner") {
      const banner = payload;
      if (!banner || !banner.id || !banner.title) {
        res.status(400).json({ error: "Invalid banner payload." });
        return;
      }
      serverBanners.set(banner.id, banner);
      res.json({ status: "ok", banner });
      return;
    }
    res.status(400).json({ error: `Unknown admin action: ${String(action)}` });
  });
  return app2;
}

// scripts/build-api.ts
var app = createApiApp();
var build_api_default = app;
export {
  build_api_default as default
};
