import React, { useState } from 'react';
import {
  Play,
  CheckCircle2,
  Download,
  Package,
  MapPin,
  Heart,
  User,
  LogOut,
  MailCheck,
} from 'lucide-react';
import type { CatalogProduct, CourseLesson } from '../utils/commerceRules';
import type { ActiveUserSession } from './AuthModal';
import type { SavedAddressRecord } from './CartCheckoutView';
import { getClientAuthHeaders, getClientAuthPayload } from '../utils/apiAuth';

export interface UserOrderSummary {
  id: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  totalAmountInr: number;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';
  shipmentStatus: 'not_applicable' | 'processing' | 'packed' | 'shipped' | 'delivered';
  paymentReference?: string;
  hasPhysicalItems: boolean;
  shippingAddressSummary: string;
  itemSummary: string;
  createdAt: string;
}

export interface UserEntitlementSummary {
  id: string;
  userId: string;
  productId: string;
  productType: 'course' | 'book' | 'storybook';
  orderId: string;
  downloadPath: string;
  grantedAt: string;
}

export interface LessonProgressRecord {
  lessonId: string;
  courseId: string;
  completed: boolean;
  watchedSeconds: number;
}

interface UserDashboardViewProps {
  user: ActiveUserSession;
  products: CatalogProduct[];
  lessons: CourseLesson[];
  orders: UserOrderSummary[];
  entitlements: UserEntitlementSummary[];
  wishlistIds: string[];
  addresses: SavedAddressRecord[];
  progressByLessonId: Record<string, LessonProgressRecord>;
  initialCourseId?: string | null;
  onUpdateProfile: (name: string, phone: string) => void;
  onToggleLessonCompleted: (courseId: string, lessonId: string, watchedSeconds: number) => void;
  onSaveAddress: (addr: Omit<SavedAddressRecord, 'id' | 'userId'>) => SavedAddressRecord;
  onDeleteAddress: (id: string) => void;
  onRemoveWishlist: (productId: string) => void;
  onAddToCart: (product: CatalogProduct) => void;
  onLogout: () => void;
}

export const UserDashboardView: React.FC<UserDashboardViewProps> = ({
  user,
  products,
  lessons,
  orders,
  entitlements,
  wishlistIds,
  addresses,
  progressByLessonId,
  initialCourseId,
  onUpdateProfile,
  onToggleLessonCompleted,
  onSaveAddress,
  onDeleteAddress,
  onRemoveWishlist,
  onAddToCart,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<
    'courses' | 'books' | 'orders' | 'addresses' | 'wishlist' | 'profile'
  >('courses');

  const entitledProductIds = new Set(entitlements.map((e) => e.productId));
  const myCourses = products.filter(
    (p) => p.type === 'course' && entitledProductIds.has(p.id)
  );
  const myDigitalBooks = products.filter(
    (p) =>
      (p.type === 'book' || p.type === 'storybook') &&
      (p.format === 'digital_book' || p.format === 'hybrid_book') &&
      entitledProductIds.has(p.id)
  );

  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    initialCourseId || myCourses[0]?.id || ''
  );
  const activeCourse = myCourses.find((c) => c.id === selectedCourseId) || myCourses[0];
  const activeCourseLessons = activeCourse
    ? lessons
        .filter((l) => l.courseId === activeCourse.id)
        .sort((a, b) => a.orderIndex - b.orderIndex)
    : [];

  const [selectedLessonId, setSelectedLessonId] = useState<string>(
    activeCourseLessons[0]?.id || ''
  );
  const currentLesson =
    activeCourseLessons.find((l) => l.id === selectedLessonId) || activeCourseLessons[0];

  const [profileName, setProfileName] = useState(user.name);
  const [profilePhone, setProfilePhone] = useState(user.phone);
  const [profileSavedToast, setProfileSavedToast] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);

  const [addrName, setAddrName] = useState(user.name);
  const [addrPhone, setAddrPhone] = useState(user.phone || '+91 9876543210');
  const [addrLine1, setAddrLine1] = useState('');
  const [addrCity, setAddrCity] = useState('');
  const [addrState, setAddrState] = useState('');
  const [addrPin, setAddrPin] = useState('');

  const handleBookDownload = async (book: CatalogProduct) => {
    setDownloadStatus(`Preparing download for "${book.title}"...`);
    try {
      const authHeaders = await getClientAuthHeaders(user);
      const authPayload = await getClientAuthPayload(user);
      const res = await fetch('/api/content/signed-url', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          ...authPayload,
          productId: book.id,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.signedUrl) {
        setDownloadStatus(data.error || 'Could not generate download link.');
        return;
      }
      setDownloadStatus(`Download started for "${book.title}".`);
      const link = document.createElement('a');
      link.href = data.signedUrl;
      link.download = `${book.slug}-satya-education.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setDownloadStatus(err instanceof Error ? err.message : 'Download error.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header Bar */}
      <div className="bg-[#0A192F] text-white rounded-xl p-6 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <img
            src="/logo.png"
            alt="Satya's Education Logo"
            className="w-12 h-12 object-contain rounded-xl bg-white p-1 border border-white/20 shadow-xs shrink-0"
          />
          <div>
            <p className="text-xs font-mono-tabular text-[#D4AF37]">
              STUDENT LEARNING DASHBOARD
            </p>
            <h1 className="font-display text-2xl font-bold mt-1">Welcome, {user.name}</h1>
            <p className="text-xs text-slate-300 mt-1">
              <span>{user.email}</span>
              <span aria-hidden="true"> · </span>
              <span className="uppercase">{user.role}</span>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-2 self-start sm:self-auto"
        >
          <LogOut className="w-4 h-4 text-[#D4AF37]" />
          <span>Sign Out</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/80 rounded-lg mb-8 overflow-x-auto">
        {(
          [
            { id: 'courses', label: `My Courses (${myCourses.length})` },
            { id: 'books', label: `My Digital Books (${myDigitalBooks.length})` },
            { id: 'orders', label: `Orders (${orders.length})` },
            { id: 'addresses', label: `Addresses (${addresses.length})` },
            { id: 'wishlist', label: `Wishlist (${wishlistIds.length})` },
            { id: 'profile', label: 'Profile' },
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

      {/* TAB 1: My Courses & Video Player */}
      {activeTab === 'courses' && (
        <div className="space-y-6">
          {myCourses.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
              <h2 className="font-display text-lg font-bold text-[#0A192F]">
                No Purchased Courses Yet
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Once you complete an order for a course, all HD module recordings unlock here
                automatically.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div>
                  <label
                    htmlFor="dashboard-course-select"
                    className="block text-xs font-semibold text-slate-600 mb-1"
                  >
                    Select Enrolled Course
                  </label>
                  <select
                    id="dashboard-course-select"
                    value={activeCourse?.id || ''}
                    onChange={(e) => {
                      setSelectedCourseId(e.target.value);
                      const firstLesson = lessons.find((l) => l.courseId === e.target.value);
                      if (firstLesson) setSelectedLessonId(firstLesson.id);
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-medium"
                  >
                    {myCourses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
                  {activeCourseLessons.map((lesson) => {
                    const prog = progressByLessonId[lesson.id];
                    const isCompleted = Boolean(prog?.completed);
                    const isCurrent = currentLesson?.id === lesson.id;
                    return (
                      <button
                        key={lesson.id}
                        type="button"
                        onClick={() => setSelectedLessonId(lesson.id)}
                        className={`w-full text-left p-3.5 transition-colors flex items-start justify-between gap-2 ${
                          isCurrent ? 'bg-slate-100' : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <p className="text-[11px] text-slate-500">{lesson.moduleTitle}</p>
                          <p className="text-xs font-semibold text-slate-900 mt-0.5">
                            {lesson.title}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5 font-mono-tabular">
                            {lesson.durationMinutes} mins
                          </p>
                        </div>
                        {isCompleted ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-1" />
                        ) : (
                          <Play className="w-4 h-4 text-[#B48A1E] shrink-0 mt-1" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
                {currentLesson && activeCourse && (
                  <>
                    <div className="bg-[#0A192F] p-4 flex flex-wrap items-center justify-between gap-2 text-white">
                      <div>
                        <p className="text-xs text-[#D4AF37]">{currentLesson.moduleTitle}</p>
                        <h3 className="text-base font-bold">{currentLesson.title}</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onToggleLessonCompleted(
                            activeCourse.id,
                            currentLesson.id,
                            currentLesson.durationMinutes * 60
                          )
                        }
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
                          progressByLessonId[currentLesson.id]?.completed
                            ? 'bg-emerald-600 text-white'
                            : 'bg-white/15 text-white hover:bg-white/25'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>
                          {progressByLessonId[currentLesson.id]?.completed
                            ? 'Completed (Saved)'
                            : 'Mark Lesson Complete'}
                        </span>
                      </button>
                    </div>

                    <div className="aspect-video bg-slate-950">
                      <video
                        key={currentLesson.id}
                        controls
                        className="w-full h-full object-contain"
                        src={
                          currentLesson.videoStoragePath.startsWith('http')
                            ? currentLesson.videoStoragePath
                            : activeCourse.previewVideoUrl ||
                              'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
                        }
                      >
                        Your browser does not support HTML5 video playback.
                      </video>
                    </div>

                    <div className="p-5 space-y-2">
                      <h4 className="text-sm font-bold text-[#0A192F]">Lesson Summary & Notes</h4>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {currentLesson.notes}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: My Digital Books */}
      {activeTab === 'books' && (
        <div className="space-y-6">
          {downloadStatus && (
            <div
              role="status"
              className="p-4 rounded-xl bg-slate-900 text-white text-xs font-mono-tabular"
            >
              {downloadStatus}
            </div>
          )}

          {myDigitalBooks.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
              <h2 className="font-display text-lg font-bold text-[#0A192F]">
                No Digital Books Unlocked Yet
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Purchased digital textbooks and illustrated storybooks appear here with direct
                download links.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {myDigitalBooks.map((book) => (
                <div
                  key={book.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
                >
                  <div>
                    <p className="text-xs text-slate-500">
                      <span>{book.category}</span>
                      <span aria-hidden="true"> · </span>
                      <span>{book.coverType}</span>
                    </p>
                    <h3 className="font-display text-lg font-bold text-[#0A192F] mt-1">
                      {book.title}
                    </h3>
                    <p className="text-xs text-slate-600 mt-1">{book.shortDescription}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleBookDownload(book)}
                    className="py-2.5 px-4 bg-[#0A192F] text-white text-xs font-semibold rounded-lg hover:bg-slate-800 inline-flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4 text-[#D4AF37]" />
                    <span>Download Digital Edition</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Order History */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
              <Package className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <h2 className="font-display text-lg font-bold text-[#0A192F]">No Orders Found</h2>
              <p className="text-sm text-slate-600 mt-1">
                Your completed orders will be listed here.
              </p>
            </div>
          ) : (
            orders.map((ord) => (
              <div
                key={ord.id}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <span className="font-mono-tabular text-xs font-bold text-[#0A192F]">
                      Order #{ord.id}
                    </span>
                    <span className="text-xs text-slate-400 mx-2">·</span>
                    <span className="text-xs text-slate-500">
                      {new Date(ord.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-semibold">
                    <span
                      className={
                        ord.paymentStatus === 'paid'
                          ? 'text-emerald-700'
                          : ord.paymentStatus === 'failed'
                          ? 'text-red-700'
                          : 'text-amber-700'
                      }
                    >
                      Status: {ord.paymentStatus.toUpperCase()}
                    </span>
                    {ord.hasPhysicalItems && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#0A192F]">
                          Shipment: {ord.shipmentStatus.toUpperCase()}
                        </span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular text-base font-bold text-[#0A192F]">
                      ₹{ord.totalAmountInr.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-700 font-medium">{ord.itemSummary}</p>
                <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
                  <span>Delivery: {ord.shippingAddressSummary}</span>
                  {ord.paymentReference && (
                    <span className="font-mono-tabular">
                      Ref: {ord.paymentReference}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 4: Saved Delivery Addresses */}
      {activeTab === 'addresses' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#0A192F]">
              Saved Delivery Addresses
            </h2>
            {addresses.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-600">
                No saved delivery addresses yet. Add one using the form.
              </div>
            ) : (
              addresses.map((addr) => (
                <div
                  key={addr.id}
                  className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-4"
                >
                  <div className="text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#B48A1E]" />
                      <span className="font-bold text-slate-900">{addr.fullName}</span>
                    </div>
                    <p className="text-slate-600">{addr.line1}</p>
                    <p className="text-slate-600">
                      {addr.city}, {addr.state} - {addr.postalCode}
                    </p>
                    <p className="text-slate-500 font-mono-tabular">Phone: {addr.phone}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteAddress(addr.id)}
                    className="text-xs text-red-600 hover:underline font-medium"
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!addrLine1.trim() || !addrCity.trim() || !addrPin.trim()) return;
              onSaveAddress({
                fullName: addrName.trim() || user.name,
                phone: addrPhone.trim(),
                line1: addrLine1.trim(),
                line2: '',
                city: addrCity.trim(),
                state: addrState.trim() || 'Telangana',
                postalCode: addrPin.trim(),
                isDefault: addresses.length === 0,
              });
              setAddrLine1('');
              setAddrCity('');
              setAddrState('');
              setAddrPin('');
            }}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3"
          >
            <h3 className="font-display text-base font-bold text-[#0A192F]">
              Add Delivery Address
            </h3>
            <div>
              <label htmlFor="dash-addr-name" className="block text-xs font-semibold mb-1">
                Full Name
              </label>
              <input
                id="dash-addr-name"
                type="text"
                value={addrName}
                onChange={(e) => setAddrName(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="dash-addr-phone" className="block text-xs font-semibold mb-1">
                Phone Number
              </label>
              <input
                id="dash-addr-phone"
                type="text"
                value={addrPhone}
                onChange={(e) => setAddrPhone(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="dash-addr-line1" className="block text-xs font-semibold mb-1">
                Street Address
              </label>
              <input
                id="dash-addr-line1"
                type="text"
                value={addrLine1}
                onChange={(e) => setAddrLine1(e.target.value)}
                placeholder="House No, Street, Landmark"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label htmlFor="dash-addr-city" className="block text-xs font-semibold mb-1">
                  City
                </label>
                <input
                  id="dash-addr-city"
                  type="text"
                  value={addrCity}
                  onChange={(e) => setAddrCity(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="dash-addr-state" className="block text-xs font-semibold mb-1">
                  State
                </label>
                <input
                  id="dash-addr-state"
                  type="text"
                  value={addrState}
                  onChange={(e) => setAddrState(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="dash-addr-pin" className="block text-xs font-semibold mb-1">
                  PIN Code
                </label>
                <input
                  id="dash-addr-pin"
                  type="text"
                  value={addrPin}
                  onChange={(e) => setAddrPin(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-[#0A192F] text-white text-xs font-semibold rounded-lg hover:bg-slate-800"
            >
              Save Address
            </button>
          </form>
        </div>
      )}

      {/* TAB 5: Wishlist */}
      {activeTab === 'wishlist' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {wishlistIds.length === 0 ? (
            <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl p-10 text-center">
              <Heart className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <h2 className="font-display text-lg font-bold text-[#0A192F]">
                Your Wishlist is Empty
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Save courses, engineering books, or storybooks to revisit them later.
              </p>
            </div>
          ) : (
            wishlistIds.map((id) => {
              const prod = products.find((p) => p.id === id);
              if (!prod) return null;
              return (
                <div
                  key={prod.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between gap-4"
                >
                  <div>
                    <p className="text-xs text-slate-500">{prod.category}</p>
                    <h3 className="text-sm font-bold text-[#0A192F]">{prod.title}</h3>
                    <p className="font-mono-tabular text-sm font-bold text-slate-900 mt-1">
                      ₹{prod.priceInr.toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onAddToCart(prod)}
                      className="px-3 py-2 bg-[#0A192F] text-white text-xs font-semibold rounded-lg"
                    >
                      Move to Cart
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveWishlist(prod.id)}
                      className="px-3 py-2 border border-slate-300 text-slate-600 text-xs rounded-lg"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 6: Profile Management */}
      {activeTab === 'profile' && (
        <div className="max-w-xl bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-3">
            <User className="w-5 h-5 text-[#B48A1E]" />
            <h2 className="font-display text-lg font-bold text-[#0A192F]">
              Profile Settings
            </h2>
          </div>

          {profileSavedToast && (
            <div
              role="status"
              className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800"
            >
              Profile updated successfully.
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              onUpdateProfile(profileName.trim() || user.name, profilePhone.trim());
              setProfileSavedToast(true);
            }}
            className="space-y-4"
          >
            <div>
              <label htmlFor="prof-name" className="block text-xs font-semibold text-slate-700 mb-1">
                Full Name
              </label>
              <input
                id="prof-name"
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                maxLength={120}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="prof-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                Phone Number
              </label>
              <input
                id="prof-phone"
                type="text"
                value={profilePhone}
                onChange={(e) => setProfilePhone(e.target.value)}
                maxLength={30}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 text-xs text-slate-600">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-400 block">Email</span>
                <span className="font-semibold text-slate-900">{user.email}</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-400 block">Account Role</span>
                <span className="font-semibold text-slate-900 uppercase">{user.role}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-emerald-700">
              <MailCheck className="w-4 h-4" />
              <span>Account Status: Active</span>
            </div>

            <button
              type="submit"
              className="px-5 py-2.5 bg-[#0A192F] text-white text-xs font-semibold rounded-lg hover:bg-slate-800"
            >
              Save Profile Changes
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
