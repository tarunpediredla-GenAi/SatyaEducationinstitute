// src/serverApp.ts
import express from "express";
import crypto2 from "node:crypto";
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

// src/utils/firestoreServerStore.ts
import crypto from "node:crypto";
var PROJECT_ID = (process.env.FIREBASE_PROJECT_ID || "").trim() || firebase_applet_config_default.projectId;
var DATABASE_ID = firebase_applet_config_default.firestoreDatabaseId || "(default)";
var FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
  PROJECT_ID
)}/databases/${encodeURIComponent(DATABASE_ID)}/documents`;
var FIRESTORE_DOC_PREFIX = `projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
var cachedServiceAccountToken = null;
function getServiceAccountCredentials() {
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || "").trim();
  const rawPrivateKey = (process.env.FIREBASE_PRIVATE_KEY || "").trim();
  if (!clientEmail || !rawPrivateKey) {
    return null;
  }
  return {
    clientEmail,
    privateKey: rawPrivateKey.replace(/\\n/g, "\n")
  };
}
async function getServiceAccountAccessToken() {
  const creds = getServiceAccountCredentials();
  if (!creds) {
    return null;
  }
  if (cachedServiceAccountToken && cachedServiceAccountToken.expiresAtMs > Date.now()) {
    return cachedServiceAccountToken.accessToken;
  }
  try {
    const nowSec = Math.floor(Date.now() / 1e3);
    const header = Buffer.from(
      JSON.stringify({ alg: "RS256", typ: "JWT" })
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        iss: creds.clientEmail,
        sub: creds.clientEmail,
        aud: "https://oauth2.googleapis.com/token",
        iat: nowSec,
        exp: nowSec + 3600,
        scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/devstorage.full_control"
      })
    ).toString("base64url");
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    signer.end();
    const signature = signer.sign(creds.privateKey, "base64url");
    const assertion = `${header}.${payload}.${signature}`;
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion
      }).toString()
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    if (!data.access_token) {
      return null;
    }
    cachedServiceAccountToken = {
      accessToken: data.access_token,
      expiresAtMs: Date.now() + Math.max(60, (data.expires_in || 3600) - 300) * 1e3
    };
    return data.access_token;
  } catch {
    return null;
  }
}
async function requireServiceAccountToken(operationName) {
  const saToken = await getServiceAccountAccessToken();
  if (!saToken) {
    throw new Error(
      `Privileged Firestore operation "${operationName}" failed securely: Server-side Firebase Service Account credentials (FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY) are not configured.`
    );
  }
  return saToken;
}
async function resolveCustomerScopedReadToken(verifiedCustomerIdToken) {
  const saToken = await getServiceAccountAccessToken();
  if (saToken) {
    return saToken;
  }
  if (verifiedCustomerIdToken && verifiedCustomerIdToken.trim()) {
    return verifiedCustomerIdToken.trim();
  }
  return null;
}
function createGcsV4SignedReadUrl(params) {
  const creds = getServiceAccountCredentials();
  if (!creds) {
    return null;
  }
  const { bucketName, objectPath, expiresInSeconds = 900 } = params;
  const now = /* @__PURE__ */ new Date();
  const isoBasic = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const datestamp = isoBasic.slice(0, 8);
  const credentialScope = `${datestamp}/auto/storage/goog4_request`;
  const credential = `${creds.clientEmail}/${credentialScope}`;
  const encodedObjectPath = objectPath.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  const canonicalUri = `/${encodeURIComponent(bucketName)}/${encodedObjectPath}`;
  const queryParams = {
    "X-Goog-Algorithm": "GOOG4-RSA-SHA256",
    "X-Goog-Credential": credential,
    "X-Goog-Date": isoBasic,
    "X-Goog-Expires": String(Math.min(Math.max(60, expiresInSeconds), 3600)),
    "X-Goog-SignedHeaders": "host"
  };
  const canonicalQueryString = Object.keys(queryParams).sort().map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`).join("&");
  const canonicalHeaders = "host:storage.googleapis.com\n";
  const signedHeaders = "host";
  const payloadHash = "UNSIGNED-PAYLOAD";
  const canonicalRequest = [
    "GET",
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");
  const canonicalRequestHash = crypto.createHash("sha256").update(canonicalRequest, "utf8").digest("hex");
  const stringToSign = [
    "GOOG4-RSA-SHA256",
    isoBasic,
    credentialScope,
    canonicalRequestHash
  ].join("\n");
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(stringToSign, "utf8");
  signer.end();
  const signatureHex = signer.sign(creds.privateKey, "hex");
  return `https://storage.googleapis.com${canonicalUri}?${canonicalQueryString}&X-Goog-Signature=${signatureHex}`;
}
async function revokeProtectedStorageDownloadTokens(bucketName) {
  const saToken = await requireServiceAccountToken("revokeProtectedStorageDownloadTokens");
  const listUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(
    bucketName
  )}/o?prefix=${encodeURIComponent("protected/")}&maxResults=500`;
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${saToken}` }
  });
  if (!listRes.ok) {
    throw new Error(`Failed to list protected objects in bucket (${listRes.status}).`);
  }
  const data = await listRes.json();
  const items = Array.isArray(data.items) ? data.items : [];
  let revokedCount = 0;
  for (const item of items) {
    const objectName = item.name;
    if (!objectName) continue;
    if (item.metadata && item.metadata.firebaseStorageDownloadTokens) {
      const nextMetadata = { ...item.metadata };
      delete nextMetadata.firebaseStorageDownloadTokens;
      const patchUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(
        bucketName
      )}/o/${encodeURIComponent(objectName)}`;
      const patchRes = await fetch(patchUrl, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${saToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          metadata: {
            ...nextMetadata,
            firebaseStorageDownloadTokens: null
          }
        })
      });
      if (patchRes.ok) {
        revokedCount += 1;
      }
    }
  }
  return { scannedCount: items.length, revokedCount };
}
function toFirestoreValue(val) {
  if (val === null || val === void 0) {
    return { nullValue: null };
  }
  if (typeof val === "boolean") {
    return { booleanValue: val };
  }
  if (typeof val === "number") {
    if (Number.isInteger(val)) {
      return { integerValue: String(val) };
    }
    return { doubleValue: val };
  }
  if (typeof val === "string") {
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map((item) => toFirestoreValue(item))
      }
    };
  }
  if (typeof val === "object") {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== void 0) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}
function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== void 0) {
      fields[k] = toFirestoreValue(v);
    }
  }
  return fields;
}
function fromFirestoreValue(val) {
  if (!val) return void 0;
  if ("stringValue" in val) return val.stringValue;
  if ("booleanValue" in val) return val.booleanValue;
  if ("integerValue" in val) return Number(val.integerValue);
  if ("doubleValue" in val) return Number(val.doubleValue);
  if ("nullValue" in val) return null;
  if ("arrayValue" in val) {
    return (val.arrayValue.values || []).map((v) => fromFirestoreValue(v));
  }
  if ("mapValue" in val) {
    const out = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      out[k] = fromFirestoreValue(v);
    }
    return out;
  }
  return void 0;
}
function parseOrderFromDoc(doc) {
  if (!doc || !doc.fields) return null;
  const f = doc.fields;
  const id = String(fromFirestoreValue(f.id) || "").trim();
  const userId = String(fromFirestoreValue(f.userId) || "").trim();
  if (!id || !userId) return null;
  const rawItems = fromFirestoreValue(f.lineItems);
  const lineItems = Array.isArray(rawItems) ? rawItems.map((item) => {
    const rec = item || {};
    return {
      productId: String(rec.productId || ""),
      title: String(rec.title || ""),
      type: rec.type === "book" || rec.type === "storybook" ? rec.type : "course",
      format: String(rec.format || "recorded_course"),
      quantity: Number(rec.quantity || 1),
      unitPriceInr: Number(rec.unitPriceInr || 0)
    };
  }) : [];
  return {
    id,
    userId,
    customerName: String(fromFirestoreValue(f.customerName) || "Student"),
    customerEmail: String(fromFirestoreValue(f.customerEmail) || ""),
    totalAmountInr: Number(fromFirestoreValue(f.totalAmountInr) || 0),
    paymentStatus: fromFirestoreValue(f.paymentStatus) || "pending",
    shipmentStatus: fromFirestoreValue(f.shipmentStatus) || "not_applicable",
    paymentReference: String(fromFirestoreValue(f.paymentReference) || ""),
    hasPhysicalItems: Boolean(fromFirestoreValue(f.hasPhysicalItems)),
    shippingAddressSummary: String(fromFirestoreValue(f.shippingAddressSummary) || ""),
    itemSummary: String(fromFirestoreValue(f.itemSummary) || ""),
    lineItems,
    entitlementsGranted: Boolean(fromFirestoreValue(f.entitlementsGranted)),
    createdAt: String(fromFirestoreValue(f.createdAt) || (/* @__PURE__ */ new Date()).toISOString()),
    updatedAt: String(fromFirestoreValue(f.updatedAt) || (/* @__PURE__ */ new Date()).toISOString())
  };
}
function parseEntitlementFromDoc(doc) {
  if (!doc || !doc.fields) return null;
  const f = doc.fields;
  const id = String(fromFirestoreValue(f.id) || "").trim();
  const userId = String(fromFirestoreValue(f.userId) || "").trim();
  const productId = String(fromFirestoreValue(f.productId) || "").trim();
  if (!id || !userId || !productId) return null;
  return {
    id,
    userId,
    productId,
    productType: fromFirestoreValue(f.productType) || "course",
    orderId: String(fromFirestoreValue(f.orderId) || ""),
    downloadPath: String(fromFirestoreValue(f.downloadPath) || ""),
    grantedAt: String(fromFirestoreValue(f.grantedAt) || (/* @__PURE__ */ new Date()).toISOString())
  };
}
async function createPendingOrderInFirestore(order) {
  const saToken = await requireServiceAccountToken("createPendingOrderInFirestore");
  const pendingOrder = {
    ...order,
    paymentStatus: "pending",
    paymentReference: "",
    entitlementsGranted: false
  };
  const res = await fetch(
    `${FIRESTORE_BASE_URL}/orders?documentId=${encodeURIComponent(pendingOrder.id)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${saToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fields: toFirestoreFields(pendingOrder)
      })
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Failed to persist pending order in Firestore (${res.status}): ${errText.slice(0, 240)}`
    );
  }
  const createdDoc = await res.json();
  return parseOrderFromDoc(createdDoc) || pendingOrder;
}
async function getOrderFromFirestore(orderId) {
  const saToken = await requireServiceAccountToken("getOrderFromFirestore");
  const res = await fetch(`${FIRESTORE_BASE_URL}/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${saToken}`
    }
  });
  if (res.status === 404 || !res.ok) {
    return null;
  }
  const doc = await res.json();
  const order = parseOrderFromDoc(doc);
  if (!order) return null;
  return {
    order,
    updateTime: doc.updateTime
  };
}
async function fulfillPaidOrderAtomicallyInFirestore(params) {
  const { orderId, paymentReference, onDecrementPhysicalStock } = params;
  const saToken = await requireServiceAccountToken("fulfillPaidOrderAtomicallyInFirestore");
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await getOrderFromFirestore(orderId);
    if (!existing) {
      throw new Error(`Order ${orderId} not found in Firestore.`);
    }
    const { order, updateTime } = existing;
    if (order.paymentStatus === "paid" && order.entitlementsGranted) {
      const existingEntitlements = await listEntitlementsByOrderFromFirestore(
        order.userId,
        order.id,
        saToken
      );
      return {
        order,
        entitlements: existingEntitlements,
        alreadyFulfilled: true
      };
    }
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const updatedOrder = {
      ...order,
      paymentStatus: "paid",
      paymentReference: paymentReference || order.paymentReference || `CF_${order.id}`,
      entitlementsGranted: true,
      updatedAt: nowIso
    };
    const entitlementsToGrant = [];
    for (const item of order.lineItems) {
      if (item.format === "recorded_course" || item.format === "digital_book" || item.format === "hybrid_book") {
        const entitlementId = `${order.userId}_${item.productId}`;
        entitlementsToGrant.push({
          id: entitlementId,
          userId: order.userId,
          productId: item.productId,
          productType: item.type,
          orderId: order.id,
          downloadPath: item.type === "course" ? `protected/courses/${item.productId}` : `protected/books/${item.productId}/${item.productId}.pdf`,
          grantedAt: nowIso
        });
      }
    }
    const writes = [
      // 1. Order document transition to 'paid' with optimistic concurrency lock on updateTime
      {
        update: {
          name: `${FIRESTORE_DOC_PREFIX}/orders/${order.id}`,
          fields: toFirestoreFields(updatedOrder)
        },
        ...updateTime ? { currentDocument: { updateTime } } : {}
      },
      // 2. Deterministic entitlement documents ({userId}_{productId})
      ...entitlementsToGrant.map((ent) => ({
        update: {
          name: `${FIRESTORE_DOC_PREFIX}/entitlements/${ent.id}`,
          fields: toFirestoreFields(ent)
        }
      }))
    ];
    const commitRes = await fetch(`${FIRESTORE_BASE_URL}:commit`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${saToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ writes })
    });
    if (commitRes.ok) {
      if (onDecrementPhysicalStock) {
        for (const item of order.lineItems) {
          if (item.format === "physical_book" || item.format === "hybrid_book") {
            onDecrementPhysicalStock(item.productId, item.quantity);
          }
        }
      }
      return {
        order: updatedOrder,
        entitlements: entitlementsToGrant,
        alreadyFulfilled: false
      };
    }
    if (commitRes.status === 400 || commitRes.status === 409) {
      continue;
    }
    const errText = await commitRes.text();
    throw new Error(
      `Failed to commit verified order fulfillment to Firestore (${commitRes.status}): ${errText.slice(0, 240)}`
    );
  }
  throw new Error(`Concurrent modification conflict fulfilling order ${orderId}.`);
}
async function markOrderFailedInFirestore(order) {
  if (order.paymentStatus !== "pending") {
    return order;
  }
  const saToken = await requireServiceAccountToken("markOrderFailedInFirestore");
  const updatedOrder = {
    ...order,
    paymentStatus: "failed",
    entitlementsGranted: false,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const res = await fetch(`${FIRESTORE_BASE_URL}/orders/${encodeURIComponent(order.id)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${saToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      fields: toFirestoreFields(updatedOrder)
    })
  });
  if (!res.ok) {
    return order;
  }
  return updatedOrder;
}
async function updateOrderByAdminInFirestore(params) {
  const { orderId, shipmentStatus, paymentStatus, onDecrementPhysicalStock } = params;
  const saToken = await requireServiceAccountToken("updateOrderByAdminInFirestore");
  const existing = await getOrderFromFirestore(orderId);
  if (!existing) return null;
  let currentOrder = existing.order;
  if (paymentStatus === "paid" && currentOrder.paymentStatus !== "paid") {
    const fulfilled = await fulfillPaidOrderAtomicallyInFirestore({
      orderId,
      paymentReference: currentOrder.paymentReference || `ADMIN_VERIFIED_${orderId}`,
      onDecrementPhysicalStock
    });
    currentOrder = fulfilled.order;
  }
  const updatedOrder = {
    ...currentOrder,
    shipmentStatus: shipmentStatus || currentOrder.shipmentStatus,
    paymentStatus: paymentStatus || currentOrder.paymentStatus,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const res = await fetch(`${FIRESTORE_BASE_URL}/orders/${encodeURIComponent(orderId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${saToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      fields: toFirestoreFields(updatedOrder)
    })
  });
  if (!res.ok) {
    return currentOrder;
  }
  const doc = await res.json();
  return parseOrderFromDoc(doc) || updatedOrder;
}
async function runStructuredQueryByField(params) {
  const { collectionId, fieldPath, stringValue, bearerToken } = params;
  const res = await fetch(`${FIRESTORE_BASE_URL}:runQuery`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: {
          fieldFilter: {
            field: { fieldPath },
            op: "EQUAL",
            value: { stringValue }
          }
        }
      }
    })
  });
  if (!res.ok) {
    return [];
  }
  const rows = await res.json();
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => r.document).filter((d) => Boolean(d && d.fields));
}
async function listEntitlementsByOrderFromFirestore(userId, orderId, bearerToken) {
  const docs = await runStructuredQueryByField({
    collectionId: "entitlements",
    fieldPath: "userId",
    stringValue: userId,
    bearerToken
  });
  return docs.map((d) => parseEntitlementFromDoc(d)).filter((e) => Boolean(e && e.orderId === orderId));
}
async function listUserOrdersAndEntitlementsFromFirestore(userId, userIdToken) {
  const bearerToken = await resolveCustomerScopedReadToken(userIdToken);
  if (!bearerToken) {
    return { orders: [], entitlements: [] };
  }
  const [orderDocs, entitlementDocs] = await Promise.all([
    runStructuredQueryByField({
      collectionId: "orders",
      fieldPath: "userId",
      stringValue: userId,
      bearerToken
    }),
    runStructuredQueryByField({
      collectionId: "entitlements",
      fieldPath: "userId",
      stringValue: userId,
      bearerToken
    })
  ]);
  const orders = orderDocs.map((d) => parseOrderFromDoc(d)).filter((o) => Boolean(o && o.userId === userId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const entitlements = entitlementDocs.map((d) => parseEntitlementFromDoc(d)).filter((e) => Boolean(e && e.userId === userId));
  return { orders, entitlements };
}
async function listUserEntitledProductIdsFromFirestore(userId, userIdToken) {
  const bearerToken = await resolveCustomerScopedReadToken(userIdToken);
  if (!bearerToken) return [];
  const entitlementDocs = await runStructuredQueryByField({
    collectionId: "entitlements",
    fieldPath: "userId",
    stringValue: userId,
    bearerToken
  });
  return entitlementDocs.map((d) => parseEntitlementFromDoc(d)).filter((e) => Boolean(e && e.userId === userId)).map((e) => e.productId);
}
async function listAllOrdersFromFirestoreForAdmin() {
  const saToken = await requireServiceAccountToken("listAllOrdersFromFirestoreForAdmin");
  const res = await fetch(`${FIRESTORE_BASE_URL}/orders?pageSize=200`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${saToken}`
    }
  });
  if (!res.ok) {
    return [];
  }
  const data = await res.json();
  const docs = Array.isArray(data.documents) ? data.documents : [];
  return docs.map((d) => parseOrderFromDoc(d)).filter((o) => Boolean(o)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
  { id: "cat-agentic-ai", name: "Agentic AI", slug: "agentic-ai", description: "Multi-step tool-calling agents, memory architectures, and evaluation.", group: "technology", active: true },
  { id: "cat-eng-books", name: "Engineering Textbooks", slug: "engineering-textbooks", description: "Reference handbooks and practical guides for software engineers.", group: "books", active: true },
  { id: "cat-storybooks", name: "Children\u2019s Storybooks", slug: "childrens-storybooks", description: "Illustrated STEM, logic, and curiosity storybooks for young readers.", group: "storybooks", active: true }
];
var INITIAL_BANNERS = [
  {
    id: "banner-launch-offer",
    title: "Academic Offer: Save 20% on Courses & Technical Books",
    subtitle: "Apply code SATYA20 at checkout. Free shipping across India on physical book orders \u20B9999 and above.",
    ctaText: "Explore Catalog",
    ctaLink: "catalog",
    couponCode: "SATYA20",
    discountPercent: 20,
    active: true
  }
];
var INITIAL_PRODUCTS = [
  {
    id: "course-python-mastery",
    title: "Complete Python 3.12 & Backend Engineering Mastery",
    slug: "complete-python-backend-mastery",
    type: "course",
    category: "Python",
    priceInr: 1499,
    originalPriceInr: 2499,
    language: "English & Telugu",
    format: "recorded_course",
    stock: 9999,
    featured: true,
    status: "published",
    authorOrInstructor: "Satya Narayana",
    shortDescription: "Comprehensive self-paced recorded course covering Python fundamentals, object-oriented design, async I/O, and automated testing.",
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
    priceInr: 1899,
    originalPriceInr: 2999,
    language: "English",
    format: "recorded_course",
    stock: 9999,
    featured: true,
    status: "published",
    authorOrInstructor: "Satya Narayana",
    shortDescription: "Comprehensive recorded course on Django ORM, authentication, API security, and cloud deployment.",
    description: "Learn how to architect secure, maintainable Django web applications and RESTful backends. Includes dedicated modules on token authentication, role-based access control, and relational schema design.",
    coverType: "HD Recorded Course (5 Modules)",
    level: "Intermediate",
    duration: "28 Hours",
    previewVideoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4"
  },
  {
    id: "course-react-typescript",
    title: "Modern React 19, TypeScript & Tailwind CSS Workshop",
    slug: "modern-react-typescript-tailwind",
    type: "course",
    category: "React",
    priceInr: 1299,
    originalPriceInr: 1999,
    language: "English",
    format: "recorded_course",
    stock: 9999,
    featured: false,
    status: "published",
    authorOrInstructor: "Satya Narayana",
    shortDescription: "Comprehensive course on accessible component systems, responsive design with Tailwind CSS, and state management.",
    description: "Master component composition, accessible forms, custom hooks, and responsive design patterns that work seamlessly across mobile phones, tablets, and desktops.",
    coverType: "HD Recorded Course (4 Modules)",
    level: "Intermediate",
    duration: "22 Hours",
    previewVideoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
  },
  {
    id: "course-agentic-ai",
    title: "Building GenAI & Agentic AI Workflows with Python",
    slug: "building-genai-agentic-ai-workflows",
    type: "course",
    category: "Agentic AI",
    priceInr: 2199,
    originalPriceInr: 3499,
    language: "English",
    format: "recorded_course",
    stock: 9999,
    featured: true,
    status: "published",
    authorOrInstructor: "Satya Narayana",
    shortDescription: "Comprehensive course covering tool-calling agents, structured outputs, retrieval-augmented generation, and safety guardrails.",
    description: "Explore the engineering foundations of Generative AI and multi-step Agentic workflows. Covers deterministic evaluation, prompt architecture, and reliable API orchestration.",
    coverType: "HD Recorded Course (5 Modules)",
    level: "Advanced",
    duration: "24 Hours",
    previewVideoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4"
  },
  {
    id: "course-aws-devops",
    title: "AWS Cloud & DevOps CI/CD Foundations",
    slug: "aws-cloud-devops-cicd-foundations",
    type: "course",
    category: "AWS",
    priceInr: 1599,
    originalPriceInr: 2499,
    language: "English",
    format: "recorded_course",
    stock: 9999,
    featured: false,
    status: "published",
    authorOrInstructor: "Satya Narayana",
    shortDescription: "Industry-ready recorded training on Linux, Docker containers, GitHub Actions, and AWS core infrastructure.",
    description: "Understand containerization, automated testing pipelines, least-privilege IAM roles, and zero-downtime deployment workflows.",
    coverType: "HD Recorded Course (4 Modules)",
    level: "Beginner to Intermediate",
    duration: "20 Hours",
    previewVideoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4"
  },
  {
    id: "book-python-handbook-digital",
    title: "The Practical Python & SQL Engineering Handbook (Digital PDF)",
    slug: "practical-python-sql-handbook-digital",
    type: "book",
    category: "Python",
    priceInr: 499,
    originalPriceInr: 799,
    language: "English",
    format: "digital_book",
    stock: 9999,
    featured: true,
    status: "published",
    authorOrInstructor: "Satya Narayana",
    shortDescription: "Authoritative downloadable digital textbook covering clean Python idioms, SQL indexing strategies, and debugging.",
    description: "Delivered as a digital PDF download upon purchase. Includes 320 pages of annotated code examples, query execution diagrams, and exercises.",
    coverType: "Digital PDF (320 Pages)",
    level: "All Levels",
    duration: "320 Pages",
    previewVideoUrl: ""
  },
  {
    id: "book-django-architecture-print",
    title: "Full-Stack Web Architecture with Django & React (Physical Hardcover)",
    slug: "fullstack-django-react-hardcover",
    type: "book",
    category: "Django",
    priceInr: 899,
    originalPriceInr: 1299,
    language: "English",
    format: "physical_book",
    stock: 18,
    featured: true,
    status: "published",
    authorOrInstructor: "Satya Narayana",
    shortDescription: "Authoritative physical hardcover edition shipped to your doorstep. Covers API security, database modeling, and full-stack architecture.",
    description: "Printed on archival-grade paper with sewn hardcover binding. Requires a valid Indian delivery address at checkout and includes shipment status tracking in your dashboard.",
    coverType: "Physical Hardcover (410 Pages)",
    level: "Intermediate",
    duration: "410 Pages",
    previewVideoUrl: ""
  },
  {
    id: "book-genai-systems-hybrid",
    title: "Applied GenAI & Agentic Engineering (Print + Digital Bundle)",
    slug: "applied-genai-agentic-engineering-bundle",
    type: "book",
    category: "GenAI",
    priceInr: 1149,
    originalPriceInr: 1599,
    language: "English",
    format: "hybrid_book",
    stock: 12,
    featured: false,
    status: "published",
    authorOrInstructor: "Satya Narayana",
    shortDescription: "Comprehensive hybrid edition including instant digital PDF access plus a physical hardcover copy shipped to your address.",
    description: "Combines immediate digital reading in your My Books library with a physical desk reference shipped via tracked courier.",
    coverType: "Print Hardcover + Digital PDF",
    level: "Intermediate to Advanced",
    duration: "360 Pages",
    previewVideoUrl: ""
  },
  {
    id: "storybook-tara-algorithm-lantern",
    title: "Tara and the Clockwork Lantern of Logic (Digital Illustrated)",
    slug: "tara-and-the-clockwork-lantern",
    type: "storybook",
    category: "HTML",
    priceInr: 299,
    originalPriceInr: 499,
    language: "English & Telugu",
    format: "digital_book",
    stock: 9999,
    featured: true,
    status: "published",
    authorOrInstructor: "Satya\u2019s Publishing Studio",
    shortDescription: "Inspiring illustrated children\u2019s storybook introducing step-by-step problem solving and curiosity for ages 7\u201312.",
    description: "Follow young inventor Tara as she repairs her village observatory using sequences, loops, and pattern recognition. Illustrated digital edition with bilingual vocabulary notes.",
    coverType: "Illustrated Digital Storybook (64 Pages)",
    level: "Ages 7\u201312",
    duration: "64 Pages",
    previewVideoUrl: ""
  },
  {
    id: "storybook-arjun-starlight-bridge",
    title: "Arjun\u2019s Starlight Bridge & The Curious Compass (Hardcover)",
    slug: "arjuns-starlight-bridge-hardcover",
    type: "storybook",
    category: "JavaScript",
    priceInr: 549,
    originalPriceInr: 749,
    language: "English",
    format: "physical_book",
    stock: 25,
    featured: true,
    status: "published",
    authorOrInstructor: "Satya\u2019s Publishing Studio",
    shortDescription: "Deluxe physical hardcover storybook celebrating teamwork, astronomy, and logical thinking for young readers.",
    description: "A durable full-color hardcover storybook designed for family reading and school libraries. Ships across India with full order tracking.",
    coverType: "Hardcover Illustrated (72 Pages)",
    level: "Ages 6\u201311",
    duration: "72 Pages",
    previewVideoUrl: ""
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
    duration: "24 Hours",
    introduction: "Learn how modern AI engineers design deterministic tool-calling pipelines, structured schemas, and evaluation harnesses.",
    syllabusSummary: "Module 1: Structured Generation & Schemas \xB7 Module 2: Retrieval & Vector Indexing \xB7 Module 3: Tool-Calling Agent Loops \xB7 Module 4: Safety, Guardrails & Testing.",
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
var legacyStorageTokensRevoked = false;
var verifiedTokenCache = /* @__PURE__ */ new Map();
function getDownloadSigningSecret() {
  const configuredSecret = (process.env.FIREBASE_PRIVATE_KEY || "").trim() || (process.env.CASHFREE_SECRET_KEY || "").trim();
  if (configuredSecret) {
    return configuredSecret;
  }
  return `satya-preview-hmac-${firebase_applet_config_default.projectId}-${firebase_applet_config_default.appId}`;
}
function getCashfreeConfig() {
  const appId = (process.env.CASHFREE_APP_ID || "").trim();
  const secretKey = (process.env.CASHFREE_SECRET_KEY || "").trim();
  const rawEnv = (process.env.CASHFREE_ENV || "PRODUCTION").trim().toUpperCase();
  const isSandbox = rawEnv === "SANDBOX" || rawEnv === "TEST";
  const apiVersion = (process.env.CASHFREE_API_VERSION || "2023-08-01").trim();
  const baseUrl = isSandbox ? "https://sandbox.cashfree.com/pg" : "https://api.cashfree.com/pg";
  return {
    appId,
    secretKey,
    apiVersion,
    baseUrl,
    mode: isSandbox ? "sandbox" : "production",
    configured: Boolean(appId && secretKey)
  };
}
function createSignedDownloadToken(uid, resourceIdentifier, expiresAtMs) {
  const payload = `${uid}|${resourceIdentifier}|${expiresAtMs}`;
  const sig = crypto2.createHmac("sha256", getDownloadSigningSecret()).update(payload).digest("hex");
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
    const expectedSig = crypto2.createHmac("sha256", getDownloadSigningSecret()).update(`${uid}|${resourceId}|${expStr}`).digest("hex");
    if (providedSig.length !== expectedSig.length || !crypto2.timingSafeEqual(Buffer.from(providedSig), Buffer.from(expectedSig))) {
      return { valid: false };
    }
    return { valid: true, uid };
  } catch {
    return { valid: false };
  }
}
function extractProtectedStorageObjectPath(pathOrUrl) {
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("protected/") || trimmed.startsWith("public/")) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.includes("firebasestorage.googleapis.com")) {
      const match = parsed.pathname.match(/\/o\/(.+)$/);
      if (match?.[1]) {
        return decodeURIComponent(match[1]);
      }
    }
  } catch {
  }
  return null;
}
async function ensureLegacyProtectedStorageTokensRevoked() {
  if (legacyStorageTokensRevoked || !firebase_applet_config_default.storageBucket) return;
  try {
    await revokeProtectedStorageDownloadTokens(firebase_applet_config_default.storageBucket);
    legacyStorageTokensRevoked = true;
  } catch {
  }
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
      paymentReference: "",
      error: "Cashfree payment gateway credentials (CASHFREE_APP_ID and CASHFREE_SECRET_KEY) are not configured on the server."
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
      paymentReference: "",
      error: `Cashfree order verification request failed (${cfRes.status}): ${errBody.slice(0, 200)}`
    };
  }
  const cfOrder = await cfRes.json();
  const cfStatus = String(cfOrder.order_status || "ACTIVE").toUpperCase();
  const amountMatches = typeof cfOrder.order_amount === "number" && Math.abs(cfOrder.order_amount - order.totalAmountInr) < 0.01;
  const currencyMatches = String(cfOrder.order_currency || "INR").toUpperCase() === "INR";
  if (cfStatus === "PAID" && amountMatches && currencyMatches) {
    let paymentRef = String(cfOrder.cf_order_id || `CF_${order.id}`);
    try {
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
      if (paymentsRes.ok) {
        const paymentsList = await paymentsRes.json();
        const successPayment = Array.isArray(paymentsList) ? paymentsList.find((p) => String(p.payment_status).toUpperCase() === "SUCCESS") : void 0;
        if (successPayment?.cf_payment_id) {
          paymentRef = `CF_PAY_${successPayment.cf_payment_id}`;
        }
      }
    } catch {
    }
    return {
      verifiedPaid: true,
      cashfreeOrderStatus: "PAID",
      paymentReference: paymentRef
    };
  }
  return {
    verifiedPaid: false,
    cashfreeOrderStatus: cfStatus,
    paymentReference: "",
    error: cfStatus === "PAID" && (!amountMatches || !currencyMatches) ? "Cashfree order amount or currency mismatch." : `Payment is not completed yet (Cashfree status: ${cfStatus}).`
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
        error: "Authentication required. Please log in with your account before checking out."
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
      res.status(400).json({ error: verifiedCart.error || "Cart validation failed." });
      return;
    }
    const orderId = `ORD_${Date.now().toString().slice(-6)}_${crypto2.randomBytes(3).toString("hex").toUpperCase()}`;
    const addressSummary = verifiedCart.hasPhysicalItems ? `${shippingAddress.fullName || customerName || "Customer"}, ${shippingAddress.line1}, ${shippingAddress.city}, ${shippingAddress.state || ""} - ${shippingAddress.postalCode} (${shippingAddress.phone || customerPhone || ""})` : "Digital Delivery (My Courses & My Books Library)";
    const itemSummary = verifiedCart.items.map((i) => `${i.title} x${i.quantity} (\u20B9${i.lineTotalInr})`).join(" \xB7 ");
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const draftOrder = {
      id: orderId,
      userId: authCtx.uid,
      customerName: String(customerName || authCtx.email || "Student").slice(0, 120),
      customerEmail: String(authCtx.email || "student@example.com").slice(0, 256),
      totalAmountInr: verifiedCart.totalAmountInr,
      paymentStatus: "pending",
      shipmentStatus: verifiedCart.hasPhysicalItems ? "processing" : "not_applicable",
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
      pendingOrder = await createPendingOrderInFirestore(draftOrder);
    } catch (err) {
      res.status(503).json({
        error: err instanceof Error ? err.message : "Unable to save pending order in Firestore."
      });
      return;
    }
    const cfConfig = getCashfreeConfig();
    if (!cfConfig.configured) {
      res.status(503).json({
        error: 'Cashfree payment gateway credentials (CASHFREE_APP_ID and CASHFREE_SECRET_KEY) are not configured on the server. Order has been saved in Firestore with status "pending" and will not be marked paid until verified with Cashfree.',
        order: pendingOrder
      });
      return;
    }
    const sanitizedPhone = String(shippingAddress?.phone || customerPhone || "9876543210").replace(/[^0-9]/g, "").slice(-10) || "9876543210";
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
          order_amount: pendingOrder.totalAmountInr,
          order_currency: "INR",
          customer_details: {
            customer_id: authCtx.uid.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48),
            customer_name: pendingOrder.customerName,
            customer_email: pendingOrder.customerEmail,
            customer_phone: sanitizedPhone.length === 10 ? sanitizedPhone : "9876543210"
          },
          order_meta: {
            return_url: typeof returnUrl === "string" && returnUrl.startsWith("http") ? returnUrl : void 0
          },
          order_note: pendingOrder.itemSummary.slice(0, 200)
        })
      });
      const cfData = await cfCreateRes.json();
      if (!cfCreateRes.ok || !cfData.payment_session_id) {
        res.status(502).json({
          error: cfData.message || "Failed to initialize payment session with Cashfree Payment Gateway.",
          order: pendingOrder
        });
        return;
      }
      res.json({
        order: pendingOrder,
        paymentSessionId: cfData.payment_session_id,
        cashfreeMode: cfConfig.mode
      });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? `Cashfree connection error: ${err.message}` : "Unable to reach Cashfree Payment Gateway.",
        order: pendingOrder
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
    let fetched;
    try {
      fetched = await getOrderFromFirestore(orderId);
    } catch (err) {
      res.status(503).json({
        verified: false,
        error: err instanceof Error ? err.message : "Privileged Firestore credentials are required to verify orders."
      });
      return;
    }
    if (!fetched) {
      res.status(404).json({ error: "Order not found in Firestore." });
      return;
    }
    const { order } = fetched;
    const isCallerAdmin = canUserPerformAdminOperation(authCtx);
    if (order.userId !== authCtx.uid && !isCallerAdmin) {
      res.status(403).json({ error: "Forbidden: You do not own this order." });
      return;
    }
    if (order.paymentStatus === "paid" && order.entitlementsGranted) {
      const { entitlements } = await listUserOrdersAndEntitlementsFromFirestore(
        order.userId,
        authCtx.idToken
      );
      res.json({
        verified: true,
        order,
        entitlements: entitlements.filter((e) => e.orderId === order.id),
        alreadyFulfilled: true
      });
      return;
    }
    const verification = await verifyOrderWithCashfreeServer(order);
    if (verification.verifiedPaid) {
      try {
        const fulfilled = await fulfillPaidOrderAtomicallyInFirestore({
          orderId: order.id,
          paymentReference: verification.paymentReference,
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
          error: err instanceof Error ? err.message : "Failed to persist verified payment and entitlements in Firestore."
        });
        return;
      }
    }
    let updatedOrder = order;
    if (verification.cashfreeOrderStatus === "EXPIRED" || verification.cashfreeOrderStatus === "TERMINATED") {
      updatedOrder = await markOrderFailedInFirestore(order);
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
      const expectedSignature = crypto2.createHmac("sha256", cfConfig.secretKey).update(`${timestamp}${rawBody}`).digest("base64");
      if (signature.length !== expectedSignature.length || !crypto2.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        res.status(401).json({ error: "Invalid Cashfree webhook signature." });
        return;
      }
      const orderId = String(req.body?.data?.order?.order_id || "").trim();
      let fetched;
      try {
        fetched = await getOrderFromFirestore(orderId);
      } catch (err) {
        res.status(503).json({
          error: err instanceof Error ? err.message : "Firebase Service Account credentials are required to process webhooks."
        });
        return;
      }
      if (!fetched) {
        res.status(404).json({ error: "Order not found in Firestore." });
        return;
      }
      const { order } = fetched;
      const verification = await verifyOrderWithCashfreeServer(order);
      if (verification.verifiedPaid) {
        const fulfilled = await fulfillPaidOrderAtomicallyInFirestore({
          orderId: order.id,
          paymentReference: verification.paymentReference,
          onDecrementPhysicalStock: decrementPhysicalCatalogStock
        });
        res.json({
          received: true,
          orderId: fulfilled.order.id,
          paymentStatus: fulfilled.order.paymentStatus,
          alreadyFulfilled: fulfilled.alreadyFulfilled
        });
        return;
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
    const { orders, entitlements } = await listUserOrdersAndEntitlementsFromFirestore(
      authCtx.uid,
      authCtx.idToken
    );
    res.json({
      orders,
      entitlements
    });
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
    if (lessonId) {
      lessonObj = serverLessons.get(String(lessonId));
      if (lessonObj && lessonObj.isFreePreview) {
        isFreePreview = true;
      }
    } else if (product.type === "course") {
      const courseLessons = Array.from(serverLessons.values()).filter((l) => l.courseId === product.id).sort((a, b) => a.orderIndex - b.orderIndex);
      lessonObj = courseLessons[0];
      if (lessonObj && lessonObj.isFreePreview) {
        isFreePreview = true;
      }
    }
    const userEntitledProductIds = authCtx?.uid ? await listUserEntitledProductIdsFromFirestore(authCtx.uid, authCtx.idToken) : [];
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
    const expiresAt = Date.now() + 15 * 60 * 1e3;
    const subjectUid = authCtx?.uid || "preview";
    if (product.type === "course") {
      const resolvedLessonId = lessonObj?.id || "default";
      const streamToken = createSignedDownloadToken(
        subjectUid,
        `${product.id}:${resolvedLessonId}`,
        expiresAt
      );
      res.json({
        allowed: true,
        reason: accessCheck.reason,
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
    const verification = verifySignedDownloadToken(token, `${productId}:${lessonId}`);
    if (!verification.valid || !verification.uid) {
      res.status(403).send("Forbidden: Valid signed video playback token required.");
      return;
    }
    const lessonObj = serverLessons.get(lessonId);
    const rawSource = lessonObj?.videoStoragePath || product.previewVideoUrl || "";
    const storageObjPath = extractProtectedStorageObjectPath(rawSource);
    if (storageObjPath && firebase_applet_config_default.storageBucket) {
      await ensureLegacyProtectedStorageTokensRevoked();
      const gcsSignedUrl = createGcsV4SignedReadUrl({
        bucketName: firebase_applet_config_default.storageBucket,
        objectPath: storageObjPath,
        expiresInSeconds: 900
      });
      if (gcsSignedUrl) {
        res.setHeader("Cache-Control", "private, no-store");
        res.redirect(302, gcsSignedUrl);
        return;
      }
      if (!lessonObj?.isFreePreview) {
        res.status(503).send(
          "Service Account credentials (FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY) are required to sign protected course video streams."
        );
        return;
      }
    }
    const fallbackVideoUrl = rawSource.startsWith("http") && !rawSource.includes("firebasestorage.googleapis.com") ? rawSource : product.previewVideoUrl || "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
    res.setHeader("Cache-Control", "private, no-store");
    res.redirect(302, fallbackVideoUrl);
  });
  app2.get("/api/content/download-book", (req, res) => {
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
    await ensureLegacyProtectedStorageTokensRevoked();
    let allOrders = [];
    try {
      allOrders = await listAllOrdersFromFirestoreForAdmin();
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
  app2.post("/api/admin/action", async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!canUserPerformAdminOperation(authCtx)) {
      res.status(403).json({
        error: "Forbidden: Only verified administrators can perform catalog or order mutations."
      });
      return;
    }
    const { action, payload } = req.body || {};
    if (action === "revoke_protected_storage_tokens") {
      try {
        const result = await revokeProtectedStorageDownloadTokens(
          firebase_applet_config_default.storageBucket
        );
        legacyStorageTokensRevoked = true;
        res.json({ status: "ok", ...result });
        return;
      } catch (err) {
        res.status(503).json({
          error: err instanceof Error ? err.message : "Unable to revoke protected storage tokens."
        });
        return;
      }
    }
    if (action === "upsert_product") {
      const prod = payload;
      if (!prod || !prod.id || !prod.title || prod.priceInr < 0) {
        res.status(400).json({ error: "Invalid product payload." });
        return;
      }
      serverProducts.set(prod.id, {
        ...prod,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      if (prod.type === "course") {
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
      }
      res.json({ status: "ok", product: serverProducts.get(prod.id) });
      return;
    }
    if (action === "update_product_status") {
      const { productId, status, featured, stock, priceInr } = payload || {};
      const existing = serverProducts.get(String(productId || ""));
      if (!existing) {
        res.status(404).json({ error: "Product not found." });
        return;
      }
      if (status) existing.status = status;
      if (typeof featured === "boolean") existing.featured = featured;
      if (typeof stock === "number" && stock >= 0) existing.stock = stock;
      if (typeof priceInr === "number" && priceInr >= 0) existing.priceInr = priceInr;
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
        const updated = await updateOrderByAdminInFirestore({
          orderId: String(orderId || ""),
          shipmentStatus,
          paymentStatus,
          onDecrementPhysicalStock: decrementPhysicalCatalogStock
        });
        if (!updated) {
          res.status(404).json({ error: "Order not found in Firestore." });
          return;
        }
        res.json({ status: "ok", order: updated });
        return;
      } catch (err) {
        res.status(503).json({
          error: err instanceof Error ? err.message : "Service Account credentials required to update orders."
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
