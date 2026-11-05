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
  SUPABASE_FREE_PLAN_MAX_FILE_BYTES,
  SUPABASE_PROTECTED_MEDIA_BUCKET,
  createPendingOrderInSupabase,
  createSupabaseSignedStorageUrl,
  createSupabaseSignedUploadUrlForAdmin,
  fulfillPaidOrderAtomicallyInSupabase,
  getOrderFromSupabase,
  getSupabaseServerConfig,
  listAllOrdersFromSupabaseForAdmin,
  listUserEntitledProductIdsFromSupabase,
  listUserOrdersAndEntitlementsFromSupabase,
  markOrderFailedOrCancelledInSupabase,
  saveCashfreeOrderIdInSupabase,
  updateOrderByAdminInSupabase,
  validateProtectedStorageFilePath,
  type ServerEntitlementRecord,
  type ServerOrderRecord,
} from './utils/supabaseServerStore';
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
    (process.env.SUPABASE_SECRET_KEY || '').trim() ||
    (process.env.CASHFREE_SECRET_KEY || '').trim();
  if (configuredSecret) {
    return configuredSecret;
  }
  return `satya-preview-hmac-${firebaseConfig.projectId}-${firebaseConfig.appId}`;
}

/**
 * Inspects Cashfree environment variables and key prefixes safely (without exposing secrets)
 * to determine the gateway mode and detect any Sandbox/Production credential mismatches.
 */
function getCashfreeConfig() {
  const appId = (process.env.CASHFREE_APP_ID || '').trim();
  const secretKey = (process.env.CASHFREE_SECRET_KEY || '').trim();
  const rawEnv = (process.env.CASHFREE_ENV || '').trim().toUpperCase();
  const apiVersion = (process.env.CASHFREE_API_VERSION || '2023-08-01').trim();

  const looksLikeSandboxKey =
    secretKey.startsWith('cfsk_ma_test_') || appId.toUpperCase().startsWith('TEST');
  const looksLikeProdKey = secretKey.startsWith('cfsk_ma_prod_');

  let isSandbox: boolean;
  if (rawEnv === 'SANDBOX' || rawEnv === 'TEST') {
    isSandbox = true;
  } else if (rawEnv === 'PRODUCTION' || rawEnv === 'PROD') {
    isSandbox = false;
  } else {
    isSandbox = looksLikeSandboxKey;
  }

  let credentialMismatchError: string | null = null;
  if (appId && secretKey) {
    if (!isSandbox && looksLikeSandboxKey) {
      credentialMismatchError =
        'Cashfree environment mismatch: CASHFREE_ENV is set to PRODUCTION, but the configured Cashfree credentials are Sandbox/Test keys. Either set CASHFREE_ENV=SANDBOX or configure live Production credentials.';
    } else if (isSandbox && looksLikeProdKey) {
      credentialMismatchError =
        'Cashfree environment mismatch: CASHFREE_ENV is set to SANDBOX, but CASHFREE_SECRET_KEY is a live Production key (cfsk_ma_prod_). Set CASHFREE_ENV=PRODUCTION for live credentials.';
    }
  }

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
    credentialMismatchError,
  };
}

function sanitizeCashfreeCustomerName(rawName: string, fallbackEmail?: string): string {
  const candidate = rawName.includes('@')
    ? rawName.split('@')[0]
    : rawName || (fallbackEmail ? fallbackEmail.split('@')[0] : 'Satya Student');
  const lettersAndSpaces = candidate
    .replace(/[^a-zA-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (lettersAndSpaces.length >= 3) {
    return lettersAndSpaces.slice(0, 90);
  }
  return 'Satya Student';
}

function sanitizeCashfreeIndianPhone(rawPhone: string): string {
  const digits = String(rawPhone || '').replace(/[^0-9]/g, '');
  const lastTen = digits.slice(-10);
  if (/^[6-9][0-9]{9}$/.test(lastTen)) {
    return lastTen;
  }
  return '9876543210';
}

function sanitizeCashfreeOrderNote(rawNote: string): string {
  return String(rawNote || '')
    .replace(/₹/g, 'INR ')
    .replace(/[^a-zA-Z0-9\s.,_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
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
 * Extracts a canonical private storage file path (`protected/courses/...` or `protected/books/...`)
 * from a server catalog path or legacy URL, stripping any query tokens and validating that it
 * refers to an actual file path (never an arbitrary or folder-only path).
 */
function resolveVerifiedProtectedFilePath(rawServerPathOrUrl: string): string | null {
  const trimmed = String(rawServerPathOrUrl || '').trim();
  if (!trimmed) return null;

  const directValidated = validateProtectedStorageFilePath(trimmed);
  if (directValidated) {
    return directValidated;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.includes('firebasestorage.googleapis.com')) {
      const match = parsed.pathname.match(/\/o\/(.+)$/);
      if (match?.[1]) {
        return validateProtectedStorageFilePath(decodeURIComponent(match[1]));
      }
    }
    if (parsed.pathname.includes('/storage/v1/object/')) {
      const match = parsed.pathname.match(
        /\/storage\/v1\/object\/(?:sign|public|authenticated)\/[^/]+\/(.+)$/
      );
      if (match?.[1]) {
        return validateProtectedStorageFilePath(decodeURIComponent(match[1]));
      }
    }
  } catch {
    // Not a URL
  }

  return null;
}

/**
 * Verifies the Firebase Authentication ID token against Google Identity Toolkit
 * for project `famous-campaign-mcbh2`. Never trusts unverified client headers,
 * body fields, or query parameters. Requires zero service-account private keys.
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
 * Independently queries Cashfree PG v3 `/orders/{orderId}` and `/orders/{orderId}/payments`
 * to verify:
 * 1. Merchant `order_id` matches `order.id`
 * 2. Cashfree `cf_order_id` matches `order.cashfreeOrderId` stored in `public.orders`
 * 3. `order_status === 'PAID'`
 * 4. Exact amount in paise (`Math.round(cfOrder.order_amount * 100) === order.totalAmountPaise`)
 * 5. `order_currency === 'INR'`
 * 6. A real `cf_payment_id` from a `payment_status === 'SUCCESS'` payment record (never invented)
 */
async function verifyOrderWithCashfreeServer(order: ServerOrderRecord): Promise<{
  verifiedPaid: boolean;
  cashfreeOrderStatus: string;
  cashfreeOrderId: string;
  cashfreePaymentId: string;
  verifiedAmountPaise: number;
  verifiedCurrency: string;
  error?: string;
}> {
  const cfConfig = getCashfreeConfig();
  if (!cfConfig.configured) {
    return {
      verifiedPaid: false,
      cashfreeOrderStatus: 'UNCONFIGURED',
      cashfreeOrderId: '',
      cashfreePaymentId: '',
      verifiedAmountPaise: 0,
      verifiedCurrency: '',
      error:
        'Cashfree payment gateway credentials (CASHFREE_APP_ID and CASHFREE_SECRET_KEY) are not configured on the server.',
    };
  }

  if (cfConfig.credentialMismatchError) {
    return {
      verifiedPaid: false,
      cashfreeOrderStatus: 'CREDENTIAL_MISMATCH',
      cashfreeOrderId: '',
      cashfreePaymentId: '',
      verifiedAmountPaise: 0,
      verifiedCurrency: '',
      error: cfConfig.credentialMismatchError,
    };
  }

  const storedCashfreeOrderId = String(order.cashfreeOrderId || '').trim();
  if (!storedCashfreeOrderId) {
    return {
      verifiedPaid: false,
      cashfreeOrderStatus: 'MISSING_CF_ORDER_ID',
      cashfreeOrderId: '',
      cashfreePaymentId: '',
      verifiedAmountPaise: 0,
      verifiedCurrency: '',
      error:
        `Order ${order.id} does not have a registered Cashfree cf_order_id in Supabase because its checkout session was not initialized. Please start a new checkout from your cart.`,
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
      cashfreeOrderId: '',
      cashfreePaymentId: '',
      verifiedAmountPaise: 0,
      verifiedCurrency: '',
      error: `Cashfree order verification request failed (${cfRes.status} in ${cfConfig.mode} mode): ${errBody.slice(0, 200)}`,
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
  const returnedMerchantOrderId = String(cfOrder.order_id || '').trim();
  const returnedCashfreeOrderId = String(cfOrder.cf_order_id ?? '').trim();
  const returnedCurrency = String(cfOrder.order_currency || '').trim().toUpperCase();
  const returnedAmountPaise =
    typeof cfOrder.order_amount === 'number' && Number.isFinite(cfOrder.order_amount)
      ? Math.round(cfOrder.order_amount * 100)
      : -1;

  if (returnedMerchantOrderId !== order.id) {
    return {
      verifiedPaid: false,
      cashfreeOrderStatus: cfStatus,
      cashfreeOrderId: returnedCashfreeOrderId,
      cashfreePaymentId: '',
      verifiedAmountPaise: returnedAmountPaise,
      verifiedCurrency: returnedCurrency,
      error: `Merchant order_id mismatch from Cashfree: expected ${order.id}, received ${returnedMerchantOrderId}.`,
    };
  }

  if (!returnedCashfreeOrderId || returnedCashfreeOrderId !== storedCashfreeOrderId) {
    return {
      verifiedPaid: false,
      cashfreeOrderStatus: cfStatus,
      cashfreeOrderId: returnedCashfreeOrderId,
      cashfreePaymentId: '',
      verifiedAmountPaise: returnedAmountPaise,
      verifiedCurrency: returnedCurrency,
      error: `Cashfree cf_order_id mismatch: expected ${storedCashfreeOrderId}, received ${returnedCashfreeOrderId || 'empty'}.`,
    };
  }

  const amountMatches = returnedAmountPaise === order.totalAmountPaise;
  const currencyMatches = returnedCurrency === 'INR';

  if (cfStatus !== 'PAID' || !amountMatches || !currencyMatches) {
    return {
      verifiedPaid: false,
      cashfreeOrderStatus: cfStatus,
      cashfreeOrderId: returnedCashfreeOrderId,
      cashfreePaymentId: '',
      verifiedAmountPaise: returnedAmountPaise,
      verifiedCurrency: returnedCurrency,
      error:
        cfStatus === 'PAID' && (!amountMatches || !currencyMatches)
          ? 'Cashfree order amount or currency mismatch.'
          : `Payment is not completed yet (Cashfree status: ${cfStatus}).`,
    };
  }

  // Independently verify the payment transaction list to obtain the real cf_payment_id
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

  if (!paymentsRes.ok) {
    const errText = await paymentsRes.text();
    return {
      verifiedPaid: false,
      cashfreeOrderStatus: 'PAYMENTS_LOOKUP_FAILED',
      cashfreeOrderId: returnedCashfreeOrderId,
      cashfreePaymentId: '',
      verifiedAmountPaise: returnedAmountPaise,
      verifiedCurrency: returnedCurrency,
      error: `Cashfree payments verification request failed (${paymentsRes.status}): ${errText.slice(
        0,
        200
      )}`,
    };
  }

  const paymentsList = (await paymentsRes.json()) as Array<{
    cf_payment_id?: string | number;
    order_id?: string;
    payment_status?: string;
    payment_amount?: number;
    payment_currency?: string;
  }>;

  const successPayment = Array.isArray(paymentsList)
    ? paymentsList.find(
        (p) =>
          String(p?.payment_status || '').toUpperCase() === 'SUCCESS' &&
          p?.cf_payment_id !== undefined &&
          p?.cf_payment_id !== null &&
          String(p.cf_payment_id).trim().length > 0
      )
    : undefined;

  if (!successPayment) {
    return {
      verifiedPaid: false,
      cashfreeOrderStatus: 'MISSING_SUCCESS_PAYMENT',
      cashfreeOrderId: returnedCashfreeOrderId,
      cashfreePaymentId: '',
      verifiedAmountPaise: returnedAmountPaise,
      verifiedCurrency: returnedCurrency,
      error:
        'Cashfree did not return a SUCCESS payment transaction with a valid cf_payment_id.',
    };
  }

  const realCashfreePaymentId = String(successPayment.cf_payment_id).trim();

  if (
    successPayment.order_id &&
    String(successPayment.order_id).trim() !== order.id
  ) {
    return {
      verifiedPaid: false,
      cashfreeOrderStatus: 'PAYMENT_ORDER_MISMATCH',
      cashfreeOrderId: returnedCashfreeOrderId,
      cashfreePaymentId: realCashfreePaymentId,
      verifiedAmountPaise: returnedAmountPaise,
      verifiedCurrency: returnedCurrency,
      error: 'Cashfree payment record order_id does not match the merchant order ID.',
    };
  }

  if (
    typeof successPayment.payment_amount === 'number' &&
    Number.isFinite(successPayment.payment_amount) &&
    Math.round(successPayment.payment_amount * 100) !== order.totalAmountPaise
  ) {
    return {
      verifiedPaid: false,
      cashfreeOrderStatus: 'PAYMENT_AMOUNT_MISMATCH',
      cashfreeOrderId: returnedCashfreeOrderId,
      cashfreePaymentId: realCashfreePaymentId,
      verifiedAmountPaise: returnedAmountPaise,
      verifiedCurrency: returnedCurrency,
      error: 'Cashfree payment transaction amount does not match the order total.',
    };
  }

  if (
    successPayment.payment_currency &&
    String(successPayment.payment_currency).trim().toUpperCase() !== 'INR'
  ) {
    return {
      verifiedPaid: false,
      cashfreeOrderStatus: 'PAYMENT_CURRENCY_MISMATCH',
      cashfreeOrderId: returnedCashfreeOrderId,
      cashfreePaymentId: realCashfreePaymentId,
      verifiedAmountPaise: returnedAmountPaise,
      verifiedCurrency: returnedCurrency,
      error: 'Cashfree payment transaction currency is not INR.',
    };
  }

  return {
    verifiedPaid: true,
    cashfreeOrderStatus: 'PAID',
    cashfreeOrderId: returnedCashfreeOrderId,
    cashfreePaymentId: realCashfreePaymentId,
    verifiedAmountPaise: returnedAmountPaise,
    verifiedCurrency: 'INR',
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

  // 3. Create Pending Order in Supabase & Initialize Cashfree Session
  // Validates Supabase + Cashfree config first, creates the pending order, requests the
  // Cashfree session, and persists `cf_order_id` before returning `paymentSessionId`.
  const handleCreatePendingCashfreeOrder = async (
    req: express.Request,
    res: express.Response
  ) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!authCtx || !authCtx.uid) {
      res.status(401).json({
        checkoutInitialized: false,
        error: 'Authentication required. Please log in with your account before checking out.',
      });
      return;
    }

    // 1. Verify Supabase and Cashfree server credentials & mode BEFORE creating any order row
    if (!getSupabaseServerConfig()) {
      res.status(503).json({
        checkoutInitialized: false,
        error:
          'Server database credentials (SUPABASE_URL and SUPABASE_SECRET_KEY) are not configured on the server.',
      });
      return;
    }

    const cfConfig = getCashfreeConfig();
    if (!cfConfig.configured) {
      res.status(503).json({
        checkoutInitialized: false,
        error:
          'Cashfree payment gateway credentials (CASHFREE_APP_ID and CASHFREE_SECRET_KEY) are not configured on the server.',
      });
      return;
    }

    if (cfConfig.credentialMismatchError) {
      res.status(503).json({
        checkoutInitialized: false,
        error: cfConfig.credentialMismatchError,
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
      res.status(400).json({
        checkoutInitialized: false,
        error: verifiedCart.error || 'Cart validation failed.',
      });
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
    const totalAmountPaise = Math.round(verifiedCart.totalAmountInr * 100);

    // Every new order MUST start with paymentStatus: 'pending' and entitlementsGranted: false
    const draftOrder: ServerOrderRecord = {
      id: orderId,
      userId: authCtx.uid,
      customerName: String(customerName || authCtx.email || 'Student').slice(0, 120),
      customerEmail: String(authCtx.email || 'student@example.com').slice(0, 256),
      totalAmountInr: verifiedCart.totalAmountInr,
      totalAmountPaise,
      currency: 'INR',
      paymentStatus: 'pending',
      shipmentStatus: verifiedCart.hasPhysicalItems ? 'processing' : 'not_applicable',
      cashfreeOrderId: '',
      cashfreePaymentId: '',
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
      pendingOrder = await createPendingOrderInSupabase(draftOrder);
    } catch (err) {
      res.status(503).json({
        checkoutInitialized: false,
        error:
          err instanceof Error
            ? err.message
            : 'Unable to save pending order in Supabase.',
      });
      return;
    }

    const sanitizedCustomerName = sanitizeCashfreeCustomerName(
      String(shippingAddress?.fullName || customerName || ''),
      pendingOrder.customerEmail
    );
    const sanitizedPhone = sanitizeCashfreeIndianPhone(
      String(shippingAddress?.phone || customerPhone || '')
    );
    const sanitizedCustomerId =
      authCtx.uid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || `cust_${Date.now()}`;
    const sanitizedNote = sanitizeCashfreeOrderNote(pendingOrder.itemSummary);

    // Cashfree Production requires https:// for return_url
    const validReturnUrl =
      typeof returnUrl === 'string' &&
      (returnUrl.startsWith('https://') ||
        (cfConfig.mode === 'sandbox' && returnUrl.startsWith('http://')))
        ? returnUrl
        : undefined;

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
          order_amount: Number(pendingOrder.totalAmountInr.toFixed(2)),
          order_currency: 'INR',
          customer_details: {
            customer_id: sanitizedCustomerId,
            customer_name: sanitizedCustomerName,
            customer_email: pendingOrder.customerEmail,
            customer_phone: sanitizedPhone,
          },
          ...(validReturnUrl
            ? {
                order_meta: {
                  return_url: validReturnUrl,
                },
              }
            : {}),
          order_note: sanitizedNote,
        }),
      });

      const rawResponseText = await cfCreateRes.text();
      let cfData: {
        payment_session_id?: string;
        cf_order_id?: string | number;
        order_id?: string;
        message?: string;
        code?: string;
        type?: string;
      } = {};
      try {
        cfData = JSON.parse(rawResponseText);
      } catch {
        // Non-JSON error body
      }

      const paymentSessionId = String(cfData.payment_session_id || '').trim();
      const realCashfreeOrderId =
        cfData.cf_order_id !== undefined && cfData.cf_order_id !== null
          ? String(cfData.cf_order_id).trim()
          : '';

      if (!cfCreateRes.ok || !paymentSessionId || !realCashfreeOrderId) {
        // Mark the order as 'failed' in Supabase so it does not remain as an uninitialized 'pending' order
        await markOrderFailedOrCancelledInSupabase(pendingOrder, 'failed');

        const safeCfDetails = [
          cfData.message,
          cfData.code ? `(code: ${cfData.code})` : '',
          cfData.type ? `[${cfData.type}]` : '',
        ]
          .filter(Boolean)
          .join(' ')
          .trim();

        res.status(502).json({
          checkoutInitialized: false,
          cashfreeMode: cfConfig.mode,
          error:
            safeCfDetails
              ? `Cashfree checkout initialization failed (HTTP ${cfCreateRes.status} in ${cfConfig.mode} mode): ${safeCfDetails}`
              : `Cashfree checkout initialization failed (HTTP ${cfCreateRes.status} in ${cfConfig.mode} mode). Please verify your Cashfree API credentials and environment mode.`,
        });
        return;
      }

      if (cfData.order_id && String(cfData.order_id).trim() !== pendingOrder.id) {
        await markOrderFailedOrCancelledInSupabase(pendingOrder, 'failed');
        res.status(502).json({
          checkoutInitialized: false,
          error: 'Cashfree returned a mismatched merchant order_id.',
        });
        return;
      }

      // Persist the real Cashfree cf_order_id in Supabase BEFORE returning paymentSessionId
      try {
        pendingOrder = await saveCashfreeOrderIdInSupabase({
          orderId: pendingOrder.id,
          cashfreeOrderId: realCashfreeOrderId,
        });
      } catch (saveErr) {
        await markOrderFailedOrCancelledInSupabase(pendingOrder, 'failed');
        res.status(503).json({
          checkoutInitialized: false,
          error:
            saveErr instanceof Error
              ? saveErr.message
              : 'Failed to store Cashfree cf_order_id in Supabase before checkout.',
        });
        return;
      }

      if (!pendingOrder.cashfreeOrderId || pendingOrder.cashfreeOrderId !== realCashfreeOrderId) {
        await markOrderFailedOrCancelledInSupabase(pendingOrder, 'failed');
        res.status(503).json({
          checkoutInitialized: false,
          error: 'Cashfree cf_order_id could not be verified in Supabase after saving.',
        });
        return;
      }

      res.json({
        checkoutInitialized: true,
        order: pendingOrder,
        cashfreeOrderId: pendingOrder.cashfreeOrderId,
        paymentSessionId,
        cashfreeMode: cfConfig.mode,
      });
    } catch (err) {
      await markOrderFailedOrCancelledInSupabase(pendingOrder, 'failed');
      res.status(502).json({
        checkoutInitialized: false,
        error:
          err instanceof Error
            ? `Cashfree connection error (${cfConfig.mode} mode): ${err.message}`
            : 'Unable to reach Cashfree Payment Gateway.',
      });
    }
  };

  app.post('/api/payments/cashfree/create-order', handleCreatePendingCashfreeOrder);
  app.post('/api/orders/create', handleCreatePendingCashfreeOrder);

  // 3B. Verify Cashfree Payment Status Before Calling Supabase `fulfill_paid_order`
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

    let order: ServerOrderRecord | null;
    try {
      order = await getOrderFromSupabase(orderId);
    } catch (err) {
      res.status(503).json({
        verified: false,
        error:
          err instanceof Error
            ? err.message
            : 'Server-side Supabase credentials (SUPABASE_URL and SUPABASE_SECRET_KEY) are required to verify orders.',
      });
      return;
    }

    if (!order) {
      res.status(404).json({ error: 'Order not found in Supabase.' });
      return;
    }

    const isCallerAdmin = canUserPerformAdminOperation(authCtx);

    // Ensure only the order owner or a verified admin can verify/inspect this order
    if (order.userId !== authCtx.uid && !isCallerAdmin) {
      res.status(403).json({ error: 'Forbidden: You do not own this order.' });
      return;
    }

    // Refuse to reactivate a refunded or cancelled order
    if (order.paymentStatus === 'refunded' || order.paymentStatus === 'cancelled') {
      res.status(409).json({
        verified: false,
        error: `Order ${order.id} has status "${order.paymentStatus}" and cannot be fulfilled or reactivated.`,
        order,
      });
      return;
    }

    // Idempotent return if already verified and unlocked in Supabase
    if (order.paymentStatus === 'paid' && order.entitlementsGranted) {
      const { entitlements } = await listUserOrdersAndEntitlementsFromSupabase(order.userId);
      res.json({
        verified: true,
        order,
        entitlements: entitlements.filter((e) => e.orderId === order!.id),
        alreadyFulfilled: true,
      });
      return;
    }

    // Refuse to verify an order that never received a Cashfree cf_order_id during checkout initialization
    if (!order.cashfreeOrderId) {
      res.status(400).json({
        verified: false,
        cashfreeOrderStatus: 'MISSING_CF_ORDER_ID',
        error: `Order ${order.id} never received a Cashfree checkout session (cashfree_order_id is NULL). Please start a new checkout from your cart.`,
        order,
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
              : 'Failed to persist verified payment and entitlements in Supabase.',
        });
        return;
      }
    }

    let updatedOrder = order;
    if (
      verification.cashfreeOrderStatus === 'EXPIRED' ||
      verification.cashfreeOrderStatus === 'TERMINATED'
    ) {
      updatedOrder = await markOrderFailedOrCancelledInSupabase(order, 'failed');
    } else if (verification.cashfreeOrderStatus === 'USER_DROPPED') {
      updatedOrder = await markOrderFailedOrCancelledInSupabase(order, 'cancelled');
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

  // 3C. Cashfree Server-to-Server Webhook Endpoint (HMAC-SHA256 Signature Verified + Supabase Fulfillment)
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
      if (!orderId) {
        res.status(400).json({ error: 'Missing order_id in Cashfree webhook payload.' });
        return;
      }

      let order: ServerOrderRecord | null;
      try {
        order = await getOrderFromSupabase(orderId);
      } catch (err) {
        res.status(503).json({
          error:
            err instanceof Error
              ? err.message
              : 'Server-side Supabase credentials are required to process webhooks.',
        });
        return;
      }

      if (!order) {
        res.status(404).json({ error: 'Order not found in Supabase.' });
        return;
      }

      // Never reactivate a refunded or cancelled order from a delayed webhook
      if (order.paymentStatus === 'refunded' || order.paymentStatus === 'cancelled') {
        res.json({
          received: true,
          orderId: order.id,
          paymentStatus: order.paymentStatus,
          ignored: true,
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
            onDecrementPhysicalStock: decrementPhysicalCatalogStock,
          });
          res.json({
            received: true,
            orderId: fulfilled.order.id,
            paymentStatus: fulfilled.order.paymentStatus,
            alreadyFulfilled: fulfilled.alreadyFulfilled,
          });
          return;
        } catch (err) {
          res.status(503).json({
            error:
              err instanceof Error
                ? err.message
                : 'Failed to fulfill verified webhook order in Supabase.',
          });
          return;
        }
      }

      res.json({ received: true, orderId: order.id, paymentStatus: order.paymentStatus });
    }
  );

  // 4. User Orders & Entitlements Endpoint (Strictly isolated to authenticated user's UID in Supabase)
  app.get('/api/user/library', async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!authCtx || !authCtx.uid) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const { orders, entitlements } = await listUserOrdersAndEntitlementsFromSupabase(
        authCtx.uid
      );

      res.json({
        orders,
        entitlements,
      });
    } catch (err) {
      res.status(503).json({
        error:
          err instanceof Error
            ? err.message
            : 'Unable to load customer orders and entitlements from Supabase.',
      });
    }
  });

  // 5. Protected Content Playback / Download Endpoint (Verified against Supabase Entitlements)
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
    if (product.type === 'course') {
      if (lessonId) {
        const candidate = serverLessons.get(String(lessonId));
        if (candidate && candidate.courseId === product.id) {
          lessonObj = candidate;
        }
      } else {
        const courseLessons = Array.from(serverLessons.values())
          .filter((l) => l.courseId === product.id)
          .sort((a, b) => a.orderIndex - b.orderIndex);
        lessonObj = courseLessons[0];
      }

      if (!lessonObj) {
        res.status(404).json({ error: 'Requested course lesson not found.' });
        return;
      }

      isFreePreview = Boolean(lessonObj.isFreePreview);
    }

    const isAdminCaller = canUserPerformAdminOperation(authCtx);

    // If not a free preview and not an admin, require Supabase entitlement check
    let userEntitledProductIds: string[] = [];
    if (!isFreePreview && !isAdminCaller) {
      if (!authCtx?.uid) {
        res.status(403).json({
          error: 'Access denied. Please sign in and purchase this item to access its content.',
          reason: 'unauthenticated',
        });
        return;
      }

      try {
        userEntitledProductIds = await listUserEntitledProductIdsFromSupabase(authCtx.uid);
      } catch (err) {
        res.status(503).json({
          error:
            err instanceof Error
              ? err.message
              : 'Supabase entitlement verification is required to access paid content.',
        });
        return;
      }
    }

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

    // For paid content, verify that Supabase server credentials are configured
    if (!isFreePreview && !getSupabaseServerConfig()) {
      res.status(503).json({
        error:
          'Server-side Supabase credentials (SUPABASE_URL and SUPABASE_SECRET_KEY) are required to issue signed URLs for paid content.',
      });
      return;
    }

    const expiresAt = Date.now() + 15 * 60 * 1000;
    const subjectUid = authCtx?.uid || 'preview';

    if (product.type === 'course' && lessonObj) {
      if (!lessonObj.isFreePreview) {
        const verifiedFilePath = resolveVerifiedProtectedFilePath(lessonObj.videoStoragePath);
        if (!verifiedFilePath) {
          res.status(500).json({
            error:
              'Course lesson does not have a valid private storage file path configured on the server.',
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
        bucket: lessonObj.isFreePreview ? 'public' : SUPABASE_PROTECTED_MEDIA_BUCKET,
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
      bucket: SUPABASE_PROTECTED_MEDIA_BUCKET,
      expiresAt: new Date(expiresAt).toISOString(),
      signedUrl: `/api/content/download-book?productId=${encodeURIComponent(
        product.id
      )}&token=${encodeURIComponent(downloadToken)}`,
    });
  });

  // 5B. Time-Limited, User-Bound Course Video Stream Endpoint
  app.get('/api/content/stream-video', async (req, res) => {
    const productId = String(req.query.productId || '');
    const lessonId = String(req.query.lessonId || '');
    const token = String(req.query.token || '');

    const product = serverProducts.get(productId);
    if (!product || product.type !== 'course') {
      res.status(404).send('Course not found.');
      return;
    }

    const lessonObj = serverLessons.get(lessonId);
    if (!lessonObj || lessonObj.courseId !== product.id) {
      res.status(404).send('Course lesson not found.');
      return;
    }

    const verification = verifySignedDownloadToken(token, `${productId}:${lessonId}`);
    if (!verification.valid || !verification.uid) {
      res.status(403).send('Forbidden: Valid signed video playback token required.');
      return;
    }

    if (lessonObj.isFreePreview) {
      const previewUrl =
        lessonObj.videoStoragePath.startsWith('http')
          ? lessonObj.videoStoragePath
          : product.previewVideoUrl ||
            'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
      res.setHeader('Cache-Control', 'private, no-store');
      res.redirect(302, previewUrl);
      return;
    }

    const isAdminUid = serverAdminUids.has(verification.uid);
    if (!isAdminUid) {
      try {
        const entitledIds = await listUserEntitledProductIdsFromSupabase(verification.uid);
        if (!entitledIds.includes(product.id)) {
          res
            .status(403)
            .send('Forbidden: Your entitlement for this course is inactive or was refunded.');
          return;
        }
      } catch (err) {
        res
          .status(503)
          .send(
            err instanceof Error
              ? err.message
              : 'Supabase entitlement verification unavailable.'
          );
        return;
      }
    }

    const verifiedObjectPath = resolveVerifiedProtectedFilePath(lessonObj.videoStoragePath);
    if (!verifiedObjectPath) {
      res
        .status(500)
        .send('Invalid private storage file path configured for this lesson.');
      return;
    }

    if (!getSupabaseServerConfig()) {
      res
        .status(503)
        .send(
          'Server-side Supabase credentials (SUPABASE_URL and SUPABASE_SECRET_KEY) are required to stream protected course videos.'
        );
      return;
    }

    try {
      const supabaseSignedUrl = await createSupabaseSignedStorageUrl({
        bucketName: SUPABASE_PROTECTED_MEDIA_BUCKET,
        objectPath: verifiedObjectPath,
        expiresInSeconds: 900,
      });

      res.setHeader('Cache-Control', 'private, no-store');
      res.redirect(302, supabaseSignedUrl);
      return;
    } catch {
      const fallbackUrl =
        product.previewVideoUrl ||
        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
      res.setHeader('Cache-Control', 'private, no-store');
      res.redirect(302, fallbackUrl);
    }
  });

  // 5C. Time-Limited, User-Bound Digital Book Download Endpoint
  app.get('/api/content/download-book', async (req, res) => {
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

    let entitledDownloadPath = `protected/books/${product.id}/${product.id}.pdf`;
    const isAdminUid = serverAdminUids.has(verification.uid);
    if (!isAdminUid) {
      try {
        const { entitlements } = await listUserOrdersAndEntitlementsFromSupabase(
          verification.uid
        );
        const matchingEntitlement = entitlements.find((e) => e.productId === product.id);
        if (!matchingEntitlement) {
          res
            .status(403)
            .send('Forbidden: Your entitlement for this book is inactive or was refunded.');
          return;
        }
        const validated = resolveVerifiedProtectedFilePath(matchingEntitlement.downloadPath);
        if (validated) {
          entitledDownloadPath = validated;
        }
      } catch (err) {
        res
          .status(503)
          .send(
            err instanceof Error
              ? err.message
              : 'Supabase entitlement verification unavailable.'
          );
        return;
      }
    }

    if (getSupabaseServerConfig()) {
      try {
        const signedBookUrl = await createSupabaseSignedStorageUrl({
          bucketName: SUPABASE_PROTECTED_MEDIA_BUCKET,
          objectPath: entitledDownloadPath,
          expiresInSeconds: 900,
        });
        res.setHeader('Cache-Control', 'private, no-store');
        res.redirect(302, signedBookUrl);
        return;
      } catch {
        // If PDF object is not uploaded in `protected-media` yet, serve licensed digital edition below
      }
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
      `Private Storage Path: ${entitledDownloadPath}`,
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

  // 6. Admin Panel Overview & Mutation Endpoints
  app.get('/api/admin/overview', async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!canUserPerformAdminOperation(authCtx)) {
      res.status(403).json({
        error: 'Forbidden: Verified administrator privileges required.',
      });
      return;
    }

    let allOrders: ServerOrderRecord[] = [];
    try {
      allOrders = await listAllOrdersFromSupabaseForAdmin();
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

  // 6B. Admin-Only Signed Upload URL for Private `protected-media` Supabase Bucket (Enforces 50 MB Free Plan Limit)
  app.post('/api/admin/storage/signed-upload-url', async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!canUserPerformAdminOperation(authCtx)) {
      res.status(403).json({
        error: 'Forbidden: Only verified administrators can upload protected course or book media.',
      });
      return;
    }

    const { objectPath, fileSizeBytes } = req.body || {};
    const numericSize = Number(fileSizeBytes || 0);

    if (numericSize > SUPABASE_FREE_PLAN_MAX_FILE_BYTES) {
      res.status(413).json({
        error: `File size (${(numericSize / (1024 * 1024)).toFixed(
          1
        )} MB) exceeds the 50 MB Supabase Free plan limit. Please split the course recording into 15–25 minute lesson modules or HLS segments under 50 MB each.`,
      });
      return;
    }

    try {
      const signedUpload = await createSupabaseSignedUploadUrlForAdmin({
        objectPath: String(objectPath || ''),
        fileSizeBytes: numericSize,
        bucketName: SUPABASE_PROTECTED_MEDIA_BUCKET,
      });
      res.json(signedUpload);
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error
            ? err.message
            : 'Unable to create signed upload URL for protected-media bucket.',
      });
    }
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
      if (!lesson.isFreePreview) {
        const verifiedPath = resolveVerifiedProtectedFilePath(lesson.videoStoragePath);
        if (!verifiedPath) {
          res.status(400).json({
            error:
              'Paid course lessons must specify a valid file path inside protected/courses/<courseId>/<filename>.mp4.',
          });
          return;
        }
        lesson.videoStoragePath = verifiedPath;
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
        const updated = await updateOrderByAdminInSupabase({
          orderId: String(orderId || ''),
          shipmentStatus,
          paymentStatus,
        });
        if (!updated) {
          res.status(404).json({ error: 'Order not found in Supabase.' });
          return;
        }
        res.json({ status: 'ok', order: updated });
        return;
      } catch (err) {
        res.status(503).json({
          error:
            err instanceof Error
              ? err.message
              : 'Server-side Supabase credentials required to update orders.',
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
