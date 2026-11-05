import express from 'express';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  calculateVerifiedCartSummary,
  canUserAccessProtectedContent,
  canUserPerformAdminOperation,
  type AuthTokenContext,
  type CatalogProduct,
  type CourseLesson,
  type OrderStateRecord,
} from './utils/commerceRules';
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
 * Only verified Firebase ID tokens identify a customer.
 * No request headers, JSON bodies or query strings can grant an identity/role.
 */
async function resolveServerAuthContext(req: express.Request): Promise<AuthTokenContext | null> {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!match) return null;

  try {
    if (getApps().length === 0) {
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      initializeApp({
        credential: serviceAccount
          ? cert(JSON.parse(serviceAccount))
          : applicationDefault(),
        projectId: process.env.FIREBASE_PROJECT_ID || undefined,
      });
    }
    const verified = await getAdminAuth().verifyIdToken(match[1]);
    return {
      uid: verified.uid,
      email: verified.email,
      emailVerified: verified.email_verified === true,
      customClaims: { admin: verified.admin === true },
    };
  } catch (error) {
    // Fail closed. Never accept an unverified JWT or a browser-provided role.
    console.warn('Firebase authentication token missing, invalid, or server credentials unavailable.');
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

  // 3. Payments: fail closed until a server-verified Cashfree flow is connected.
  // No order can be marked paid or receive entitlements from an unverified client request.
  app.post('/api/orders/create', async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!authCtx) {
      res.status(401).json({ error: 'Please sign in with Firebase before checking out.' });
      return;
    }
    res.status(503).json({
      error: 'Checkout is temporarily unavailable until Cashfree payment verification is configured. No charge has been made.',
    });
  });

  // 4. User Orders & Entitlements Endpoint
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

  // 5. Protected Content Download / Access Endpoint
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
        error: 'Access denied. You must purchase this item to access its recordings or files.',
        reason: accessCheck.reason,
      });
      return;
    }

    const expiresAt = Date.now() + 15 * 60 * 1000;

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
        signedUrl: videoUrl,
      });
      return;
    }

    const secret = process.env.CONTENT_URL_SIGNING_SECRET;
    if (!secret || !authCtx?.uid) {
      res.status(503).json({ error: 'Secure downloads are not configured.' });
      return;
    }
    const payload = `${authCtx.uid}:${product.id}:${expiresAt}`;
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    res.json({
      allowed: true,
      reason: accessCheck.reason,
      expiresAt: new Date(expiresAt).toISOString(),
      signedUrl: `/api/content/download-book?productId=${encodeURIComponent(product.id)}&uid=${encodeURIComponent(authCtx.uid)}&exp=${expiresAt}&sig=${signature}`,
    });
  });

  app.get('/api/content/download-book', (req, res) => {
    const productId = String(req.query.productId || '');
    const uid = String(req.query.uid || '');
    const exp = Number(req.query.exp);
    const sig = String(req.query.sig || '');
    const secret = process.env.CONTENT_URL_SIGNING_SECRET;
    if (
      !secret || !uid || !productId || !Number.isSafeInteger(exp) ||
      exp <= Date.now() || exp > Date.now() + 16 * 60 * 1000 ||
      !/^[a-f0-9]{64}$/.test(sig)
    ) {
      res.status(403).send('This download link is missing, invalid, or expired.');
      return;
    }
    const expected = crypto.createHmac('sha256', secret)
      .update(`${uid}:${productId}:${exp}`).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'))) {
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
      `SATYA'S EDUCATION — DIGITAL EDITION`,
      `====================================================================`,
      `Title: ${product.title}`,
      `Author / Publisher: ${product.authorOrInstructor}`,
      `Category: ${product.category}`,
      `Language: ${product.language}`,
      `Format: ${product.coverType}`,
      `Licensed To Student ID: ${uid}`,
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
        error: 'Forbidden: Administrator privileges required.',
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
        error: 'Forbidden: Only administrators can perform catalog or order mutations.',
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

  return app;
}
