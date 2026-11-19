import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_COURSE_PRICE_INR,
  calculateVerifiedCartSummary,
  matchesCoursePriceTier,
} from './commerceRules';
import {
  INITIAL_CATEGORIES,
  INITIAL_COURSE_DETAILS,
  INITIAL_LESSONS,
  INITIAL_PRODUCTS,
} from '../data/sampleCatalog';

describe('Online-courses-only catalog & ₹10k/₹20k/₹50k pricing', () => {
  it('contains exclusively recorded online courses priced at ₹10,000, ₹20,000, or ₹50,000', () => {
    assert.ok(INITIAL_PRODUCTS.length > 0, 'Catalog must contain at least one course');

    const allowedTiers = new Set([10000, 20000, 50000]);
    const observedTiers = new Set<number>();

    for (const product of INITIAL_PRODUCTS) {
      assert.equal(product.type, 'course', `Product "${product.id}" must be a course`);
      assert.equal(
        product.format,
        'recorded_course',
        `Product "${product.id}" must use recorded_course format`
      );
      assert.ok(
        product.priceInr >= MIN_COURSE_PRICE_INR,
        `Product "${product.id}" must be priced at least ₹${MIN_COURSE_PRICE_INR}`
      );
      assert.ok(
        allowedTiers.has(product.priceInr),
        `Product "${product.id}" price ₹${product.priceInr} must be in ₹10k / ₹20k / ₹50k tiers`
      );
      assert.ok(
        product.originalPriceInr > product.priceInr,
        `Product "${product.id}" originalPriceInr should exceed priceInr`
      );
      assert.ok(
        INITIAL_COURSE_DETAILS[product.id],
        `Product "${product.id}" must have course curriculum details`
      );
      assert.ok(
        INITIAL_LESSONS.some((lesson) => lesson.courseId === product.id),
        `Product "${product.id}" must have at least one lesson`
      );
      observedTiers.add(product.priceInr);
    }

    assert.equal(observedTiers.has(10000), true, 'Catalog should include ₹10,000 tier courses');
    assert.equal(observedTiers.has(20000), true, 'Catalog should include ₹20,000 tier courses');
    assert.equal(observedTiers.has(50000), true, 'Catalog should include ₹50,000 tier courses');
  });

  it('has no books or storybooks categories', () => {
    assert.ok(INITIAL_CATEGORIES.length > 0);
    for (const cat of INITIAL_CATEGORIES) {
      assert.equal(cat.group, 'technology', `Category "${cat.name}" must belong to technology tracks`);
      assert.equal(
        /book|storybook/i.test(cat.name),
        false,
        `Category "${cat.name}" must not reference books`
      );
    }
  });
});

describe('matchesCoursePriceTier', () => {
  it('filters courses cleanly across 10k, 20k, and 50k tiers', () => {
    assert.equal(matchesCoursePriceTier(10000, 'all'), true);
    assert.equal(matchesCoursePriceTier(50000, 'all'), true);

    assert.equal(matchesCoursePriceTier(10000, '10k'), true);
    assert.equal(matchesCoursePriceTier(19999, '10k'), true);
    assert.equal(matchesCoursePriceTier(20000, '10k'), false);
    assert.equal(matchesCoursePriceTier(9999, '10k'), false);

    assert.equal(matchesCoursePriceTier(20000, '20k'), true);
    assert.equal(matchesCoursePriceTier(49999, '20k'), true);
    assert.equal(matchesCoursePriceTier(10000, '20k'), false);
    assert.equal(matchesCoursePriceTier(50000, '20k'), false);

    assert.equal(matchesCoursePriceTier(50000, '50k'), true);
    assert.equal(matchesCoursePriceTier(75000, '50k'), true);
    assert.equal(matchesCoursePriceTier(20000, '50k'), false);
  });
});

describe('calculateVerifiedCartSummary for high-ticket online courses', () => {
  const catalogById = Object.fromEntries(INITIAL_PRODUCTS.map((p) => [p.id, p]));

  it('computes exact subtotal, zero shipping, and SATYA20 discount without requiring shipping address', () => {
    const result = calculateVerifiedCartSummary({
      cartItems: [
        { productId: 'course-react-typescript', quantity: 1, clientSuppliedPriceInr: 1 },
        { productId: 'course-python-mastery', quantity: 2, clientSuppliedPriceInr: 500 },
        { productId: 'course-agentic-ai', quantity: 1 },
      ],
      catalogById,
      couponCode: 'SATYA20',
      activeCoupons: { SATYA20: 20 },
      shippingAddressProvided: false,
    });

    assert.equal(result.valid, true);
    assert.equal(result.hasPhysicalItems, false);
    assert.equal(result.shippingInr, 0);
    // Recorded courses clamp quantity to 1: 10,000 + 20,000 + 50,000 = 80,000
    assert.equal(result.subtotalInr, 80000);
    assert.equal(result.discountInr, 16000);
    assert.equal(result.totalAmountInr, 64000);
    assert.equal(result.items.every((item) => item.quantity === 1), true);
    assert.equal(result.items.every((item) => item.requiresShipping === false), true);
  });
});
