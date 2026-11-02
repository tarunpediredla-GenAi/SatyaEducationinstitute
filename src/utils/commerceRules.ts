
export type ProductType = 'course' | 'book' | 'storybook';
export type ProductFormat = 'recorded_course' | 'digital_book' | 'physical_book' | 'hybrid_book';
export type ProductStatus = 'published' | 'draft' | 'archived';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';
export type ShipmentStatus = 'not_applicable' | 'processing' | 'packed' | 'shipped' | 'delivered';

export interface CatalogProduct {
  id: string;
  title: string;
  slug: string;
  type: ProductType;
  category: string;
  priceInr: number;
  originalPriceInr: number;
  language: string;
  format: ProductFormat;
  stock: number;
  featured: boolean;
  status: ProductStatus;
  authorOrInstructor: string;
  shortDescription: string;
  description: string;
  coverType: string;
  level: string;
  duration: string;
  previewVideoUrl: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CourseLesson {
  id: string;
  courseId: string;
  moduleTitle: string;
  title: string;
  orderIndex: number;
  durationMinutes: number;
  isFreePreview: boolean;
  videoStoragePath: string;
  notes: string;
}

export interface ClientCartItemInput {
  productId: string;
  quantity: number;
  /** Untrusted client price — always ignored by server calculation */
  clientSuppliedPriceInr?: number;
}

export interface VerifiedLineItem {
  productId: string;
  title: string;
  type: ProductType;
  format: ProductFormat;
  unitPriceInr: number;
  quantity: number;
  lineTotalInr: number;
  requiresShipping: boolean;
}

export interface VerifiedCartResult {
  valid: boolean;
  error?: string;
  items: VerifiedLineItem[];
  subtotalInr: number;
  discountInr: number;
  shippingInr: number;
  totalAmountInr: number;
  hasPhysicalItems: boolean;
}

export interface AuthTokenContext {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  customClaims?: {
    admin?: boolean;
  };
  isAdminRecordPresent?: boolean;
}

export const BOOTSTRAPPED_ADMIN_EMAIL = 'tarunpediredla9966@gmail.com';

/**
 * Single source of truth for payment gateway compliance, RBI merchant onboarding,
 * legal entity information, and refund/cancellation guidelines.
 */
export const BUSINESS_COMPLIANCE_INFO = {
  tradeName: "Satya's Education Institute",
  legalName: "Pediredla Tarunraj",
  operatedByStatement: "This website is operated by Satya's Education Institute (Legal Entity & Proprietor: Pediredla Tarunraj).",
  registeredAddress: "D.No. 4-42, Satya Education Institute, Near IT SEZ, Madhurawada, Visakhapatnam, Andhra Pradesh 530048, India",
  operationalAddress: "D.No. 4-42, Satya Education Institute, Near IT SEZ, Madhurawada, Visakhapatnam, Andhra Pradesh 530048, India",
  supportEmail: "support@satyaeducation.in",
  ownerEmail: "tarunpediredla9966@gmail.com",
  supportPhone: "+91 98765 43210",
  workingHours: "Monday to Saturday, 9:00 AM – 6:00 PM IST",
  paymentGateway: "Cashfree Payments (PCI-DSS Certified, RBI Licensed Payment Aggregator)",
  currency: "Indian Rupee (INR - ₹)",
  returnDurationDays: 7,
  cancellationDurationHours: 24,
  refundTurnaroundDays: "5 to 7 business days",
  refundMode: "Original Payment Source (Bank Account / UPI / Debit Card / Credit Card) via Cashfree",
};
const ID_REGEX = /^[a-zA-Z0-9_-]+$/;

export function isValidDocumentId(id: unknown): id is string {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && ID_REGEX.test(id);
}

/**
 * Enforces server-side and rule-equivalent admin check.
 * Never trusts client-side role flags; requires Firebase custom claim `admin: true`,
 * verified bootstrapped admin email, or `/admins/{uid}` record.
 */
export function canUserPerformAdminOperation(auth: AuthTokenContext | null | undefined): boolean {
  if (!auth || !auth.uid) return false;
  if (auth.customClaims?.admin === true && auth.emailVerified === true) {
    return true;
  }
  if (auth.emailVerified === true && auth.email === BOOTSTRAPPED_ADMIN_EMAIL) {
    return true;
  }
  if (auth.emailVerified === true && auth.isAdminRecordPresent === true) {
    return true;
  }
  return false;
}

/**
 * Checks whether a user can read private user-owned resources (orders, addresses, progress, entitlements).
 */
export function canUserAccessPrivateResource(
  auth: AuthTokenContext | null | undefined,
  resourceOwnerUid: string
): boolean {
  if (!auth || !auth.uid) return false;
  if (auth.uid === resourceOwnerUid) return true;
  return canUserPerformAdminOperation(auth);
}

/**
 * Checks whether a user can access a lesson recording or digital book download.
 * Free preview lessons are publicly accessible. Paid content requires a verified entitlement or admin access.
 */
export function canUserAccessProtectedContent(params: {
  auth: AuthTokenContext | null | undefined;
  productId: string;
  isFreePreview?: boolean;
  entitledProductIds: Set<string> | string[];
}): { allowed: boolean; reason: string } {
  if (params.isFreePreview === true) {
    return { allowed: true, reason: 'free_preview' };
  }
  if (!params.auth || !params.auth.uid) {
    return { allowed: false, reason: 'unauthenticated' };
  }
  if (canUserPerformAdminOperation(params.auth)) {
    return { allowed: true, reason: 'admin_override' };
  }
  const entitledSet =
    params.entitledProductIds instanceof Set
      ? params.entitledProductIds
      : new Set(params.entitledProductIds);

  if (entitledSet.has(params.productId)) {
    return { allowed: true, reason: 'verified_entitlement' };
  }
  return { allowed: false, reason: 'purchase_required' };
}

/**
 * Server-side authoritative cart & price calculation.
 * Never trusts client-supplied prices; reads prices and stock from the catalog map.
 */
export function calculateVerifiedCartSummary(params: {
  cartItems: ClientCartItemInput[];
  catalogById: Map<string, CatalogProduct> | Record<string, CatalogProduct>;
  couponCode?: string;
  activeCoupons?: Record<string, number>; // code -> discountPercent
  shippingAddressProvided?: boolean;
}): VerifiedCartResult {
  const { cartItems, couponCode, activeCoupons = {}, shippingAddressProvided = false } = params;

  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return {
      valid: false,
      error: 'Your cart is empty.',
      items: [],
      subtotalInr: 0,
      discountInr: 0,
      shippingInr: 0,
      totalAmountInr: 0,
      hasPhysicalItems: false,
    };
  }

  const getProduct = (id: string): CatalogProduct | undefined => {
    if (params.catalogById instanceof Map) {
      return params.catalogById.get(id);
    }
    return params.catalogById[id];
  };

  const verifiedItems: VerifiedLineItem[] = [];
  let subtotalInr = 0;
  let hasPhysicalItems = false;

  for (const rawItem of cartItems) {
    if (!rawItem || !isValidDocumentId(rawItem.productId)) {
      return {
        valid: false,
        error: 'Invalid product identifier in cart.',
        items: [],
        subtotalInr: 0,
        discountInr: 0,
        shippingInr: 0,
        totalAmountInr: 0,
        hasPhysicalItems: false,
      };
    }

    const quantity = Number(rawItem.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      return {
        valid: false,
        error: 'Invalid item quantity. Quantity must be an integer between 1 and 20.',
        items: [],
        subtotalInr: 0,
        discountInr: 0,
        shippingInr: 0,
        totalAmountInr: 0,
        hasPhysicalItems: false,
      };
    }

    const product = getProduct(rawItem.productId);
    if (!product || product.status !== 'published') {
      return {
        valid: false,
        error: `Product "${rawItem.productId}" is unavailable or unpublished.`,
        items: [],
        subtotalInr: 0,
        discountInr: 0,
        shippingInr: 0,
        totalAmountInr: 0,
        hasPhysicalItems: false,
      };
    }

    const requiresShipping =
      product.format === 'physical_book' || product.format === 'hybrid_book';

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
          hasPhysicalItems: true,
        };
      }
    }

    // Digital courses only make sense with quantity = 1
    const effectiveQty = product.format === 'recorded_course' ? 1 : quantity;
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
      requiresShipping,
    });

    subtotalInr += lineTotalInr;
  }

  if (hasPhysicalItems && !shippingAddressProvided) {
    return {
      valid: false,
      error: 'A delivery address is required for physical books in your cart.',
      items: verifiedItems,
      subtotalInr,
      discountInr: 0,
      shippingInr: 0,
      totalAmountInr: subtotalInr,
      hasPhysicalItems: true,
    };
  }

  let discountInr = 0;
  if (couponCode && couponCode.trim().length > 0) {
    const normalizedCode = couponCode.trim().toUpperCase();
    const pct = activeCoupons[normalizedCode];
    if (typeof pct === 'number' && pct > 0 && pct <= 90) {
      discountInr = Math.round((subtotalInr * pct) / 100);
    }
  }

  const discountedSubtotal = Math.max(0, subtotalInr - discountInr);
  // Free shipping on physical orders >= ₹999, otherwise ₹79 flat delivery fee
  const shippingInr = hasPhysicalItems ? (discountedSubtotal >= 999 ? 0 : 79) : 0;
  const totalAmountInr = discountedSubtotal + shippingInr;

  return {
    valid: true,
    items: verifiedItems,
    subtotalInr,
    discountInr,
    shippingInr,
    totalAmountInr,
    hasPhysicalItems,
  };
}


export interface OrderStateRecord {
  id: string;
  userId: string;
  totalAmountInr: number;
  paymentStatus: PaymentStatus;
  shipmentStatus: ShipmentStatus;
  hasPhysicalItems: boolean;
  cashfreePaymentId: string;
  processedWebhookIds?: string[];
}

export interface WebhookTransitionDecision {
  shouldUpdateOrder: boolean;
  shouldGrantEntitlements: boolean;
  shouldDecrementStock: boolean;
  alreadyProcessed: boolean;
  nextPaymentStatus: PaymentStatus;
  nextShipmentStatus: ShipmentStatus;
  reason: string;
}

/**
 * Evaluates a Cashfree payment verification or webhook event idempotently.
 * Prevents duplicate fulfillment, double stock deduction, or state regression
 * when repeated webhooks arrive.
 */
export function evaluateOrderWebhookTransition(params: {
  order: OrderStateRecord;
  cashfreePaymentStatus: 'SUCCESS' | 'FAILED' | 'USER_DROPPED' | 'PENDING' | 'CANCELLED';
  paidAmountInr: number;
  cashfreePaymentId: string;
}): WebhookTransitionDecision {
  const { order, cashfreePaymentStatus, paidAmountInr, cashfreePaymentId } = params;

  // 1. If the order is already paid, never process twice (idempotent guard)
  if (order.paymentStatus === 'paid') {
    return {
      shouldUpdateOrder: false,
      shouldGrantEntitlements: false,
      shouldDecrementStock: false,
      alreadyProcessed: true,
      nextPaymentStatus: 'paid',
      nextShipmentStatus: order.shipmentStatus,
      reason: 'Order is already marked paid; duplicate webhook safely ignored.',
    };
  }

  // 2. If the order was refunded, terminal state cannot be overwritten
  if (order.paymentStatus === 'refunded') {
    return {
      shouldUpdateOrder: false,
      shouldGrantEntitlements: false,
      shouldDecrementStock: false,
      alreadyProcessed: true,
      nextPaymentStatus: 'refunded',
      nextShipmentStatus: order.shipmentStatus,
      reason: 'Order is already refunded; terminal state locked.',
    };
  }

  // 3. Handle successful payment only when paid amount matches authoritative order total
  if (cashfreePaymentStatus === 'SUCCESS') {
    if (Math.round(paidAmountInr) !== order.totalAmountInr) {
      return {
        shouldUpdateOrder: true,
        shouldGrantEntitlements: false,
        shouldDecrementStock: false,
        alreadyProcessed: false,
        nextPaymentStatus: 'failed',
        nextShipmentStatus: order.shipmentStatus,
        reason: `Amount mismatch: expected ₹${order.totalAmountInr}, received ₹${paidAmountInr}.`,
      };
    }

    return {
      shouldUpdateOrder: true,
      shouldGrantEntitlements: true,
      shouldDecrementStock: order.hasPhysicalItems,
      alreadyProcessed: false,
      nextPaymentStatus: 'paid',
      nextShipmentStatus: order.hasPhysicalItems ? 'processing' : 'not_applicable',
      reason: `Payment ${cashfreePaymentId} verified. Granting entitlements.`,
    };
  }

  if (cashfreePaymentStatus === 'FAILED') {
    return {
      shouldUpdateOrder: order.paymentStatus !== 'failed',
      shouldGrantEntitlements: false,
      shouldDecrementStock: false,
      alreadyProcessed: order.paymentStatus === 'failed',
      nextPaymentStatus: 'failed',
      nextShipmentStatus: order.shipmentStatus,
      reason: 'Payment reported as FAILED by Cashfree.',
    };
  }

  if (cashfreePaymentStatus === 'USER_DROPPED' || cashfreePaymentStatus === 'CANCELLED') {
    return {
      shouldUpdateOrder: order.paymentStatus !== 'cancelled',
      shouldGrantEntitlements: false,
      shouldDecrementStock: false,
      alreadyProcessed: order.paymentStatus === 'cancelled',
      nextPaymentStatus: 'cancelled',
      nextShipmentStatus: order.shipmentStatus,
      reason: 'Payment cancelled or dropped by user.',
    };
  }

  return {
    shouldUpdateOrder: false,
    shouldGrantEntitlements: false,
    shouldDecrementStock: false,
    alreadyProcessed: false,
    nextPaymentStatus: 'pending',
    nextShipmentStatus: order.shipmentStatus,
    reason: 'Payment remains pending.',
  };
}
