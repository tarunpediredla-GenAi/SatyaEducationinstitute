import express from 'express';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import firebaseConfig from '../firebase-applet-config.json';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  calculateVerifiedCartSummary,
  canUserAccessProtectedContent,
  canUserPerformAdminOperation,
  type AuthTokenContext,
  type CatalogProduct,
  type CourseLesson,
} from './utils/commerceRules';
import {
  createGcsV4SignedReadUrl,
  createPendingOrderInFirestore,
  fulfillPaidOrderAtomicallyInFirestore,
  getOrderFromFirestore,
  listAllOrdersFromFirestoreForAdmin,
  listUserEntitledProductIdsFromFirestore,
  listUserOrdersAndEntitlementsFromFirestore,
  markOrderFailedInFirestore,
  revokeProtectedStorageDownloadTokens,
  updateOrderByAdminInFirestore,
  type ServerEntitlementRecord,
  type ServerOrderRecord,
} from './utils/firestoreServerStore';
import {
  INITIAL_BANNERS,
  INITIAL_CATEGORIES,
  INITIAL_COURSE_DETAILS,
  INITIAL_LESSONS,
  INITIAL_PRODUCTS,
  type CategoryItem,
  type CourseCurriculumDetails,
  type PromotionalBanner,
} from './data/sampleCatalog';

if (!process.env.VERCEL) {
  try {
    dotenv.config();
  } catch {
    // Environment variables already available
  }
}

export type { ServerOrderRecord, ServerEntitlementRecord };

const serverProducts = new Map<string, CatalogProduct>(
  INITIAL_PRODUCTS.map((p) => [p.id, { ...p }])
);
const serverCategories = new Map<string, CategoryItem>(
  INITIAL_CATEGORIES.map((c) => [c.id, { ...c }])
);
const serverCourses = new Map<string, CourseCurriculumDetails>(
  Object.entries(INITIAL_COURSE_DETAILS).map(([k, v]) => [k, { ...v }])
);
const serverLessons = new Map<string, CourseLesson>(
  INITIAL_LESSONS.map((l) => [l.id, { ...l }])
);
const serverBanners = new Map<string, PromotionalBanner>(
  INITIAL_BANNERS.map((b) => [b.id, { ...b }])
);

const serverAdminUids = new Set<string>();
let legacyStorageTokensRevoked = false;

export interface VerifiedServerAuthContext extends AuthTokenContext {
  idToken: string;
}

// Short-lived cache for verified Firebase ID tokens
const verifiedTokenCache = new Map<
  string,
  { authCtx: VerifiedServerAuthContext; expiresAtMs: number }
>();

function getDownloadSigningSecret(): string {
  const configuredSecret =
    (process.env.FIREBASE_PRIVATE_KEY || '').trim() ||
    (process.env.CASHFREE_SECRET_KEY || '').trim();
  if (configuredSecret) {
    return configuredSecret;
  }
  return `satya-preview-hmac-${firebaseConfig.projectId}-${firebaseConfig.appId}`;
}

function getCashfreeConfig() {
  const appId = (process.env.CASHFREE_APP_ID || '').trim();
  const secretKey = (process.env.CASHFREE_SECRET_KEY || '').trim();
  const rawEnv = (process.env.CASHFREE_ENV || 'PRODUCTION').trim().toUpperCase();
  const isSandbox = rawEnv === 'SANDBOX' || rawEnv === 'TEST';
  const apiVersion = (process.env.CASHFREE_API_VERSION || '2023-08-01').trim();
  const baseUrl = isSandbox
    ? 'https://sandbox.cashfree.com/pg'
    : 'https://api.cashfree.com/pg';

  return {
    appId,
    secretKey,
    apiVersion,
    baseUrl,
    mode: isSandbox ? ('sandbox' as const) : ('production' as const),
    configured: Boolean(appId && secretKey),
  };
}

function createSignedDownloadToken(
  uid: string,
  resourceIdentifier: string,
  expiresAtMs: number
): string {
  const payload = `${uid}|${resourceIdentifier}|${expiresAtMs}`;
  const sig = crypto
    .createHmac('sha256', getDownloadSigningSecret())
    .update(payload)
    .digest('hex');
  return Buffer.from(`${payload}|${sig}`).toString('base64url');
}

function verifySignedDownloadToken(
  token: string,
  expectedResourceIdentifier: string
): { valid: boolean; uid?: string } {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split('|');
    if (parts.length !== 4) return { valid: false };
    const [uid, resourceId, expStr, providedSig] = parts;
    if (resourceId !== expectedResourceIdentifier) return { valid: false };
    const expMs = Number(expStr);
    if (!Number.isFinite(expMs) || Date.now() > expMs) return { valid: false };

    const expectedSig = crypto
      .createHmac('sha256', getDownloadSigningSecret())
      .update(`${uid}|${resourceId}|${expStr}`)
      .digest('hex');

    if (
      providedSig.length !== expectedSig.length ||
      !crypto.timingSafeEqual(Buffer.from(providedSig), Buffer.from(expectedSig))
    ) {
      return { valid: false };
    }
    return { valid: true, uid };
  } catch {
    return { valid: false };
  }
}

/**
 * Strips any Firebase Storage `?token=...` query parameter from a storage URL
 * or converts a Firebase Storage URL into its canonical object path so old
 * capability tokens cannot bypass paid-content protection.
 */
function extractProtectedStorageObjectPath(pathOrUrl: string): string | null {
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('protected/') || trimmed.startsWith('public/')) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.includes('firebasestorage.googleapis.com')) {
      const match = parsed.pathname.match(/\/o\/(.+)$/);
      if (match?.[1]) {
        return decodeURIComponent(match[1]);
      }
    }
  } catch {
    // Not a URL
  }
  return null;
}

/**
 * Automatically revokes any pre-existing `firebaseStorageDownloadTokens` on objects
 * inside `protected/` once Service Account credentials are active.
 */
async function ensureLegacyProtectedStorageTokensRevoked(): Promise<void> {
  if (legacyStorageTokensRevoked || !firebaseConfig.storageBucket) return;
  try {
    await revokeProtectedStorageDownloadTokens(firebaseConfig.storageBucket);
    legacyStorageTokensRevoked = true;
  } catch {
    // Will retry when Service Account credentials are configured
  }
}

/**
 * Verifies the Firebase Authentication ID token against Google Identity Toolkit
 * for project `famous-campaign-mcbh2`. Never trusts unverified client headers,
 * body fields, or query parameters.
 */
async function resolveServerAuthContext(
  req: express.Request
): Promise<VerifiedServerAuthContext | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) return null;

  const cached = verifiedTokenCache.get(idToken);
  if (cached && cached.expiresAtMs > Date.now()) {
    return cached.authCtx;
  }

  try {
    const apiKey = firebaseConfig.apiKey;
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      users?: Array<{
        localId?: string;
        email?: string;
        emailVerified?: boolean;
        customAttributes?: string;
      }>;
    };

    const fbUser = data.users?.[0];
    if (!fbUser || !fbUser.localId) {
      return null;
    }

    let customAdminClaim = false;
    if (fbUser.customAttributes) {
      try {
        const parsedClaims = JSON.parse(fbUser.customAttributes);
        customAdminClaim = parsedClaims?.admin === true || parsedClaims?.role === 'admin';
      } catch {
        // ignore invalid customAttributes JSON
      }
    }

    const email = fbUser.email?.trim();
    const emailVerified = Boolean(fbUser.emailVerified);
    const isVerifiedBootstrappedAdmin =
      Boolean(email) &&
      emailVerified === true &&
      email!.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

    if (isVerifiedBootstrappedAdmin || customAdminClaim) {
      serverAdminUids.add(fbUser.localId);
    }

    const authCtx: VerifiedServerAuthContext = {
      uid: fbUser.localId,
      email,
      emailVerified,
      customClaims: {
        admin: customAdminClaim,
      },
      isAdminRecordPresent: serverAdminUids.has(fbUser.localId),
      idToken,
    };

    verifiedTokenCache.set(idToken, {
      authCtx,
      expiresAtMs: Date.now() + 2 * 60 * 1000,
    });

    return authCtx;
  } catch {
    return null;
  }
}

function getActiveCouponsMap(): Record<string, number> {
  const map: Record<string, number> = {};
  for (const banner of serverBanners.values()) {
    if (banner.active && banner.couponCode) {
      map[banner.couponCode.toUpperCase()] = banner.discountPercent;
    }
  }
  return map;
}

function decrementPhysicalCatalogStock(productId: string, quantity: number): void {
  const prod = serverProducts.get(productId);
  if (prod && (prod.format === 'physical_book' || prod.format === 'hybrid_book')) {
    prod.stock = Math.max(0, prod.stock - quantity);
    serverProducts.set(prod.id, prod);
  }
}

/**
 * Independently queries Cashfree PG v3 `/orders/{orderId}` to verify payment status.
 * Never trusts client-supplied status flags.
 */
async function verifyOrderWithCashfreeServer(order: ServerOrderRecord): Promise<{
  verifiedPaid: boolean;
  cashfreeOrderStatus: string;
  paymentReference: string;
  error?: string;
}> {
  const cfConfig = getCashfreeConfig();
  if (!cfConfig.configured) {
    return {
      verifiedPaid: false,
      cashfreeOrderStatus: 'UNCONFIGURED',
      paymentReference: '',
      error:
        'Cashfree payment gateway credentials (CASHFREE_APP_ID and CASHFREE_SECRET_KEY) are not configured on the server.',
    };
  }

  const cfRes = await fetch(
    `${cfConfig.baseUrl}/orders/${encodeURIComponent(order.id)}`,
    {
      method: 'GET',
      headers: {
        'x-client-id': cfConfig.appId,
        'x-client-secret': cfConfig.secretKey,
        'x-api-version': cfConfig.apiVersion,
        Accept: 'application/json',
      },
    }
  );

  if (!cfRes.ok) {
    const errBody = await cfRes.text();
    return {
      verifiedPaid: false,
      cashfreeOrderStatus: 'LOOKUP_FAILED',
      paymentReference: '',
      error: `Cashfree order verification request failed (${cfRes.status}): ${errBody.slice(0, 200)}`,
    };
  }

  const cfOrder = (await cfRes.json()) as {
    order_id?: string;
    order_status?: string;
    order_amount?: number;
    order_currency?: string;
    cf_order_id?: string | number;
  };

  const cfStatus = String(cfOrder.order_status || 'ACTIVE').toUpperCase();
  const amountMatches =
    typeof cfOrder.order_amount === 'number' &&
    Math.abs(cfOrder.order_amount - order.totalAmountInr) < 0.01;
  const currencyMatches = String(cfOrder.order_currency || 'INR').toUpperCase() === 'INR';

  if (cfStatus === 'PAID' && amountMatches && currencyMatches) {
    let paymentRef = String(cfOrder.cf_order_id || `CF_${order.id}`);
    try {
      const paymentsRes = await fetch(
        `${cfConfig.baseUrl}/orders/${encodeURIComponent(order.id)}/payments`,
        {
          method: 'GET',
          headers: {
            'x-client-id': cfConfig.appId,
            'x-client-secret': cfConfig.secretKey,
            'x-api-version': cfConfig.apiVersion,
            Accept: 'application/json',
          },
        }
      );
      if (paymentsRes.ok) {
        const paymentsList = (await paymentsRes.json()) as Array<{
          cf_payment_id?: string | number;
          payment_status?: string;
        }>;
        const successPayment = Array.isArray(paymentsList)
          ? paymentsList.find((p) => String(p.payment_status).toUpperCase() === 'SUCCESS')
          : undefined;
        if (successPayment?.cf_payment_id) {
          paymentRef = `CF_PAY_${successPayment.cf_payment_id}`;
        }
      }
    } catch {
      // Keep cf_order_id reference if payment list lookup is skipped
    }

    return {
      verifiedPaid: true,
      cashfreeOrderStatus: 'PAID',
      paymentReference: paymentRef,
    };
  }

  return {
    verifiedPaid: false,
    cashfreeOrderStatus: cfStatus,
    paymentReference: '',
    error:
      cfStatus === 'PAID' && (!amountMatches || !currencyMatches)
        ? 'Cashfree order amount or currency mismatch.'
        : `Payment is not completed yet (Cashfree status: ${cfStatus}).`,
  };
}

export function createApiApp() {
  const app = express();

  app.use((req, _res, next) => {
    const forwardedUri = req.headers['x-forwarded-uri'] || req.headers['x-matched-path'];
    if (typeof forwardedUri === 'string' && forwardedUri.startsWith('/api/')) {
      req.url = forwardedUri;
    } else if (req.url.startsWith('/api/index.js')) {
      const rest = req.url.slice('/api/index.js'.length);
      req.url = `/api${rest.startsWith('/') ? '' : '/'}${rest}`;
    }

    if (
      process.env.VERCEL &&
      !req.url.startsWith('/api/') &&
      req.url !== '/api'
    ) {
      req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
    }
    next();
  });

  app.use(
    express.json({
      limit: '2mb',
      verify: (req: express.Request & { rawBody?: string }, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    })
  );

  // 0. Server-Verified Authentication Session & Role Endpoint
  app.get('/api/auth/session', async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!authCtx || !authCtx.uid) {
      res.status(401).json({ authenticated: false, error: 'Invalid or missing Firebase ID token.' });
      return;
    }

    const isAdmin = canUserPerformAdminOperation(authCtx);
    res.json({
      authenticated: true,
      uid: authCtx.uid,
      email: authCtx.email || '',
      emailVerified: Boolean(authCtx.emailVerified),
      role: isAdmin ? 'admin' : 'student',
    });
  });

  // 1. Public Catalog & Storefront Data Endpoint
  // Strip private paid video URLs/paths from all non-preview lessons
  app.get('/api/catalog', (_req, res) => {
    const sanitizedLessons = Array.from(serverLessons.values()).map((lesson) => ({
      ...lesson,
      videoStoragePath: lesson.isFreePreview ? lesson.videoStoragePath : '',
    }));

    res.json({
      products: Array.from(serverProducts.values()),
      categories: Array.from(serverCategories.values()),
      courseDetails: Object.fromEntries(serverCourses.entries()),
      lessons: sanitizedLessons,
      banners: Array.from(serverBanners.values()),
    });
  });

  // 2. Cart Price & Stock Verification Endpoint
  app.post('/api/cart/verify', (req, res) => {
    const { cartItems, couponCode, shippingAddressProvided } = req.body || {};
    const result = calculateVerifiedCartSummary({
      cartItems: Array.isArray(cartItems) ? cartItems : [],
      catalogById: serverProducts,
      couponCode,
      activeCoupons: getActiveCouponsMap(),
      shippingAddressProvided: Boolean(shippingAddressProvided),
    });
    res.json(result);
  });

  // 3. Create Pending Order in Firestore & Initialize Cashfree Session (NEVER marks order paid on creation)
  const handleCreatePendingCashfreeOrder = async (
    req: express.Request,
    res: express.Response
  ) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!authCtx || !authCtx.uid) {
      res.status(401).json({
        error: 'Authentication required. Please log in with your account before checking out.',
      });
      return;
    }

    const {
      cartItems,
      couponCode,
      shippingAddress,
      customerName,
      customerPhone,
      returnUrl,
    } = req.body || {};

    const hasAddress = Boolean(
      shippingAddress &&
        typeof shippingAddress.line1 === 'string' &&
        shippingAddress.line1.trim().length >= 3 &&
        typeof shippingAddress.city === 'string' &&
        shippingAddress.city.trim().length >= 2 &&
        typeof shippingAddress.postalCode === 'string' &&
        shippingAddress.postalCode.trim().length >= 4
    );

    const verifiedCart = calculateVerifiedCartSummary({
      cartItems: Array.isArray(cartItems) ? cartItems : [],
      catalogById: serverProducts,
      couponCode,
      activeCoupons: getActiveCouponsMap(),
      shippingAddressProvided: hasAddress,
    });

    if (!verifiedCart.valid) {
      res.status(400).json({ error: verifiedCart.error || 'Cart validation failed.' });
      return;
    }

    const orderId = `ORD_${Date.now().toString().slice(-6)}_${crypto
      .randomBytes(3)
      .toString('hex')
      .toUpperCase()}`;

    const addressSummary = verifiedCart.hasPhysicalItems
      ? `${shippingAddress.fullName || customerName || 'Customer'}, ${shippingAddress.line1}, ${
          shippingAddress.city
        }, ${shippingAddress.state || ''} - ${shippingAddress.postalCode} (${
          shippingAddress.phone || customerPhone || ''
        })`
      : 'Digital Delivery (My Courses & My Books Library)';

    const itemSummary = verifiedCart.items
      .map((i) => `${i.title} x${i.quantity} (₹${i.lineTotalInr})`)
      .join(' · ');

    const nowIso = new Date().toISOString();

    // Every new order MUST start with paymentStatus: 'pending' and entitlementsGranted: false
    const draftOrder: ServerOrderRecord = {
      id: orderId,
      userId: authCtx.uid,
      customerName: String(customerName || authCtx.email || 'Student').slice(0, 120),
      customerEmail: String(authCtx.email || 'student@example.com').slice(0, 256),
      totalAmountInr: verifiedCart.totalAmountInr,
      paymentStatus: 'pending',
      shipmentStatus: verifiedCart.hasPhysicalItems ? 'processing' : 'not_applicable',
      paymentReference: '',
      hasPhysicalItems: verifiedCart.hasPhysicalItems,
      shippingAddressSummary: addressSummary.slice(0, 600),
      itemSummary: itemSummary.slice(0, 1500),
      lineItems: verifiedCart.items.map((item) => ({
        productId: item.productId,
        title: item.title,
        type: item.type,
        format: item.format,
        quantity: item.quantity,
        unitPriceInr: item.unitPriceInr,
      })),
      entitlementsGranted: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    let pendingOrder: ServerOrderRecord;
    try {
      pendingOrder = await createPendingOrderInFirestore(draftOrder);
    } catch (err) {
      res.status(503).json({
        error:
          err instanceof Error
            ? err.message
            : 'Unable to save pending order in Firestore.',
      });
      return;
    }

    const cfConfig = getCashfreeConfig();
    if (!cfConfig.configured) {
      res.status(503).json({
        error:
          'Cashfree payment gateway credentials (CASHFREE_APP_ID and CASHFREE_SECRET_KEY) are not configured on the server. Order has been saved in Firestore with status "pending" and will not be marked paid until verified with Cashfree.',
        order: pendingOrder,
      });
      return;
    }

    const sanitizedPhone =
      String(shippingAddress?.phone || customerPhone || '9876543210')
        .replace(/[^0-9]/g, '')
        .slice(-10) || '9876543210';

    try {
      const cfCreateRes = await fetch(`${cfConfig.baseUrl}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': cfConfig.appId,
          'x-client-secret': cfConfig.secretKey,
          'x-api-version': cfConfig.apiVersion,
          Accept: 'application/json',
        },
        body: JSON.stringify({
          order_id: pendingOrder.id,
          order_amount: pendingOrder.totalAmountInr,
          order_currency: 'INR',
          customer_details: {
            customer_id: authCtx.uid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48),
            customer_name: pendingOrder.customerName,
            customer_email: pendingOrder.customerEmail,
            customer_phone: sanitizedPhone.length === 10 ? sanitizedPhone : '9876543210',
          },
          order_meta: {
            return_url:
              typeof returnUrl === 'string' && returnUrl.startsWith('http')
                ? returnUrl
                : undefined,
          },
          order_note: pendingOrder.itemSummary.slice(0, 200),
        }),
      });

      const cfData = (await cfCreateRes.json()) as {
        payment_session_id?: string;
        cf_order_id?: string | number;
        message?: string;
      };

      if (!cfCreateRes.ok || !cfData.payment_session_id) {
        res.status(502).json({
          error:
            cfData.message ||
            'Failed to initialize payment session with Cashfree Payment Gateway.',
          order: pendingOrder,
        });
        return;
      }

      res.json({
        order: pendingOrder,
        paymentSessionId: cfData.payment_session_id,
        cashfreeMode: cfConfig.mode,
      });
    } catch (err) {
      res.status(502).json({
        error:
          err instanceof Error
            ? `Cashfree connection error: ${err.message}`
            : 'Unable to reach Cashfree Payment Gateway.',
        order: pendingOrder,
      });
    }
  };

  app.post('/api/payments/cashfree/create-order', handleCreatePendingCashfreeOrder);
  app.post('/api/orders/create', handleCreatePendingCashfreeOrder);

  // 3B. Verify Cashfree Payment Status Before Updating Firestore Order to "paid" or Unlocking Content
  app.post('/api/payments/cashfree/verify', async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!authCtx || !authCtx.uid) {
      res.status(401).json({ error: 'Authentication required to verify payment.' });
      return;
    }

    const orderId = String(req.body?.orderId || '').trim();
    if (!orderId) {
      res.status(400).json({ error: 'Order ID is required for payment verification.' });
      return;
    }

    let fetched: { order: ServerOrderRecord; updateTime?: string } | null;
    try {
      fetched = await getOrderFromFirestore(orderId);
    } catch (err) {
      res.status(503).json({
        verified: false,
        error:
          err instanceof Error
            ? err.message
            : 'Privileged Firestore credentials are required to verify orders.',
      });
      return;
    }

    if (!fetched) {
      res.status(404).json({ error: 'Order not found in Firestore.' });
      return;
    }

    const { order } = fetched;
    const isCallerAdmin = canUserPerformAdminOperation(authCtx);

    // Ensure only the order owner or a verified admin can verify/inspect this order
    if (order.userId !== authCtx.uid && !isCallerAdmin) {
      res.status(403).json({ error: 'Forbidden: You do not own this order.' });
      return;
    }

    // Idempotent return if already verified and unlocked in Firestore
    if (order.paymentStatus === 'paid' && order.entitlementsGranted) {
      const { entitlements } = await listUserOrdersAndEntitlementsFromFirestore(
        order.userId,
        authCtx.idToken
      );
      res.json({
        verified: true,
        order,
        entitlements: entitlements.filter((e) => e.orderId === order.id),
        alreadyFulfilled: true,
      });
      return;
    }

    const verification = await verifyOrderWithCashfreeServer(order);
    if (verification.verifiedPaid) {
      try {
        const fulfilled = await fulfillPaidOrderAtomicallyInFirestore({
          orderId: order.id,
          paymentReference: verification.paymentReference,
          onDecrementPhysicalStock: decrementPhysicalCatalogStock,
        });

        res.json({
          verified: true,
          order: fulfilled.order,
          entitlements: fulfilled.entitlements,
          alreadyFulfilled: fulfilled.alreadyFulfilled,
        });
        return;
      } catch (err) {
        res.status(503).json({
          verified: false,
          error:
            err instanceof Error
              ? err.message
              : 'Failed to persist verified payment and entitlements in Firestore.',
        });
        return;
      }
    }

    let updatedOrder = order;
    if (
      verification.cashfreeOrderStatus === 'EXPIRED' ||
      verification.cashfreeOrderStatus === 'TERMINATED'
    ) {
      updatedOrder = await markOrderFailedInFirestore(order);
    }

    res.status(402).json({
      verified: false,
      cashfreeOrderStatus: verification.cashfreeOrderStatus,
      error:
        verification.error ||
        'Payment has not been verified as PAID by Cashfree yet. Purchased content remains locked.',
      order: updatedOrder,
    });
  });

  // 3C. Cashfree Server-to-Server Webhook Endpoint (HMAC-SHA256 Signature Verified + Service Account Fulfillment)
  app.post(
    '/api/payments/cashfree/webhook',
    async (req: express.Request & { rawBody?: string }, res) => {
      const cfConfig = getCashfreeConfig();
      if (!cfConfig.configured) {
        res.status(503).json({ error: 'Cashfree webhook secret not configured.' });
        return;
      }

      const signature = String(req.headers['x-webhook-signature'] || '');
      const timestamp = String(req.headers['x-webhook-timestamp'] || '');
      const rawBody = req.rawBody || '';

      if (!signature || !timestamp || !rawBody) {
        res.status(400).json({ error: 'Missing Cashfree webhook signature headers.' });
        return;
      }

      const expectedSignature = crypto
        .createHmac('sha256', cfConfig.secretKey)
        .update(`${timestamp}${rawBody}`)
        .digest('base64');

      if (
        signature.length !== expectedSignature.length ||
        !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
      ) {
        res.status(401).json({ error: 'Invalid Cashfree webhook signature.' });
        return;
      }

      const orderId = String(req.body?.data?.order?.order_id || '').trim();
      let fetched: { order: ServerOrderRecord; updateTime?: string } | null;
      try {
        fetched = await getOrderFromFirestore(orderId);
      } catch (err) {
        res.status(503).json({
          error:
            err instanceof Error
              ? err.message
              : 'Firebase Service Account credentials are required to process webhooks.',
        });
        return;
      }

      if (!fetched) {
        res.status(404).json({ error: 'Order not found in Firestore.' });
        return;
      }

      const { order } = fetched;
      const verification = await verifyOrderWithCashfreeServer(order);
      if (verification.verifiedPaid) {
        const fulfilled = await fulfillPaidOrderAtomicallyInFirestore({
          orderId: order.id,
          paymentReference: verification.paymentReference,
          onDecrementPhysicalStock: decrementPhysicalCatalogStock,
        });
        res.json({
          received: true,
          orderId: fulfilled.order.id,
          paymentStatus: fulfilled.order.paymentStatus,
          alreadyFulfilled: fulfilled.alreadyFulfilled,
        });
        return;
      }

      res.json({ received: true, orderId: order.id, paymentStatus: order.paymentStatus });
    }
  );

  // 4. User Orders & Entitlements Endpoint (Strictly isolated to authenticated user's UID in Firestore)
  app.get('/api/user/library', async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!authCtx || !authCtx.uid) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const { orders, entitlements } = await listUserOrdersAndEntitlementsFromFirestore(
      authCtx.uid,
      authCtx.idToken
    );

    res.json({
      orders,
      entitlements,
    });
  });

  // 5. Protected Content Playback / Download Endpoint (Verified against Firestore Entitlements)
  app.post('/api/content/signed-url', async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    const { productId, lessonId } = req.body || {};

    const product = serverProducts.get(String(productId || ''));
    if (!product) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    let isFreePreview = false;
    let lessonObj: CourseLesson | undefined;
    if (lessonId) {
      lessonObj = serverLessons.get(String(lessonId));
      if (lessonObj && lessonObj.isFreePreview) {
        isFreePreview = true;
      }
    } else if (product.type === 'course') {
      const courseLessons = Array.from(serverLessons.values())
        .filter((l) => l.courseId === product.id)
        .sort((a, b) => a.orderIndex - b.orderIndex);
      lessonObj = courseLessons[0];
      if (lessonObj && lessonObj.isFreePreview) {
        isFreePreview = true;
      }
    }

    const userEntitledProductIds = authCtx?.uid
      ? await listUserEntitledProductIdsFromFirestore(authCtx.uid, authCtx.idToken)
      : [];

    const accessCheck = canUserAccessProtectedContent({
      auth: authCtx,
      productId: product.id,
      isFreePreview,
      entitledProductIds: userEntitledProductIds,
    });

    if (!accessCheck.allowed) {
      res.status(403).json({
        error: 'Access denied. You must purchase this item to access its recordings or files.',
        reason: accessCheck.reason,
      });
      return;
    }

    const expiresAt = Date.now() + 15 * 60 * 1000;
    const subjectUid = authCtx?.uid || 'preview';

    if (product.type === 'course') {
      const resolvedLessonId = lessonObj?.id || 'default';
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
        )}`,
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
      )}&token=${encodeURIComponent(downloadToken)}`,
    });
  });

  // 5B. Time-Limited, User-Bound Course Video Stream Endpoint
  // Uses a 15-minute Google Cloud Storage V4 Signed URL redirect so large HD videos
  // stream directly from Google Cloud Storage without hitting Vercel's 4.5 MB payload limit
  // and without using permanent Firebase `?token=` download tokens.
  app.get('/api/content/stream-video', async (req, res) => {
    const productId = String(req.query.productId || '');
    const lessonId = String(req.query.lessonId || '');
    const token = String(req.query.token || '');

    const product = serverProducts.get(productId);
    if (!product || product.type !== 'course') {
      res.status(404).send('Course not found.');
      return;
    }

    const verification = verifySignedDownloadToken(token, `${productId}:${lessonId}`);
    if (!verification.valid || !verification.uid) {
      res.status(403).send('Forbidden: Valid signed video playback token required.');
      return;
    }

    const lessonObj = serverLessons.get(lessonId);
    const rawSource = lessonObj?.videoStoragePath || product.previewVideoUrl || '';
    const storageObjPath = extractProtectedStorageObjectPath(rawSource);

    if (storageObjPath && firebaseConfig.storageBucket) {
      await ensureLegacyProtectedStorageTokensRevoked();

      const gcsSignedUrl = createGcsV4SignedReadUrl({
        bucketName: firebaseConfig.storageBucket,
        objectPath: storageObjPath,
        expiresInSeconds: 900,
      });

      if (gcsSignedUrl) {
        res.setHeader('Cache-Control', 'private, no-store');
        res.redirect(302, gcsSignedUrl);
        return;
      }

      if (!lessonObj?.isFreePreview) {
        res.status(503).send(
          'Service Account credentials (FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY) are required to sign protected course video streams.'
        );
        return;
      }
    }

    const fallbackVideoUrl =
      rawSource.startsWith('http') && !rawSource.includes('firebasestorage.googleapis.com')
        ? rawSource
        : product.previewVideoUrl ||
          'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';

    res.setHeader('Cache-Control', 'private, no-store');
    res.redirect(302, fallbackVideoUrl);
  });

  app.get('/api/content/download-book', (req, res) => {
    const productId = String(req.query.productId || '');
    const token = String(req.query.token || '');

    const product = serverProducts.get(productId);
    if (!product) {
      res.status(404).send('Book not found.');
      return;
    }

    const verification = verifySignedDownloadToken(token, product.id);
    if (!verification.valid || !verification.uid) {
      res.status(403).send('Forbidden: Valid signed download token required.');
      return;
    }

    const content = [
      `====================================================================`,
      `SATYA'S EDUCATION — DIGITAL EDITION`,
      `====================================================================`,
      `Title: ${product.title}`,
      `Author / Publisher: ${product.authorOrInstructor}`,
      `Category: ${product.category}`,
      `Language: ${product.language}`,
      `Format: ${product.coverType}`,
      `Licensed To Student UID: ${verification.uid}`,
      `Issued At: ${new Date().toISOString()}`,
      `--------------------------------------------------------------------`,
      `SYNOPSIS & CHAPTER CONTENT:`,
      product.description,
      ``,
      `Notice: This digital edition is licensed for personal educational use.`,
      `====================================================================`,
    ].join('\n');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${product.slug}-satya-education.txt"`
    );
    res.send(content);
  });

  // 6. Admin Panel Overview & Mutation Endpoints (Strictly Server-Verified Admin Only + Firestore Orders)
  app.get('/api/admin/overview', async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!canUserPerformAdminOperation(authCtx)) {
      res.status(403).json({
        error: 'Forbidden: Verified administrator privileges required.',
      });
      return;
    }

    await ensureLegacyProtectedStorageTokensRevoked();

    let allOrders: ServerOrderRecord[] = [];
    try {
      allOrders = await listAllOrdersFromFirestoreForAdmin();
    } catch {
      allOrders = [];
    }

    const paidOrders = allOrders.filter((o) => o.paymentStatus === 'paid');
    const totalSalesInr = paidOrders.reduce((acc, o) => acc + o.totalAmountInr, 0);

    res.json({
      metrics: {
        totalSalesInr,
        paidOrdersCount: paidOrders.length,
        totalOrdersCount: allOrders.length,
        productsCount: serverProducts.size,
        coursesCount: Array.from(serverProducts.values()).filter((p) => p.type === 'course').length,
        booksCount: Array.from(serverProducts.values()).filter((p) => p.type === 'book').length,
        storybooksCount: Array.from(serverProducts.values()).filter((p) => p.type === 'storybook')
          .length,
      },
      orders: allOrders,
      products: Array.from(serverProducts.values()),
      categories: Array.from(serverCategories.values()),
      lessons: Array.from(serverLessons.values()),
      banners: Array.from(serverBanners.values()),
    });
  });

  app.post('/api/admin/action', async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!canUserPerformAdminOperation(authCtx)) {
      res.status(403).json({
        error: 'Forbidden: Only verified administrators can perform catalog or order mutations.',
      });
      return;
    }

    const { action, payload } = req.body || {};

    if (action === 'revoke_protected_storage_tokens') {
      try {
        const result = await revokeProtectedStorageDownloadTokens(
          firebaseConfig.storageBucket
        );
        legacyStorageTokensRevoked = true;
        res.json({ status: 'ok', ...result });
        return;
      } catch (err) {
        res.status(503).json({
          error:
            err instanceof Error
              ? err.message
              : 'Unable to revoke protected storage tokens.',
        });
        return;
      }
    }

    if (action === 'upsert_product') {
      const prod = payload as CatalogProduct;
      if (!prod || !prod.id || !prod.title || prod.priceInr < 0) {
        res.status(400).json({ error: 'Invalid product payload.' });
        return;
      }
      serverProducts.set(prod.id, {
        ...prod,
        updatedAt: new Date().toISOString(),
      });
      if (prod.type === 'course') {
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
          syllabusSummary:
            existingCourse?.syllabusSummary ||
            'Module 1: Core Foundations · Module 2: Practical Implementation',
          status: prod.status,
        });
      }
      res.json({ status: 'ok', product: serverProducts.get(prod.id) });
      return;
    }

    if (action === 'update_product_status') {
      const { productId, status, featured, stock, priceInr } = payload || {};
      const existing = serverProducts.get(String(productId || ''));
      if (!existing) {
        res.status(404).json({ error: 'Product not found.' });
        return;
      }
      if (status) existing.status = status;
      if (typeof featured === 'boolean') existing.featured = featured;
      if (typeof stock === 'number' && stock >= 0) existing.stock = stock;
      if (typeof priceInr === 'number' && priceInr >= 0) existing.priceInr = priceInr;
      existing.updatedAt = new Date().toISOString();
      serverProducts.set(existing.id, existing);
      res.json({ status: 'ok', product: existing });
      return;
    }

    if (action === 'add_lesson') {
      const lesson = payload as CourseLesson;
      if (!lesson || !lesson.id || !lesson.courseId || !lesson.title) {
        res.status(400).json({ error: 'Invalid lesson payload.' });
        return;
      }
      serverLessons.set(lesson.id, lesson);
      res.json({ status: 'ok', lesson });
      return;
    }

    if (action === 'add_category') {
      const cat = payload as CategoryItem;
      if (!cat || !cat.id || !cat.name) {
        res.status(400).json({ error: 'Invalid category payload.' });
        return;
      }
      serverCategories.set(cat.id, cat);
      res.json({ status: 'ok', category: cat });
      return;
    }

    if (action === 'update_order') {
      const { orderId, shipmentStatus, paymentStatus } = payload || {};
      try {
        const updated = await updateOrderByAdminInFirestore({
          orderId: String(orderId || ''),
          shipmentStatus,
          paymentStatus,
          onDecrementPhysicalStock: decrementPhysicalCatalogStock,
        });
        if (!updated) {
          res.status(404).json({ error: 'Order not found in Firestore.' });
          return;
        }
        res.json({ status: 'ok', order: updated });
        return;
      } catch (err) {
        res.status(503).json({
          error:
            err instanceof Error
              ? err.message
              : 'Service Account credentials required to update orders.',
        });
        return;
      }
    }

    if (action === 'upsert_banner') {
      const banner = payload as PromotionalBanner;
      if (!banner || !banner.id || !banner.title) {
        res.status(400).json({ error: 'Invalid banner payload.' });
        return;
      }
      serverBanners.set(banner.id, banner);
      res.json({ status: 'ok', banner });
      return;
    }

    res.status(400).json({ error: `Unknown admin action: ${String(action)}` });
  });

  return app;
}
