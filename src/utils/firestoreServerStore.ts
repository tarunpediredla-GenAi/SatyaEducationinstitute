import crypto from 'node:crypto';
import firebaseConfig from '../../firebase-applet-config.json';
import type { OrderStateRecord } from './commerceRules';

export interface ServerOrderLineItem {
  productId: string;
  title: string;
  type: 'course' | 'book' | 'storybook';
  format: string;
  quantity: number;
  unitPriceInr: number;
}

export interface ServerOrderRecord extends OrderStateRecord {
  customerName: string;
  customerEmail: string;
  shippingAddressSummary: string;
  itemSummary: string;
  lineItems: ServerOrderLineItem[];
  entitlementsGranted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServerEntitlementRecord {
  id: string;
  userId: string;
  productId: string;
  productType: 'course' | 'book' | 'storybook';
  orderId: string;
  downloadPath: string;
  grantedAt: string;
}

interface FirestoreDocumentResponse {
  name?: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
}

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

const PROJECT_ID =
  (process.env.FIREBASE_PROJECT_ID || '').trim() || firebaseConfig.projectId;
const DATABASE_ID =
  firebaseConfig.firestoreDatabaseId || '(default)';

const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
  PROJECT_ID
)}/databases/${encodeURIComponent(DATABASE_ID)}/documents`;

const FIRESTORE_DOC_PREFIX = `projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;

let cachedServiceAccountToken: { accessToken: string; expiresAtMs: number } | null = null;

export function getServiceAccountCredentials(): {
  clientEmail: string;
  privateKey: string;
} | null {
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const rawPrivateKey = (process.env.FIREBASE_PRIVATE_KEY || '').trim();
  if (!clientEmail || !rawPrivateKey) {
    return null;
  }
  return {
    clientEmail,
    privateKey: rawPrivateKey.replace(/\\n/g, '\n'),
  };
}

/**
 * Generates an OAuth2 access token from trusted server-side Service Account credentials
 * (`FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`).
 * Missing credentials cause privileged operations to fail securely.
 */
export async function getServiceAccountAccessToken(): Promise<string | null> {
  const creds = getServiceAccountCredentials();
  if (!creds) {
    return null;
  }

  if (cachedServiceAccountToken && cachedServiceAccountToken.expiresAtMs > Date.now()) {
    return cachedServiceAccountToken.accessToken;
  }

  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', typ: 'JWT' })
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: creds.clientEmail,
        sub: creds.clientEmail,
        aud: 'https://oauth2.googleapis.com/token',
        iat: nowSec,
        exp: nowSec + 3600,
        scope:
          'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/devstorage.full_control',
      })
    ).toString('base64url');

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(`${header}.${payload}`);
    signer.end();
    const signature = signer.sign(creds.privateKey, 'base64url');
    const assertion = `${header}.${payload}.${signature}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) {
      return null;
    }

    cachedServiceAccountToken = {
      accessToken: data.access_token,
      expiresAtMs: Date.now() + Math.max(60, (data.expires_in || 3600) - 300) * 1000,
    };
    return data.access_token;
  } catch {
    return null;
  }
}

/**
 * Strictly requires Firebase Service Account credentials (`FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`).
 * Throws an error (failing securely) if credentials are missing or invalid.
 */
async function requireServiceAccountToken(operationName: string): Promise<string> {
  const saToken = await getServiceAccountAccessToken();
  if (!saToken) {
    throw new Error(
      `Privileged Firestore operation "${operationName}" failed securely: Server-side Firebase Service Account credentials (FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY) are not configured.`
    );
  }
  return saToken;
}

/**
 * Resolves a Firestore Bearer token strictly for customer-scoped read operations
 * (`GET /api/user/library` and `POST /api/content/signed-url` entitlement reads).
 * Never used for order creation, order updates, or entitlement creation.
 */
async function resolveCustomerScopedReadToken(
  verifiedCustomerIdToken?: string
): Promise<string | null> {
  const saToken = await getServiceAccountAccessToken();
  if (saToken) {
    return saToken;
  }
  if (verifiedCustomerIdToken && verifiedCustomerIdToken.trim()) {
    return verifiedCustomerIdToken.trim();
  }
  return null;
}

/**
 * Generates a short-lived Google Cloud Storage V4 Signed URL (`GOOG4-RSA-SHA256`)
 * using `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`.
 * Allows the browser to stream large HD course videos directly from Google Cloud Storage
 * without hitting Vercel's 4.5 MB serverless response limit and without using
 * permanent Firebase `?token=` download tokens.
 */
export function createGcsV4SignedReadUrl(params: {
  bucketName: string;
  objectPath: string;
  expiresInSeconds?: number;
}): string | null {
  const creds = getServiceAccountCredentials();
  if (!creds) {
    return null;
  }

  const { bucketName, objectPath, expiresInSeconds = 900 } = params;
  const now = new Date();
  const isoBasic = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const datestamp = isoBasic.slice(0, 8);
  const credentialScope = `${datestamp}/auto/storage/goog4_request`;
  const credential = `${creds.clientEmail}/${credentialScope}`;

  const encodedObjectPath = objectPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  const canonicalUri = `/${encodeURIComponent(bucketName)}/${encodedObjectPath}`;
  const queryParams: Record<string, string> = {
    'X-Goog-Algorithm': 'GOOG4-RSA-SHA256',
    'X-Goog-Credential': credential,
    'X-Goog-Date': isoBasic,
    'X-Goog-Expires': String(Math.min(Math.max(60, expiresInSeconds), 3600)),
    'X-Goog-SignedHeaders': 'host',
  };

  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&');

  const canonicalHeaders = 'host:storage.googleapis.com\n';
  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    'GET',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const canonicalRequestHash = crypto
    .createHash('sha256')
    .update(canonicalRequest, 'utf8')
    .digest('hex');

  const stringToSign = [
    'GOOG4-RSA-SHA256',
    isoBasic,
    credentialScope,
    canonicalRequestHash,
  ].join('\n');

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(stringToSign, 'utf8');
  signer.end();
  const signatureHex = signer.sign(creds.privateKey, 'hex');

  return `https://storage.googleapis.com${canonicalUri}?${canonicalQueryString}&X-Goog-Signature=${signatureHex}`;
}

/**
 * Revokes any pre-existing Firebase Storage download tokens (`firebaseStorageDownloadTokens`)
 * on objects inside `protected/` so old `?alt=media&token=<uuid>` URLs cannot bypass authorization.
 */
export async function revokeProtectedStorageDownloadTokens(
  bucketName: string
): Promise<{ scannedCount: number; revokedCount: number }> {
  const saToken = await requireServiceAccountToken('revokeProtectedStorageDownloadTokens');

  const listUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(
    bucketName
  )}/o?prefix=${encodeURIComponent('protected/')}&maxResults=500`;

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${saToken}` },
  });

  if (!listRes.ok) {
    throw new Error(`Failed to list protected objects in bucket (${listRes.status}).`);
  }

  const data = (await listRes.json()) as {
    items?: Array<{
      name?: string;
      metadata?: Record<string, string>;
    }>;
  };

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
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${saToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          metadata: {
            ...nextMetadata,
            firebaseStorageDownloadTokens: null,
          },
        }),
      });
      if (patchRes.ok) {
        revokedCount += 1;
      }
    }
  }

  return { scannedCount: items.length, revokedCount };
}

function toFirestoreValue(val: unknown): FirestoreValue {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      return { integerValue: String(val) };
    }
    return { doubleValue: val };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map((item) => toFirestoreValue(item)),
      },
    };
  }
  if (typeof val === 'object') {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function toFirestoreFields(obj: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      fields[k] = toFirestoreValue(v);
    }
  }
  return fields;
}

function fromFirestoreValue(val: FirestoreValue | undefined): unknown {
  if (!val) return undefined;
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map((v) => fromFirestoreValue(v));
  }
  if ('mapValue' in val) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      out[k] = fromFirestoreValue(v);
    }
    return out;
  }
  return undefined;
}

function parseOrderFromDoc(doc: FirestoreDocumentResponse): ServerOrderRecord | null {
  if (!doc || !doc.fields) return null;
  const f = doc.fields;
  const id = String(fromFirestoreValue(f.id) || '').trim();
  const userId = String(fromFirestoreValue(f.userId) || '').trim();
  if (!id || !userId) return null;

  const rawItems = fromFirestoreValue(f.lineItems);
  const lineItems: ServerOrderLineItem[] = Array.isArray(rawItems)
    ? rawItems.map((item: unknown) => {
        const rec = (item || {}) as Record<string, unknown>;
        return {
          productId: String(rec.productId || ''),
          title: String(rec.title || ''),
          type: (rec.type === 'book' || rec.type === 'storybook' ? rec.type : 'course') as
            | 'course'
            | 'book'
            | 'storybook',
          format: String(rec.format || 'recorded_course'),
          quantity: Number(rec.quantity || 1),
          unitPriceInr: Number(rec.unitPriceInr || 0),
        };
      })
    : [];

  return {
    id,
    userId,
    customerName: String(fromFirestoreValue(f.customerName) || 'Student'),
    customerEmail: String(fromFirestoreValue(f.customerEmail) || ''),
    totalAmountInr: Number(fromFirestoreValue(f.totalAmountInr) || 0),
    paymentStatus:
      (fromFirestoreValue(f.paymentStatus) as ServerOrderRecord['paymentStatus']) || 'pending',
    shipmentStatus:
      (fromFirestoreValue(f.shipmentStatus) as ServerOrderRecord['shipmentStatus']) ||
      'not_applicable',
    paymentReference: String(fromFirestoreValue(f.paymentReference) || ''),
    hasPhysicalItems: Boolean(fromFirestoreValue(f.hasPhysicalItems)),
    shippingAddressSummary: String(fromFirestoreValue(f.shippingAddressSummary) || ''),
    itemSummary: String(fromFirestoreValue(f.itemSummary) || ''),
    lineItems,
    entitlementsGranted: Boolean(fromFirestoreValue(f.entitlementsGranted)),
    createdAt: String(fromFirestoreValue(f.createdAt) || new Date().toISOString()),
    updatedAt: String(fromFirestoreValue(f.updatedAt) || new Date().toISOString()),
  };
}

function parseEntitlementFromDoc(doc: FirestoreDocumentResponse): ServerEntitlementRecord | null {
  if (!doc || !doc.fields) return null;
  const f = doc.fields;
  const id = String(fromFirestoreValue(f.id) || '').trim();
  const userId = String(fromFirestoreValue(f.userId) || '').trim();
  const productId = String(fromFirestoreValue(f.productId) || '').trim();
  if (!id || !userId || !productId) return null;

  return {
    id,
    userId,
    productId,
    productType:
      (fromFirestoreValue(f.productType) as ServerEntitlementRecord['productType']) || 'course',
    orderId: String(fromFirestoreValue(f.orderId) || ''),
    downloadPath: String(fromFirestoreValue(f.downloadPath) || ''),
    grantedAt: String(fromFirestoreValue(f.grantedAt) || new Date().toISOString()),
  };
}

/**
 * Creates a new order in Firestore with `paymentStatus: 'pending'` and `entitlementsGranted: false`.
 * Strictly requires Firebase Service Account credentials so customers can never create orders
 * directly from the client or manipulate order totals.
 */
export async function createPendingOrderInFirestore(
  order: ServerOrderRecord
): Promise<ServerOrderRecord> {
  const saToken = await requireServiceAccountToken('createPendingOrderInFirestore');

  const pendingOrder: ServerOrderRecord = {
    ...order,
    paymentStatus: 'pending',
    paymentReference: '',
    entitlementsGranted: false,
  };

  const res = await fetch(
    `${FIRESTORE_BASE_URL}/orders?documentId=${encodeURIComponent(pendingOrder.id)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${saToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: toFirestoreFields(pendingOrder as unknown as Record<string, unknown>),
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Failed to persist pending order in Firestore (${res.status}): ${errText.slice(0, 240)}`
    );
  }

  const createdDoc = (await res.json()) as FirestoreDocumentResponse;
  return parseOrderFromDoc(createdDoc) || pendingOrder;
}

/**
 * Fetches a single order by ID from Firestore along with its document `updateTime`
 * for optimistic concurrency locking during payment fulfillment.
 * Uses Service Account credentials for server-side verification.
 */
export async function getOrderFromFirestore(
  orderId: string
): Promise<{ order: ServerOrderRecord; updateTime?: string } | null> {
  const saToken = await requireServiceAccountToken('getOrderFromFirestore');

  const res = await fetch(`${FIRESTORE_BASE_URL}/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${saToken}`,
    },
  });

  if (res.status === 404 || !res.ok) {
    return null;
  }

  const doc = (await res.json()) as FirestoreDocumentResponse;
  const order = parseOrderFromDoc(doc);
  if (!order) return null;

  return {
    order,
    updateTime: doc.updateTime,
  };
}

/**
 * Atomically transitions a pending order to `paid` and unlocks all purchased courses
 * and digital books in a single Firestore `:commit` batch with optimistic locking.
 * Strictly requires server-side Service Account credentials (`FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`).
 * Missing credentials cause the operation to fail securely.
 */
export async function fulfillPaidOrderAtomicallyInFirestore(params: {
  orderId: string;
  paymentReference: string;
  onDecrementPhysicalStock?: (productId: string, quantity: number) => void;
}): Promise<{
  order: ServerOrderRecord;
  entitlements: ServerEntitlementRecord[];
  alreadyFulfilled: boolean;
}> {
  const { orderId, paymentReference, onDecrementPhysicalStock } = params;
  const saToken = await requireServiceAccountToken('fulfillPaidOrderAtomicallyInFirestore');

  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await getOrderFromFirestore(orderId);
    if (!existing) {
      throw new Error(`Order ${orderId} not found in Firestore.`);
    }

    const { order, updateTime } = existing;

    // Idempotency check: if already paid and entitlementsGranted, return existing entitlements
    if (order.paymentStatus === 'paid' && order.entitlementsGranted) {
      const existingEntitlements = await listEntitlementsByOrderFromFirestore(
        order.userId,
        order.id,
        saToken
      );
      return {
        order,
        entitlements: existingEntitlements,
        alreadyFulfilled: true,
      };
    }

    const nowIso = new Date().toISOString();
    const updatedOrder: ServerOrderRecord = {
      ...order,
      paymentStatus: 'paid',
      paymentReference: paymentReference || order.paymentReference || `CF_${order.id}`,
      entitlementsGranted: true,
      updatedAt: nowIso,
    };

    const entitlementsToGrant: ServerEntitlementRecord[] = [];
    for (const item of order.lineItems) {
      if (
        item.format === 'recorded_course' ||
        item.format === 'digital_book' ||
        item.format === 'hybrid_book'
      ) {
        const entitlementId = `${order.userId}_${item.productId}`;
        entitlementsToGrant.push({
          id: entitlementId,
          userId: order.userId,
          productId: item.productId,
          productType: item.type,
          orderId: order.id,
          downloadPath:
            item.type === 'course'
              ? `protected/courses/${item.productId}`
              : `protected/books/${item.productId}/${item.productId}.pdf`,
          grantedAt: nowIso,
        });
      }
    }

    const writes: Array<Record<string, unknown>> = [
      // 1. Order document transition to 'paid' with optimistic concurrency lock on updateTime
      {
        update: {
          name: `${FIRESTORE_DOC_PREFIX}/orders/${order.id}`,
          fields: toFirestoreFields(updatedOrder as unknown as Record<string, unknown>),
        },
        ...(updateTime ? { currentDocument: { updateTime } } : {}),
      },
      // 2. Deterministic entitlement documents ({userId}_{productId})
      ...entitlementsToGrant.map((ent) => ({
        update: {
          name: `${FIRESTORE_DOC_PREFIX}/entitlements/${ent.id}`,
          fields: toFirestoreFields(ent as unknown as Record<string, unknown>),
        },
      })),
    ];

    const commitRes = await fetch(`${FIRESTORE_BASE_URL}:commit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${saToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes }),
    });

    if (commitRes.ok) {
      if (onDecrementPhysicalStock) {
        for (const item of order.lineItems) {
          if (item.format === 'physical_book' || item.format === 'hybrid_book') {
            onDecrementPhysicalStock(item.productId, item.quantity);
          }
        }
      }
      return {
        order: updatedOrder,
        entitlements: entitlementsToGrant,
        alreadyFulfilled: false,
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

/**
 * Marks a pending order as `failed` in Firestore using server-side Service Account credentials
 * if Cashfree reports EXPIRED or TERMINATED.
 */
export async function markOrderFailedInFirestore(
  order: ServerOrderRecord
): Promise<ServerOrderRecord> {
  if (order.paymentStatus !== 'pending') {
    return order;
  }

  const saToken = await requireServiceAccountToken('markOrderFailedInFirestore');

  const updatedOrder: ServerOrderRecord = {
    ...order,
    paymentStatus: 'failed',
    entitlementsGranted: false,
    updatedAt: new Date().toISOString(),
  };

  const res = await fetch(`${FIRESTORE_BASE_URL}/orders/${encodeURIComponent(order.id)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${saToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: toFirestoreFields(updatedOrder as unknown as Record<string, unknown>),
    }),
  });

  if (!res.ok) {
    return order;
  }

  return updatedOrder;
}

/**
 * Admin-only order update in Firestore (e.g., updating shipment status or admin-verified payment status).
 * Strictly requires Service Account credentials.
 */
export async function updateOrderByAdminInFirestore(params: {
  orderId: string;
  shipmentStatus?: ServerOrderRecord['shipmentStatus'];
  paymentStatus?: ServerOrderRecord['paymentStatus'];
  onDecrementPhysicalStock?: (productId: string, quantity: number) => void;
}): Promise<ServerOrderRecord | null> {
  const { orderId, shipmentStatus, paymentStatus, onDecrementPhysicalStock } = params;
  const saToken = await requireServiceAccountToken('updateOrderByAdminInFirestore');

  const existing = await getOrderFromFirestore(orderId);
  if (!existing) return null;

  let currentOrder = existing.order;

  if (paymentStatus === 'paid' && currentOrder.paymentStatus !== 'paid') {
    const fulfilled = await fulfillPaidOrderAtomicallyInFirestore({
      orderId,
      paymentReference: currentOrder.paymentReference || `ADMIN_VERIFIED_${orderId}`,
      onDecrementPhysicalStock,
    });
    currentOrder = fulfilled.order;
  }

  const updatedOrder: ServerOrderRecord = {
    ...currentOrder,
    shipmentStatus: shipmentStatus || currentOrder.shipmentStatus,
    paymentStatus: paymentStatus || currentOrder.paymentStatus,
    updatedAt: new Date().toISOString(),
  };

  const res = await fetch(`${FIRESTORE_BASE_URL}/orders/${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${saToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: toFirestoreFields(updatedOrder as unknown as Record<string, unknown>),
    }),
  });

  if (!res.ok) {
    return currentOrder;
  }

  const doc = (await res.json()) as FirestoreDocumentResponse;
  return parseOrderFromDoc(doc) || updatedOrder;
}

async function runStructuredQueryByField(params: {
  collectionId: string;
  fieldPath: string;
  stringValue: string;
  bearerToken: string;
}): Promise<FirestoreDocumentResponse[]> {
  const { collectionId, fieldPath, stringValue, bearerToken } = params;
  const res = await fetch(`${FIRESTORE_BASE_URL}:runQuery`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: {
          fieldFilter: {
            field: { fieldPath },
            op: 'EQUAL',
            value: { stringValue },
          },
        },
      },
    }),
  });

  if (!res.ok) {
    return [];
  }

  const rows = (await res.json()) as Array<{ document?: FirestoreDocumentResponse }>;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => r.document)
    .filter((d): d is FirestoreDocumentResponse => Boolean(d && d.fields));
}

async function listEntitlementsByOrderFromFirestore(
  userId: string,
  orderId: string,
  bearerToken: string
): Promise<ServerEntitlementRecord[]> {
  const docs = await runStructuredQueryByField({
    collectionId: 'entitlements',
    fieldPath: 'userId',
    stringValue: userId,
    bearerToken,
  });

  return docs
    .map((d) => parseEntitlementFromDoc(d))
    .filter((e): e is ServerEntitlementRecord => Boolean(e && e.orderId === orderId));
}

/**
 * Queries a specific customer's orders and unlocked entitlements from Firestore,
 * strictly isolated by `userId == authCtx.uid`.
 */
export async function listUserOrdersAndEntitlementsFromFirestore(
  userId: string,
  userIdToken?: string
): Promise<{
  orders: ServerOrderRecord[];
  entitlements: ServerEntitlementRecord[];
}> {
  const bearerToken = await resolveCustomerScopedReadToken(userIdToken);
  if (!bearerToken) {
    return { orders: [], entitlements: [] };
  }

  const [orderDocs, entitlementDocs] = await Promise.all([
    runStructuredQueryByField({
      collectionId: 'orders',
      fieldPath: 'userId',
      stringValue: userId,
      bearerToken,
    }),
    runStructuredQueryByField({
      collectionId: 'entitlements',
      fieldPath: 'userId',
      stringValue: userId,
      bearerToken,
    }),
  ]);

  const orders = orderDocs
    .map((d) => parseOrderFromDoc(d))
    .filter((o): o is ServerOrderRecord => Boolean(o && o.userId === userId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const entitlements = entitlementDocs
    .map((d) => parseEntitlementFromDoc(d))
    .filter((e): e is ServerEntitlementRecord => Boolean(e && e.userId === userId));

  return { orders, entitlements };
}

/**
 * Returns the list of productIds that a customer has unlocked in Firestore.
 */
export async function listUserEntitledProductIdsFromFirestore(
  userId: string,
  userIdToken?: string
): Promise<string[]> {
  const bearerToken = await resolveCustomerScopedReadToken(userIdToken);
  if (!bearerToken) return [];

  const entitlementDocs = await runStructuredQueryByField({
    collectionId: 'entitlements',
    fieldPath: 'userId',
    stringValue: userId,
    bearerToken,
  });

  return entitlementDocs
    .map((d) => parseEntitlementFromDoc(d))
    .filter((e): e is ServerEntitlementRecord => Boolean(e && e.userId === userId))
    .map((e) => e.productId);
}

/**
 * Lists all customer orders from Firestore for a verified administrator.
 * Strictly requires Service Account credentials.
 */
export async function listAllOrdersFromFirestoreForAdmin(): Promise<ServerOrderRecord[]> {
  const saToken = await requireServiceAccountToken('listAllOrdersFromFirestoreForAdmin');

  const res = await fetch(`${FIRESTORE_BASE_URL}/orders?pageSize=200`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${saToken}`,
    },
  });

  if (!res.ok) {
    return [];
  }

  const data = (await res.json()) as { documents?: FirestoreDocumentResponse[] };
  const docs = Array.isArray(data.documents) ? data.documents : [];
  return docs
    .map((d) => parseOrderFromDoc(d))
    .filter((o): o is ServerOrderRecord => Boolean(o))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
