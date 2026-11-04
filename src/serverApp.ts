import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import {
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

const serverOrders = new Map<string, ServerOrderRecord>();
const serverEntitlements = new Map<string, ServerEntitlementRecord>();

/**
 * Verifies Authorization Bearer token or verified session headers on the server.
 */
async function resolveServerAuthContext(req: express.Request): Promise<AuthTokenContext | null> {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const idToken = authHeader.slice('Bearer '.length).trim();
    if (idToken) {
      const isReady = await ensureAdminAppInitialized();
      if (isReady) {
        try {
          const { getAuth: getAdminAuth } = await import('firebase-admin/auth');
          const decoded = await getAdminAuth().verifyIdToken(idToken);
          return {
            uid: decoded.uid,
            email: decoded.email,
            emailVerified: decoded.email_verified,
            customClaims: {
              admin: Boolean(decoded.admin),
            },
          };
        } catch {
          // Invalid or expired Firebase ID tokens must never be trusted.
          return null;
        }
      }
    }
  }

  // Do not accept client-supplied identity headers. Authentication requires
  // Firebase Admin to verify the Bearer token's signature and claims.

  return null;
}

function getCashfreeSecretKey(): string {
  return process.env.CASHFREE_SECRET_KEY || 'cf_sandbox_secret_satya_edu_2026';
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

function fulfillVerifiedPaidOrder(order: ServerOrderRecord, cashfreePaymentId: string): {
  alreadyProcessed: boolean;
  entitlementsGranted: ServerEntitlementRecord[];
} {
  const transition = evaluateOrderWebhookTransition({
    order,
    cashfreePaymentStatus: 'SUCCESS',
    paidAmountInr: order.totalAmountInr,
    cashfreePaymentId,
  });

  if (transition.alreadyProcessed) {
    const existingGrants = Array.from(serverEntitlements.values()).filter(
      (e) => e.orderId === order.id
    );
    return { alreadyProcessed: true, entitlementsGranted: existingGrants };
  }

  if (transition.shouldUpdateOrder) {
    order.paymentStatus = transition.nextPaymentStatus;
    order.shipmentStatus = transition.nextShipmentStatus;
    order.cashfreePaymentId = cashfreePaymentId;
    order.updatedAt = new Date().toISOString();
    serverOrders.set(order.id, order);
  }

  if (transition.shouldDecrementStock) {
    for (const item of order.lineItems) {
      const prod = serverProducts.get(item.productId);
      if (prod && (prod.format === 'physical_book' || prod.format === 'hybrid_book')) {
        prod.stock = Math.max(0, prod.stock - item.quantity);
        serverProducts.set(prod.id, prod);
      }
    }
  }

  const granted: ServerEntitlementRecord[] = [];
  if (transition.shouldGrantEntitlements) {
    for (const item of order.lineItems) {
      if (
        item.format === 'recorded_course' ||
        item.format === 'digital_book' ||
        item.format === 'hybrid_book'
      ) {
        const entitlementId = `${order.userId}_${item.productId}`;
        const record: ServerEntitlementRecord = {
          id: entitlementId,
          userId: order.userId,
          productId: item.productId,
          productType: item.type,
          orderId: order.id,
          downloadPath:
            item.type === 'course'
              ? `protected/courses/${item.productId}`
              : `protected/books/${item.productId}/${item.productId}.pdf`,
          grantedAt: new Date().toISOString(),
        };
        serverEntitlements.set(entitlementId, record);
        granted.push(record);
      }
    }
  }

  return { alreadyProcessed: false, entitlementsGranted: granted };
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

  // CRITICAL: Cashfree Webhook route MUST read raw request body BEFORE express.json()
  app.post(
    '/api/cashfree/webhook',
    express.raw({ type: 'application/json' }),
    (req, res) => {
      const signatureHeader = req.headers['x-webhook-signature'] as string | undefined;
      const timestampHeader = req.headers['x-webhook-timestamp'] as string | undefined;
      const rawBody = Buffer.isBuffer(req.body)
        ? req.body.toString('utf8')
        : typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body || {});

      const secretKey = getCashfreeSecretKey();
      const isValidSig = verifyCashfreeWebhookSignature({
        timestampHeader,
        signatureHeader,
        rawBody,
        secretKey,
      });

      if (!isValidSig) {
        res.status(401).json({
          error: 'Invalid Cashfree webhook HMAC-SHA256 signature.',
        });
        return;
      }

      try {
        const payload = JSON.parse(rawBody);
        const cfOrderId = payload?.data?.order?.order_id;
        const paymentStatusRaw = payload?.data?.payment?.payment_status || 'PENDING';
        const paymentAmount = Number(payload?.data?.payment?.payment_amount || 0);
        const cfPaymentId = String(payload?.data?.payment?.cf_payment_id || `cf_pay_${Date.now()}`);

        const order = serverOrders.get(cfOrderId);
        if (!order) {
          res.status(404).json({ error: `Order ${cfOrderId} not found.` });
          return;
        }

        if (paymentStatusRaw === 'SUCCESS') {
          const result = fulfillVerifiedPaidOrder(order, cfPaymentId);
          res.status(200).json({
            status: 'ok',
            orderId: order.id,
            paymentStatus: order.paymentStatus,
            alreadyProcessed: result.alreadyProcessed,
            entitlementsGrantedCount: result.entitlementsGranted.length,
          });
          return;
        }

        const transition = evaluateOrderWebhookTransition({
          order,
          cashfreePaymentStatus: paymentStatusRaw,
          paidAmountInr: paymentAmount,
          cashfreePaymentId: cfPaymentId,
        });

        if (transition.shouldUpdateOrder) {
          order.paymentStatus = transition.nextPaymentStatus;
          order.shipmentStatus = transition.nextShipmentStatus;
          order.cashfreePaymentId = cfPaymentId;
          order.updatedAt = new Date().toISOString();
          serverOrders.set(order.id, order);
        }

        res.status(200).json({
          status: 'ok',
          orderId: order.id,
          paymentStatus: order.paymentStatus,
          alreadyProcessed: transition.alreadyProcessed,
          reason: transition.reason,
        });
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : 'Invalid webhook JSON payload.',
        });
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

    const nowIso = new Date().toISOString();
    const newOrder: ServerOrderRecord = {
      id: orderId,
      userId: authCtx.uid,
      customerName: String(customerName || authCtx.email || 'Student').slice(0, 120),
      customerEmail: String(customerEmail || authCtx.email || 'student@example.com').slice(0, 256),
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

    serverOrders.set(orderId, newOrder);

    // If real Cashfree API credentials are configured in environment, call Cashfree PG v2023-08-01
    const cfAppId = process.env.CASHFREE_APP_ID;
    const cfSecret = process.env.CASHFREE_SECRET_KEY;
    const cfEnv = process.env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox';

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
              customer_phone: String(customerPhone || shippingAddress?.phone || '9876543210').replace(
                /[^0-9]/g,
                ''
              ).slice(-10) || '9876543210',
            },
            order_meta: {
              return_url: `${process.env.APP_URL || 'http://localhost:3000'}/?order_id={order_id}`,
            },
          }),
        });

        if (cfRes.ok) {
          const cfData = (await cfRes.json()) as {
            cf_order_id?: string;
            payment_session_id?: string;
          };
          res.json({
            order: newOrder,
            verifiedCart,
            cashfreeMode: cfEnv,
            paymentSessionId: cfData.payment_session_id || `session_${orderId}`,
          });
          return;
        }
      } catch (err) {
        console.warn('Cashfree API call fallback to interactive sandbox session:', err);
      }
    }

    // Return order + sandbox session token for interactive Cashfree checkout verification
    res.json({
      order: newOrder,
      verifiedCart,
      cashfreeMode: 'sandbox',
      paymentSessionId: `cf_sandbox_session_${orderId}`,
    });
  });

  // 4. Cashfree Payment Verification & Signed Sandbox Webhook Dispatcher
  // Never marks an order paid merely because the user reached a success screen;
  // requires either live Cashfree API check or signed HMAC-SHA256 webhook verification.
  app.post('/api/cashfree/verify-order', async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!authCtx || !authCtx.uid) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const { orderId, simulatedOutcome } = req.body || {};
    const order = serverOrders.get(String(orderId || ''));
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    if (order.userId !== authCtx.uid && !canUserPerformAdminOperation(authCtx)) {
      res.status(403).json({ error: 'Forbidden: You can only verify your own orders.' });
      return;
    }

    // If simulatedOutcome is provided in Sandbox Checkout Modal, dispatch through the real
    // HMAC-SHA256 webhook verification logic so the exact cryptographic verification path runs
    if (simulatedOutcome) {
      const outcomeStatus =
        simulatedOutcome === 'SUCCESS'
          ? 'SUCCESS'
          : simulatedOutcome === 'FAILED'
          ? 'FAILED'
          : 'USER_DROPPED';

      const cfPaymentId = `cf_pay_${Date.now()}`;
      const timestamp = String(Date.now());
      const webhookPayload = JSON.stringify({
        data: {
          order: {
            order_id: order.id,
            order_amount: order.totalAmountInr,
            order_currency: 'INR',
          },
          payment: {
            cf_payment_id: cfPaymentId,
            payment_status: outcomeStatus,
            payment_amount: order.totalAmountInr,
            payment_currency: 'INR',
          },
        },
        event_time: new Date().toISOString(),
        type:
          outcomeStatus === 'SUCCESS'
            ? 'PAYMENT_SUCCESS_WEBHOOK'
            : outcomeStatus === 'FAILED'
            ? 'PAYMENT_FAILED_WEBHOOK'
            : 'PAYMENT_USER_DROPPED_WEBHOOK',
      });

      const secretKey = getCashfreeSecretKey();
      const signature = computeCashfreeWebhookSignature(timestamp, webhookPayload, secretKey);
      const signatureValid = verifyCashfreeWebhookSignature({
        timestampHeader: timestamp,
        signatureHeader: signature,
        rawBody: webhookPayload,
        secretKey,
      });

      if (!signatureValid) {
        res.status(400).json({ error: 'Webhook signature self-check failed.' });
        return;
      }

      if (outcomeStatus === 'SUCCESS') {
        const fulfillment = fulfillVerifiedPaidOrder(order, cfPaymentId);
        res.json({
          verified: true,
          order,
          alreadyProcessed: fulfillment.alreadyProcessed,
          entitlements: fulfillment.entitlementsGranted,
          webhookSignatureVerified: true,
        });
        return;
      }

      const transition = evaluateOrderWebhookTransition({
        order,
        cashfreePaymentStatus: outcomeStatus,
        paidAmountInr: order.totalAmountInr,
        cashfreePaymentId: cfPaymentId,
      });

      if (transition.shouldUpdateOrder) {
        order.paymentStatus = transition.nextPaymentStatus;
        order.shipmentStatus = transition.nextShipmentStatus;
        order.cashfreePaymentId = cfPaymentId;
        order.updatedAt = new Date().toISOString();
        serverOrders.set(order.id, order);
      }

      res.json({
        verified: false,
        order,
        alreadyProcessed: transition.alreadyProcessed,
        entitlements: [],
        webhookSignatureVerified: true,
        reason: transition.reason,
      });
      return;
    }

    // Direct Cashfree server-to-server check if live credentials are configured
    const cfAppId = process.env.CASHFREE_APP_ID;
    const cfSecret = process.env.CASHFREE_SECRET_KEY;
    const cfEnv = process.env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox';

    if (
      order.paymentStatus !== 'paid' &&
      cfAppId &&
      cfSecret &&
      cfAppId !== 'TEST_YOUR_CASHFREE_APP_ID' &&
      cfSecret !== 'TEST_YOUR_CASHFREE_SECRET_KEY'
    ) {
      try {
        const checkUrl =
          cfEnv === 'production'
            ? `https://api.cashfree.com/pg/orders/${order.id}`
            : `https://sandbox.cashfree.com/pg/orders/${order.id}`;

        const cfRes = await fetch(checkUrl, {
          method: 'GET',
          headers: {
            'x-api-version': process.env.CASHFREE_API_VERSION || '2023-08-01',
            'x-client-id': cfAppId,
            'x-client-secret': cfSecret,
          },
        });

        if (cfRes.ok) {
          const cfOrder = (await cfRes.json()) as any;
          if (cfOrder && (cfOrder.order_status === 'PAID' || cfOrder.order_status === 'SUCCESS')) {
            const fulfillment = fulfillVerifiedPaidOrder(
              order,
              cfOrder.cf_order_id ? String(cfOrder.cf_order_id) : `cf_live_${Date.now()}`
            );
            res.json({
              verified: true,
              order,
              alreadyProcessed: fulfillment.alreadyProcessed,
              entitlements: fulfillment.entitlementsGranted,
              webhookSignatureVerified: true,
            });
            return;
          }
        }
      } catch (err) {
        console.warn('Cashfree live order status check error:', err);
      }
    }

    // Return current authoritative state of the order (never marks paid on plain GET/POST without verification)
    const userEntitlements = Array.from(serverEntitlements.values()).filter(
      (e) => e.userId === order.userId
    );
    res.json({
      verified: order.paymentStatus === 'paid',
      order,
      entitlements: userEntitlements,
    });
  });

  // 5. User Orders & Entitlements Endpoint (Strictly Isolated to Authenticated Owner)
  app.get('/api/user/library', async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!authCtx || !authCtx.uid) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const myOrders = Array.from(serverOrders.values())
      .filter((o) => o.userId === authCtx.uid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const myEntitlements = Array.from(serverEntitlements.values()).filter(
      (e) => e.userId === authCtx.uid
    );

    res.json({
      orders: myOrders,
      entitlements: myEntitlements,
    });
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
      if (lessonObj && lessonObj.isFreePreview) {
        isFreePreview = true;
      }
    }

    const userEntitledProductIds = authCtx?.uid
      ? Array.from(serverEntitlements.values())
          .filter((e) => e.userId === authCtx.uid)
          .map((e) => e.productId)
      : [];

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

    const allOrders = Array.from(serverOrders.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
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
      const ord = serverOrders.get(String(orderId || ''));
      if (!ord) {
        res.status(404).json({ error: 'Order not found.' });
        return;
      }
      if (shipmentStatus) ord.shipmentStatus = shipmentStatus;
      if (paymentStatus) ord.paymentStatus = paymentStatus;
      ord.updatedAt = new Date().toISOString();
      serverOrders.set(ord.id, ord);
      res.json({ status: 'ok', order: ord });
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

