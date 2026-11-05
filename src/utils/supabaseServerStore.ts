import type { OrderStateRecord, PaymentStatus, ShipmentStatus } from './commerceRules';

export const SUPABASE_PROTECTED_MEDIA_BUCKET =
  (process.env.SUPABASE_STORAGE_BUCKET || '').trim() || 'protected-media';

export const SUPABASE_FREE_PLAN_MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

export interface ServerOrderLineItem {
  productId: string;
  title: string;
  type: 'course' | 'book' | 'storybook';
  format: 'recorded_course' | 'digital_book' | 'physical_book' | 'hybrid_book' | string;
  quantity: number;
  unitPriceInr: number;
}

export interface ServerOrderRecord extends OrderStateRecord {
  customerName: string;
  customerEmail: string;
  totalAmountPaise: number;
  currency: string;
  cashfreeOrderId: string;
  cashfreePaymentId: string;
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
  revokedAt?: string | null;
}

interface SupabaseOrderRow {
  id: string;
  firebase_uid: string;
  cashfree_order_id?: string | null;
  total_amount_paise: number | string;
  currency?: string | null;
  payment_status?: string | null;
  cashfree_payment_id?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  shipment_status?: string | null;
  has_physical_items?: boolean | null;
  shipping_address_summary?: string | null;
  item_summary?: string | null;
  line_items?: unknown;
  entitlements_granted?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface SupabaseEntitlementRow {
  firebase_uid: string;
  product_id: string;
  order_id: string;
  product_type?: string | null;
  download_path?: string | null;
  granted_at?: string | null;
  revoked_at?: string | null;
}

export function getSupabaseServerConfig(): {
  url: string;
  secretKey: string;
  storageBucket: string;
} | null {
  const rawUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const secretKey = (process.env.SUPABASE_SECRET_KEY || '').trim();
  const storageBucket =
    (process.env.SUPABASE_STORAGE_BUCKET || '').trim() || SUPABASE_PROTECTED_MEDIA_BUCKET;

  if (!rawUrl || !secretKey) {
    return null;
  }

  return {
    url: rawUrl,
    secretKey,
    storageBucket,
  };
}

function requireSupabaseServerConfig(operationName: string): {
  url: string;
  secretKey: string;
  storageBucket: string;
} {
  const cfg = getSupabaseServerConfig();
  if (!cfg) {
    throw new Error(
      `Privileged Supabase operation "${operationName}" failed securely: Server-side SUPABASE_URL and SUPABASE_SECRET_KEY environment variables are required.`
    );
  }
  return cfg;
}

function buildSupabaseHeaders(
  secretKey: string,
  extraHeaders?: Record<string, string>
): Record<string, string> {
  return {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extraHeaders,
  };
}

function normalizeLineItems(raw: unknown): ServerOrderLineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const rec = (item || {}) as Record<string, unknown>;
    const rawType = String(rec.type || 'course').trim().toLowerCase();
    const validType: 'course' | 'book' | 'storybook' =
      rawType === 'book' || rawType === 'storybook' ? rawType : 'course';

    return {
      productId: String(rec.productId || '').trim(),
      title: String(rec.title || '').trim(),
      type: validType,
      format: String(rec.format || 'recorded_course').trim().toLowerCase(),
      quantity: Math.max(1, Math.round(Number(rec.quantity || 1))),
      unitPriceInr: Number(rec.unitPriceInr || 0),
    };
  });
}

function mapSupabaseRowToOrder(row: SupabaseOrderRow): ServerOrderRecord {
  const totalAmountPaise = Math.round(Number(row.total_amount_paise || 0));
  const totalAmountInr = Number((totalAmountPaise / 100).toFixed(2));
  const cashfreeOrderId = String(row.cashfree_order_id || '').trim();
  const cashfreePaymentId = String(row.cashfree_payment_id || '').trim();
  const rawPaymentStatus = String(row.payment_status || 'pending')
    .trim()
    .toLowerCase();

  const paymentStatus: PaymentStatus =
    rawPaymentStatus === 'paid' ||
    rawPaymentStatus === 'failed' ||
    rawPaymentStatus === 'cancelled' ||
    rawPaymentStatus === 'refunded'
      ? rawPaymentStatus
      : 'pending';

  const rawShipmentStatus = String(row.shipment_status || 'not_applicable')
    .trim()
    .toLowerCase();
  const shipmentStatus: ShipmentStatus =
    rawShipmentStatus === 'processing' ||
    rawShipmentStatus === 'packed' ||
    rawShipmentStatus === 'shipped' ||
    rawShipmentStatus === 'delivered'
      ? rawShipmentStatus
      : 'not_applicable';

  return {
    id: String(row.id || '').trim(),
    userId: String(row.firebase_uid || '').trim(),
    customerName: String(row.customer_name || 'Student'),
    customerEmail: String(row.customer_email || ''),
    totalAmountInr,
    totalAmountPaise,
    currency: String(row.currency || 'INR').toUpperCase(),
    paymentStatus,
    shipmentStatus,
    cashfreeOrderId,
    cashfreePaymentId,
    paymentReference: cashfreePaymentId || cashfreeOrderId || '',
    hasPhysicalItems: Boolean(row.has_physical_items),
    shippingAddressSummary: String(row.shipping_address_summary || ''),
    itemSummary: String(row.item_summary || ''),
    lineItems: normalizeLineItems(row.line_items),
    entitlementsGranted: Boolean(row.entitlements_granted),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function mapSupabaseRowToEntitlement(row: SupabaseEntitlementRow): ServerEntitlementRecord {
  const userId = String(row.firebase_uid || '').trim();
  const productId = String(row.product_id || '').trim();
  const rawType = String(row.product_type || 'course').trim().toLowerCase();
  const productType: 'course' | 'book' | 'storybook' =
    rawType === 'book' || rawType === 'storybook' ? rawType : 'course';

  const defaultDownloadPath =
    productType === 'course'
      ? `protected/courses/${productId}`
      : `protected/books/${productId}/${productId}.pdf`;

  return {
    id: `${userId}_${productId}`,
    userId,
    productId,
    productType,
    orderId: String(row.order_id || '').trim(),
    downloadPath: String(row.download_path || defaultDownloadPath).trim(),
    grantedAt: String(row.granted_at || new Date().toISOString()),
    revokedAt: row.revoked_at || null,
  };
}

/**
 * Validates and normalizes a private Supabase Storage file path inside `protected-media`.
 * Rejects folder-only paths, path traversal (`..`), and paths outside `protected/courses/` or `protected/books/`.
 */
export function validateProtectedStorageFilePath(rawPath: string): string | null {
  const trimmed = String(rawPath || '').trim().replace(/^\/+/, '');
  if (!trimmed || trimmed.includes('..') || trimmed.includes('//') || trimmed.includes('\\')) {
    return null;
  }

  let normalized = trimmed;
  if (normalized.startsWith('courses/')) {
    normalized = `protected/${normalized}`;
  } else if (normalized.startsWith('books/')) {
    normalized = `protected/${normalized}`;
  }

  const isCourseFile = normalized.startsWith('protected/courses/');
  const isBookFile = normalized.startsWith('protected/books/');
  if (!isCourseFile && !isBookFile) {
    return null;
  }

  const segments = normalized.split('/').filter(Boolean);
  if (segments.length < 3) {
    return null;
  }

  const fileName = segments[segments.length - 1];
  if (!/\.[a-zA-Z0-9]{2,6}$/.test(fileName)) {
    return null;
  }

  return segments.join('/');
}

/**
 * Creates a new pending order in `public.orders` with `payment_status = 'pending'`,
 * `entitlements_granted = false`, and `total_amount_paise = Math.round(totalAmountInr * 100)`.
 */
export async function createPendingOrderInSupabase(
  order: Omit<
    ServerOrderRecord,
    'totalAmountPaise' | 'currency' | 'cashfreeOrderId' | 'cashfreePaymentId'
  > & {
    totalAmountPaise?: number;
    currency?: string;
    cashfreeOrderId?: string;
    cashfreePaymentId?: string;
  }
): Promise<ServerOrderRecord> {
  const cfg = requireSupabaseServerConfig('createPendingOrderInSupabase');

  const totalAmountPaise =
    typeof order.totalAmountPaise === 'number' && order.totalAmountPaise > 0
      ? Math.round(order.totalAmountPaise)
      : Math.round(order.totalAmountInr * 100);

  if (!Number.isInteger(totalAmountPaise) || totalAmountPaise <= 0) {
    throw new Error('Calculated order total_amount_paise must be a positive integer.');
  }

  const initialCashfreeOrderId = order.cashfreeOrderId
    ? String(order.cashfreeOrderId).trim() || null
    : null;

  const payload = {
    id: order.id,
    firebase_uid: order.userId,
    cashfree_order_id: initialCashfreeOrderId,
    total_amount_paise: totalAmountPaise,
    currency: 'INR',
    payment_status: 'pending',
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
      unitPriceInr: item.unitPriceInr,
    })),
    entitlements_granted: false,
    created_at: order.createdAt,
    updated_at: order.updatedAt,
  };

  const res = await fetch(`${cfg.url}/rest/v1/orders`, {
    method: 'POST',
    headers: buildSupabaseHeaders(cfg.secretKey, {
      Prefer: 'return=representation',
    }),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Failed to save pending order in Supabase (${res.status}): ${errText.slice(0, 240)}`
    );
  }

  const rows = (await res.json()) as SupabaseOrderRow[];
  const createdRow = Array.isArray(rows) ? rows[0] : undefined;
  if (!createdRow) {
    throw new Error('Supabase did not return the created pending order record.');
  }

  return mapSupabaseRowToOrder(createdRow);
}

/**
 * Persists Cashfree's real `cf_order_id` onto `public.orders.cashfree_order_id`
 * before returning the payment session to the frontend.
 *
 * Uses a direct atomic PostgREST PATCH (`WHERE id = $1 AND cashfree_order_id IS NULL`)
 * so it works even if the optional `public.set_order_cashfree_id` RPC function was not
 * created in Supabase, while strictly guaranteeing that an existing `cashfree_order_id`
 * can NEVER be overwritten with a different ID.
 */
export async function saveCashfreeOrderIdInSupabase(params: {
  orderId: string;
  cashfreeOrderId: string;
}): Promise<ServerOrderRecord> {
  const cfg = requireSupabaseServerConfig('saveCashfreeOrderIdInSupabase');
  const orderId = String(params.orderId || '').trim();
  const cashfreeOrderId = String(params.cashfreeOrderId || '').trim();

  if (!orderId || !cashfreeOrderId) {
    throw new Error('Both orderId and cashfreeOrderId are required.');
  }

  if (orderId === cashfreeOrderId) {
    throw new Error('cashfreeOrderId must be Cashfree cf_order_id, not merchant orderId.');
  }

  // 1. Check current order state in Supabase
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

  // 2. Atomically update `cashfree_order_id` ONLY where `cashfree_order_id IS NULL`
  const patchUrl = `${cfg.url}/rest/v1/orders?id=eq.${encodeURIComponent(
    orderId
  )}&cashfree_order_id=is.null`;

  const patchRes = await fetch(patchUrl, {
    method: 'PATCH',
    headers: buildSupabaseHeaders(cfg.secretKey, {
      Prefer: 'return=representation',
    }),
    body: JSON.stringify({
      cashfree_order_id: cashfreeOrderId,
      updated_at: new Date().toISOString(),
    }),
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

  const patchedRows = (await patchRes.json()) as SupabaseOrderRow[];
  if (Array.isArray(patchedRows) && patchedRows.length > 0) {
    const mapped = mapSupabaseRowToOrder(patchedRows[0]);
    if (mapped.cashfreeOrderId === cashfreeOrderId) {
      return mapped;
    }
  }

  // 3. Re-read to confirm whether a concurrent call set the same ID
  const reloaded = await getOrderFromSupabase(orderId);
  if (reloaded && reloaded.cashfreeOrderId === cashfreeOrderId) {
    return reloaded;
  }

  throw new Error(
    `Verification of stored cashfree_order_id failed for order ${orderId} in Supabase.`
  );
}

/**
 * Fetches a single order by merchant `id` from `public.orders`.
 */
export async function getOrderFromSupabase(
  orderId: string
): Promise<ServerOrderRecord | null> {
  const cfg = requireSupabaseServerConfig('getOrderFromSupabase');
  const trimmedId = String(orderId || '').trim();
  if (!trimmedId) return null;

  const res = await fetch(
    `${cfg.url}/rest/v1/orders?id=eq.${encodeURIComponent(trimmedId)}&select=*&limit=1`,
    {
      method: 'GET',
      headers: buildSupabaseHeaders(cfg.secretKey),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Failed to fetch order ${trimmedId} from Supabase (${res.status}): ${errText.slice(0, 240)}`
    );
  }

  const rows = (await res.json()) as SupabaseOrderRow[];
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  return mapSupabaseRowToOrder(rows[0]);
}

/**
 * Invokes the PostgreSQL `public.fulfill_paid_order` RPC function only after
 * the backend has independently verified the Cashfree payment.
 */
export async function fulfillPaidOrderAtomicallyInSupabase(params: {
  orderId: string;
  cashfreeOrderId: string;
  cashfreePaymentId: string;
  verifiedAmountPaise: number;
  verifiedCurrency?: string;
  onDecrementPhysicalStock?: (productId: string, quantity: number) => void;
}): Promise<{
  order: ServerOrderRecord;
  entitlements: ServerEntitlementRecord[];
  alreadyFulfilled: boolean;
}> {
  const cfg = requireSupabaseServerConfig('fulfillPaidOrderAtomicallyInSupabase');
  const {
    orderId,
    cashfreeOrderId,
    cashfreePaymentId,
    verifiedAmountPaise,
    verifiedCurrency = 'INR',
    onDecrementPhysicalStock,
  } = params;

  const rpcRes = await fetch(`${cfg.url}/rest/v1/rpc/fulfill_paid_order`, {
    method: 'POST',
    headers: buildSupabaseHeaders(cfg.secretKey),
    body: JSON.stringify({
      p_order_id: orderId,
      p_cashfree_order_id: cashfreeOrderId,
      p_cashfree_payment_id: cashfreePaymentId,
      p_verified_amount_paise: Math.round(verifiedAmountPaise),
      p_verified_currency: verifiedCurrency,
    }),
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

  const rpcResult = (await rpcRes.json()) as {
    status?: string;
    orderId?: string;
    cashfreeOrderId?: string;
    cashfreePaymentId?: string;
    digitalEntitlementsGranted?: number;
  };

  const alreadyFulfilled = rpcResult?.status === 'already_paid';

  const updatedOrder = await getOrderFromSupabase(orderId);
  if (!updatedOrder || updatedOrder.paymentStatus !== 'paid') {
    throw new Error(`Order ${orderId} was not marked paid after fulfill_paid_order.`);
  }

  const entitlements = await listActiveEntitlementsByOrderFromSupabase(
    updatedOrder.userId,
    updatedOrder.id
  );

  // Double-check in application layer that digital items produced active entitlements
  const expectedDigitalItems = updatedOrder.lineItems.filter(
    (item) =>
      item.format === 'recorded_course' ||
      item.format === 'digital_book' ||
      item.format === 'hybrid_book' ||
      item.type === 'course'
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
      if (item.format === 'physical_book' || item.format === 'hybrid_book') {
        onDecrementPhysicalStock(item.productId, item.quantity);
      }
    }
  }

  return {
    order: updatedOrder,
    entitlements,
    alreadyFulfilled,
  };
}

/**
 * Marks a pending order as `failed` or `cancelled` in `public.orders` when Cashfree
 * checkout initialization fails, or when Cashfree reports EXPIRED, TERMINATED, or user cancellation.
 * Never modifies a paid or refunded order.
 */
export async function markOrderFailedOrCancelledInSupabase(
  order: ServerOrderRecord,
  newStatus: 'failed' | 'cancelled' = 'failed'
): Promise<ServerOrderRecord> {
  if (order.paymentStatus !== 'pending') {
    return order;
  }

  const cfg = requireSupabaseServerConfig('markOrderFailedOrCancelledInSupabase');

  const res = await fetch(
    `${cfg.url}/rest/v1/orders?id=eq.${encodeURIComponent(
      order.id
    )}&payment_status=eq.pending`,
    {
      method: 'PATCH',
      headers: buildSupabaseHeaders(cfg.secretKey, {
        Prefer: 'return=representation',
      }),
      body: JSON.stringify({
        payment_status: newStatus,
        entitlements_granted: false,
        updated_at: new Date().toISOString(),
      }),
    }
  );

  if (!res.ok) {
    return order;
  }

  const rows = (await res.json()) as SupabaseOrderRow[];
  return Array.isArray(rows) && rows[0] ? mapSupabaseRowToOrder(rows[0]) : order;
}

/**
 * Safely refunds or cancels an order using `public.revoke_paid_order` and ensures
 * that if the customer has ANOTHER distinct, still-valid paid order for any of the same
 * digital products, that valid purchase's entitlement is immediately preserved/restored.
 */
export async function refundOrCancelOrderInSupabase(params: {
  orderId: string;
  newStatus: 'refunded' | 'cancelled';
}): Promise<ServerOrderRecord | null> {
  const cfg = requireSupabaseServerConfig('refundOrCancelOrderInSupabase');
  const { orderId, newStatus } = params;

  const targetOrder = await getOrderFromSupabase(orderId);
  if (!targetOrder) {
    return null;
  }

  const rpcRes = await fetch(`${cfg.url}/rest/v1/rpc/revoke_paid_order`, {
    method: 'POST',
    headers: buildSupabaseHeaders(cfg.secretKey),
    body: JSON.stringify({
      p_order_id: targetOrder.id,
      p_new_status: newStatus,
    }),
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
      method: 'GET',
      headers: buildSupabaseHeaders(cfg.secretKey),
    }
  );

  if (otherPaidOrdersRes.ok) {
    const otherPaidRows = (await otherPaidOrdersRes.json()) as SupabaseOrderRow[];
    const otherPaidOrders = Array.isArray(otherPaidRows)
      ? otherPaidRows.map((r) => mapSupabaseRowToOrder(r))
      : [];

    if (otherPaidOrders.length > 0) {
      for (const item of targetOrder.lineItems) {
        const isDigital =
          item.format === 'recorded_course' ||
          item.format === 'digital_book' ||
          item.format === 'hybrid_book' ||
          item.type === 'course';
        if (!isDigital) continue;

        const alternateValidOrder = otherPaidOrders.find((otherOrd) =>
          otherOrd.lineItems.some((li) => li.productId === item.productId)
        );

        if (alternateValidOrder) {
          await fetch(
            `${cfg.url}/rest/v1/entitlements?firebase_uid=eq.${encodeURIComponent(
              targetOrder.userId
            )}&product_id=eq.${encodeURIComponent(item.productId)}`,
            {
              method: 'PATCH',
              headers: buildSupabaseHeaders(cfg.secretKey),
              body: JSON.stringify({
                order_id: alternateValidOrder.id,
                product_type: item.type,
                revoked_at: null,
              }),
            }
          );
        }
      }
    }
  }

  return await getOrderFromSupabase(targetOrder.id);
}

/**
 * Admin-only order update in Supabase.
 * Allows updating `shipment_status` or issuing a refund/cancellation via `refundOrCancelOrderInSupabase`.
 * Never marks an order `paid` without Cashfree verification.
 */
export async function updateOrderByAdminInSupabase(params: {
  orderId: string;
  shipmentStatus?: ServerOrderRecord['shipmentStatus'];
  paymentStatus?: ServerOrderRecord['paymentStatus'];
}): Promise<ServerOrderRecord | null> {
  const cfg = requireSupabaseServerConfig('updateOrderByAdminInSupabase');
  const { orderId, shipmentStatus, paymentStatus } = params;

  const existing = await getOrderFromSupabase(orderId);
  if (!existing) return null;

  if (paymentStatus === 'paid' && existing.paymentStatus !== 'paid') {
    throw new Error(
      'Orders can only be marked paid after independent Cashfree verification via fulfill_paid_order.'
    );
  }

  if (paymentStatus === 'refunded' || paymentStatus === 'cancelled') {
    const refundedOrder = await refundOrCancelOrderInSupabase({
      orderId: existing.id,
      newStatus: paymentStatus,
    });
    if (!shipmentStatus || !refundedOrder) {
      return refundedOrder;
    }
  }

  const updateFields: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (shipmentStatus) {
    updateFields.shipment_status = shipmentStatus;
  }
  if (paymentStatus === 'failed' && existing.paymentStatus === 'pending') {
    updateFields.payment_status = 'failed';
  }

  const res = await fetch(
    `${cfg.url}/rest/v1/orders?id=eq.${encodeURIComponent(existing.id)}`,
    {
      method: 'PATCH',
      headers: buildSupabaseHeaders(cfg.secretKey, {
        Prefer: 'return=representation',
      }),
      body: JSON.stringify(updateFields),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Failed to update order ${existing.id} in Supabase (${res.status}): ${errText.slice(0, 240)}`
    );
  }

  const rows = (await res.json()) as SupabaseOrderRow[];
  return Array.isArray(rows) && rows[0] ? mapSupabaseRowToOrder(rows[0]) : existing;
}

async function listActiveEntitlementsByOrderFromSupabase(
  userId: string,
  orderId: string
): Promise<ServerEntitlementRecord[]> {
  const cfg = requireSupabaseServerConfig('listActiveEntitlementsByOrderFromSupabase');

  const res = await fetch(
    `${cfg.url}/rest/v1/entitlements?firebase_uid=eq.${encodeURIComponent(
      userId
    )}&order_id=eq.${encodeURIComponent(orderId)}&revoked_at=is.null&select=*`,
    {
      method: 'GET',
      headers: buildSupabaseHeaders(cfg.secretKey),
    }
  );

  if (!res.ok) {
    return [];
  }

  const rows = (await res.json()) as SupabaseEntitlementRow[];
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => mapSupabaseRowToEntitlement(r));
}

/**
 * Lists a specific customer's orders and active (non-revoked) entitlements from Supabase,
 * strictly isolated by `firebase_uid == userId` and verified against `payment_status === 'paid'`.
 */
export async function listUserOrdersAndEntitlementsFromSupabase(
  userId: string
): Promise<{
  orders: ServerOrderRecord[];
  entitlements: ServerEntitlementRecord[];
}> {
  const trimmedUid = String(userId || '').trim();
  if (!trimmedUid) {
    return { orders: [], entitlements: [] };
  }

  const cfg = requireSupabaseServerConfig('listUserOrdersAndEntitlementsFromSupabase');

  const [ordersRes, entitlementsRes] = await Promise.all([
    fetch(
      `${cfg.url}/rest/v1/orders?firebase_uid=eq.${encodeURIComponent(
        trimmedUid
      )}&order=created_at.desc&select=*`,
      {
        method: 'GET',
        headers: buildSupabaseHeaders(cfg.secretKey),
      }
    ),
    fetch(
      `${cfg.url}/rest/v1/entitlements?firebase_uid=eq.${encodeURIComponent(
        trimmedUid
      )}&revoked_at=is.null&order=granted_at.desc&select=*`,
      {
        method: 'GET',
        headers: buildSupabaseHeaders(cfg.secretKey),
      }
    ),
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

  const orderRows = (await ordersRes.json()) as SupabaseOrderRow[];
  const entitlementRows = (await entitlementsRes.json()) as SupabaseEntitlementRow[];

  const orders = (Array.isArray(orderRows) ? orderRows : [])
    .map((r) => mapSupabaseRowToOrder(r))
    .filter((o) => o.userId === trimmedUid);

  const paidOrderIds = new Set(
    orders
      .filter((o) => o.paymentStatus === 'paid' && o.entitlementsGranted)
      .map((o) => o.id)
  );

  const entitlements = (Array.isArray(entitlementRows) ? entitlementRows : [])
    .filter((r) => !r.revoked_at && paidOrderIds.has(String(r.order_id || '').trim()))
    .map((r) => mapSupabaseRowToEntitlement(r))
    .filter((e) => e.userId === trimmedUid);

  return { orders, entitlements };
}

/**
 * Returns the list of productIds that a customer currently has active, unrevoked
 * entitlements for (backed by a verified `paid` order in `public.orders`).
 */
export async function listUserEntitledProductIdsFromSupabase(
  userId: string
): Promise<string[]> {
  const { entitlements } = await listUserOrdersAndEntitlementsFromSupabase(userId);
  return Array.from(new Set(entitlements.map((e) => e.productId)));
}

/**
 * Lists all customer orders from Supabase `public.orders` for a verified administrator.
 */
export async function listAllOrdersFromSupabaseForAdmin(): Promise<ServerOrderRecord[]> {
  const cfg = requireSupabaseServerConfig('listAllOrdersFromSupabaseForAdmin');

  const res = await fetch(
    `${cfg.url}/rest/v1/orders?order=created_at.desc&limit=500&select=*`,
    {
      method: 'GET',
      headers: buildSupabaseHeaders(cfg.secretKey),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Failed to list orders for admin from Supabase (${res.status}): ${errText.slice(0, 240)}`
    );
  }

  const rows = (await res.json()) as SupabaseOrderRow[];
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => mapSupabaseRowToOrder(r));
}

/**
 * Generates a short-lived (default 15-minute) signed read URL for an exact file path
 * inside the private `protected-media` Supabase Storage bucket.
 * Must only be called AFTER verifying the customer's entitlement.
 */
export async function createSupabaseSignedStorageUrl(params: {
  objectPath: string;
  bucketName?: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const cfg = requireSupabaseServerConfig('createSupabaseSignedStorageUrl');
  const validatedPath = validateProtectedStorageFilePath(params.objectPath);
  if (!validatedPath) {
    throw new Error(
      `Invalid or disallowed protected storage object path: "${params.objectPath}".`
    );
  }

  const bucket = (params.bucketName || cfg.storageBucket).trim();
  const expiresIn = Math.min(Math.max(60, Math.round(params.expiresInSeconds || 900)), 3600);
  const encodedPath = validatedPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  const signRes = await fetch(
    `${cfg.url}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodedPath}`,
    {
      method: 'POST',
      headers: buildSupabaseHeaders(cfg.secretKey),
      body: JSON.stringify({ expiresIn }),
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

  const data = (await signRes.json()) as { signedURL?: string; signedUrl?: string };
  const rawSignedPath = data.signedURL || data.signedUrl || '';
  if (!rawSignedPath) {
    throw new Error(
      `Supabase Storage did not return a signed URL for "${validatedPath}".`
    );
  }

  if (rawSignedPath.startsWith('http://') || rawSignedPath.startsWith('https://')) {
    return rawSignedPath;
  }

  const normalizedPrefix = rawSignedPath.startsWith('/storage/v1/')
    ? rawSignedPath
    : `/storage/v1${rawSignedPath.startsWith('/') ? '' : '/'}${rawSignedPath}`;

  return `${cfg.url}${normalizedPrefix}`;
}

/**
 * Generates a short-lived signed upload URL for a verified administrator to upload
 * a course video or digital book (up to 50 MB on the Supabase Free Plan) into the
 * private `protected-media` bucket.
 */
export async function createSupabaseSignedUploadUrlForAdmin(params: {
  objectPath: string;
  fileSizeBytes: number;
  bucketName?: string;
}): Promise<{
  signedUploadUrl: string;
  bucketName: string;
  objectPath: string;
  token?: string;
}> {
  const cfg = requireSupabaseServerConfig('createSupabaseSignedUploadUrlForAdmin');

  if (
    typeof params.fileSizeBytes === 'number' &&
    params.fileSizeBytes > SUPABASE_FREE_PLAN_MAX_FILE_BYTES
  ) {
    throw new Error(
      `File size (${(params.fileSizeBytes / (1024 * 1024)).toFixed(
        1
      )} MB) exceeds the 50 MB Supabase Free plan limit. Please split the course recording into 15–25 minute lesson modules or HLS segments under 50 MB each.`
    );
  }

  const validatedPath = validateProtectedStorageFilePath(params.objectPath);
  if (!validatedPath) {
    throw new Error(
      `Invalid protected storage upload path: "${params.objectPath}". Must be inside protected/courses/ or protected/books/.`
    );
  }

  const bucket = (params.bucketName || cfg.storageBucket).trim();
  const encodedPath = validatedPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  const res = await fetch(
    `${cfg.url}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${encodedPath}`,
    {
      method: 'POST',
      headers: buildSupabaseHeaders(cfg.secretKey, {
        'x-upsert': 'true',
      }),
      body: JSON.stringify({}),
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

  const data = (await res.json()) as { url?: string; token?: string };
  if (!data.url) {
    throw new Error('Supabase Storage did not return a signed upload URL.');
  }

  const fullUploadUrl = data.url.startsWith('http')
    ? data.url
    : `${cfg.url}/storage/v1${data.url.startsWith('/') ? '' : '/'}${data.url}`;

  return {
    signedUploadUrl: fullUploadUrl,
    bucketName: bucket,
    objectPath: validatedPath,
    token: data.token,
  };
}
