/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  ShoppingBag,
  Menu,
  X,
  Heart,
  User,
  ShieldCheck,
  ArrowRight,
  SlidersHorizontal,
  Play,
  BookOpen,
  Sparkles,
  CheckCircle2,
  Truck,
  Lock,
  LogIn,
  LogOut,
  Star,
  GraduationCap,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Send,
  Award,
  Zap,
  Phone,
} from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, signOut } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  BUSINESS_COMPLIANCE_INFO,
  type CatalogProduct,
  type CourseLesson,
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
import { CoverArtwork, formatCleanTitle } from './components/CoverArtwork';
import { AuthModal, type ActiveUserSession } from './components/AuthModal';
import { ProductDetailView } from './components/ProductDetailView';
import {
  CartCheckoutView,
  type CartItemState,
  type SavedAddressRecord,
} from './components/CartCheckoutView';
import {
  UserDashboardView,
  type LessonProgressRecord,
  type UserEntitlementSummary,
  type UserOrderSummary,
} from './components/UserDashboardView';
import { AdminDashboardView } from './components/AdminDashboardView';
import { StaticAndGuideViews, type StaticPageType } from './components/StaticAndGuideViews';

type ActiveView =
  | 'home'
  | 'courses'
  | 'books'
  | 'storybooks'
  | 'catalog'
  | 'product-detail'
  | 'cart'
  | 'dashboard'
  | 'admin'
  | StaticPageType;

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('home');
  const [selectedProductId, setSelectedProductId] = useState<string>(INITIAL_PRODUCTS[0].id);
  const [heroSpotlightIndex, setHeroSpotlightIndex] = useState<number>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Catalog state synchronized with backend /api/catalog
  const [products, setProducts] = useState<CatalogProduct[]>(INITIAL_PRODUCTS);
  const [categories, setCategories] = useState<CategoryItem[]>(INITIAL_CATEGORIES);
  const [courseDetailsMap, setCourseDetailsMap] =
    useState<Record<string, CourseCurriculumDetails>>(INITIAL_COURSE_DETAILS);
  const [lessons, setLessons] = useState<CourseLesson[]>(INITIAL_LESSONS);
  const [banners, setBanners] = useState<PromotionalBanner[]>(INITIAL_BANNERS);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // Filters & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [priceFilter, setPriceFilter] = useState<'all' | 'under500' | '500to1500' | 'over1500'>(
    'all'
  );
  const [formatFilter, setFormatFilter] = useState<
    'all' | 'recorded_course' | 'digital_book' | 'physical_book'
  >('all');
  const [sortBy, setSortBy] = useState<'featured' | 'price-asc' | 'price-desc' | 'title'>(
    'featured'
  );

  // User Session & Isolated Personal State
  const [user, setUser] = useState<ActiveUserSession | null>(null);

  const [cart, setCart] = useState<CartItemState[]>([
    { productId: 'course-python-mastery', quantity: 1 },
  ]);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddressRecord[]>([]);

  const [orders, setOrders] = useState<UserOrderSummary[]>([]);
  const [entitlements, setEntitlements] = useState<UserEntitlementSummary[]>([]);
  const [progressByLessonId, setProgressByLessonId] = useState<
    Record<string, LessonProgressRecord>
  >({});
  const [dashboardInitialCourseId, setDashboardInitialCourseId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterSubmitted, setNewsletterSubmitted] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn('Sign out:', err);
    }
    setUser(null);
    showToast('Signed out successfully.');
    if (activeView === 'dashboard' || activeView === 'admin') {
      setActiveView('home');
    }
  };

  const fetchCatalogFromServer = async () => {
    setLoadingCatalog(true);
    try {
      const res = await fetch('/api/catalog');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.products) && data.products.length > 0) {
          setProducts(data.products);
        }
        if (Array.isArray(data.categories) && data.categories.length > 0) {
          setCategories(data.categories);
        }
        if (data.courseDetails) {
          setCourseDetailsMap(data.courseDetails);
        }
        if (Array.isArray(data.lessons) && data.lessons.length > 0) {
          setLessons(data.lessons);
        }
        if (Array.isArray(data.banners) && data.banners.length > 0) {
          setBanners(data.banners);
        }
      }
    } catch {
      // Fallback to initial embedded catalog
    } finally {
      setLoadingCatalog(false);
    }
  };

  const fetchUserLibraryFromServer = async (activeSession: ActiveUserSession | null) => {
    if (!activeSession) {
      setOrders([]);
      setEntitlements([]);
      return;
    }
    try {
      const res = await fetch('/api/user/library', {
        headers: {
          'x-satya-uid': activeSession.uid,
          'x-satya-email': activeSession.email,
          'x-satya-email-verified': String(activeSession.emailVerified),
          'x-satya-admin-claim': String(activeSession.role === 'admin'),
        },
      });
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
        setEntitlements(data.entitlements || []);
      }
    } catch {
      // Ignore transient error
    }
  };

  useEffect(() => {
    fetchCatalogFromServer();
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        let role: 'student' | 'admin' = 'student';
        try {
          const tokenResult = await fbUser.getIdTokenResult();
          if (tokenResult?.claims?.admin === true) {
            role = 'admin';
          } else {
            const adminDoc = await getDoc(doc(db, 'admins', fbUser.uid));
            if (adminDoc.exists()) {
              role = 'admin';
            }
          }
        } catch {
          role = 'student';
        }
        const session: ActiveUserSession = {
          uid: fbUser.uid,
          name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Student',
          email: fbUser.email || 'student@example.com',
          phone: fbUser.phoneNumber || '',
          emailVerified: fbUser.emailVerified,
          role,
        };
        setUser(session);
      } else {
        setUser(null);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    fetchUserLibraryFromServer(user);
  }, [user?.uid]);

  const publishedProducts = useMemo(
    () => products.filter((p) => p.status === 'published'),
    [products]
  );

  const spotlightProducts = useMemo(() => {
    const picks = [
      publishedProducts.find((p) => p.id === 'course-python-mastery'),
      publishedProducts.find((p) => p.id === 'book-django-architecture-print'),
      publishedProducts.find((p) => p.id === 'course-agentic-ai'),
    ].filter((x): x is CatalogProduct => Boolean(x));
    return picks.length > 0 ? picks : publishedProducts.slice(0, 3);
  }, [publishedProducts]);

  const currentSpotlight = spotlightProducts[heroSpotlightIndex] || spotlightProducts[0];

  const filteredProducts = useMemo(() => {
    return publishedProducts
      .filter((prod) => {
        if (activeView === 'courses' && prod.type !== 'course') return false;
        if (activeView === 'books' && prod.type !== 'book') return false;
        if (activeView === 'storybooks' && prod.type !== 'storybook') return false;

        if (selectedCategory !== 'All' && prod.category !== selectedCategory) {
          return false;
        }

        if (formatFilter !== 'all') {
          if (
            formatFilter === 'physical_book' &&
            prod.format !== 'physical_book' &&
            prod.format !== 'hybrid_book'
          ) {
            return false;
          } else if (
            formatFilter !== 'physical_book' &&
            prod.format !== formatFilter
          ) {
            return false;
          }
        }

        if (priceFilter === 'under500' && prod.priceInr >= 500) return false;
        if (priceFilter === '500to1500' && (prod.priceInr < 500 || prod.priceInr > 1500))
          return false;
        if (priceFilter === 'over1500' && prod.priceInr <= 1500) return false;

        if (searchQuery.trim().length > 0) {
          const q = searchQuery.toLowerCase();
          const matchTitle = prod.title.toLowerCase().includes(q);
          const matchCat = prod.category.toLowerCase().includes(q);
          const matchDesc = prod.shortDescription.toLowerCase().includes(q);
          const matchAuthor = prod.authorOrInstructor.toLowerCase().includes(q);
          if (!matchTitle && !matchCat && !matchDesc && !matchAuthor) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'price-asc') return a.priceInr - b.priceInr;
        if (sortBy === 'price-desc') return b.priceInr - a.priceInr;
        if (sortBy === 'title') return a.title.localeCompare(b.title);
        return Number(b.featured) - Number(a.featured);
      });
  }, [
    publishedProducts,
    activeView,
    selectedCategory,
    formatFilter,
    priceFilter,
    searchQuery,
    sortBy,
  ]);

  const handleAddToCart = (product: CatalogProduct) => {
    const clean = formatCleanTitle(product.title);
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        if (product.format === 'recorded_course') {
          showToast(`"${clean}" is already in your cart.`);
          return prev;
        }
        showToast(`Updated quantity for "${clean}" in cart.`);
        return prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: Math.min(product.stock, item.quantity + 1) }
            : item
        );
      }
      showToast(`Added "${clean}" to cart.`);
      return [...prev, { productId: product.id, quantity: 1 }];
    });
  };

  const handleBuyNow = (product: CatalogProduct) => {
    handleAddToCart(product);
    setActiveView('cart');
  };

  const handleToggleWishlist = (productId: string) => {
    setWishlistIds((prev) => {
      if (prev.includes(productId)) {
        showToast('Removed from your wishlist.');
        return prev.filter((id) => id !== productId);
      }
      showToast('Saved to your wishlist.');
      return [...prev, productId];
    });
  };

  const handleOpenProductDetail = (productId: string) => {
    setSelectedProductId(productId);
    setActiveView('product-detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalCartItemsCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const activeBanner = banners.find((b) => b.active) || banners[0];
  const entitledProductIds = new Set(entitlements.map((e) => e.productId));
  const selectedProduct =
    products.find((p) => p.id === selectedProductId) || publishedProducts[0];

  const renderProductCard = (product: CatalogProduct) => {
    const isEntitled = entitledProductIds.has(product.id);
    const isWishlisted = wishlistIds.includes(product.id);
    const isPhysical =
      product.format === 'physical_book' || product.format === 'hybrid_book';
    const cleanTitle = formatCleanTitle(product.title);
    const discountPercent =
      product.originalPriceInr > product.priceInr
        ? Math.round(
            ((product.originalPriceInr - product.priceInr) /
              product.originalPriceInr) *
              100
          )
        : 0;

    return (
      <article
        key={product.id}
        className="group bg-white border border-slate-200/90 rounded-2xl overflow-hidden flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:border-slate-300"
      >
        <div>
          {/* Card Visual Area */}
          <div
            onClick={() => handleOpenProductDetail(product.id)}
            className="aspect-4/3 cursor-pointer relative overflow-hidden border-b border-slate-100 bg-slate-50"
          >
            <CoverArtwork
              product={product}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            {/* Format & Type Tag Pill */}
            <div className="absolute top-3 left-3 flex items-center gap-1.5">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#0A192F]/90 text-[#D4AF37] backdrop-blur-xs shadow-sm uppercase tracking-wide">
                {product.type === 'course'
                  ? 'HD Course'
                  : product.type === 'storybook'
                  ? 'Storybook'
                  : 'Book'}
              </span>
            </div>
            {/* Wishlist Heart Action */}
            <button
              type="button"
              aria-label={`Toggle wishlist for ${cleanTitle}`}
              onClick={(e) => {
                e.stopPropagation();
                handleToggleWishlist(product.id);
              }}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 hover:bg-white text-slate-500 hover:text-red-500 flex items-center justify-center shadow-sm backdrop-blur-xs transition-colors"
            >
              <Heart
                className={`w-4 h-4 ${
                  isWishlisted ? 'fill-red-500 text-red-500' : ''
                }`}
              />
            </button>
          </div>

          {/* Card Content */}
          <div className="p-5 space-y-2.5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-medium text-[#B48A1E]">
                {product.category} · {product.language}
              </span>
              <span className="font-mono-tabular text-slate-600 font-medium">
                {isPhysical ? `${product.stock} in stock` : 'Instant Access'}
              </span>
            </div>

            <h3 className="font-display text-base sm:text-[17px] font-bold text-[#0A192F] leading-snug line-clamp-2">
              <button
                type="button"
                onClick={() => handleOpenProductDetail(product.id)}
                className="text-left group-hover:text-[#163866] transition-colors focus:outline-none"
              >
                {cleanTitle}
              </button>
            </h3>

            <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
              {product.shortDescription}
            </p>
          </div>
        </div>

        <div className="px-5 pb-5 pt-3.5 border-t border-slate-100 space-y-3.5 bg-slate-50/50">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <span className="font-mono-tabular text-xl font-bold text-[#0A192F]">
                ₹{product.priceInr.toLocaleString('en-IN')}
              </span>
              {product.originalPriceInr > product.priceInr && (
                <>
                  <span className="font-mono-tabular text-xs text-slate-400 line-through">
                    ₹{product.originalPriceInr.toLocaleString('en-IN')}
                  </span>
                  {discountPercent > 0 && (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                      Save {discountPercent}%
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleOpenProductDetail(product.id)}
              className="py-2.5 px-3 bg-white border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap text-center"
            >
              {product.type === 'course' ? 'Watch Preview' : 'View Details'}
            </button>
            {isEntitled ? (
              <button
                type="button"
                onClick={() => {
                  setDashboardInitialCourseId(product.id);
                  setActiveView('dashboard');
                }}
                className="py-2.5 px-3 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap text-center"
              >
                Open Library
              </button>
            ) : (
              <button
                type="button"
                disabled={isPhysical && product.stock <= 0}
                onClick={() => handleAddToCart(product)}
                className="py-2.5 px-3 bg-[#0A192F] hover:bg-[#162D50] text-white text-xs font-bold rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap text-center"
              >
                {isPhysical && product.stock <= 0 ? 'Out of Stock' : 'Add to Cart'}
              </button>
            )}
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      {/* Sticky Professional Navigation Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-xs px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto h-16 sm:h-[72px] flex items-center justify-between gap-3 sm:gap-4 lg:gap-6">
          {/* Brand Emblem & Wordmark */}
          <a
            href="#home"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('home');
            }}
            className="flex items-center gap-3 whitespace-nowrap shrink-0 group focus:outline-none"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0A192F] to-[#162D50] border border-[#D4AF37]/80 flex items-center justify-center text-[#D4AF37] font-display font-bold text-base shadow-sm group-hover:scale-105 transition-all">
              SE
            </div>
            <div className="flex flex-col">
              <span className="font-display text-lg sm:text-xl font-bold tracking-tight text-[#0A192F] group-hover:text-[#112240] transition-colors leading-none">
                Satya’s Education
              </span>
              <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-500 mt-1 font-mono-tabular">
                Technology Academy & Press
              </span>
            </div>
          </a>

          {/* Navigation Links */}
          <nav aria-label="Primary Navigation" className="hidden lg:flex items-center">
            <ul className="flex items-center gap-1">
              {[
                { id: 'home', label: 'Home' },
                { id: 'courses', label: 'Courses' },
                { id: 'books', label: 'Books' },
                { id: 'storybooks', label: 'Storybooks' },
                { id: 'catalog', label: 'Catalog' },
                ...(user ? [{ id: 'dashboard' as const, label: 'My Dashboard' }] : []),
                ...(user?.role === 'admin'
                  ? [{ id: 'admin' as const, label: 'Admin Studio' }]
                  : []),
              ].map((item) => {
                const isActive = activeView === item.id;
                return (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        if (item.id === 'dashboard' && !user) {
                          setAuthModalOpen(true);
                          return;
                        }
                        if (
                          item.id === 'courses' ||
                          item.id === 'books' ||
                          item.id === 'storybooks' ||
                          item.id === 'catalog'
                        ) {
                          setSelectedCategory('All');
                        }
                        setActiveView(item.id as ActiveView);
                      }}
                      className={`relative px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap shrink-0 inline-block ${
                        isActive
                          ? 'text-[#0A192F] bg-slate-100 shadow-xs'
                          : 'text-slate-600 hover:text-[#0A192F] hover:bg-slate-50'
                      }`}
                    >
                      {item.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Integrated Search, Cart & Header Authentication Controls */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Search Input */}
            <div className="hidden xl:block relative w-48 2xl:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="global-catalog-search"
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (
                    activeView !== 'catalog' &&
                    activeView !== 'courses' &&
                    activeView !== 'books' &&
                    activeView !== 'storybooks'
                  ) {
                    setActiveView('catalog');
                  }
                }}
                placeholder="Search Python, AI, Books..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-100/90 hover:bg-slate-100 focus:bg-white text-xs text-slate-900 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0A192F] transition-all"
              />
            </div>

            {/* Cart Button */}
            <button
              type="button"
              onClick={() => setActiveView('cart')}
              className="px-3 py-2 text-xs font-semibold text-white bg-[#0A192F] rounded-lg hover:bg-[#112240] transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-2 shadow-xs"
              title="View Cart"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span className="hidden sm:inline">Cart</span>
              <span className="px-1.5 py-0.5 text-[11px] font-mono-tabular font-bold bg-[#D4AF37] text-[#0A192F] rounded">
                {totalCartItemsCount}
              </span>
            </button>

            {/* HEADER AUTHENTICATION ONLY: Exclusively in Navigation Header */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {user ? (
                /* Authenticated User: Profile Avatar + Direct Sign Out */
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveView('dashboard')}
                    className="inline-flex items-center gap-2 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-lg text-xs font-semibold text-[#0A192F] transition-colors max-w-[140px] sm:max-w-[180px] truncate"
                    title={`Signed in as ${user.name} (${user.role}). Click to view Dashboard.`}
                  >
                    <span className="w-6 h-6 rounded-full bg-[#0A192F] text-[#D4AF37] flex items-center justify-center text-[11px] font-bold shrink-0">
                      {user.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate hidden sm:inline">
                      {user.name.split(' ')[0]}
                    </span>
                    {user.role === 'admin' ? (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold bg-[#D4AF37] text-[#0A192F] rounded uppercase">
                        Admin
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-slate-200 text-slate-700 rounded hidden md:inline">
                        Student
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleSignOut}
                    title="Sign Out"
                    className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:text-red-700 bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-lg transition-all whitespace-nowrap shadow-xs"
                  >
                    <LogOut className="w-3.5 h-3.5 text-slate-500 hover:text-red-600" />
                    <span className="hidden sm:inline">Sign Out</span>
                  </button>
                </div>
              ) : (
                /* Logged Out User: Sign In & Register */
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => setAuthModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:text-[#0A192F] hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <LogIn className="w-3.5 h-3.5 text-slate-500" />
                    <span>Sign In</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthModalOpen(true)}
                    className="inline-flex items-center gap-1 px-3 py-2 text-xs font-bold text-[#0A192F] bg-gradient-to-r from-[#D4AF37] to-[#F3E5AB] hover:brightness-105 active:scale-95 rounded-lg shadow-xs transition-all whitespace-nowrap"
                  >
                    <span>Register</span>
                  </button>
                </div>
              )}
            </div>

            {/* Mobile Menu Toggle Button */}
            <button
              type="button"
              aria-label="Toggle mobile navigation menu"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 text-slate-700 hover:text-[#0A192F] rounded-lg border border-slate-200"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <nav
            aria-label="Mobile Navigation"
            className="lg:hidden py-4 border-t border-slate-200 space-y-3"
          >
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="search"
                aria-label="Mobile search courses and books"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (activeView !== 'catalog') setActiveView('catalog');
                }}
                placeholder="Search Python, Django, React, AI, or books..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 text-xs border border-slate-200 rounded-lg"
              />
            </div>

            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {[
                { id: 'home', label: 'Home' },
                { id: 'courses', label: 'Technology Courses' },
                { id: 'books', label: 'Educational Books' },
                { id: 'storybooks', label: 'Storybooks' },
                { id: 'catalog', label: 'Full Catalog & Filters' },
                ...(user ? [{ id: 'dashboard' as const, label: 'My Dashboard' }] : []),
                ...(user?.role === 'admin'
                  ? [{ id: 'admin' as const, label: 'Admin Studio' }]
                  : []),
              ].map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (item.id === 'dashboard' && !user) {
                        setAuthModalOpen(true);
                      } else {
                        setActiveView(item.id as ActiveView);
                      }
                      setMobileMenuOpen(false);
                    }}
                    className={`block w-full text-left px-3 py-2 text-xs font-semibold rounded-lg ${
                      activeView === item.id
                        ? 'bg-[#0A192F] text-[#D4AF37]'
                        : 'text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>

            {/* Mobile Header Auth Controls */}
            <div className="pt-3 border-t border-slate-200">
              {user ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs px-1">
                    <span className="text-slate-600 font-medium">
                      Signed in as: <strong className="text-[#0A192F]">{user.name}</strong> ({user.role})
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveView('dashboard');
                        setMobileMenuOpen(false);
                      }}
                      className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg text-center"
                    >
                      My Dashboard
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        handleSignOut();
                      }}
                      className="py-2 px-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold rounded-lg text-center flex items-center justify-center gap-1.5"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setAuthModalOpen(true);
                    }}
                    className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg text-center flex items-center justify-center gap-1.5"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Sign In</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setAuthModalOpen(true);
                    }}
                    className="py-2.5 px-3 bg-gradient-to-r from-[#D4AF37] to-[#F3E5AB] text-[#0A192F] text-xs font-bold rounded-lg text-center shadow-xs"
                  >
                    <span>Register</span>
                  </button>
                </div>
              )}
            </div>
          </nav>
        )}
      </header>

      {/* Global Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-40 bg-[#0A192F] text-white border border-[#D4AF37] px-4 py-3 rounded-xl shadow-lg text-xs font-medium flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4 text-[#D4AF37]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1">
        {/* VIEW 1: Storefront Home */}
        {activeView === 'home' && (
          <div>
            {/* Section 1: Storefront Split Hero with Interactive Spotlight Stage */}
            <section className="relative overflow-hidden bg-gradient-to-br from-[#050D1A] via-[#0A192F] to-[#112240] text-white border-b border-white/10 py-12 lg:py-16">
              {/* Ambient Background Glows */}
              <div className="pointer-events-none absolute -top-40 -left-40 w-96 h-96 bg-[#D4AF37]/10 rounded-full blur-3xl" />
              <div className="pointer-events-none absolute -bottom-40 -right-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />

              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
                  {/* Left Column (7 cols): Headline, Value Proposition, Primary Actions & Category Strip */}
                  <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
                    <div className="space-y-5">
                      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#D4AF37]/15 text-[#F3E5AB] border border-[#D4AF37]/35 shadow-sm">
                        <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span className="tracking-wide">SATYA’S EDUCATION · ACADEMY & PUBLISHING</span>
                      </div>
                      <h1 className="font-display text-3xl sm:text-4xl lg:text-[46px] font-bold leading-[1.14] tracking-tight text-white">
                        Master Modern{' '}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FDE047] via-[#D4AF37] to-[#F59E0B]">
                          Software Engineering, AI
                        </span>{' '}
                        & Reading Foundations.
                      </h1>
                      <p className="text-sm sm:text-base text-slate-300 max-w-2xl leading-relaxed">
                        Self-paced HD course recordings in Python, Django, React, Cloud & Agentic
                        AI, paired with authoritative engineering textbooks and illustrated
                        children’s storybooks. Instant digital access and tracked hardcover delivery
                        across India.
                      </p>
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => setActiveView('courses')}
                          className="px-6 py-3.5 bg-gradient-to-r from-[#D4AF37] to-[#F3E5AB] text-[#0A192F] text-sm font-bold rounded-xl hover:brightness-105 active:scale-95 transition-all inline-flex items-center gap-2 whitespace-nowrap shadow-lg shadow-[#D4AF37]/20"
                        >
                          <Play className="w-4 h-4 fill-current" />
                          <span>Explore Technology Courses</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveView('books')}
                          className="px-6 py-3.5 bg-white/10 hover:bg-white/15 text-white border border-white/20 text-sm font-semibold rounded-xl active:scale-95 transition-all inline-flex items-center gap-2 whitespace-nowrap backdrop-blur-xs"
                        >
                          <BookOpen className="w-4 h-4 text-[#D4AF37]" />
                          <span>Browse Books & Storybooks</span>
                        </button>
                      </div>
                    </div>

                    {/* Technology Categories Interactive Filter Strip */}
                    <div className="pt-5 border-t border-white/10">
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
                        EXPLORE 11 TECHNOLOGY & PUBLISHING TRACKS:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {categories.map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => {
                              setSelectedCategory(cat.name);
                              setActiveView('catalog');
                            }}
                            className="px-3 py-1.5 bg-white/10 hover:bg-[#D4AF37] hover:text-[#0A192F] hover:border-[#D4AF37] border border-white/15 text-xs font-medium text-slate-200 rounded-full transition-all duration-150 whitespace-nowrap shadow-xs active:scale-95"
                          >
                            {cat.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column (5 cols): Interactive Featured Course & Hardcover Book Showcase */}
                  {currentSpotlight && (
                    <div className="lg:col-span-5 flex flex-col justify-between bg-gradient-to-b from-[#0F223D]/95 to-[#0A182E]/95 border border-[#D4AF37]/35 rounded-2xl p-5 sm:p-6 shadow-2xl backdrop-blur-md space-y-4">
                      {/* Interactive Spotlight Selector Tabs */}
                      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
                        <span className="text-[11px] font-bold text-[#D4AF37] uppercase tracking-wider flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse" />
                          FEATURED SPOTLIGHT
                        </span>
                        <div className="flex items-center gap-1 bg-black/30 p-1 rounded-lg">
                          {spotlightProducts.map((item, idx) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setHeroSpotlightIndex(idx)}
                              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all whitespace-nowrap ${
                                heroSpotlightIndex === idx
                                  ? 'bg-[#D4AF37] text-[#0A192F] shadow-xs'
                                  : 'text-slate-300 hover:text-white'
                              }`}
                            >
                              {item.category}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Visual Artwork Preview inside Hero */}
                      <div
                        onClick={() => handleOpenProductDetail(currentSpotlight.id)}
                        className="aspect-16/10 rounded-xl overflow-hidden border border-white/20 cursor-pointer shadow-inner hover:scale-[1.01] transition-transform"
                      >
                        <CoverArtwork product={currentSpotlight} className="w-full h-full" />
                      </div>

                      {/* Spotlight Details & Direct CTA */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs text-slate-300">
                          <span>
                            {currentSpotlight.coverType} · {currentSpotlight.language}
                          </span>
                          <span className="font-mono-tabular text-[#FDE047] font-semibold px-2 py-0.5 rounded bg-white/10">
                            {currentSpotlight.level}
                          </span>
                        </div>

                        <h2 className="font-display text-lg font-bold text-white leading-snug">
                          {formatCleanTitle(currentSpotlight.title)}
                        </h2>

                        <div className="flex items-center justify-between pt-2 border-t border-white/10">
                          <div className="flex items-baseline gap-2">
                            <span className="font-mono-tabular text-2xl font-bold text-white">
                              ₹{currentSpotlight.priceInr.toLocaleString('en-IN')}
                            </span>
                            <span className="font-mono-tabular text-xs text-slate-400 line-through">
                              ₹{currentSpotlight.originalPriceInr.toLocaleString('en-IN')}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenProductDetail(currentSpotlight.id)}
                              className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                            >
                              {currentSpotlight.type === 'course' ? 'Free Preview' : 'Inspect Book'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAddToCart(currentSpotlight)}
                              className="px-3.5 py-2 bg-[#D4AF37] hover:bg-[#e0bc42] text-[#0A192F] text-xs font-bold rounded-lg transition-colors whitespace-nowrap shadow-sm"
                            >
                              Add to Cart
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Full-Width 4-Column Academic Architecture Highlights Strip */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-10 pt-8 border-t border-white/10 text-xs">
                  <div className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-4 flex items-start gap-3.5 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center shrink-0 mt-0.5">
                      <Play className="w-4 h-4 text-[#D4AF37]" />
                    </div>
                    <div>
                      <p className="font-semibold text-white">HD Course Recordings</p>
                      <p className="text-slate-300 mt-1 leading-relaxed">
                        Modular syllabus with public free preview lessons and saved progress.
                      </p>
                    </div>
                  </div>
                  <div className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-4 flex items-start gap-3.5 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center shrink-0 mt-0.5">
                      <BookOpen className="w-4 h-4 text-[#D4AF37]" />
                    </div>
                    <div>
                      <p className="font-semibold text-white">Digital & Print Editions</p>
                      <p className="text-slate-300 mt-1 leading-relaxed">
                        Signed 15-minute PDF downloads and sewn hardcover books.
                      </p>
                    </div>
                  </div>
                  <div className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-4 flex items-start gap-3.5 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center shrink-0 mt-0.5">
                      <Truck className="w-4 h-4 text-[#D4AF37]" />
                    </div>
                    <div>
                      <p className="font-semibold text-white">Tracked Delivery Across India</p>
                      <p className="text-slate-300 mt-1 leading-relaxed">
                        Live physical stock verification and free shipping on orders ₹999+.
                      </p>
                    </div>
                  </div>
                  <div className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-4 flex items-start gap-3.5 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center shrink-0 mt-0.5">
                      <Lock className="w-4 h-4 text-[#D4AF37]" />
                    </div>
                    <div>
                      <p className="font-semibold text-white">Verified Cashfree INR Checkout</p>
                      <p className="text-slate-300 mt-1 leading-relaxed">
                        Server-side price calculation and HMAC-SHA256 webhook verification.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 2: Featured Courses, Technical Books & Storybooks Grid */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-14">
              {/* Featured Technology Courses */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
                  <div>
                    <p className="text-xs font-mono-tabular text-[#B48A1E] font-semibold">
                      01. HD VIDEO RECORDINGS · FREE PREVIEW LESSONS
                    </p>
                    <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0A192F] mt-1">
                      Featured Technology Courses
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveView('courses')}
                    className="text-xs font-semibold text-[#0A192F] hover:underline inline-flex items-center gap-1"
                  >
                    <span>Explore All {publishedProducts.filter((p) => p.type === 'course').length} Courses</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {publishedProducts
                    .filter((p) => p.type === 'course')
                    .slice(0, 3)
                    .map(renderProductCard)}
                </div>
              </div>

              {/* Featured Educational Books & Storybooks */}
              <div className="pt-10 border-t border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
                  <div>
                    <p className="text-xs font-mono-tabular text-[#B48A1E] font-semibold">
                      02. PRINT HARDCOVER & DIGITAL PDF EDITIONS
                    </p>
                    <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0A192F] mt-1">
                      Engineering Textbooks & Children’s Storybooks
                    </h2>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => setActiveView('books')}
                      className="text-xs font-semibold text-[#0A192F] hover:underline"
                    >
                      Engineering Books →
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveView('storybooks')}
                      className="text-xs font-semibold text-[#0A192F] hover:underline"
                    >
                      Children’s Storybooks →
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {publishedProducts
                    .filter((p) => p.type === 'book' || p.type === 'storybook')
                    .slice(0, 3)
                    .map(renderProductCard)}
                </div>
              </div>

              {/* Section 3: Why Choose Satya's Education? */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-10 shadow-xs space-y-8">
                <div className="text-center max-w-2xl mx-auto space-y-2">
                  <p className="text-xs font-mono-tabular text-[#B48A1E] font-semibold tracking-wider uppercase">
                    03. INSTITUTIONAL RIGOR & HONEST VALUE
                  </p>
                  <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0A192F]">
                    Why Engineers & Students Choose Satya’s Education
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    Designed for real-world software engineering competencies, verified learning outcomes, and zero subscription traps.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="p-5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3 hover:shadow-md transition-shadow">
                    <div className="w-10 h-10 rounded-xl bg-[#0A192F] text-[#D4AF37] flex items-center justify-center">
                      <Zap className="w-5 h-5 text-[#D4AF37]" />
                    </div>
                    <h3 className="font-display font-bold text-base text-[#0A192F]">
                      Practical Engineering Rigor
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Every module is built around production Python, Django, Cloud, and Agentic AI architectures. No superficial tutorials.
                    </p>
                  </div>

                  <div className="p-5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3 hover:shadow-md transition-shadow">
                    <div className="w-10 h-10 rounded-xl bg-[#0A192F] text-[#D4AF37] flex items-center justify-center">
                      <BookOpen className="w-5 h-5 text-[#D4AF37]" />
                    </div>
                    <h3 className="font-display font-bold text-base text-[#0A192F]">
                      Authoritative Textbooks
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Comprehensive printed hardcover reference manuals and 15-minute signed digital PDFs with full code notes.
                    </p>
                  </div>

                  <div className="p-5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3 hover:shadow-md transition-shadow">
                    <div className="w-10 h-10 rounded-xl bg-[#0A192F] text-[#D4AF37] flex items-center justify-center">
                      <GraduationCap className="w-5 h-5 text-[#D4AF37]" />
                    </div>
                    <h3 className="font-display font-bold text-base text-[#0A192F]">
                      Early STEM Curiosity
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Illustrated children’s storybooks designed to foster early computational thinking, algorithms, and logic.
                    </p>
                  </div>

                  <div className="p-5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3 hover:shadow-md transition-shadow">
                    <div className="w-10 h-10 rounded-xl bg-[#0A192F] text-[#D4AF37] flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5 text-[#D4AF37]" />
                    </div>
                    <h3 className="font-display font-bold text-base text-[#0A192F]">
                      Transparent Cashfree Checkout
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      All prices transparently in INR (₹). Secure checkout powered by Cashfree Payments with 7-day refund guarantee.
                    </p>
                  </div>
                </div>
              </div>

              {/* Section 4: How It Works */}
              <div className="space-y-8">
                <div className="text-center max-w-2xl mx-auto space-y-2">
                  <p className="text-xs font-mono-tabular text-[#B48A1E] font-semibold tracking-wider uppercase">
                    04. STREAMLINED STUDENT JOURNEY
                  </p>
                  <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0A192F]">
                    How Learning at Satya’s Education Works
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    From free previews to lifetime dashboard access and tracked nationwide book delivery.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="relative p-6 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-[#0A192F] text-[#D4AF37] flex items-center justify-center text-sm font-bold font-mono-tabular">
                      01
                    </div>
                    <h3 className="font-display font-bold text-base text-[#0A192F]">
                      Discover & Watch Free Previews
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Browse courses, textbooks, and storybooks by technology track. Watch introductory lessons freely without creating an account.
                    </p>
                  </div>

                  <div className="relative p-6 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-[#0A192F] text-[#D4AF37] flex items-center justify-center text-sm font-bold font-mono-tabular">
                      02
                    </div>
                    <h3 className="font-display font-bold text-base text-[#0A192F]">
                      Secure Checkout via Cashfree
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Add items to your cart, apply coupons like <code className="font-mono-tabular font-bold text-[#0A192F]">SATYA20</code>, and pay securely using UPI, Cards, or Net Banking in Indian Rupees.
                    </p>
                  </div>

                  <div className="relative p-6 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-[#0A192F] text-[#D4AF37] flex items-center justify-center text-sm font-bold font-mono-tabular">
                      03
                    </div>
                    <h3 className="font-display font-bold text-base text-[#0A192F]">
                      Learn in Dashboard & Receive Books
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Courses and digital books unlock immediately in your Student Dashboard. Hardcover textbooks are packaged and shipped with India-wide tracking.
                    </p>
                  </div>
                </div>
              </div>

              {/* Section 5: Frequently Asked Questions (FAQ) */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-10 shadow-xs space-y-6">
                <div className="max-w-2xl space-y-2">
                  <p className="text-xs font-mono-tabular text-[#B48A1E] font-semibold tracking-wider uppercase">
                    05. QUESTIONS & ANSWERS
                  </p>
                  <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0A192F]">
                    Frequently Asked Questions
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    Clear information on course access, physical deliveries, refunds, and payments.
                  </p>
                </div>

                <div className="space-y-3 divide-y divide-slate-100">
                  {[
                    {
                      q: 'How do I access course recordings after purchasing?',
                      a: 'As soon as your payment is confirmed, your enrolled course unlocks immediately inside your personal Student Dashboard. You receive lifetime access to all HD video recordings, syllabus updates, and downloadable source code repositories.',
                    },
                    {
                      q: 'How long does physical hardcover book delivery take across India?',
                      a: 'Physical books are dispatched from our publishing fulfillment desk within 24 to 48 business hours. Delivery typically takes 4 to 7 business days across all serviceable postal PIN codes in India, handled via India Post or trusted domestic courier partners with tracking.',
                    },
                    {
                      q: 'What payment methods are supported on Satya’s Education?',
                      a: 'We process all payments through Cashfree Payments India Private Limited (PCI-DSS Level 1 compliant). Supported payment options include UPI (Google Pay, PhonePe, Paytm, BHIM), Indian Debit & Credit Cards (Visa, MasterCard, RuPay), and Net Banking across all major Indian banks.',
                    },
                    {
                      q: 'What is your Return and Refund Policy?',
                      a: 'We offer a 7-day return policy for physical books if received in damaged or defective condition, providing a free replacement or full refund. For digital courses, refund requests are honored within 7 days of purchase provided less than 20% of the video curriculum has been consumed.',
                    },
                    {
                      q: 'Can I cancel an order after placing it?',
                      a: 'Physical book orders can be cancelled within 24 hours of placement or prior to dispatch from our warehouse at zero cancellation charge. Full refunds are processed directly back to your original payment method via Cashfree within 5 to 7 business days.',
                    },
                  ].map((faq, idx) => {
                    const isOpen = openFaqIndex === idx;
                    return (
                      <div key={idx} className="pt-3">
                        <button
                          type="button"
                          onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                          className="w-full py-2 flex items-center justify-between text-left text-sm font-bold text-[#0A192F] hover:text-[#B48A1E] transition-colors focus:outline-none"
                        >
                          <span>{faq.q}</span>
                          {isOpen ? (
                            <ChevronUp className="w-4 h-4 text-[#B48A1E] shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                        </button>
                        {isOpen && (
                          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed pt-1.5 pb-2">
                            {faq.a}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section 6: Direct Student & Academic Inquiry Desk */}
              <div className="bg-gradient-to-br from-[#0A192F] via-[#112240] to-[#0A192F] text-white rounded-2xl p-6 sm:p-10 shadow-lg border border-slate-800 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-7 space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[#D4AF37]/20 text-[#F3E5AB] border border-[#D4AF37]/40">
                    <Award className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>ACADEMIC COUNSELING & SYLLABUS UPDATES</span>
                  </div>
                  <h2 className="font-display text-2xl sm:text-3xl font-bold leading-tight">
                    Stay Updated on New Course Syllabus & Textbooks
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl">
                    Get notified when new engineering modules, Python 3.12 exercises, and children's STEM storybooks are published. No spam, ever.
                  </p>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300 pt-2">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-[#D4AF37]" />
                      Direct support: {BUSINESS_COMPLIANCE_INFO.supportEmail}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Phone className="w-4 h-4 text-[#D4AF37]" />
                      Helpline: {BUSINESS_COMPLIANCE_INFO.supportPhone}
                    </span>
                  </div>
                </div>

                <div className="lg:col-span-5 bg-white/5 border border-white/10 rounded-xl p-5 space-y-3 backdrop-blur-xs">
                  <h3 className="font-display font-bold text-sm text-white">
                    Request Course Syllabus or Assistance
                  </h3>
                  {newsletterSubmitted ? (
                    <div className="p-3 bg-emerald-950/60 border border-emerald-500/50 rounded-lg text-xs text-emerald-200 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Thank you! Your inquiry has been noted by our academic desk.</span>
                    </div>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!newsletterEmail.trim()) return;
                        setNewsletterSubmitted(true);
                      }}
                      className="space-y-2.5"
                    >
                      <input
                        type="email"
                        value={newsletterEmail}
                        onChange={(e) => setNewsletterEmail(e.target.value)}
                        placeholder="Enter your email address..."
                        required
                        className="w-full px-3.5 py-2 text-xs bg-white text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                      />
                      <button
                        type="submit"
                        className="w-full py-2.5 px-4 bg-gradient-to-r from-[#D4AF37] to-[#F3E5AB] text-[#0A192F] font-bold text-xs rounded-lg hover:brightness-105 transition-all shadow-xs"
                      >
                        Subscribe to Syllabus Updates
                      </button>
                    </form>
                  )}
                  <p className="text-[11px] text-slate-400 text-center">
                    Operated by {BUSINESS_COMPLIANCE_INFO.tradeName} · Registered Entity: {BUSINESS_COMPLIANCE_INFO.legalName}
                  </p>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* VIEW 2: Catalog Views (Courses, Books, Storybooks, All Catalog) */}
        {(activeView === 'courses' ||
          activeView === 'books' ||
          activeView === 'storybooks' ||
          activeView === 'catalog') && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-5">
              <div>
                <p className="text-xs font-mono-tabular text-[#B48A1E] font-semibold">
                  SATYA’S EDUCATION CATALOG
                </p>
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0A192F] mt-1">
                  {activeView === 'courses'
                    ? 'Technology Course Recordings'
                    : activeView === 'books'
                    ? 'Educational & Engineering Books'
                    : activeView === 'storybooks'
                    ? 'Children’s Illustrated Storybooks'
                    : 'Complete Course & Book Catalog'}
                </h1>
              </div>
              <span className="text-xs text-slate-500 font-mono-tabular">
                Showing {filteredProducts.length} item(s)
              </span>
            </div>

            {/* Category & Attribute Filter Controls */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <SlidersHorizontal className="w-4 h-4 text-[#B48A1E]" />
                <span>Filter by Technology or Publishing Category:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('All')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                    selectedCategory === 'All'
                      ? 'bg-[#0A192F] text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  All Categories
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.name)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                      selectedCategory === cat.name
                        ? 'bg-[#0A192F] text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-200">
                <div>
                  <label
                    htmlFor="filter-price-select"
                    className="block text-[11px] font-semibold text-slate-500 mb-1"
                  >
                    Price Range (INR)
                  </label>
                  <select
                    id="filter-price-select"
                    value={priceFilter}
                    onChange={(e) =>
                      setPriceFilter(
                        e.target.value as 'all' | 'under500' | '500to1500' | 'over1500'
                      )
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="all">All Prices</option>
                    <option value="under500">Under ₹500</option>
                    <option value="500to1500">₹500 – ₹1,500</option>
                    <option value="over1500">Above ₹1,500</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="filter-format-select"
                    className="block text-[11px] font-semibold text-slate-500 mb-1"
                  >
                    Delivery Format
                  </label>
                  <select
                    id="filter-format-select"
                    value={formatFilter}
                    onChange={(e) =>
                      setFormatFilter(
                        e.target.value as
                          | 'all'
                          | 'recorded_course'
                          | 'digital_book'
                          | 'physical_book'
                      )
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="all">All Formats</option>
                    <option value="recorded_course">Recorded Video Courses</option>
                    <option value="digital_book">Digital Books (PDF)</option>
                    <option value="physical_book">Physical Hardcover Books</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="filter-sort-select"
                    className="block text-[11px] font-semibold text-slate-500 mb-1"
                  >
                    Sort By
                  </label>
                  <select
                    id="filter-sort-select"
                    value={sortBy}
                    onChange={(e) =>
                      setSortBy(
                        e.target.value as 'featured' | 'price-asc' | 'price-desc' | 'title'
                      )
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="featured">Featured First</option>
                    <option value="price-asc">Price: Low to High</option>
                    <option value="price-desc">Price: High to Low</option>
                    <option value="title">Title: A to Z</option>
                  </select>
                </div>
              </div>
            </div>

            {loadingCatalog ? (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-600">
                Loading catalog items...
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
                <h2 className="font-display text-lg font-bold text-[#0A192F]">
                  No Matching Courses or Books Found
                </h2>
                <p className="text-xs text-slate-600">
                  Try clearing your search query or resetting the active category and price filters.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('All');
                    setPriceFilter('all');
                    setFormatFilter('all');
                  }}
                  className="px-4 py-2 bg-[#0A192F] text-white text-xs font-semibold rounded-lg"
                >
                  Reset All Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProducts.map(renderProductCard)}
              </div>
            )}
          </div>
        )}

        {/* VIEW 3: Product Details View */}
        {activeView === 'product-detail' && selectedProduct && (
          <ProductDetailView
            product={selectedProduct}
            courseDetails={courseDetailsMap[selectedProduct.id]}
            lessons={lessons}
            isEntitled={entitledProductIds.has(selectedProduct.id)}
            isWishlisted={wishlistIds.includes(selectedProduct.id)}
            onBack={() => setActiveView('catalog')}
            onAddToCart={handleAddToCart}
            onBuyNow={handleBuyNow}
            onToggleWishlist={handleToggleWishlist}
            onOpenCoursePlayer={(prodId) => {
              setDashboardInitialCourseId(prodId);
              setActiveView('dashboard');
            }}
          />
        )}

        {/* VIEW 4: Cart & Cashfree INR Checkout */}
        {activeView === 'cart' && (
          <CartCheckoutView
            cart={cart}
            products={products}
            user={user}
            savedAddresses={savedAddresses}
            onUpdateQuantity={(productId, quantity) =>
              setCart((prev) =>
                prev.map((item) =>
                  item.productId === productId ? { ...item, quantity } : item
                )
              )
            }
            onRemoveItem={(productId) =>
              setCart((prev) => prev.filter((item) => item.productId !== productId))
            }
            onClearCart={() => setCart([])}
            onRequireAuth={() => setAuthModalOpen(true)}
            onSaveAddress={(newAddr) => {
              const created: SavedAddressRecord = {
                ...newAddr,
                id: `addr_${Date.now()}`,
                userId: user?.uid || 'guest',
              };
              setSavedAddresses((prev) => [...prev, created]);
              return created;
            }}
            onOrderCompleted={async () => {
              await fetchCatalogFromServer();
              await fetchUserLibraryFromServer(user);
            }}
            onNavigateCatalog={() => setActiveView('catalog')}
          />
        )}

        {/* VIEW 5: Protected Student Dashboard */}
        {activeView === 'dashboard' &&
          (user ? (
            <UserDashboardView
              user={user}
              products={products}
              lessons={lessons}
              orders={orders}
              entitlements={entitlements}
              wishlistIds={wishlistIds}
              addresses={savedAddresses}
              progressByLessonId={progressByLessonId}
              initialCourseId={dashboardInitialCourseId}
              onUpdateProfile={(name, phone) => {
                setUser((prev) => (prev ? { ...prev, name, phone } : null));
              }}
              onToggleLessonCompleted={(courseId, lessonId, watchedSeconds) => {
                setProgressByLessonId((prev) => {
                  const current = prev[lessonId];
                  return {
                    ...prev,
                    [lessonId]: {
                      lessonId,
                      courseId,
                      completed: !current?.completed,
                      watchedSeconds,
                    },
                  };
                });
              }}
              onSaveAddress={(newAddr) => {
                const created: SavedAddressRecord = {
                  ...newAddr,
                  id: `addr_${Date.now()}`,
                  userId: user.uid,
                };
                setSavedAddresses((prev) => [...prev, created]);
                return created;
              }}
              onDeleteAddress={(id) =>
                setSavedAddresses((prev) => prev.filter((a) => a.id !== id))
              }
              onRemoveWishlist={handleToggleWishlist}
              onAddToCart={handleAddToCart}
              onLogout={async () => {
                try {
                  await signOut(auth);
                } catch {
                  // Ignore signout error in demo session
                }
                setUser(null);
                setActiveView('home');
              }}
            />
          ) : (
            <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
              <h2 className="font-display text-2xl font-bold text-[#0A192F]">
                Sign In to Access Your Student Dashboard
              </h2>
              <p className="text-sm text-slate-600">
                Your purchased courses, lesson playback progress, digital books, and orders are
                private to your account.
              </p>
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="px-6 py-2.5 bg-[#0A192F] text-white text-xs font-semibold rounded-lg"
              >
                Open Sign In Modal
              </button>
            </div>
          ))}

        {/* VIEW 6: Protected Admin Panel */}
        {activeView === 'admin' && (
          <AdminDashboardView
            user={user}
            products={products}
            categories={categories}
            lessons={lessons}
            banners={banners}
            onRefreshCatalog={fetchCatalogFromServer}
            onNavigateHome={() => setActiveView('home')}
          />
        )}

        {/* VIEW 7: Static Policy & Deployment Guide Pages */}
        {(activeView === 'about' ||
          activeView === 'contact' ||
          activeView === 'privacy' ||
          activeView === 'terms' ||
          activeView === 'refund' ||
          activeView === 'cancellation' ||
          activeView === 'shipping' ||
          activeView === 'deployment') && <StaticAndGuideViews page={activeView} />}
      </main>

      {/* Storefront Footer with Mandatory Compliance & Developer Attribution */}
      <footer className="bg-[#071120] text-slate-300 border-t border-white/10 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid grid-cols-1 md:grid-cols-4 gap-8 text-xs">
          <div className="space-y-3">
            <span className="font-display text-lg font-bold text-white block">
              {BUSINESS_COMPLIANCE_INFO.tradeName}
            </span>
            <p className="text-slate-400 leading-relaxed">
              Operated by <strong>{BUSINESS_COMPLIANCE_INFO.legalName}</strong>. Structured software engineering
              courses, authoritative textbooks, and children’s STEM storybooks with secure Cashfree INR payments.
            </p>
            <div className="pt-2 text-[11px] text-slate-400 space-y-1">
              <p>
                <strong className="text-slate-300">Registered Office:</strong> {BUSINESS_COMPLIANCE_INFO.registeredAddress}
              </p>
              <p>
                <strong className="text-slate-300">Email:</strong> {BUSINESS_COMPLIANCE_INFO.supportEmail}
              </p>
              <p>
                <strong className="text-slate-300">Helpline:</strong> {BUSINESS_COMPLIANCE_INFO.supportPhone} (
                {BUSINESS_COMPLIANCE_INFO.workingHours})
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-[#D4AF37]">Catalog & Learning</h3>
            <ul className="space-y-1.5">
              <li>
                <button
                  type="button"
                  onClick={() => setActiveView('courses')}
                  className="hover:text-white"
                >
                  Technology Courses
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setActiveView('books')}
                  className="hover:text-white"
                >
                  Educational Textbooks
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setActiveView('storybooks')}
                  className="hover:text-white"
                >
                  Children’s Storybooks
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setActiveView('dashboard')}
                  className="hover:text-white"
                >
                  Student Dashboard
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-[#D4AF37]">Information & Policies</h3>
            <ul className="space-y-1.5">
              <li>
                <button
                  type="button"
                  onClick={() => setActiveView('about')}
                  className="hover:text-white"
                >
                  About Us
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setActiveView('contact')}
                  className="hover:text-white"
                >
                  Contact Support & Address
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setActiveView('privacy')}
                  className="hover:text-white"
                >
                  Privacy Policy
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setActiveView('terms')}
                  className="hover:text-white"
                >
                  Terms & Conditions
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setActiveView('refund')}
                  className="hover:text-white"
                >
                  Return & Refund Policy
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setActiveView('cancellation')}
                  className="hover:text-white"
                >
                  Cancellation Policy
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setActiveView('shipping')}
                  className="hover:text-white"
                >
                  Shipping & Delivery Policy
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-[#D4AF37]">Administration & Security</h3>
            <ul className="space-y-1.5">
              <li>
                <button
                  type="button"
                  onClick={() => setActiveView('admin')}
                  className="hover:text-white"
                >
                  Protected Admin Console
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setActiveView('deployment')}
                  className="hover:text-white"
                >
                  Deployment & Cloud Guide
                </button>
              </li>
              <li className="pt-2 text-[11px] text-slate-400">
                Payment transactions secured by Cashfree Payments (PCI-DSS Level 1 Compliant)
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 py-6 px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-400 space-y-2">
          <p className="text-slate-300 font-medium">
            {BUSINESS_COMPLIANCE_INFO.operatedByStatement}
          </p>
          <p>© {new Date().getFullYear()} {BUSINESS_COMPLIANCE_INFO.tradeName}. All rights reserved.</p>
          <p className="text-[11px] text-slate-400">
            All prices listed in Indian Rupees (INR - ₹). Payments processed securely via Cashfree Payments India Private Limited.
          </p>
          <p className="font-medium text-[#D4AF37] tracking-wide pt-1">
            WEbsite maker : Pediredla Tarunraj
          </p>
        </div>
      </footer>

      {/* Authentication Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSessionAuthenticated={(session) => {
          setUser(session);
          showToast(`Signed in as ${session.name} (${session.role})`);
        }}
      />
    </div>
  );
}
