import React, { useState } from 'react';
import {
  Trash2,
  Plus,
  Minus,
  ShieldCheck,
  Truck,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import type { CatalogProduct } from '../utils/commerceRules';
import type { ActiveUserSession } from './AuthModal';
import { CoverArtwork, formatCleanTitle } from './CoverArtwork';
import { getClientAuthHeaders } from '../utils/apiAuth';

declare global {
  interface Window {
    Cashfree?: (config: { mode: 'sandbox' | 'production' }) => {
      checkout: (options: {
        paymentSessionId: string;
        redirectTarget?: '_modal' | '_self';
      }) => Promise<{
        error?: { message?: string };
        redirect?: boolean;
        paymentDetails?: unknown;
      }>;
    };
  }
}

export interface CartItemState {
  productId: string;
  quantity: number;
}

export interface SavedAddressRecord {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  isDefault: boolean;
}

interface CartCheckoutViewProps {
  cart: CartItemState[];
  products: CatalogProduct[];
  user: ActiveUserSession | null;
  savedAddresses: SavedAddressRecord[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  onRequireAuth: () => void;
  onSaveAddress: (addr: Omit<SavedAddressRecord, 'id' | 'userId'>) => SavedAddressRecord;
  onOrderCompleted: () => Promise<void>;
  onNavigateCatalog: () => void;
}

export const CartCheckoutView: React.FC<CartCheckoutViewProps> = ({
  cart,
  products,
  user,
  savedAddresses,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onRequireAuth,
  onSaveAddress,
  onOrderCompleted,
  onNavigateCatalog,
}) => {
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'UPI' | 'CARD' | 'NETBANKING'>('UPI');
  const [selectedAddressId, setSelectedAddressId] = useState<string>(
    savedAddresses.find((a) => a.isDefault)?.id || savedAddresses[0]?.id || ''
  );
  const [showNewAddressForm, setShowNewAddressForm] = useState(savedAddresses.length === 0);

  const [fullName, setFullName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '+91 9876543210');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [postalCode, setPostalCode] = useState('');

  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);

  const [orderFeedback, setOrderFeedback] = useState<{
    orderId: string;
    message: string;
  } | null>(null);

  const detailedItems = cart
    .map((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) return null;
      const effectiveQty = product.format === 'recorded_course' ? 1 : item.quantity;
      return {
        product,
        quantity: effectiveQty,
        lineTotalInr: product.priceInr * effectiveQty,
        requiresShipping:
          product.format === 'physical_book' || product.format === 'hybrid_book',
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const subtotalInr = detailedItems.reduce((sum, item) => sum + item.lineTotalInr, 0);
  const hasPhysicalItems = detailedItems.some((item) => item.requiresShipping);
  const discountInr =
    appliedCoupon.trim().toUpperCase() === 'SATYA20' ? Math.round(subtotalInr * 0.2) : 0;
  const discountedSubtotal = Math.max(0, subtotalInr - discountInr);
  const shippingInr = hasPhysicalItems ? (discountedSubtotal >= 999 ? 0 : 79) : 0;
  const totalAmountInr = discountedSubtotal + shippingInr;

  const handleSaveNewAddress = (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutError(null);
    if (
      fullName.trim().length < 2 ||
      phone.trim().length < 6 ||
      line1.trim().length < 3 ||
      city.trim().length < 2 ||
      stateName.trim().length < 2 ||
      postalCode.trim().length < 4
    ) {
      setCheckoutError(
        'Please complete all required delivery address fields (Name, Phone, Street Address, City, State, and PIN Code).'
      );
      return;
    }

    const created = onSaveAddress({
      fullName: fullName.trim(),
      phone: phone.trim(),
      line1: line1.trim(),
      line2: line2.trim(),
      city: city.trim(),
      state: stateName.trim(),
      postalCode: postalCode.trim(),
      isDefault: savedAddresses.length === 0,
    });
    setSelectedAddressId(created.id);
    setShowNewAddressForm(false);
  };

  const verifyPaymentWithBackend = async (orderIdToVerify: string) => {
    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      const authHeaders = await getClientAuthHeaders(user);
      const verifyRes = await fetch('/api/payments/cashfree/verify', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ orderId: orderIdToVerify }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.verified) {
        setCheckoutError(
          verifyData?.error ||
            `Order ${orderIdToVerify} is still pending payment verification with Cashfree. Content unlocks only after payment is confirmed as PAID.`
        );
        return;
      }

      setPendingOrderId(null);
      onClearCart();
      await onOrderCompleted();
      setOrderFeedback({
        orderId: verifyData.order.id,
        message: `Cashfree payment verified for Order ${verifyData.order.id}! Your courses and digital books are now unlocked in your Student Dashboard.`,
      });
    } catch (err) {
      setCheckoutError(
        err instanceof Error ? err.message : 'Network error verifying payment with server.'
      );
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handlePlaceOrder = async () => {
    setCheckoutError(null);
    setOrderFeedback(null);

    if (!user) {
      onRequireAuth();
      return;
    }

    let resolvedAddress = savedAddresses.find((a) => a.id === selectedAddressId);
    if (hasPhysicalItems && !resolvedAddress) {
      if (
        fullName.trim().length >= 2 &&
        line1.trim().length >= 3 &&
        city.trim().length >= 2 &&
        postalCode.trim().length >= 4
      ) {
        resolvedAddress = onSaveAddress({
          fullName: fullName.trim(),
          phone: phone.trim() || '+91 9876543210',
          line1: line1.trim(),
          line2: line2.trim(),
          city: city.trim(),
          state: stateName.trim() || 'Telangana',
          postalCode: postalCode.trim(),
          isDefault: true,
        });
        setSelectedAddressId(resolvedAddress.id);
      } else {
        setCheckoutError(
          'Your cart includes a physical book. Please select or save a valid Indian delivery address before placing your order.'
        );
        return;
      }
    }

    setCheckoutLoading(true);
    try {
      const authHeaders = await getClientAuthHeaders(user);

      // Step 1: Create Pending Order and Request Cashfree Payment Session
      const response = await fetch('/api/payments/cashfree/create-order', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          cartItems: cart,
          couponCode: appliedCoupon,
          shippingAddress: resolvedAddress,
          customerName: user.name,
          customerEmail: user.email,
          customerPhone: resolvedAddress?.phone || user.phone || '9876543210',
          paymentMethod,
          returnUrl: window.location.origin,
        }),
      });

      const data = await response.json();
      if (data?.order?.id) {
        setPendingOrderId(data.order.id);
      }

      if (!response.ok || !data.paymentSessionId) {
        await onOrderCompleted();
        setCheckoutError(
          data?.error || 'Could not initialize Cashfree checkout session.'
        );
        return;
      }

      // Step 2: Launch Official Cashfree v3 Modal Checkout
      if (typeof window.Cashfree !== 'function') {
        setCheckoutError(
          'Cashfree Checkout SDK is not loaded. Please check your internet connection and refresh.'
        );
        return;
      }

      const cashfree = window.Cashfree({
        mode: data.cashfreeMode === 'sandbox' ? 'sandbox' : 'production',
      });

      const checkoutResult = await cashfree.checkout({
        paymentSessionId: data.paymentSessionId,
        redirectTarget: '_modal',
      });

      if (checkoutResult?.error) {
        await onOrderCompleted();
        setCheckoutError(
          checkoutResult.error.message ||
            `Payment was not completed for Order ${data.order.id}. Order status remains pending.`
        );
        return;
      }

      // Step 3: Independently Verify Payment Status on Backend with Cashfree Server API
      await verifyPaymentWithBackend(data.order.id);
    } catch (err) {
      setCheckoutError(
        err instanceof Error ? err.message : 'Network error during checkout.'
      );
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <p className="text-xs font-mono-tabular text-[#B48A1E]">
          CASHFREE INR CHECKOUT · SERVER-VERIFIED FULFILLMENT
        </p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0A192F] mt-1">
          Shopping Cart & Checkout
        </h1>
      </div>

      {orderFeedback && (
        <div
          role="status"
          className="mb-6 p-5 rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold">Cashfree Payment Verified — Access Granted</h3>
              <p className="text-xs mt-1 leading-relaxed">{orderFeedback.message}</p>
            </div>
          </div>
        </div>
      )}

      {detailedItems.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center max-w-xl mx-auto">
          <h2 className="font-display text-xl font-bold text-[#0A192F]">Your Cart is Empty</h2>
          <p className="text-sm text-slate-600 mt-2 mb-6">
            Explore recorded technology courses, engineering handbooks, and illustrated storybooks.
          </p>
          <button
            type="button"
            onClick={onNavigateCatalog}
            className="px-5 py-2.5 bg-[#0A192F] text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors inline-flex items-center gap-2"
          >
            <span>Browse Full Catalog</span>
            <ArrowRight className="w-4 h-4 text-[#D4AF37]" />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left 7 columns: Cart Items + Delivery Address */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
              {detailedItems.map(({ product, quantity, lineTotalInr, requiresShipping }) => (
                <div
                  key={product.id}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-24 aspect-4/3 rounded-lg overflow-hidden border border-slate-200 shrink-0 hidden sm:block">
                      <CoverArtwork product={product} className="w-full h-full" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-slate-500">
                        <span>{product.category}</span>
                        <span aria-hidden="true"> · </span>
                        <span>
                          {requiresShipping ? 'Physical Delivery Required' : 'Instant Digital Access'}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-[#0A192F]">
                        {formatCleanTitle(product.title)}
                      </h3>
                      <p className="text-xs text-slate-500">
                        Unit Price: ₹{product.priceInr.toLocaleString('en-IN')} · {product.coverType}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                    {product.format !== 'recorded_course' ? (
                      <div className="flex items-center border border-slate-300 rounded-lg">
                        <button
                          type="button"
                          aria-label={`Decrease quantity for ${product.title}`}
                          onClick={() => onUpdateQuantity(product.id, Math.max(1, quantity - 1))}
                          className="p-2 text-slate-600 hover:text-slate-900"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-3 text-xs font-mono-tabular font-semibold">
                          {quantity}
                        </span>
                        <button
                          type="button"
                          aria-label={`Increase quantity for ${product.title}`}
                          onClick={() =>
                            onUpdateQuantity(product.id, Math.min(product.stock, quantity + 1))
                          }
                          className="p-2 text-slate-600 hover:text-slate-900"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">1 Course License</span>
                    )}

                    <span className="font-mono-tabular text-base font-bold text-[#0A192F] min-w-[72px] text-right">
                      ₹{lineTotalInr.toLocaleString('en-IN')}
                    </span>

                    <button
                      type="button"
                      aria-label={`Remove ${product.title} from cart`}
                      onClick={() => onRemoveItem(product.id)}
                      className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Physical Book Delivery Address Section */}
            {hasPhysicalItems && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Truck className="w-5 h-5 text-[#B48A1E]" />
                    <h2 className="font-display text-lg font-bold text-[#0A192F]">
                      Delivery Address for Physical Books
                    </h2>
                  </div>
                  {savedAddresses.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowNewAddressForm(!showNewAddressForm)}
                      className="text-xs font-semibold text-[#0A192F] underline"
                    >
                      {showNewAddressForm ? 'Use Saved Address' : '+ Add New Address'}
                    </button>
                  )}
                </div>

                {savedAddresses.length > 0 && !showNewAddressForm && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {savedAddresses.map((addr) => (
                      <label
                        key={addr.id}
                        className={`p-4 rounded-lg border cursor-pointer transition-colors block ${
                          selectedAddressId === addr.id
                            ? 'border-[#0A192F] bg-slate-50'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-[#0A192F]">{addr.fullName}</span>
                          <input
                            type="radio"
                            name="deliveryAddress"
                            checked={selectedAddressId === addr.id}
                            onChange={() => setSelectedAddressId(addr.id)}
                          />
                        </div>
                        <p className="text-xs text-slate-600">
                          {addr.line1}
                          {addr.line2 ? `, ${addr.line2}` : ''}
                        </p>
                        <p className="text-xs text-slate-600">
                          {addr.city}, {addr.state} - {addr.postalCode}
                        </p>
                        <p className="text-xs text-slate-500 mt-1 font-mono-tabular">
                          Phone: {addr.phone}
                        </p>
                      </label>
                    ))}
                  </div>
                )}

                {(showNewAddressForm || savedAddresses.length === 0) && (
                  <form onSubmit={handleSaveNewAddress} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="ship-fullname"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Recipient Full Name
                      </label>
                      <input
                        id="ship-fullname"
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Ananya Rao"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="ship-phone"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Mobile Number (10 digits)
                      </label>
                      <input
                        id="ship-phone"
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+91 9876543210"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="ship-line1"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Flat / House No., Building, Street Address
                      </label>
                      <input
                        id="ship-line1"
                        type="text"
                        value={line1}
                        onChange={(e) => setLine1(e.target.value)}
                        placeholder="Plot 42, Madhapur Main Road"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="ship-city"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        City / Town
                      </label>
                      <input
                        id="ship-city"
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Hyderabad"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label
                          htmlFor="ship-state"
                          className="block text-xs font-semibold text-slate-700 mb-1"
                        >
                          State
                        </label>
                        <input
                          id="ship-state"
                          type="text"
                          value={stateName}
                          onChange={(e) => setStateName(e.target.value)}
                          placeholder="Telangana"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="ship-pin"
                          className="block text-xs font-semibold text-slate-700 mb-1"
                        >
                          PIN Code
                        </label>
                        <input
                          id="ship-pin"
                          type="text"
                          value={postalCode}
                          onChange={(e) => setPostalCode(e.target.value)}
                          placeholder="500081"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        type="submit"
                        className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800"
                      >
                        Save Delivery Address
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Right 5 columns: Order Summary & Cashfree Checkout Button */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <h2 className="font-display text-xl font-bold text-[#0A192F]">
              Order Summary (INR)
            </h2>

            {/* Coupon Code Input */}
            <div className="flex gap-2">
              <label htmlFor="coupon-input" className="sr-only">
                Coupon Code
              </label>
              <input
                id="coupon-input"
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                placeholder="Coupon code (try SATYA20)"
                className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg uppercase font-mono-tabular"
              />
              <button
                type="button"
                onClick={() => setAppliedCoupon(couponCode.trim().toUpperCase())}
                className="px-4 py-2 bg-slate-100 text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-200"
              >
                Apply
              </button>
            </div>

            {/* Preferred Payment Mode Indicator */}
            <div className="space-y-2 pt-2 border-t border-slate-200">
              <span className="block text-xs font-semibold text-slate-700">
                Cashfree Payment Options (UPI, Cards, NetBanking)
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'UPI', label: 'UPI' },
                    { id: 'CARD', label: 'Card' },
                    { id: 'NETBANKING', label: 'NetBanking' },
                  ] as const
                ).map((pm) => (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => setPaymentMethod(pm.id)}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                      paymentMethod === pm.id
                        ? 'bg-[#0A192F] text-white border-[#0A192F]'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {pm.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5 text-sm pt-3 border-t border-slate-200">
              <div className="flex justify-between text-slate-600">
                <span>Catalog Subtotal</span>
                <span className="font-mono-tabular">₹{subtotalInr.toLocaleString('en-IN')}</span>
              </div>
              {discountInr > 0 && (
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>Offer Discount ({appliedCoupon})</span>
                  <span className="font-mono-tabular">-₹{discountInr.toLocaleString('en-IN')}</span>
                </div>
              )}
              {hasPhysicalItems && (
                <div className="flex justify-between text-slate-600">
                  <span>Physical Book Shipping</span>
                  <span className="font-mono-tabular">
                    {shippingInr === 0 ? 'FREE (Order ≥ ₹999)' : `₹${shippingInr}`}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-[#0A192F] pt-3 border-t border-slate-200">
                <span>Total Payable (INR)</span>
                <span className="font-mono-tabular text-xl">
                  ₹{totalAmountInr.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {checkoutError && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 space-y-2"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{checkoutError}</span>
                </div>
                {pendingOrderId && (
                  <button
                    type="button"
                    disabled={checkoutLoading}
                    onClick={() => verifyPaymentWithBackend(pendingOrderId)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-300 text-red-900 font-semibold rounded-md hover:bg-red-100"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Re-check Cashfree Payment Status ({pendingOrderId})</span>
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              disabled={checkoutLoading}
              onClick={handlePlaceOrder}
              className="w-full py-3 px-4 bg-[#0A192F] text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <CreditCard className="w-4 h-4 text-[#D4AF37]" />
              <span>
                {checkoutLoading
                  ? 'Processing with Cashfree...'
                  : user
                  ? `Pay with Cashfree — ₹${totalAmountInr.toLocaleString('en-IN')}`
                  : 'Log In to Complete Order'}
              </span>
            </button>

            <div className="flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed">
              <ShieldCheck className="w-4 h-4 text-[#B48A1E] shrink-0 mt-0.5" />
              <span>
                Verified Fulfillment: Every order starts as <strong>pending</strong> and unlocks
                courses or digital books only after our backend independently verifies payment
                completion with Cashfree.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
