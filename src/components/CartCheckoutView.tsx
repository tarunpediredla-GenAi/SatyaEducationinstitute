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
} from 'lucide-react';
import type { CatalogProduct } from '../utils/commerceRules';
import type { ActiveUserSession } from './AuthModal';
import { CoverArtwork, formatCleanTitle } from './CoverArtwork';
import { getClientAuthHeaders, getClientAuthPayload } from '../utils/apiAuth';

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

  // Cashfree Gateway Modal State
  const [activeCashfreeSession, setActiveCashfreeSession] = useState<{
    orderId: string;
    paymentSessionId: string;
    totalAmountInr: number;
    cashfreeMode: string;
    itemSummary: string;
  } | null>(null);

  const [verificationFeedback, setVerificationFeedback] = useState<{
    status: 'paid' | 'failed' | 'cancelled' | 'pending';
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

  const handleInitiateCashfreeCheckout = async () => {
    setCheckoutError(null);
    setVerificationFeedback(null);

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
          'Your cart includes a physical book. Please select or save a valid Indian delivery address before proceeding to Cashfree payment.'
        );
        return;
      }
    }

    const checkoutPhone = (resolvedAddress?.phone || user.phone || '').replace(/[^0-9]/g, '').slice(-10);
    if (!/^[6-9][0-9]{9}$/.test(checkoutPhone) || checkoutPhone === '9876543210') {
      setCheckoutError('Please add your real 10-digit Indian mobile number in your profile or delivery address before paying.');
      return;
    }

    setCheckoutLoading(true);
    try {
      const authHeaders = await getClientAuthHeaders(user);
      const authPayload = await getClientAuthPayload(user);

      const response = await fetch('/api/cashfree/create-order', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          ...authPayload,
          cartItems: cart,
          couponCode: appliedCoupon,
          shippingAddress: resolvedAddress,
          customerName: user.name,
          customerEmail: user.email,
          customerPhone: checkoutPhone,
        }),
      });

      let data: any = null;
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          text && text.length < 200 && !text.includes('<html')
            ? text
            : 'Payment service currently unavailable. Please verify that Cashfree environment variables are configured.'
        );
      }

      if (!response.ok) {
        setCheckoutError(data?.error || 'Could not create Cashfree order.');
        return;
      }

      setActiveCashfreeSession({
        orderId: data.order.id,
        paymentSessionId: data.paymentSessionId,
        totalAmountInr: data.order.totalAmountInr,
        cashfreeMode: data.cashfreeMode,
        itemSummary: data.order.itemSummary,
      });

      // Automatically launch Cashfree Web Checkout modal if official session is available
      if (
        data.paymentSessionId &&
        typeof window !== 'undefined' &&
        (window as any).Cashfree
      ) {
        try {
          const cashfree = (window as any).Cashfree({
            mode: data.cashfreeMode === 'production' ? 'production' : 'sandbox',
          });
          cashfree
            .checkout({
              paymentSessionId: data.paymentSessionId,
              redirectTarget: '_modal',
            })
            .then((result: any) => {
              if (result && result.error) {
                setCheckoutError(
                  result.error.message || 'Cashfree payment was cancelled or declined.'
                );
              } else {
                // Verify order completion with server
                handleCompleteCashfreeVerification(data.order.id);
              }
            });
        } catch (e) {
          console.warn('Cashfree JS modal launch notice:', e);
        }
      }
    } catch (err) {
      setCheckoutError(
        err instanceof Error ? err.message : 'Network error creating Cashfree order.'
      );
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleCompleteCashfreeVerification = async (orderId: string) => {
    if (!orderId || !user) return;
    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      const authHeaders = await getClientAuthHeaders(user);
      const authPayload = await getClientAuthPayload(user);
      const res = await fetch('/api/cashfree/verify-order', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({...authPayload, orderId}),
      });
      const data = await res.json();
      if (!res.ok) {
        setCheckoutError(data?.error || 'Payment verification could not complete. Retry checking the payment status.');
        return;
      }
      if (data.verified && data.order?.paymentStatus === 'paid') {
        setActiveCashfreeSession(null);
        onClearCart();
        await onOrderCompleted();
        setVerificationFeedback({
          status:'paid', orderId,
          message:`Order ${orderId} confirmed by Cashfree. Your purchased courses and digital books are available in My Dashboard.`,
        });
      } else if (data.order?.paymentStatus === 'failed') {
        setVerificationFeedback({status:'failed', orderId,
          message:'Cashfree reports the payment failed. No purchase access has been granted.'});
      } else if (data.order?.paymentStatus === 'cancelled') {
        setVerificationFeedback({status:'cancelled', orderId,
          message:'The payment was cancelled. Your cart is saved; you can try again.'});
      } else {
        setVerificationFeedback({status:'pending', orderId,
          message:'Payment is not confirmed yet. If you paid, check again shortly. Do not pay twice.'});
      }
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Payment verification unavailable.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <p className="text-xs font-mono-tabular text-[#B48A1E]">
          SERVER-VERIFIED INR CHECKOUT · CASHFREE PG
        </p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0A192F] mt-1">
          Shopping Cart & Secure Checkout
        </h1>
      </div>

      {verificationFeedback && (
        <div
          role="status"
          className={`mb-6 p-5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
            verificationFeedback.status === 'paid'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
              : 'bg-amber-50 border-amber-200 text-amber-950'
          }`}
        >
          <div className="flex items-start gap-3">
            {verificationFeedback.status === 'paid' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            )}
            <div>
              <h3 className="text-sm font-bold">
                {verificationFeedback.status === 'paid'
                  ? 'Cashfree Payment Verified — Access Granted'
                  : 'Payment Not Completed'}
              </h3>
              <p className="text-xs mt-1 leading-relaxed">{verificationFeedback.message}</p>
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
          {/* Left 7 columns: Cart Items + Delivery Address (if physical books present) */}
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

          {/* Right 5 columns: Server-Verified Order Summary & Cashfree Trigger */}
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
                className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{checkoutError}</span>
              </div>
            )}

            <button
              type="button"
              disabled={checkoutLoading}
              onClick={handleInitiateCashfreeCheckout}
              className="w-full py-3 px-4 bg-[#0A192F] text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
            >
              <CreditCard className="w-4 h-4 text-[#D4AF37]" />
              <span>
                {checkoutLoading
                  ? 'Validating Cart & Stock on Server...'
                  : user
                  ? `Pay ₹${totalAmountInr.toLocaleString('en-IN')} with Cashfree`
                  : 'Sign In to Checkout with Cashfree'}
              </span>
            </button>

            {/* Accepted Payment Modes Badges */}
            <div className="pt-2 border-t border-slate-200/80 space-y-2">
              <p className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-[#B48A1E]" />
                <span>Accepted Payment Methods (Real-Time INR):</span>
              </p>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium text-slate-700">
                <span className="px-2 py-1 bg-slate-100 rounded-md border border-slate-200">
                  💳 Credit Cards (Visa, MasterCard, RuPay, Amex)
                </span>
                <span className="px-2 py-1 bg-slate-100 rounded-md border border-slate-200">
                  💳 Debit Cards (All Banks)
                </span>
                <span className="px-2 py-1 bg-slate-100 rounded-md border border-slate-200">
                  📱 UPI (PhonePe, GPay, Paytm)
                </span>
                <span className="px-2 py-1 bg-slate-100 rounded-md border border-slate-200">
                  🏦 Net Banking (50+ Banks)
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed">
              <ShieldCheck className="w-4 h-4 text-[#B48A1E] shrink-0 mt-0.5" />
              <span>
                Server-side verification: The backend re-reads live product prices and physical
                book stock before creating the Cashfree order and verifies the HMAC-SHA256 webhook
                signature before unlocking courses or books.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Cashfree Payment Gateway Interactive Checkout Modal */}
      {activeCashfreeSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cf-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="border-b border-slate-200 pb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-mono-tabular text-[#B48A1E] uppercase">
                  CASHFREE PAYMENTS ({activeCashfreeSession.cashfreeMode})
                </p>
                <h3 id="cf-modal-title" className="font-display text-lg font-bold text-[#0A192F]">
                  Complete INR Payment
                </h3>
              </div>
              <span className="font-mono-tabular text-xl font-bold text-[#0A192F]">
                ₹{activeCashfreeSession.totalAmountInr.toLocaleString('en-IN')}
              </span>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Cashfree Order ID:</span>
                <span className="font-mono-tabular font-semibold text-slate-900">
                  {activeCashfreeSession.orderId}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Session Token:</span>
                <span className="font-mono-tabular text-slate-700 truncate max-w-[180px]">
                  {activeCashfreeSession.paymentSessionId}
                </span>
              </div>
              <p className="text-slate-600 pt-1 border-t border-slate-200">
                {activeCashfreeSession.itemSummary}
              </p>
            </div>

            {(
              <button
                type="button"
                disabled={checkoutLoading}
                onClick={() => {
                  if (typeof window !== 'undefined' && (window as any).Cashfree) {
                    const cashfree = (window as any).Cashfree({
                      mode:
                        activeCashfreeSession.cashfreeMode === 'production'
                          ? 'production'
                          : 'sandbox',
                    });
                    cashfree
                      .checkout({
                        paymentSessionId: activeCashfreeSession.paymentSessionId,
                        redirectTarget: '_modal',
                      })
                      .then((result: any) => {
                        if (result && result.error) {
                          setCheckoutError(result.error.message || 'Payment cancelled.');
                        } else {
                          handleCompleteCashfreeVerification(activeCashfreeSession.orderId);
                        }
                      });
                  }
                }}
                className="w-full py-3 px-4 bg-[#D4AF37] hover:bg-[#e0bc42] text-[#0A192F] text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                <span>Open Cashfree Gateway Popup (UPI / Card / NetBanking)</span>
              </button>
            )}

            <p className="text-xs text-slate-600 leading-relaxed">
              Payment status is confirmed on the server directly with Cashfree.
              Closing the payment window does not mean payment succeeded. If you have paid,
              use the button below to refresh your payment status.
            </p>
            <button
              type="button"
              disabled={checkoutLoading}
              onClick={() => handleCompleteCashfreeVerification(activeCashfreeSession.orderId)}
              className="w-full py-2.5 px-4 bg-emerald-700 text-white text-xs font-semibold rounded-lg hover:bg-emerald-800 disabled:opacity-50"
            >
              {checkoutLoading ? 'Verifying payment...' : 'Check Cashfree Payment Status'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
