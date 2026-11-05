import express from 'express';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
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

async function resolveServerAuthContext(req: express.Request): Promise<AuthTokenContext | null> {
  const sessionUid =
    req.headers['x-satya-uid'] ||
    req.headers['x-user-id'] ||
    req.headers['x-user-uid'];
  const sessionEmail = req.headers['x-satya-email'];
  const sessionVerified = req.headers['x-satya-email-verified'];
  const sessionAdminClaim = req.headers['x-satya-admin-claim'];

  if (typeof sessionUid === 'string' && sessionUid.trim().length > 0) {
    return {
      uid: sessionUid.trim(),
      email: typeof sessionEmail === 'string' ? sessionEmail.trim() : undefined,
      emailVerified: sessionVerified === 'true',
      customClaims: {
        admin: sessionAdminClaim === 'true',
      },
    };
  }

  const body = req.body;
  if (body && typeof body === 'object') {
    const bodyUid = body.userId || body.uid || body.customerUid || body.user?.uid;
    if (typeof bodyUid === 'string' && bodyUid.trim().length > 0) {
      const bodyEmail =
        typeof (body.userEmail || body.customerEmail || body.email) === 'string'
          ? (body.userEmail || body.customerEmail || body.email).trim()
          : undefined;
      const isAdminEmail =
        typeof bodyEmail === 'string' &&
        bodyEmail.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

      return {
        uid: bodyUid.trim(),
        email: bodyEmail,
        emailVerified: body.userEmailVerified === true || body.emailVerified === true,
        customClaims: {
          admin: Boolean(body.userRole === 'admin' || body.role === 'admin' || isAdminEmail),
        },
      };
    }
  }

  const query = req.query;
  if (query && typeof query === 'object') {
    const queryUid = query.userId || query.uid;
    if (typeof queryUid === 'string' && queryUid.trim().length > 0) {
      const queryEmail =
        typeof (query.userEmail || query.email) === 'string'
          ? String(query.userEmail || query.email).trim()
          : undefined;
      const isAdminEmail =
        typeof queryEmail === 'string' &&
        queryEmail.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

      return {
        uid: queryUid.trim(),
        email: queryEmail,
        emailVerified: query.userEmailVerified === 'true' || query.emailVerified === 'true',
        customClaims: {
          admin: Boolean(query.userRole === 'admin' || query.role === 'admin' || isAdminEmail),
        },
      };
    }
  }

  return null;
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

  // 3. Direct Order Checkout & Instant Entitlement Fulfillment
  app.post('/api/orders/create', async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!authCtx || !authCtx.uid) {
      res.status(401).json({
        error: 'Authentication required. Please sign in before checking out.',
      });
      return;
    }

    const { cartItems, couponCode, shippingAddress, customerName, customerEmail, customerPhone, paymentMethod } =
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

    const orderId = `ORD_${Date.now().toString().slice(-6)}_${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
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
    const paymentRef = `${String(paymentMethod || 'ONLINE').toUpperCase()}_${Date.now().toString().slice(-6)}`;

    const newOrder: ServerOrderRecord = {
      id: orderId,
      userId: authCtx.uid,
      customerName: String(customerName || authCtx.email || 'Student').slice(0, 120),
      customerEmail: String(customerEmail || authCtx.email || 'student@example.com').slice(0, 256),
      totalAmountInr: verifiedCart.totalAmountInr,
      paymentStatus: 'paid',
      shipmentStatus: verifiedCart.hasPhysicalItems ? 'processing' : 'not_applicable',
      paymentReference: paymentRef,
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

    // Decrement physical stock
    for (const item of newOrder.lineItems) {
      const prod = serverProducts.get(item.productId);
      if (prod && (prod.format === 'physical_book' || prod.format === 'hybrid_book')) {
        prod.stock = Math.max(0, prod.stock - item.quantity);
        serverProducts.set(prod.id, prod);
      }
    }

    // Grant digital entitlements immediately
    const granted: ServerEntitlementRecord[] = [];
    for (const item of newOrder.lineItems) {
      if (
        item.format === 'recorded_course' ||
        item.format === 'digital_book' ||
        item.format === 'hybrid_book'
      ) {
        const entitlementId = `${newOrder.userId}_${item.productId}`;
        const record: ServerEntitlementRecord = {
          id: entitlementId,
          userId: newOrder.userId,
          productId: item.productId,
          productType: item.type,
          orderId: newOrder.id,
          downloadPath:
            item.type === 'course'
              ? `protected/courses/${item.productId}`
              : `protected/books/${item.productId}/${item.productId}.pdf`,
          grantedAt: nowIso,
        };
        serverEntitlements.set(entitlementId, record);
        granted.push(record);
      }
    }

    res.json({
      order: newOrder,
      entitlements: granted,
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

    res.json({
      allowed: true,
      reason: accessCheck.reason,
      expiresAt: new Date(expiresAt).toISOString(),
      signedUrl: `/api/content/download-book?productId=${encodeURIComponent(
        product.id
      )}&uid=${encodeURIComponent(authCtx?.uid || 'student')}`,
    });
  });

  app.get('/api/content/download-book', (req, res) => {
    const productId = String(req.query.productId || '');
    const uid = String(req.query.uid || 'student');

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
