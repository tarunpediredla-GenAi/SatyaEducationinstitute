import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateVerifiedCartSummary,
  canUserAccessPrivateResource,
  canUserAccessProtectedContent,
  canUserPerformAdminOperation,
  computeCashfreeWebhookSignature,
  evaluateOrderWebhookTransition,
  verifyCashfreeWebhookSignature,
  type CatalogProduct,
} from './commerceRules';

const sampleCatalog: Record<string, CatalogProduct> = {
  'course-python-mastery': {
    id: 'course-python-mastery',
    title: 'Complete Python & Django Architecture Bootcamp',
    slug: 'complete-python-django-bootcamp',
    type: 'course',
    category: 'Python',
    priceInr: 1499,
    originalPriceInr: 2999,
    language: 'English & Telugu',
    format: 'recorded_course',
    stock: 9999,
    featured: true,
    status: 'published',
    authorOrInstructor: 'Satya Narayana',
    shortDescription: 'End-to-end Python 3.12 and Django 5 web engineering course.',
    description: 'Comprehensive recorded curriculum with hands-on projects.',
    coverType: 'Course Recording',
    level: 'Beginner to Advanced',
    duration: '42 Hours',
    previewVideoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  },
  'book-agentic-ai-print': {
    id: 'book-agentic-ai-print',
    title: 'Engineering Agentic AI Systems (Hardcover)',
    slug: 'engineering-agentic-ai-systems',
    type: 'book',
    category: 'Agentic AI',
    priceInr: 799,
    originalPriceInr: 1199,
    language: 'English',
    format: 'physical_book',
    stock: 3,
    featured: true,
    status: 'published',
    authorOrInstructor: 'Satya Narayana',
    shortDescription: 'Print edition covering tool-calling agents and memory systems.',
    description: 'Detailed guide to production GenAI and Agentic workflows.',
    coverType: 'Hardcover (380 Pages)',
    level: 'Intermediate',
    duration: '380 Pages',
    previewVideoUrl: '',
  },
};

test('Admin authorization blocks non-admin and unverified users', () => {
  assert.equal(canUserPerformAdminOperation(null), false);
  assert.equal(
    canUserPerformAdminOperation({
      uid: 'u1',
      email: 'student@example.com',
      emailVerified: true,
    }),
    false
  );
  // Spoofed admin email without emailVerified === true must be rejected
  assert.equal(
    canUserPerformAdminOperation({
      uid: 'u2',
      email: 'tarunpediredla9966@gmail.com',
      emailVerified: false,
    }),
    false
  );
  // Verified admin custom claim succeeds
  assert.equal(
    canUserPerformAdminOperation({
      uid: 'u3',
      email: 'admin@satyaedu.in',
      emailVerified: true,
      customClaims: { admin: true },
    }),
    true
  );
  // Verified bootstrapped admin succeeds
  assert.equal(
    canUserPerformAdminOperation({
      uid: 'u4',
      email: 'tarunpediredla9966@gmail.com',
      emailVerified: true,
    }),
    true
  );
});

test('User data isolation blocks cross-user reads while allowing owner and admin', () => {
  const userA = { uid: 'user_a', email: 'a@example.com', emailVerified: true };
  const userB = { uid: 'user_b', email: 'b@example.com', emailVerified: true };
  const admin = {
    uid: 'admin_1',
    email: 'tarunpediredla9966@gmail.com',
    emailVerified: true,
  };

  assert.equal(canUserAccessPrivateResource(userA, 'user_a'), true);
  assert.equal(canUserAccessPrivateResource(userB, 'user_a'), false);
  assert.equal(canUserAccessPrivateResource(admin, 'user_a'), true);
});

test('Protected content gate allows free preview lessons and blocks unpurchased recordings', () => {
  const unauthenticatedCheck = canUserAccessProtectedContent({
    auth: null,
    productId: 'course-python-mastery',
    isFreePreview: true,
    entitledProductIds: [],
  });
  assert.equal(unauthenticatedCheck.allowed, true);

  const unpurchasedCheck = canUserAccessProtectedContent({
    auth: { uid: 'student_1', email: 's1@example.com', emailVerified: true },
    productId: 'course-python-mastery',
    isFreePreview: false,
    entitledProductIds: [],
  });
  assert.equal(unpurchasedCheck.allowed, false);
  assert.equal(unpurchasedCheck.reason, 'purchase_required');

  const purchasedCheck = canUserAccessProtectedContent({
    auth: { uid: 'student_1', email: 's1@example.com', emailVerified: true },
    productId: 'course-python-mastery',
    isFreePreview: false,
    entitledProductIds: ['course-python-mastery'],
  });
  assert.equal(purchasedCheck.allowed, true);
  assert.equal(purchasedCheck.reason, 'verified_entitlement');
});

test('Checkout price calculation ignores tampered browser prices and enforces physical stock & address', () => {
  // Tampered client price (₹1 instead of ₹1499) is ignored
  const summary = calculateVerifiedCartSummary({
    cartItems: [
      {
        productId: 'course-python-mastery',
        quantity: 1,
        clientSuppliedPriceInr: 1,
      },
    ],
    catalogById: sampleCatalog,
  });

  assert.equal(summary.valid, true);
  assert.equal(summary.subtotalInr, 1499);
  assert.equal(summary.totalAmountInr, 1499);
  assert.equal(summary.hasPhysicalItems, false);

  // Physical book requires delivery address
  const missingAddr = calculateVerifiedCartSummary({
    cartItems: [{ productId: 'book-agentic-ai-print', quantity: 1 }],
    catalogById: sampleCatalog,
    shippingAddressProvided: false,
  });
  assert.equal(missingAddr.valid, false);
  assert.match(missingAddr.error || '', /delivery address is required/i);

  // Physical book exceeding stock (stock is 3, requesting 5) is rejected
  const outOfStock = calculateVerifiedCartSummary({
    cartItems: [{ productId: 'book-agentic-ai-print', quantity: 5 }],
    catalogById: sampleCatalog,
    shippingAddressProvided: true,
  });
  assert.equal(outOfStock.valid, false);
  assert.match(outOfStock.error || '', /in stock/i);
});

test('Cashfree webhook signature verification and idempotent repeated webhook handling', () => {
  const secret = 'cf_test_secret_key_998877';
  const timestamp = '1730450000000';
  const rawBody = JSON.stringify({
    data: {
      order: { order_id: 'ord_101', order_amount: 1499 },
      payment: { cf_payment_id: 'pay_9001', payment_status: 'SUCCESS', payment_amount: 1499 },
    },
  });

  const validSig = computeCashfreeWebhookSignature(timestamp, rawBody, secret);
  assert.equal(
    verifyCashfreeWebhookSignature({
      timestampHeader: timestamp,
      signatureHeader: validSig,
      rawBody,
      secretKey: secret,
    }),
    true
  );

  // Tampered body must fail verification
  assert.equal(
    verifyCashfreeWebhookSignature({
      timestampHeader: timestamp,
      signatureHeader: validSig,
      rawBody: rawBody.replace('1499', '1'),
      secretKey: secret,
    }),
    false
  );

  // First webhook marks order paid and grants entitlements
  const pendingOrder = {
    id: 'ord_101',
    userId: 'user_1',
    totalAmountInr: 1499,
    paymentStatus: 'pending' as const,
    shipmentStatus: 'not_applicable' as const,
    hasPhysicalItems: false,
    cashfreePaymentId: '',
  };

  const firstTransition = evaluateOrderWebhookTransition({
    order: pendingOrder,
    cashfreePaymentStatus: 'SUCCESS',
    paidAmountInr: 1499,
    cashfreePaymentId: 'pay_9001',
  });
  assert.equal(firstTransition.shouldUpdateOrder, true);
  assert.equal(firstTransition.shouldGrantEntitlements, true);
  assert.equal(firstTransition.nextPaymentStatus, 'paid');

  // Repeated webhook on already-paid order is a no-op (prevents double fulfillment)
  const paidOrder = {
    ...pendingOrder,
    paymentStatus: 'paid' as const,
    cashfreePaymentId: 'pay_9001',
  };
  const repeatTransition = evaluateOrderWebhookTransition({
    order: paidOrder,
    cashfreePaymentStatus: 'SUCCESS',
    paidAmountInr: 1499,
    cashfreePaymentId: 'pay_9001',
  });
  assert.equal(repeatTransition.alreadyProcessed, true);
  assert.equal(repeatTransition.shouldUpdateOrder, false);
  assert.equal(repeatTransition.shouldGrantEntitlements, false);
  assert.equal(repeatTransition.shouldDecrementStock, false);
});
