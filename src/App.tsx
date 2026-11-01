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
} from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, signOut } from './firebase';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
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
  const [user, setUser] = useState<ActiveUserSession | null>({
    uid: 'student_ananya_uid_01',
    name: 'Ananya Rao',
    email: 'ananya.student@satyaedu.in',
    phone: '+91 9123456780',
    emailVerified: true,
    role: 'student',
    isDemoSession: true,
  });

  const [cart, setCart] = useState<CartItemState[]>([
    { productId: 'course-python-mastery', quantity: 1 },
  ]);
  const [wishlistIds, setWishlistIds] = useState<string[]>(['book-django-architecture-print']);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddressRecord[]>([
    {
      id: 'addr_default_1',
      userId: 'student_ananya_uid_01',
      fullName: 'Ananya Rao',
      phone: '+91 9123456780',
      line1: 'Flat 302, Vidya Nagar Colony, Madhapur',
      line2: 'Near Metro Station',
      city: 'Hyderabad',
      state: 'Telangana',
      postalCode: '500081',
      isDefault: true,
    },
  ]);

  const [orders, setOrders] = useState<UserOrderSummary[]>([]);
  const [entitlements, setEntitlements] = useState<UserEntitlementSummary[]>([]);
  const [progressByLessonId, setProgressByLessonId] = useState<
    Record<string, LessonProgressRecord>
  >({});
  const [dashboardInitialCourseId, setDashboardInitialCourseId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
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
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        const isAdmin =
          fbUser.emailVerified &&
          fbUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
        const session: ActiveUserSession = {
          uid: fbUser.uid,
          name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Student',
          email: fbUser.email || 'student@example.com',
          phone: fbUser.phoneNumber || '',
          emailVerified: fbUser.emailVerified,
          role: isAdmin ? 'admin' : 'student',
        };
        setUser(session);
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

    return (
      <article
        key={product.id}
        className="group bg-white border border-slate-200/90 rounded-xl overflow-hidden flex flex-col justify-between transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg hover:border-slate-300"
      >
        <div>
          {/* Card Visual Area (65% height proportion) */}
          <div
            onClick={() => handleOpenProductDetail(product.id)}
            className="aspect-4/3 cursor-pointer relative overflow-hidden border-b border-slate-100"
          >
            <CoverArtwork product={product} className="w-full h-full" />
          </div>

          {/* Card Content with Clean Unboxed Metadata */}
          <div className="p-5 space-y-2.5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>
                {product.category} · {product.language} · Sample
              </span>
              <span className="font-mono-tabular text-slate-600 font-medium">
                {isPhysical ? `${product.stock} in stock` : 'Instant Access'}
              </span>
            </div>

            <h3 className="font-display text-base sm:text-[17px] font-bold text-[#0A192F] leading-snug line-clamp-2">
              <button
                type="button"
                onClick={() => handleOpenProductDetail(product.id)}
                className="text-left group-hover:text-[#1D3557] hover:underline focus:outline-none"
              >
                {cleanTitle}
              </button>
            </h3>

            <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
              {product.shortDescription}
            </p>
          </div>
        </div>

        <div className="px-5 pb-5 pt-3.5 border-t border-slate-100 space-y-3.5 bg-slate-50/40">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <span className="font-mono-tabular text-lg font-bold text-[#0A192F]">
                ₹{product.priceInr.toLocaleString('en-IN')}
              </span>
              {product.originalPriceInr > product.priceInr && (
                <span className="font-mono-tabular text-xs text-slate-400 line-through">
                  ₹{product.originalPriceInr.toLocaleString('en-IN')}
                </span>
              )}
            </div>
            <button
              type="button"
              aria-label={`Toggle wishlist for ${cleanTitle}`}
              onClick={() => handleToggleWishlist(product.id)}
              className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
            >
              <Heart
                className={`w-4 h-4 ${
                  isWishlisted ? 'fill-red-500 text-red-500' : ''
                }`}
              />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => handleOpenProductDetail(product.id)}
              className="py-2 px-3 bg-white border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
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
                className="py-2 px-3 bg-emerald-700 text-white text-xs font-semibold rounded-lg hover:bg-emerald-800 transition-colors whitespace-nowrap"
              >
                Open Library
              </button>
            ) : (
              <button
                type="button"
                disabled={isPhysical && product.stock <= 0}
                onClick={() => handleAddToCart(product)}
                className="py-2 px-3 bg-[#0A192F] text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
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
      {/* Tier 1: Executive Academic Offer & Utility Top Bar */}
      <div className="bg-[#060E1A] text-slate-300 border-b border-white/10 px-4 sm:px-6 lg:px-8 h-9 flex items-center text-xs">
        <div className="max-w-7xl w-full mx-auto flex items-center justify-between gap-6">
          {activeBanner ? (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <p className="truncate text-[11px] sm:text-xs">
                <span className="text-[#D4AF37] font-semibold">
                  SATYA20 — Save {activeBanner.discountPercent}%:
                </span>{' '}
                <span className="text-slate-300">
                  Free shipping across India on hardcover book orders ₹999+
                </span>
              </p>
              <button
                type="button"
                onClick={() => setActiveView('catalog')}
                className="text-[#D4AF37] text-[11px] font-semibold hover:underline whitespace-nowrap shrink-0"
              >
                {activeBanner.ctaText} →
              </button>
            </div>
          ) : (
            <span className="text-slate-400 truncate">
              Satya’s Education — Recorded Courses, Textbooks & Storybooks
            </span>
          )}

          {/* Executive Utility Links (Admin, Setup Guide & Account Switcher) */}
          <ul className="hidden md:flex items-center gap-4 text-[11px] font-medium text-slate-300 shrink-0">
            <li>
              <button
                type="button"
                onClick={() => setActiveView('deployment')}
                className={`hover:text-[#D4AF37] transition-colors whitespace-nowrap ${
                  activeView === 'deployment' ? 'text-[#D4AF37] font-semibold' : ''
                }`}
              >
                Vercel & Setup Guide
              </button>
            </li>
            <li aria-hidden="true" className="text-white/20">
              |
            </li>
            <li>
              <button
                type="button"
                onClick={() => setActiveView('admin')}
                className={`inline-flex items-center gap-1 hover:text-[#D4AF37] transition-colors whitespace-nowrap ${
                  activeView === 'admin' ? 'text-[#D4AF37] font-semibold' : ''
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Admin Panel</span>
              </button>
            </li>
            <li aria-hidden="true" className="text-white/20">
              |
            </li>
            <li>
              {user ? (
                <div className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveView('dashboard')}
                    className="inline-flex items-center gap-1 text-white hover:text-[#D4AF37] transition-colors whitespace-nowrap"
                  >
                    <User className="w-3 h-3 text-[#D4AF37]" />
                    <span>
                      {user.name.replace(/\s*\(Admin\)/i, '')} ({user.role === 'admin' ? 'Admin' : 'Student'})
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthModalOpen(true)}
                    className="text-[#D4AF37] hover:underline whitespace-nowrap"
                  >
                    Switch Account
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAuthModalOpen(true)}
                  className="text-[#D4AF37] font-semibold hover:underline whitespace-nowrap"
                >
                  Sign In / Register
                </button>
              )}
            </li>
          </ul>
        </div>
      </div>

      {/* Tier 2: Main Sticky Professional Navigation Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-2xs px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto h-16 sm:h-[70px] flex items-center justify-between gap-4 lg:gap-6">
          {/* Zone 1: Brand Emblem & Wordmark */}
          <a
            href="#home"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('home');
            }}
            className="flex items-center gap-3 whitespace-nowrap shrink-0 group focus:outline-none"
          >
            <span className="w-9 h-9 rounded-lg bg-[#0A192F] border border-[#D4AF37]/70 flex items-center justify-center text-[#D4AF37] font-display font-bold text-sm shadow-2xs group-hover:bg-[#112240] transition-colors">
              SE
            </span>
            <span className="font-display text-lg sm:text-xl font-bold tracking-tight text-[#0A192F]">
              Satya’s Education
            </span>
          </a>

          {/* Zone 2: Primary Semantic <ul> Navigation Bar */}
          <nav aria-label="Primary Navigation" className="hidden lg:flex items-center">
            <ul className="flex items-center gap-1">
              {(
                [
                  { id: 'home', label: 'Home' },
                  { id: 'courses', label: 'Courses' },
                  { id: 'books', label: 'Books' },
                  { id: 'storybooks', label: 'Storybooks' },
                  { id: 'catalog', label: 'Catalog' },
                  { id: 'dashboard', label: 'Dashboard' },
                ] as const
              ).map((item) => {
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
                        setActiveView(item.id);
                      }}
                      className={`relative px-3.5 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap shrink-0 inline-block ${
                        isActive
                          ? 'text-[#0A192F] font-semibold bg-slate-100/90 after:content-[""] after:absolute after:bottom-0.5 after:inset-x-3.5 after:h-0.5 after:bg-[#D4AF37] after:rounded-full'
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

          {/* Zone 3: Integrated Search Input & Primary Cart Action */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <div className="hidden sm:block relative w-48 md:w-56 xl:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <label htmlFor="global-catalog-search" className="sr-only">
                Search courses, books, or storybooks
              </label>
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
                placeholder="Search Python, Django, AI..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-100/80 hover:bg-slate-100 focus:bg-white text-xs text-slate-900 border border-slate-200/90 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0A192F] transition-colors"
              />
            </div>

            <button
              type="button"
              onClick={() => setActiveView('cart')}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0A192F] rounded-lg hover:bg-[#112240] transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-2 shadow-2xs"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Cart</span>
              <span className="px-1.5 py-0.5 text-[11px] font-mono-tabular font-bold bg-[#D4AF37] text-[#0A192F] rounded">
                {totalCartItemsCount}
              </span>
            </button>

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

        {/* Mobile & Tablet Navigation Drawer */}
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
                placeholder="Search Python, Django, React, Agentic AI, or books..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 text-xs border border-slate-200 rounded-lg"
              />
            </div>

            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {(
                [
                  { id: 'home', label: 'Home' },
                  { id: 'courses', label: 'Technology Courses' },
                  { id: 'books', label: 'Educational Books' },
                  { id: 'storybooks', label: 'Storybooks' },
                  { id: 'catalog', label: 'Full Catalog & Filters' },
                  { id: 'dashboard', label: 'Student Dashboard' },
                  { id: 'admin', label: 'Admin Console' },
                  { id: 'deployment', label: 'Vercel & Setup Guide' },
                ] as const
              ).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveView(item.id);
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

            <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs px-1">
              {user ? (
                <>
                  <span className="text-slate-600 font-medium">
                    Signed in: <strong className="text-[#0A192F]">{user.name}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setAuthModalOpen(true);
                    }}
                    className="text-[#0A192F] font-semibold underline"
                  >
                    Switch Account
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setAuthModalOpen(true);
                  }}
                  className="w-full py-2 bg-[#D4AF37] text-[#0A192F] font-bold rounded-lg text-center"
                >
                  Sign In / Register
                </button>
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
            <section className="relative overflow-hidden bg-gradient-to-br from-[#071120] via-[#0A192F] to-[#112240] text-white border-b border-white/10 py-10 lg:py-14">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
                  {/* Left Column (7 cols): Headline, Value Proposition, Primary Actions & Category Strip */}
                  <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
                    <div className="space-y-5">
                      <div className="text-xs font-mono-tabular tracking-wider text-[#D4AF37]">
                        SATYA’S EDUCATION · RECORDED COURSES, BOOKS & STORYBOOKS
                      </div>
                      <h1 className="font-display text-3xl sm:text-4xl lg:text-[44px] font-bold leading-[1.14] text-white">
                        Master Modern Software Engineering, AI & Reading Foundations.
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
                          className="px-6 py-3 bg-[#D4AF37] text-[#0A192F] text-sm font-bold rounded-lg hover:bg-[#e0bc42] transition-colors inline-flex items-center gap-2 whitespace-nowrap shadow-md"
                        >
                          <Play className="w-4 h-4 fill-current" />
                          <span>Explore Technology Courses</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveView('books')}
                          className="px-6 py-3 bg-white/10 text-white border border-white/20 text-sm font-semibold rounded-lg hover:bg-white/15 transition-colors inline-flex items-center gap-2 whitespace-nowrap"
                        >
                          <BookOpen className="w-4 h-4 text-[#D4AF37]" />
                          <span>Browse Books & Storybooks</span>
                        </button>
                      </div>
                    </div>

                    {/* Technology Categories Interactive Filter Strip */}
                    <div className="pt-4 border-t border-white/10">
                      <p className="text-[11px] font-mono-tabular text-slate-400 mb-2.5">
                        EXPLORE 11 TECHNOLOGY & PUBLISHING TRACKS:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {categories.map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => {
                              setSelectedCategory(cat.name);
                              setActiveView('catalog');
                            }}
                            className="px-2.5 py-1 bg-white/8 hover:bg-[#D4AF37] hover:text-[#0A192F] border border-white/10 text-xs font-medium text-slate-200 rounded-md transition-colors whitespace-nowrap"
                          >
                            {cat.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column (5 cols): Interactive Featured Course & Hardcover Book Showcase */}
                  {currentSpotlight && (
                    <div className="lg:col-span-5 flex flex-col justify-between bg-[#0F223D]/90 border border-white/15 rounded-xl p-5 shadow-2xl space-y-4">
                      {/* Interactive Spotlight Selector Tabs */}
                      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
                        <span className="text-[11px] font-mono-tabular text-[#D4AF37] uppercase tracking-wider">
                          FEATURED SPOTLIGHT
                        </span>
                        <div className="flex items-center gap-1 bg-black/25 p-1 rounded-lg">
                          {spotlightProducts.map((item, idx) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setHeroSpotlightIndex(idx)}
                              className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors whitespace-nowrap ${
                                heroSpotlightIndex === idx
                                  ? 'bg-[#D4AF37] text-[#0A192F]'
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
                        className="aspect-16/10 rounded-lg overflow-hidden border border-white/15 cursor-pointer"
                      >
                        <CoverArtwork product={currentSpotlight} className="w-full h-full" />
                      </div>

                      {/* Spotlight Details & Direct CTA */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs text-slate-300">
                          <span>
                            {currentSpotlight.coverType} · {currentSpotlight.language}
                          </span>
                          <span className="font-mono-tabular text-[#FDE047] font-semibold">
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
                              className="px-3.5 py-2 bg-[#D4AF37] hover:bg-[#e0bc42] text-[#0A192F] text-xs font-bold rounded-lg transition-colors whitespace-nowrap"
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8 pt-8 border-t border-white/10 text-xs">
                  <div className="bg-white/5 border border-white/10 rounded-lg p-3.5 flex items-start gap-3">
                    <Play className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-white">HD Course Recordings</p>
                      <p className="text-slate-300 mt-0.5">
                        Modular syllabus with public free preview lessons and saved progress.
                      </p>
                    </div>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-3.5 flex items-start gap-3">
                    <BookOpen className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-white">Digital & Print Editions</p>
                      <p className="text-slate-300 mt-0.5">
                        Signed 15-minute PDF downloads and sewn hardcover books.
                      </p>
                    </div>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-3.5 flex items-start gap-3">
                    <Truck className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-white">Tracked Delivery Across India</p>
                      <p className="text-slate-300 mt-0.5">
                        Live physical stock verification and free shipping on orders ₹999+.
                      </p>
                    </div>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-3.5 flex items-start gap-3">
                    <Lock className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-white">Verified Cashfree INR Checkout</p>
                      <p className="text-slate-300 mt-0.5">
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

              {/* Section 3: Academic Press & Learning Portal Architecture */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-7 space-y-4">
                  <p className="text-xs font-mono-tabular text-[#B48A1E] font-semibold">
                    03. TRANSPARENT ACADEMIC STOREFRONT
                  </p>
                  <h2 className="font-display text-2xl font-bold text-[#0A192F]">
                    Built for Focused Learning, Protected Content & Verified Fulfillment
                  </h2>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Every course recording and book in Satya’s Education is delivered through an
                    isolated personal library. Preview introductory lectures freely before purchase,
                    complete INR checkout through server-verified Cashfree orders, and track
                    physical hardcover shipments or download signed digital editions from your
                    dashboard.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs text-slate-700">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>Public Free Preview Lesson on Every Course</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>Saved Lesson Playback Progress in Firestore</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>15-Minute Signed URLs for Digital Books</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>Zero Fake Reviews or Inflated Sales Counters</span>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5 bg-[#0A192F] text-white rounded-xl p-6 space-y-4 border border-slate-800">
                  <p className="text-xs font-mono-tabular text-[#D4AF37]">
                    QUICK PORTAL ACCESS
                  </p>
                  <h3 className="font-display text-lg font-bold">
                    Test Student Library, Cashfree Checkout, or Admin Studio
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Explore your enrolled courses, test a live Cashfree sandbox order with coupon{' '}
                    <code className="font-mono-tabular text-[#FDE047]">SATYA20</code>, or manage
                    catalog inventory in the Admin Console.
                  </p>
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setActiveView('dashboard')}
                      className="py-2.5 px-3 bg-[#D4AF37] text-[#0A192F] text-xs font-bold rounded-lg hover:bg-[#e0bc42] transition-colors whitespace-nowrap"
                    >
                      Open Student Portal
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveView('admin')}
                      className="py-2.5 px-3 bg-white/10 text-white border border-white/20 text-xs font-semibold rounded-lg hover:bg-white/15 transition-colors whitespace-nowrap"
                    >
                      Open Admin Studio
                    </button>
                  </div>
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
            onSwitchToAdminDemo={() => {
              setUser({
                uid: 'admin_satya_uid_01',
                name: 'Pediredla Tarunraj (Admin)',
                email: BOOTSTRAPPED_ADMIN_EMAIL,
                phone: '+91 9876543210',
                emailVerified: true,
                role: 'admin',
                isDemoSession: true,
              });
            }}
          />
        )}

        {/* VIEW 7: Static Policy & Deployment Guide Pages */}
        {(activeView === 'about' ||
          activeView === 'contact' ||
          activeView === 'privacy' ||
          activeView === 'terms' ||
          activeView === 'refund' ||
          activeView === 'shipping' ||
          activeView === 'deployment') && <StaticAndGuideViews page={activeView} />}
      </main>

      {/* Storefront Footer with Mandatory Developer Attribution */}
      <footer className="bg-[#071120] text-slate-300 border-t border-white/10 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid grid-cols-1 md:grid-cols-4 gap-8 text-xs">
          <div className="space-y-3">
            <span className="font-display text-lg font-bold text-white block">
              Satya’s Education
            </span>
            <p className="text-slate-400 leading-relaxed">
              Technology course recordings, engineering textbooks, and illustrated children’s
              storybooks with Firebase security and Cashfree INR payments.
            </p>
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
                  Contact Support
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
                  Refund Policy
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setActiveView('shipping')}
                  className="hover:text-white"
                >
                  Shipping Policy
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-[#D4AF37]">Administration & Cloud</h3>
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
                  Vercel, Firebase & Cashfree Setup Guide
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 py-5 px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-300 space-y-1">
          <p>© {new Date().getFullYear()} Satya’s Education. All rights reserved.</p>
          <p className="font-semibold text-[#D4AF37] tracking-wide">
            This website is developed by PEDIREDLA TARUNRAJ
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
