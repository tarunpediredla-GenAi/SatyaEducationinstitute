import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Plus,
  CheckCircle2,
  AlertCircle,
  Video,
  BookOpen,
  Layers,
  Truck,
  Users,
  Megaphone,
} from 'lucide-react';
import {
  canUserPerformAdminOperation,
  type CatalogProduct,
  type CourseLesson,
  type ProductFormat,
  type ProductStatus,
  type ProductType,
} from '../utils/commerceRules';
import type { CategoryItem, PromotionalBanner } from '../data/sampleCatalog';
import type { ActiveUserSession } from './AuthModal';
import type { UserOrderSummary } from './UserDashboardView';
import { getClientAuthHeaders, getClientAuthPayload } from '../utils/apiAuth';

interface AdminDashboardViewProps {
  user: ActiveUserSession | null;
  products: CatalogProduct[];
  categories: CategoryItem[];
  lessons: CourseLesson[];
  banners: PromotionalBanner[];
  onRefreshCatalog: () => Promise<void>;
  onNavigateHome?: () => void;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  user,
  products,
  categories,
  lessons,
  banners,
  onRefreshCatalog,
  onNavigateHome,
}) => {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'courses' | 'books' | 'categories' | 'orders' | 'customers' | 'banners'
  >('overview');

  const [adminOrders, setAdminOrders] = useState<UserOrderSummary[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Add/Edit Product Form State
  const [prodTitle, setProdTitle] = useState('');
  const [prodType, setProdType] = useState<ProductType>('course');
  const [prodCategory, setProdCategory] = useState('Python');
  const [prodPrice, setProdPrice] = useState(1499);
  const [prodOrigPrice, setProdOrigPrice] = useState(2499);
  const [prodFormat, setProdFormat] = useState<ProductFormat>('recorded_course');
  const [prodStock, setProdStock] = useState(50);
  const [prodLanguage, setProdLanguage] = useState('English');
  const [prodInstructor, setProdInstructor] = useState('Satya Narayana');
  const [prodDuration, setProdDuration] = useState('24 Hours');
  const [prodLevel, setProdLevel] = useState('Intermediate');
  const [prodShortDesc, setProdShortDesc] = useState('');
  const [prodDesc, setProdDesc] = useState('');

  // Add Lesson Form State
  const [lessonCourseId, setLessonCourseId] = useState(
    products.find((p) => p.type === 'course')?.id || 'course-python-mastery'
  );
  const [lessonModule, setLessonModule] = useState('Module 3: Production Systems');
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonDuration, setLessonDuration] = useState(25);
  const [lessonIsPreview, setLessonIsPreview] = useState(false);
  const [lessonVideoPath, setLessonVideoPath] = useState(
    'protected/courses/course-python-mastery/new-lesson.mp4'
  );
  const [lessonNotes, setLessonNotes] = useState('');

  // Add Category Form State
  const [catName, setCatName] = useState('');
  const [catGroup, setCatGroup] = useState<'technology' | 'books' | 'storybooks'>('technology');
  const [catDesc, setCatDesc] = useState('');

  // Banner Form State
  const [bannerTitle, setBannerTitle] = useState(banners[0]?.title || '');
  const [bannerSubtitle, setBannerSubtitle] = useState(banners[0]?.subtitle || '');
  const [bannerCoupon, setBannerCoupon] = useState(banners[0]?.couponCode || 'SATYA20');
  const [bannerDiscount, setBannerDiscount] = useState(banners[0]?.discountPercent || 20);

  const isAuthorizedAdmin =
    user !== null &&
    canUserPerformAdminOperation({
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
      customClaims: { admin: user.role === 'admin' },
    });

  const fetchAdminOverview = async () => {
    if (!user || !isAuthorizedAdmin) return;
    try {
      const authHeaders = await getClientAuthHeaders(user);
      const queryParams = new URLSearchParams({
        userId: user.uid,
        userEmail: user.email,
        userRole: user.role,
      });
      const res = await fetch(`/api/admin/overview?${queryParams.toString()}`, {
        headers: authHeaders,
      });
      if (res.ok) {
        const data = await res.json();
        setAdminOrders(data.orders || []);
      }
    } catch {
      // Ignore network hiccup
    }
  };

  useEffect(() => {
    fetchAdminOverview();
  }, [user?.uid, isAuthorizedAdmin]);

  if (!isAuthorizedAdmin) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <div className="bg-white border border-red-200 rounded-xl p-8 text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-red-600 mx-auto" />
          <h1 className="font-display text-2xl font-bold text-[#0A192F]">
            403 Forbidden — Administrator Authorization Required
          </h1>
          <p className="text-sm text-slate-600 max-w-xl mx-auto leading-relaxed">
            Administrator privileges are required to view or manage catalog items, orders, and
            store settings. Standard student accounts cannot access or modify admin resources.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={onNavigateHome ? onNavigateHome : () => { window.location.href = '#home'; }}
              className="px-5 py-2.5 bg-[#0A192F] text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors"
            >
              Return to Storefront
            </button>
          </div>
        </div>
      </div>
    );
  }

  const executeAdminAction = async (action: string, payload: unknown, successMsg: string) => {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const authHeaders = await getClientAuthHeaders(user);
      const authPayload = await getClientAuthPayload(user);
      const res = await fetch('/api/admin/action', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ ...authPayload, action, payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'Admin operation failed.');
        return;
      }
      setStatusMessage(successMsg);
      await onRefreshCatalog();
      await fetchAdminOverview();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Admin request error.');
    }
  };

  const paidOrders = adminOrders.filter((o) => o.paymentStatus === 'paid');
  const totalSalesInr = paidOrders.reduce((acc, o) => acc + o.totalAmountInr, 0);
  const uniqueCustomers = Array.from(
    new Map(
      adminOrders.map((o) => [
        o.userId,
        {
          uid: o.userId,
          name: o.customerName,
          email: o.customerEmail,
          ordersCount: adminOrders.filter((x) => x.userId === o.userId).length,
        },
      ])
    ).values()
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Admin Top Header */}
      <div className="bg-[#0A192F] text-white rounded-xl p-6 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <img
            src="/logo.png"
            alt="Satya's Education Logo"
            className="w-12 h-12 object-contain rounded-xl bg-white p-1 border border-white/20 shadow-xs shrink-0"
          />
          <div>
            <div className="flex items-center gap-2 text-xs font-mono-tabular text-[#D4AF37]">
              <ShieldCheck className="w-4 h-4" />
              <span>ADMINISTRATION CONSOLE</span>
            </div>
            <h1 className="font-display text-xl sm:text-2xl font-bold mt-1">
              Satya’s Education — Storefront & Curriculum Administration
            </h1>
            <p className="text-xs text-slate-300 mt-1">
              Authenticated Admin: {user.email}
            </p>
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {statusMessage && (
        <div
          role="status"
          className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div
          role="alert"
          className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900 flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Admin Navigation Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/80 rounded-lg mb-8 overflow-x-auto">
        {(
          [
            { id: 'overview', label: 'Analytics & Summary' },
            { id: 'courses', label: 'Courses & Recordings' },
            { id: 'books', label: 'Books, Storybooks & Stock' },
            { id: 'categories', label: `Categories (${categories.length})` },
            { id: 'orders', label: `Orders & Shipments (${adminOrders.length})` },
            { id: 'customers', label: `Customers (${uniqueCustomers.length})` },
            { id: 'banners', label: 'Banners & Featured' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === tab.id
                ? 'bg-white text-[#0A192F] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: Real Database Metrics & Summary */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <span className="text-xs text-slate-500">Verified Revenue (Paid Orders)</span>
              <p className="font-mono-tabular text-2xl font-bold text-[#0A192F] mt-1">
                ₹{totalSalesInr.toLocaleString('en-IN')}
              </p>
              <span className="text-[11px] text-slate-500 mt-1 block">
                Calculated from live database orders
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <span className="text-xs text-slate-500">Paid Orders / Total Orders</span>
              <p className="font-mono-tabular text-2xl font-bold text-[#0A192F] mt-1">
                {paidOrders.length} / {adminOrders.length}
              </p>
              <span className="text-[11px] text-slate-500 mt-1 block">
                Confirmed store orders
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <span className="text-xs text-slate-500">Active Catalog Products</span>
              <p className="font-mono-tabular text-2xl font-bold text-[#0A192F] mt-1">
                {products.length}
              </p>
              <span className="text-[11px] text-slate-500 mt-1 block">
                {products.filter((p) => p.type === 'course').length} Courses ·{' '}
                {products.filter((p) => p.type !== 'course').length} Books & Storybooks
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <span className="text-xs text-slate-500">Registered Customers</span>
              <p className="font-mono-tabular text-2xl font-bold text-[#0A192F] mt-1">
                {uniqueCustomers.length}
              </p>
              <span className="text-[11px] text-slate-500 mt-1 block">
                Credentials strictly isolated
              </span>
            </div>
          </div>

          {/* Quick Catalog Inventory Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-[#0A192F]">
                Live Catalog Status & Inventory Control
              </h2>
              <span className="text-xs text-slate-500">
                Publish, unpublish, archive, or adjust INR price & stock
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th className="py-3 px-4 font-semibold">Title</th>
                    <th className="py-3 px-4 font-semibold">Type & Category</th>
                    <th className="py-3 px-4 font-semibold">Price (INR)</th>
                    <th className="py-3 px-4 font-semibold">Stock</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {products.map((prod) => (
                    <tr key={prod.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-semibold text-slate-900 max-w-xs truncate">
                        {prod.title}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {prod.type} · {prod.category}
                      </td>
                      <td className="py-3 px-4 font-mono-tabular font-semibold">
                        ₹{prod.priceInr.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 px-4 font-mono-tabular">
                        {prod.format === 'recorded_course' || prod.format === 'digital_book'
                          ? 'Digital'
                          : prod.stock}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono-tabular uppercase font-semibold text-slate-700">
                          {prod.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          {(['published', 'draft', 'archived'] as ProductStatus[]).map((st) => (
                            <button
                              key={st}
                              type="button"
                              disabled={prod.status === st}
                              onClick={() =>
                                executeAdminAction(
                                  'update_product_status',
                                  { productId: prod.id, status: st },
                                  `Updated "${prod.title}" status to ${st}.`
                                )
                              }
                              className={`px-2 py-1 rounded text-[11px] font-semibold capitalize ${
                                prod.status === st
                                  ? 'bg-[#0A192F] text-white'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {st === 'draft' ? 'Unpublish' : st}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() =>
                              executeAdminAction(
                                'update_product_status',
                                {
                                  productId: prod.id,
                                  priceInr: Math.max(99, Math.round(prod.priceInr * 0.9)),
                                },
                                `Applied 10% price reduction to "${prod.title}".`
                              )
                            }
                            className="px-2 py-1 rounded text-[11px] font-semibold bg-[#D4AF37]/20 text-[#0A192F] hover:bg-[#D4AF37]/35 whitespace-nowrap"
                          >
                            -10% Price
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Add / Edit Courses & Upload Lesson Recordings */}
      {activeTab === 'courses' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Create Course Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!prodTitle.trim()) return;
              const slug = prodTitle
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)/g, '');
              const newCourse: CatalogProduct = {
                id: `course-${slug}-${Date.now().toString().slice(-4)}`,
                title: prodTitle.trim(),
                slug,
                type: 'course',
                category: prodCategory,
                priceInr: Number(prodPrice) || 1499,
                originalPriceInr: Number(prodOrigPrice) || 2499,
                language: prodLanguage.trim() || 'English',
                format: 'recorded_course',
                stock: 9999,
                featured: true,
                status: 'published',
                authorOrInstructor: prodInstructor.trim() || 'Satya Narayana',
                shortDescription:
                  prodShortDesc.trim() ||
                  'Recorded technology course with modular video lessons and code notes.',
                description:
                  prodDesc.trim() ||
                  'Comprehensive curriculum with practical exercises and lifetime recording access.',
                coverType: 'HD Recorded Course',
                level: prodLevel.trim() || 'Intermediate',
                duration: prodDuration.trim() || '24 Hours',
                previewVideoUrl:
                  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
              };
              executeAdminAction(
                'upsert_product',
                newCourse,
                `Course "${newCourse.title}" published to catalog.`
              );
              setProdTitle('');
              setProdShortDesc('');
              setProdDesc('');
            }}
            className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Video className="w-5 h-5 text-[#B48A1E]" />
              <h2 className="font-display text-lg font-bold text-[#0A192F]">
                Add New Technology Course
              </h2>
            </div>

            <div>
              <label htmlFor="admin-course-title" className="block text-xs font-semibold mb-1">
                Course Title
              </label>
              <input
                id="admin-course-title"
                type="text"
                value={prodTitle}
                onChange={(e) => setProdTitle(e.target.value)}
                placeholder="e.g. [Sample Course] Mastering SQL & PostgreSQL Indexing"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="admin-course-cat" className="block text-xs font-semibold mb-1">
                  Technology Category
                </label>
                <select
                  id="admin-course-cat"
                  value={prodCategory}
                  onChange={(e) => setProdCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="admin-course-price" className="block text-xs font-semibold mb-1">
                  Price (INR)
                </label>
                <input
                  id="admin-course-price"
                  type="number"
                  value={prodPrice}
                  onChange={(e) => setProdPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="admin-course-lang" className="block text-xs font-semibold mb-1">
                  Language
                </label>
                <input
                  id="admin-course-lang"
                  type="text"
                  value={prodLanguage}
                  onChange={(e) => setProdLanguage(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="admin-course-level" className="block text-xs font-semibold mb-1">
                  Level
                </label>
                <input
                  id="admin-course-level"
                  type="text"
                  value={prodLevel}
                  onChange={(e) => setProdLevel(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="admin-course-dur" className="block text-xs font-semibold mb-1">
                  Total Duration
                </label>
                <input
                  id="admin-course-dur"
                  type="text"
                  value={prodDuration}
                  onChange={(e) => setProdDuration(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label htmlFor="admin-course-short" className="block text-xs font-semibold mb-1">
                Short Summary
              </label>
              <input
                id="admin-course-short"
                type="text"
                value={prodShortDesc}
                onChange={(e) => setProdShortDesc(e.target.value)}
                placeholder="Concise 1-line summary for product cards"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="admin-course-desc" className="block text-xs font-semibold mb-1">
                Detailed Syllabus & Introduction
              </label>
              <textarea
                id="admin-course-desc"
                rows={3}
                value={prodDesc}
                onChange={(e) => setProdDesc(e.target.value)}
                placeholder="Describe modules, projects, and learning outcomes..."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-[#0A192F] text-white text-xs font-semibold rounded-lg hover:bg-slate-800 inline-flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4 text-[#D4AF37]" />
              <span>Publish New Course</span>
            </button>
          </form>

          {/* Add Module Lesson Recording Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!lessonTitle.trim()) return;
              const existingCount = lessons.filter((l) => l.courseId === lessonCourseId).length;
              const newLesson: CourseLesson = {
                id: `lesson-${Date.now()}`,
                courseId: lessonCourseId,
                moduleTitle: lessonModule.trim() || 'Module 1',
                title: lessonTitle.trim(),
                orderIndex: existingCount + 1,
                durationMinutes: Number(lessonDuration) || 20,
                isFreePreview: lessonIsPreview,
                videoStoragePath: lessonVideoPath.trim(),
                notes:
                  lessonNotes.trim() ||
                  'Recorded lecture with annotated examples and downloadable notes.',
              };
              executeAdminAction(
                'add_lesson',
                newLesson,
                `Added lesson "${newLesson.title}" to course ${lessonCourseId}.`
              );
              setLessonTitle('');
              setLessonNotes('');
            }}
            className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#B48A1E]" />
              <h2 className="font-display text-lg font-bold text-[#0A192F]">
                Organize Modules & Upload Lesson Recordings
              </h2>
            </div>

            <div>
              <label htmlFor="admin-lesson-course" className="block text-xs font-semibold mb-1">
                Target Course
              </label>
              <select
                id="admin-lesson-course"
                value={lessonCourseId}
                onChange={(e) => setLessonCourseId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              >
                {products
                  .filter((p) => p.type === 'course')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="admin-lesson-mod" className="block text-xs font-semibold mb-1">
                  Module Name
                </label>
                <input
                  id="admin-lesson-mod"
                  type="text"
                  value={lessonModule}
                  onChange={(e) => setLessonModule(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="admin-lesson-dur" className="block text-xs font-semibold mb-1">
                  Duration (Minutes)
                </label>
                <input
                  id="admin-lesson-dur"
                  type="number"
                  value={lessonDuration}
                  onChange={(e) => setLessonDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono-tabular"
                />
              </div>
            </div>

            <div>
              <label htmlFor="admin-lesson-title" className="block text-xs font-semibold mb-1">
                Lesson Title
              </label>
              <input
                id="admin-lesson-title"
                type="text"
                value={lessonTitle}
                onChange={(e) => setLessonTitle(e.target.value)}
                placeholder="e.g. 04. Async Database Pools & Query Optimization"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="admin-lesson-path" className="block text-xs font-semibold mb-1">
                Video Recording URL or Path (MP4/WebM)
              </label>
              <input
                id="admin-lesson-path"
                type="text"
                value={lessonVideoPath}
                onChange={(e) => setLessonVideoPath(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono-tabular"
              />
            </div>

            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={lessonIsPreview}
                onChange={(e) => setLessonIsPreview(e.target.checked)}
              />
              <span>Mark as Public Free Preview Lesson</span>
            </label>

            <button
              type="submit"
              className="w-full py-2.5 bg-[#0A192F] text-white text-xs font-semibold rounded-lg hover:bg-slate-800"
            >
              Add Lesson to Course Syllabus
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: Add / Edit Educational Books, Storybooks & Physical Stock */}
      {activeTab === 'books' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!prodTitle.trim()) return;
              const slug = prodTitle
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)/g, '');
              const newBook: CatalogProduct = {
                id: `${prodType}-${slug}-${Date.now().toString().slice(-4)}`,
                title: prodTitle.trim(),
                slug,
                type: prodType === 'course' ? 'book' : prodType,
                category: prodCategory,
                priceInr: Number(prodPrice) || 599,
                originalPriceInr: Number(prodOrigPrice) || 899,
                language: prodLanguage.trim() || 'English',
                format:
                  prodFormat === 'recorded_course' ? 'physical_book' : prodFormat,
                stock: Number(prodStock) || 25,
                featured: true,
                status: 'published',
                authorOrInstructor: prodInstructor.trim() || 'Satya Narayana',
                shortDescription:
                  prodShortDesc.trim() ||
                  'Sample educational edition available in physical or digital format.',
                description:
                  prodDesc.trim() ||
                  'Complete reference book with structured chapters and exercises.',
                coverType:
                  prodFormat === 'digital_book'
                    ? 'Digital PDF Edition'
                    : 'Physical Hardcover Edition',
                level: prodLevel.trim() || 'All Levels',
                duration: prodDuration.trim() || '320 Pages',
                previewVideoUrl: '',
              };
              executeAdminAction(
                'upsert_product',
                newBook,
                `Book "${newBook.title}" added to catalog.`
              );
              setProdTitle('');
            }}
            className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[#B48A1E]" />
              <h2 className="font-display text-lg font-bold text-[#0A192F]">
                Add Educational Book or Storybook
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="admin-book-type" className="block text-xs font-semibold mb-1">
                  Catalog Type
                </label>
                <select
                  id="admin-book-type"
                  value={prodType === 'course' ? 'book' : prodType}
                  onChange={(e) => setProdType(e.target.value as ProductType)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                >
                  <option value="book">Educational / Technical Book</option>
                  <option value="storybook">Children’s Storybook</option>
                </select>
              </div>
              <div>
                <label htmlFor="admin-book-format" className="block text-xs font-semibold mb-1">
                  Format (Digital vs Physical)
                </label>
                <select
                  id="admin-book-format"
                  value={prodFormat === 'recorded_course' ? 'physical_book' : prodFormat}
                  onChange={(e) => setProdFormat(e.target.value as ProductFormat)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                >
                  <option value="physical_book">Physical Hardcover Book</option>
                  <option value="digital_book">Digital Book (PDF / EPUB)</option>
                  <option value="hybrid_book">Hybrid Bundle (Print + Digital)</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="admin-book-title" className="block text-xs font-semibold mb-1">
                Book Title
              </label>
              <input
                id="admin-book-title"
                type="text"
                value={prodTitle}
                onChange={(e) => setProdTitle(e.target.value)}
                placeholder="e.g. [Sample Book] System Design & Cloud SQL Reference"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="admin-book-price" className="block text-xs font-semibold mb-1">
                  Price (INR)
                </label>
                <input
                  id="admin-book-price"
                  type="number"
                  value={prodPrice}
                  onChange={(e) => setProdPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono-tabular"
                />
              </div>
              <div>
                <label htmlFor="admin-book-stock" className="block text-xs font-semibold mb-1">
                  Physical Stock
                </label>
                <input
                  id="admin-book-stock"
                  type="number"
                  value={prodStock}
                  onChange={(e) => setProdStock(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono-tabular"
                />
              </div>
              <div>
                <label htmlFor="admin-book-cat" className="block text-xs font-semibold mb-1">
                  Category
                </label>
                <select
                  id="admin-book-cat"
                  value={prodCategory}
                  onChange={(e) => setProdCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-[#0A192F] text-white text-xs font-semibold rounded-lg hover:bg-slate-800"
            >
              Publish Book / Storybook
            </button>
          </form>

          {/* Physical Stock Manager */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="font-display text-lg font-bold text-[#0A192F]">
              Physical Book Warehouse Stock & Price Control
            </h3>
            <div className="divide-y divide-slate-200">
              {products
                .filter((p) => p.type !== 'course')
                .map((book) => (
                  <div
                    key={book.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-900">{book.title}</p>
                      <p className="text-[11px] text-slate-500">
                        Format: {book.format} · Price: ₹{book.priceInr} · Stock: {book.stock}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          executeAdminAction(
                            'update_product_status',
                            { productId: book.id, stock: book.stock + 10 },
                            `Added +10 stock to "${book.title}".`
                          )
                        }
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded"
                      >
                        +10 Stock
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Categories Manager */}
      {activeTab === 'categories' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="font-display text-lg font-bold text-[#0A192F] mb-4">
              Supported Technology & Book Categories
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[#0A192F]">{cat.name}</span>
                    <span className="text-[11px] font-mono-tabular text-[#B48A1E] uppercase">
                      {cat.group}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{cat.description}</p>
                </div>
              ))}
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!catName.trim()) return;
              const slug = catName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
              executeAdminAction(
                'add_category',
                {
                  id: `cat-${slug}`,
                  name: catName.trim(),
                  slug,
                  description:
                    catDesc.trim() || `Courses and books covering ${catName.trim()}.`,
                  group: catGroup,
                  active: true,
                },
                `Category "${catName.trim()}" added.`
              );
              setCatName('');
              setCatDesc('');
            }}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <h3 className="font-display text-base font-bold text-[#0A192F]">
              Add New Category
            </h3>
            <div>
              <label htmlFor="admin-cat-name" className="block text-xs font-semibold mb-1">
                Category Name
              </label>
              <input
                id="admin-cat-name"
                type="text"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="e.g. Kubernetes, System Design, Moral Stories"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="admin-cat-group" className="block text-xs font-semibold mb-1">
                Category Group
              </label>
              <select
                id="admin-cat-group"
                value={catGroup}
                onChange={(e) =>
                  setCatGroup(e.target.value as 'technology' | 'books' | 'storybooks')
                }
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              >
                <option value="technology">Technology</option>
                <option value="books">Educational Books</option>
                <option value="storybooks">Storybooks</option>
              </select>
            </div>
            <div>
              <label htmlFor="admin-cat-desc" className="block text-xs font-semibold mb-1">
                Description
              </label>
              <input
                id="admin-cat-desc"
                type="text"
                value={catDesc}
                onChange={(e) => setCatDesc(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-[#0A192F] text-white text-xs font-semibold rounded-lg"
            >
              Add Category
            </button>
          </form>
        </div>
      )}

      {/* TAB 5: Orders, Payments, Refunds & Physical Book Shipments */}
      {activeTab === 'orders' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-[#B48A1E]" />
            <h2 className="font-display text-lg font-bold text-[#0A192F]">
              Order Fulfillment, Shipment Tracking & Payment Status
            </h2>
          </div>

          {adminOrders.length === 0 ? (
            <p className="text-sm text-slate-600 py-8 text-center">
              No customer orders have been placed yet. Complete a test checkout to manage shipments
              and payment statuses here.
            </p>
          ) : (
            <div className="space-y-4">
              {adminOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="p-4 rounded-xl border border-slate-200 space-y-3 bg-slate-50/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono-tabular text-xs font-bold text-[#0A192F]">
                        {ord.id}
                      </span>
                      <span className="text-xs text-slate-400 mx-2">·</span>
                      <span className="text-xs text-slate-700">
                        {ord.customerName} ({ord.customerEmail})
                      </span>
                    </div>
                    <span className="font-mono-tabular text-sm font-bold text-[#0A192F]">
                      ₹{ord.totalAmountInr.toLocaleString('en-IN')}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600">{ord.itemSummary}</p>
                  <p className="text-xs text-slate-500">Address: {ord.shippingAddressSummary}</p>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-700">Shipment Status:</span>
                      {(['processing', 'packed', 'shipped', 'delivered'] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() =>
                            executeAdminAction(
                              'update_order',
                              { orderId: ord.id, shipmentStatus: st },
                              `Order ${ord.id} shipment status updated to ${st}.`
                            )
                          }
                          className={`px-2.5 py-1 rounded capitalize font-semibold ${
                            ord.shipmentStatus === st
                              ? 'bg-[#0A192F] text-white'
                              : 'bg-white border border-slate-300 text-slate-700'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-700">
                        Payment ({ord.paymentStatus}):
                      </span>
                      {ord.paymentStatus === 'paid' && (
                        <button
                          type="button"
                          onClick={() =>
                            executeAdminAction(
                              'update_order',
                              { orderId: ord.id, paymentStatus: 'refunded' },
                              `Order ${ord.id} marked as refunded.`
                            )
                          }
                          className="px-2.5 py-1 rounded bg-amber-100 text-amber-900 font-semibold"
                        >
                          Issue Refund
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 6: Customers Directory (Without Exposing Credentials) */}
      {activeTab === 'customers' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#B48A1E]" />
            <h2 className="font-display text-lg font-bold text-[#0A192F]">
              Customer Directory (Zero Credential Exposure)
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            Displays customer profile summaries and order counts. Password hashes, private tokens,
            and payment instrument details are never stored or exposed.
          </p>
          <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
            {uniqueCustomers.map((c) => (
              <div key={c.uid} className="p-4 flex items-center justify-between text-xs">
                <div>
                  <p className="font-bold text-slate-900">{c.name}</p>
                  <p className="text-slate-500">
                    {c.email} · UID: <span className="font-mono-tabular">{c.uid}</span>
                  </p>
                </div>
                <span className="font-mono-tabular font-semibold text-[#0A192F]">
                  {c.ordersCount} Order(s)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 7: Homepage Banners & Featured Products */}
      {activeTab === 'banners' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              executeAdminAction(
                'upsert_banner',
                {
                  id: 'banner-launch-offer',
                  title: bannerTitle.trim(),
                  subtitle: bannerSubtitle.trim(),
                  ctaText: 'Explore Catalog',
                  ctaLink: 'catalog',
                  couponCode: bannerCoupon.trim().toUpperCase(),
                  discountPercent: Number(bannerDiscount) || 20,
                  active: true,
                },
                'Homepage promotional banner updated.'
              );
            }}
            className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-[#B48A1E]" />
              <h2 className="font-display text-lg font-bold text-[#0A192F]">
                Homepage Promotional Banner & Offer Code
              </h2>
            </div>

            <div>
              <label htmlFor="banner-title" className="block text-xs font-semibold mb-1">
                Banner Headline
              </label>
              <input
                id="banner-title"
                type="text"
                value={bannerTitle}
                onChange={(e) => setBannerTitle(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="banner-sub" className="block text-xs font-semibold mb-1">
                Subtitle
              </label>
              <input
                id="banner-sub"
                type="text"
                value={bannerSubtitle}
                onChange={(e) => setBannerSubtitle(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="banner-coupon" className="block text-xs font-semibold mb-1">
                  Active Coupon Code
                </label>
                <input
                  id="banner-coupon"
                  type="text"
                  value={bannerCoupon}
                  onChange={(e) => setBannerCoupon(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono-tabular uppercase"
                />
              </div>
              <div>
                <label htmlFor="banner-pct" className="block text-xs font-semibold mb-1">
                  Discount (%)
                </label>
                <input
                  id="banner-pct"
                  type="number"
                  value={bannerDiscount}
                  onChange={(e) => setBannerDiscount(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono-tabular"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-[#0A192F] text-white text-xs font-semibold rounded-lg"
            >
              Save Homepage Banner
            </button>
          </form>

          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <h3 className="font-display text-lg font-bold text-[#0A192F]">
              Toggle Homepage Featured Products
            </h3>
            <div className="divide-y divide-slate-200">
              {products.map((p) => (
                <div key={p.id} className="py-2.5 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-800 truncate max-w-[70%]">{p.title}</span>
                  <button
                    type="button"
                    onClick={() =>
                      executeAdminAction(
                        'update_product_status',
                        { productId: p.id, featured: !p.featured },
                        `Updated featured state for "${p.title}".`
                      )
                    }
                    className={`px-3 py-1 rounded font-semibold ${
                      p.featured
                        ? 'bg-[#D4AF37]/25 text-[#0A192F] border border-[#D4AF37]'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {p.featured ? 'Featured on Home' : 'Not Featured'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
