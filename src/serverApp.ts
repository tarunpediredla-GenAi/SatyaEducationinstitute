import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import firebaseConfig from '../firebase-applet-config.json';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  calculateVerifiedCartSummary,
  canUserAccessProtectedContent,
  canUserPerformAdminOperation,
  evaluateOrderWebhookTransition,
  type AuthTokenContext,
  type CatalogProduct,
  type CourseLesson,
  type OrderStateRecord,
} from './utils/commerceRules';
import {
  computeCashfreeWebhookSignature,
  verifyCashfreeWebhookSignature,
} from './utils/serverCrypto';
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
    // Environment variables already available in serverless runtime
  }
}

// Dynamically and safely initialize Firebase Admin SDK when real service account credentials are provided
let adminAppInitialized = false;
async function ensureAdminAppInitialized(): Promise<boolean> {
  if (adminAppInitialized) return true;
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (
      projectId &&
      clientEmail &&
      rawPrivateKey &&
      projectId !== 'your-project-id' &&
      !rawPrivateKey.includes('YOUR_PRIVATE_KEY_HERE') &&
      rawPrivateKey.includes('BEGIN PRIVATE KEY')
    ) {
      const { initializeApp: initializeAdminApp, cert, getApps } = await import('firebase-admin/app');
      if (getApps().length === 0) {
        initializeAdminApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey: rawPrivateKey.replace(/\\n/g, '\n'),
          }),
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        });
      }
      adminAppInitialized = true;
      return true;
    }
  } catch {
    adminAppInitialized = false;
  }
  return false;
}

// Server-side authoritative state store (synchronized with Firestore client/admin operations)
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

export interface ServerOrderRecord extends OrderStateRecord {
  customerName: string;
  customerEmail: string;
  cashfreeOrderId: string;
  shippingAddressSummary: string;
  itemSummary: string;
  lineItems: {
    productId: string;
    title: string;
    type: 'course' | 'book' | 'storybook';
    format: string;
    quantity: number;
    unitPriceInr: number;
  }[];
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

// Payment orders and access grants are stored in Firestore, never process memory.

/**
 * Never trust unsigned JWT payloads, client-supplied uid/role fields, or custom
 * session headers as identity. Only Firebase Admin's signature verification
 * authorizes a payment, library, or administrator request.
 */
async function resolveServerAuthContext(req: express.Request): Promise<AuthTokenContext | null> {
  const bearer = typeof req.headers.authorization === 'string' &&
    req.headers.authorization.startsWith('Bearer ')
    ? req.headers.authorization.slice(7).trim()
    : '';
  // Vercel rewrites should preserve Authorization; signed tokens in request
  // bodies are supported for older clients without trusting other body fields.
  const bodyToken = typeof req.body?.idToken === 'string' ? req.body.idToken : '';
  const token = bearer || bodyToken;
  if (!token || !(await ensureAdminAppInitialized())) return null;
  try {
    const { getAuth } = await import('firebase-admin/auth');
    const decoded = await getAuth().verifyIdToken(token, true);
    return {
      uid: decoded.uid,
      email: decoded.email,
      emailVerified: decoded.email_verified,
      customClaims: { admin: decoded.admin === true },
    };
  } catch {
    return null;
  }
}

async function getPaymentDb() {
  if (!(await ensureAdminAppInitialized())) {
    throw new Error('Firebase Admin service account credentials are missing or invalid.');
  }
  const { getApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  // Match the *named* database used by the client, not the default database.
  const databaseId = process.env.FIREBASE_DATABASE_ID || firebaseConfig.firestoreDatabaseId;
  return getFirestore(getApp(), databaseId);
}

async function loadStoredOrder(orderId: string): Promise<ServerOrderRecord | null> {
  if (!/^ord_satya_[a-zA-Z0-9_]+$/.test(orderId)) return null;
  const db = await getPaymentDb();
  const doc = await db.collection('orders').doc(orderId).get();
  return doc.exists ? (doc.data() as ServerOrderRecord) : null;
}

/** A successful frontend popup or signed webhook is not a payment receipt.
 * Always confirm both the order AND a successful payment with Cashfree APIs.
 */
async function fetchVerifiedCashfreePayment(order: ServerOrderRecord): Promise<string | null> {
  const appId = cleanEnvString(process.env.CASHFREE_APP_ID);
  const secret = getCashfreeSecretKey();
  if (!appId || !secret) throw new Error('Cashfree credentials are not configured.');
  const cfEnv = cleanEnvString(process.env.CASHFREE_ENV).toLowerCase() === 'production'
    ? 'production' : 'sandbox';
  const endpoint = cfEnv === 'production'
    ? 'https://api.cashfree.com/pg/orders'
    : 'https://sandbox.cashfree.com/pg/orders';
  const headers = {
    'x-api-version': process.env.CASHFREE_API_VERSION || '2023-08-01',
    'x-client-id': appId,
    'x-client-secret': secret,
  };
  const orderResponse = await fetch(`${endpoint}/${encodeURIComponent(order.id)}`, { headers });
  if (!orderResponse.ok) throw new Error(`Cashfree order verification failed (HTTP ${orderResponse.status})`);
  const cfOrder = await orderResponse.json() as any;
  const amountMatches = (a: unknown) => Number.isFinite(Number(a)) &&
    Math.abs(Number(a) - order.totalAmountInr) < 0.005;
  if (cfOrder.order_id !== order.id || cfOrder.order_status !== 'PAID' ||
      cfOrder.order_currency !== 'INR' || !amountMatches(cfOrder.order_amount)) return null;
  const paymentsResponse = await fetch(
    `${endpoint}/${encodeURIComponent(order.id)}/payments`, { headers }
  );
  if (!paymentsResponse.ok) throw new Error(`Cashfree payment lookup failed (HTTP ${paymentsResponse.status})`);
  const payments = await paymentsResponse.json() as any;
  const successfulPayment = Array.isArray(payments) ? payments.find((p: any) =>
    p.payment_status === 'SUCCESS' && amountMatches(p.payment_amount) &&
    (!p.payment_currency || p.payment_currency === 'INR') && p.cf_payment_id
  ) : null;
  return successfulPayment ? String(successfulPayment.cf_payment_id) : null;
}

async function fulfillVerifiedPaidOrder(
  order: ServerOrderRecord, cashfreePaymentId: string
): Promise<{alreadyProcessed: boolean; entitlementsGranted: ServerEntitlementRecord[]}> {
  const db = await getPaymentDb();
  const orderRef = db.collection('orders').doc(order.id);
  const grants: ServerEntitlementRecord[] = [];
  let alreadyProcessed = false;
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(orderRef);
    if (!snapshot.exists) throw new Error('Payment order no longer exists.');
    const saved = snapshot.data() as ServerOrderRecord;
    if (saved.paymentStatus === 'paid') {
      alreadyProcessed = true;
      return;
    }
    const transition = evaluateOrderWebhookTransition({
      order: saved,
      cashfreePaymentStatus: 'SUCCESS',
      paidAmountInr: saved.totalAmountInr,
      cashfreePaymentId,
    });
    if (!transition.shouldUpdateOrder || !transition.shouldGrantEntitlements) {
      throw new Error('Payment transition rejected.');
    }
    tx.update(orderRef, {
      paymentStatus: 'paid',
      shipmentStatus: transition.nextShipmentStatus,
      cashfreePaymentId,
      updatedAt: new Date().toISOString(),
    });
    for (const item of saved.lineItems) {
      if (!['recorded_course', 'digital_book', 'hybrid_book'].includes(item.format)) continue;
      const id = `${saved.userId}_${item.productId}`;
      const record: ServerEntitlementRecord = {
        id, userId: saved.userId, productId: item.productId,
        productType: item.type, orderId: saved.id,
        downloadPath: item.type === 'course'
          ? `protected/courses/${item.productId}`
          : `protected/books/${item.productId}/${item.productId}.pdf`,
        grantedAt: new Date().toISOString(),
      };
      tx.set(db.collection('entitlements').doc(id), record);
      grants.push(record);
    }
  });
  return { alreadyProcessed, entitlementsGranted: grants };
}

async function recordUnsuccessfulPayment(
  order: ServerOrderRecord, status: string, amount: number, paymentId: string
): Promise<void> {
  const db = await getPaymentDb();
  const ref = db.collection('orders').doc(order.id);
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) return;
    const saved = doc.data() as ServerOrderRecord;
    if (saved.paymentStatus === 'paid') return;
    const transition = evaluateOrderWebhookTransition({
      order: saved, cashfreePaymentStatus: status,
      paidAmountInr: amount, cashfreePaymentId: paymentId,
    });
    if (transition.shouldUpdateOrder) tx.update(ref, {
      paymentStatus: transition.nextPaymentStatus,
      shipmentStatus: transition.nextShipmentStatus,
      cashfreePaymentId: paymentId,
      updatedAt: new Date().toISOString(),
    });
  });
}

function cleanEnvString(val?: string): string {
  if (!val) return '';
  let cleaned = val.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

function getCashfreeSecretKey(): string {
  return cleanEnvString(process.env.CASHFREE_SECRET_KEY);
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

export function createApiApp() {
  const app = express();

  // Normalize URL prefix when invoked inside Vercel Serverless Functions rewrite
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

  // Health and ping check for webhook endpoint
  app.get('/api/cashfree/webhook', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: "Satya's Education Cashfree Webhook Service",
      timestamp: new Date().toISOString(),
    });
  });

  // CRITICAL: Cashfree Webhook route MUST read raw request body BEFORE express.json()
  app.post(
    '/api/cashfree/webhook',
    express.raw({ type: 'application/json', limit: '1mb' }),
    async (req, res) => {
      const signatureHeader = req.headers['x-webhook-signature'] as string | undefined;
      const timestampHeader = req.headers['x-webhook-timestamp'] as string | undefined;
      if (!Buffer.isBuffer(req.body) ||
          !verifyCashfreeWebhookSignature({
            timestampHeader, signatureHeader, rawBody: req.body.toString('utf8'),
            secretKey: getCashfreeSecretKey(),
          })) {
        res.status(401).json({error: 'Invalid Cashfree webhook signature.'});
        return;
      }
      try {
        const payload = JSON.parse(req.body.toString('utf8'));
        const orderId = String(payload?.data?.order?.order_id || '');
        const status = String(payload?.data?.payment?.payment_status || '');
        const amount = Number(payload?.data?.payment?.payment_amount);
        const currency = String(payload?.data?.payment?.payment_currency || payload?.data?.order?.order_currency || '');
        const paymentId = String(payload?.data?.payment?.cf_payment_id || '');
        const order = await loadStoredOrder(orderId);
        if (!order) {
          // Let Cashfree retry if order persistence is temporarily unavailable.
          res.status(404).json({error:'Order not found.'});
          return;
        }
        if (status === 'SUCCESS') {
          if (currency !== 'INR' || !Number.isFinite(amount) ||
              Math.abs(amount - order.totalAmountInr) >= 0.005 || !paymentId) {
            res.status(400).json({error:'Payment amount, currency, or ID mismatch.'});
            return;
          }
          const verifiedPaymentId = await fetchVerifiedCashfreePayment(order);
          if (!verifiedPaymentId || verifiedPaymentId !== paymentId) {
            res.status(503).json({error:'Cashfree has not confirmed this payment.'});
            return;
          }
          const result = await fulfillVerifiedPaidOrder(order, verifiedPaymentId);
          res.json({status:'ok', orderId:order.id, paid:true, alreadyProcessed:result.alreadyProcessed});
          return;
        }
        if (status === 'FAILED' || status === 'USER_DROPPED') {
          await recordUnsuccessfulPayment(order, status, amount, paymentId);
        }
        res.json({status:'ok', orderId:order.id});
      } catch (err) {
        console.error('Cashfree webhook processing error:', err);
        res.status(503).json({error:'Webhook could not be processed; please retry.'});
      }
    }
  );

  // Standard JSON parser for all other API endpoints
  app.use(express.json({ limit: '2mb' }));

  // 1. Public Catalog & Storefront Data Endpoint
  app.get('/api/catalog', (_req, res) => {
    res.json({
      products: Array.from(serverProducts.values()),
      categories: Array.from(serverCategories.values()),
      courseDetails: Object.fromEntries(serverCourses.entries()),
      lessons: Array.from(serverLessons.values()),
      banners: Array.from(serverBanners.values()),
    });
  });

  // 2. Server-Side Cart Price & Stock Verification Endpoint
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

  // 3. Create Cashfree Order (Server-Authoritative Price & Stock Check)
  app.post('/api/cashfree/create-order', async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!authCtx || !authCtx.uid) {
      res.status(401).json({
        error: 'Authentication required. Please sign in before checking out.',
      });
      return;
    }

    const { cartItems, couponCode, shippingAddress, customerName, customerEmail, customerPhone } =
      req.body || {};

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

    const orderId = `ord_satya_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const addressSummary = verifiedCart.hasPhysicalItems
      ? `${shippingAddress.fullName || customerName || 'Student'}, ${shippingAddress.line1}, ${
          shippingAddress.city
        }, ${shippingAddress.state || ''} - ${shippingAddress.postalCode} (${
          shippingAddress.phone || customerPhone || ''
        })`
      : 'Digital Delivery (My Courses & My Books Library)';

    const itemSummary = verifiedCart.items
      .map((i) => `${i.title} x${i.quantity} (₹${i.lineTotalInr})`)
      .join(' · ');

    const providedPhone = String(customerPhone || shippingAddress?.phone || '').replace(/[^0-9]/g, '').slice(-10);
    if (!/^[6-9][0-9]{9}$/.test(providedPhone) || providedPhone === '9876543210') {
      res.status(400).json({error:'Please enter a valid 10-digit Indian mobile number before paying.'});
      return;
    }
    if (!authCtx.email) {
      res.status(400).json({error:'Please sign in with an account that has an email address.'});
      return;
    }
    const nowIso = new Date().toISOString();
    const newOrder: ServerOrderRecord = {
      id: orderId,
      userId: authCtx.uid,
      customerName: String(customerName || authCtx.email || 'Student').slice(0, 120),
      customerEmail: authCtx.email.slice(0, 256),
      totalAmountInr: verifiedCart.totalAmountInr,
      paymentStatus: 'pending',
      shipmentStatus: verifiedCart.hasPhysicalItems ? 'processing' : 'not_applicable',
      cashfreeOrderId: orderId,
      cashfreePaymentId: '',
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
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    // Persist pending orders before opening checkout; never use function memory for payments.
    try {
      const db = await getPaymentDb();
      await db.collection('orders').doc(orderId).create(newOrder);
    } catch (error) {
      console.error('Could not persist payment order:', error);
      res.status(503).json({error:'Payment database is unavailable. Please try again later.'});
      return;
    }

    const cfAppId = cleanEnvString(process.env.CASHFREE_APP_ID);
    const cfSecret = cleanEnvString(process.env.CASHFREE_SECRET_KEY);
    // Server configuration, never a browser variable or heuristic, chooses live mode.
    const cfEnv: 'production' | 'sandbox' =
      cleanEnvString(process.env.CASHFREE_ENV).toLowerCase() === 'production'
        ? 'production' : 'sandbox';
    const isTestKey = cfAppId.startsWith('TEST') || cfSecret.includes('_test_');

    if (process.env.VERCEL_ENV === 'preview' && cfEnv === 'production') {
      res.status(503).json({error:'Live Cashfree checkout is blocked on preview deployments. Configure sandbox credentials for testing.'});
      return;
    }

    if (cfEnv === 'production') {
      if (isTestKey) {
        res.status(400).json({
          error:
            'Configuration Error: You have configured CASHFREE_ENV="production", but your API credentials are for the Sandbox Test environment (starts with TEST / contains _test_). To accept real payments, please switch to the LIVE tab in your Cashfree Merchant Dashboard (https://merchant.cashfree.com) and copy your LIVE App ID and Secret Key into Vercel environment variables.',
        });
        return;
      }
      if (!cfAppId || !cfSecret || cfAppId === 'TEST_YOUR_CASHFREE_APP_ID' || cfSecret === 'TEST_YOUR_CASHFREE_SECRET_KEY') {
        res.status(400).json({
          error:
            'Cashfree Live Configuration Missing: To accept live payments, please add CASHFREE_APP_ID and CASHFREE_SECRET_KEY from your Cashfree Live dashboard to your Vercel Project Settings -> Environment Variables, and then redeploy.',
        });
        return;
      }
    }

    if (
      cfAppId &&
      cfSecret &&
      cfAppId !== 'TEST_YOUR_CASHFREE_APP_ID' &&
      cfSecret !== 'TEST_YOUR_CASHFREE_SECRET_KEY'
    ) {
      try {
        const baseUrl =
          cfEnv === 'production'
            ? 'https://api.cashfree.com/pg/orders'
            : 'https://sandbox.cashfree.com/pg/orders';

        const appUrl = (process.env.APP_URL || 'https://satyaeducationinstitute.vercel.app').replace(/\/$/, '');

        const cfRes = await fetch(baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-version': process.env.CASHFREE_API_VERSION || '2023-08-01',
            'x-client-id': cfAppId,
            'x-client-secret': cfSecret,
          },
          body: JSON.stringify({
            order_id: orderId,
            order_amount: verifiedCart.totalAmountInr,
            order_currency: 'INR',
            customer_details: {
              customer_id: authCtx.uid.slice(0, 45),
              customer_name: newOrder.customerName,
              customer_email: newOrder.customerEmail,
              customer_phone: providedPhone,
            },
            order_meta: {
              return_url: `${appUrl}/?order_id={order_id}`,
              notify_url: `${appUrl}/api/cashfree/webhook`,
            },
          }),
        });

        if (cfRes.ok) {
          const cfData = (await cfRes.json()) as {
            cf_order_id?: string;
            payment_session_id?: string;
          };
          if (!cfData.payment_session_id) {
            res.status(502).json({error:'Cashfree returned no payment session.'});
            return;
          }
          res.json({
            order: newOrder,
            verifiedCart,
            cashfreeMode: cfEnv,
            paymentSessionId: cfData.payment_session_id,
          });
          return;
        } else {
          const errData = (await cfRes.json().catch(() => ({}))) as { message?: string };
          console.error('Cashfree PG Order Creation Failed:', cfRes.status, errData);
          res.status(400).json({
            error: `Cashfree (${cfEnv.toUpperCase()}) Gateway Error: ${errData?.message || `Status ${cfRes.status}. Please check your API credentials.`}`,
          });
          return;
        }
      } catch (err) {
        console.error('Cashfree API invocation error:', err);
        res.status(502).json({
          error: `Failed to contact Cashfree payment servers: ${err instanceof Error ? err.message : String(err)}`,
        });
        return;
      }
    }

    res.status(503).json({
      error: 'Cashfree credentials are not configured. Online payment is unavailable.',
    });
  });

  // 4. Server-side payment verification. Client-provided outcomes are never trusted.
  app.post('/api/cashfree/verify-order', async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!authCtx) {
      res.status(401).json({error:'Please sign in again to verify your payment.'});
      return;
    }
    const orderId = String(req.body?.orderId || '');
    try {
      const order = await loadStoredOrder(orderId);
      if (!order) {
        res.status(404).json({error:'Order not found.'});
        return;
      }
      if (order.userId !== authCtx.uid && !canUserPerformAdminOperation(authCtx)) {
        res.status(403).json({error:'You can only verify your own orders.'});
        return;
      }
      // Even if already paid, the only source of paid status is the server's
      // transactional state written after Cashfree confirmation.
      if (order.paymentStatus === 'paid') {
        res.json({verified:true, order, entitlements:[]});
        return;
      }
      const paymentId = await fetchVerifiedCashfreePayment(order);
      if (!paymentId) {
        res.json({verified:false, order, entitlements:[], message:'Payment is pending or unsuccessful.'});
        return;
      }
      const result = await fulfillVerifiedPaidOrder(order, paymentId);
      const updatedOrder = await loadStoredOrder(order.id);
      res.json({
        verified:updatedOrder?.paymentStatus === 'paid',
        order:updatedOrder,
        alreadyProcessed:result.alreadyProcessed,
        entitlements:result.entitlementsGranted,
      });
    } catch (err) {
      console.error('Payment status verification failed:', err);
      res.status(503).json({error:'Unable to check payment status securely. Please try again.'});
    }
  });

  // 5. User Orders & Entitlements Endpoint (Strictly Isolated to Authenticated Owner)
  app.get('/api/user/library', async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!authCtx || !authCtx.uid) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const db = await getPaymentDb();
      const [orderSnapshot, entitlementSnapshot] = await Promise.all([
        db.collection('orders').where('userId', '==', authCtx.uid).get(),
        db.collection('entitlements').where('userId', '==', authCtx.uid).get(),
      ]);
      const orders = orderSnapshot.docs.map((d) => d.data() as ServerOrderRecord)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const entitlements = entitlementSnapshot.docs.map((d) => d.data() as ServerEntitlementRecord);
      res.json({orders, entitlements});
    } catch (err) {
      console.error('Could not load payment library:', err);
      res.status(503).json({error:'Purchase records are temporarily unavailable.'});
    }
  });

  // 6. Protected Content Signed Access Endpoint (Courses & Digital Books)
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
      if (!lessonObj || lessonObj.courseId !== product.id) {
        res.status(404).json({error:'Lesson does not belong to this course.'});
        return;
      }
      isFreePreview = lessonObj.isFreePreview;
    }
    let userEntitledProductIds: string[] = [];
    if (authCtx?.uid) {
      try {
        const db = await getPaymentDb();
        const grant = await db.collection('entitlements')
          .doc(`${authCtx.uid}_${product.id}`).get();
        if (grant.exists && grant.data()?.userId === authCtx.uid &&
            grant.data()?.productId === product.id) {
          userEntitledProductIds = [product.id];
        }
      } catch {
        res.status(503).json({error:'Unable to check purchased content access.'});
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
        error: 'Access denied. You must purchase this item to access its protected recordings or files.',
        reason: accessCheck.reason,
      });
      return;
    }

    const expiresAt = Date.now() + 15 * 60 * 1000; // 15-minute ephemeral token
    const tokenSig = crypto
      .createHmac('sha256', getCashfreeSecretKey())
      .update(`${authCtx?.uid || 'public'}:${product.id}:${lessonId || 'book'}:${expiresAt}`)
      .digest('hex')
      .slice(0, 24);

    if (product.type === 'course') {
      const videoUrl =
        lessonObj?.videoStoragePath.startsWith('http')
          ? lessonObj.videoStoragePath
          : product.previewVideoUrl ||
            'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';

      res.json({
        allowed: true,
        reason: accessCheck.reason,
        expiresAt: new Date(expiresAt).toISOString(),
        signedUrl: `${videoUrl}?token=${tokenSig}&expires=${expiresAt}`,
      });
      return;
    }

    // For digital books and storybooks, return a signed download URL pointing to the server's protected book stream
    res.json({
      allowed: true,
      reason: accessCheck.reason,
      expiresAt: new Date(expiresAt).toISOString(),
      signedUrl: `/api/content/download-book?productId=${encodeURIComponent(
        product.id
      )}&uid=${encodeURIComponent(authCtx?.uid || 'admin')}&expires=${expiresAt}&sig=${tokenSig}`,
    });
  });

  // Protected digital book file generator (validates short-lived HMAC signature before serving)
  app.get('/api/content/download-book', (req, res) => {
    const productId = String(req.query.productId || '');
    const uid = String(req.query.uid || '');
    const expires = Number(req.query.expires || 0);
    const sig = String(req.query.sig || '');

    if (!productId || !uid || !expires || Date.now() > expires) {
      res.status(403).send('Signed download link has expired or is invalid.');
      return;
    }

    const expectedSig = crypto
      .createHmac('sha256', getCashfreeSecretKey())
      .update(`${uid}:${productId}:book:${expires}`)
      .digest('hex')
      .slice(0, 24);

    if (sig !== expectedSig) {
      res.status(403).send('Invalid download signature.');
      return;
    }

    const product = serverProducts.get(productId);
    if (!product) {
      res.status(404).send('Book not found.');
      return;
    }

    const content = [
      `====================================================================`,
      `SATYA'S EDUCATION — PROTECTED DIGITAL EDITION`,
      `====================================================================`,
      `Title: ${product.title}`,
      `Author / Publisher: ${product.authorOrInstructor}`,
      `Category: ${product.category}`,
      `Language: ${product.language}`,
      `Format: ${product.coverType}`,
      `Licensed To UID: ${uid}`,
      `Issued At: ${new Date().toISOString()}`,
      `--------------------------------------------------------------------`,
      `SYNOPSIS & SAMPLE CHAPTER CONTENT:`,
      product.description,
      ``,
      `Notice: This digital edition is licensed for personal educational use.`,
      `Permanent public URLs are disabled; this download was served via a`,
      `short-lived 15-minute HMAC-signed token after entitlement verification.`,
      `====================================================================`,
    ].join('\n');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${product.slug}-satya-education.txt"`
    );
    res.send(content);
  });

  // 7. Protected Admin Panel Overview & Mutation Endpoints
  app.get('/api/admin/overview', async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!canUserPerformAdminOperation(authCtx)) {
      res.status(403).json({
        error: 'Forbidden: Administrator privileges (Firebase custom claim or verified admin record) required.',
      });
      return;
    }

    let allOrders: ServerOrderRecord[];
    try {
      const db = await getPaymentDb();
      const orderDocs = await db.collection('orders').get();
      allOrders = orderDocs.docs.map((d) => d.data() as ServerOrderRecord)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      res.status(503).json({error:'Unable to load persistent payment records.'});
      return;
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
            existingCourse?.syllabusSummary || 'Module 1: Core Foundations · Module 2: Practical Implementation',
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
      if (paymentStatus !== undefined) {
        res.status(403).json({error:'Payment status may only be changed by verified Cashfree events.'});
        return;
      }
      const statuses = ['not_applicable', 'processing', 'packed', 'shipped', 'delivered'];
      if (!statuses.includes(shipmentStatus)) {
        res.status(400).json({error:'Invalid shipment status.'});
        return;
      }
      try {
        const db = await getPaymentDb();
        const ref = db.collection('orders').doc(String(orderId || ''));
        const doc = await ref.get();
        if (!doc.exists) {
          res.status(404).json({error:'Order not found.'});
          return;
        }
        await ref.update({shipmentStatus, updatedAt:new Date().toISOString()});
        res.json({status:'ok', order:{...doc.data(), shipmentStatus}});
      } catch {
        res.status(503).json({error:'Unable to update shipment.'});
      }
      return;
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

  
  // Robust global error handling for production & Vercel serverless functions
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Serverless API Error]:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal Server Error' });
  });

  return app;
}

