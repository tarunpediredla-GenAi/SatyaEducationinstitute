import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Play,
  Lock,
  CheckCircle2,
  Heart,
  ShoppingBag,
  BookOpen,
  Truck,
  Download,
} from 'lucide-react';
import type { CatalogProduct, CourseLesson } from '../utils/commerceRules';
import type { CourseCurriculumDetails } from '../data/sampleCatalog';
import { CoverArtwork, formatCleanTitle } from './CoverArtwork';
import { getClientAuthHeaders } from '../utils/apiAuth';

interface ProductDetailViewProps {
  product: CatalogProduct;
  courseDetails?: CourseCurriculumDetails;
  lessons: CourseLesson[];
  isEntitled: boolean;
  isWishlisted: boolean;
  onBack: () => void;
  onAddToCart: (product: CatalogProduct) => void;
  onBuyNow?: (product: CatalogProduct) => void;
  onToggleWishlist: (productId: string) => void;
  onOpenCoursePlayer: (productId: string) => void;
}

export const ProductDetailView: React.FC<ProductDetailViewProps> = ({
  product,
  courseDetails,
  lessons,
  isEntitled,
  isWishlisted,
  onBack,
  onAddToCart,
  onBuyNow,
  onToggleWishlist,
  onOpenCoursePlayer,
}) => {
  const courseLessons = lessons
    .filter((l) => l.courseId === product.id)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const freePreviewLesson = courseLessons.find((l) => l.isFreePreview) || courseLessons[0];
  const [activePreviewLesson, setActivePreviewLesson] = useState<CourseLesson | undefined>(
    freePreviewLesson
  );
  const [lockedLessonNotice, setLockedLessonNotice] = useState<string | null>(null);
  const [resolvedLessonPlaybackUrl, setResolvedLessonPlaybackUrl] = useState<string>('');

  const isCourse = product.type === 'course';
  const requiresPhysicalDelivery =
    product.format === 'physical_book' || product.format === 'hybrid_book';

  useEffect(() => {
    let cancelled = false;
    const resolveVideoUrl = async () => {
      if (!isCourse || !activePreviewLesson) {
        setResolvedLessonPlaybackUrl('');
        return;
      }

      if (activePreviewLesson.isFreePreview) {
        setResolvedLessonPlaybackUrl(
          activePreviewLesson.videoStoragePath.startsWith('http')
            ? activePreviewLesson.videoStoragePath
            : product.previewVideoUrl ||
                'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
        );
        return;
      }

      if (!isEntitled) {
        setResolvedLessonPlaybackUrl('');
        return;
      }

      try {
        const authHeaders = await getClientAuthHeaders();
        const res = await fetch('/api/content/signed-url', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            productId: product.id,
            lessonId: activePreviewLesson.id,
          }),
        });
        const data = await res.json();
        if (!cancelled && res.ok && data.signedUrl) {
          setResolvedLessonPlaybackUrl(data.signedUrl);
        } else if (!cancelled) {
          setResolvedLessonPlaybackUrl('');
          setLockedLessonNotice(
            data?.error || 'Server entitlement verification is required to play this recording.'
          );
        }
      } catch {
        if (!cancelled) {
          setResolvedLessonPlaybackUrl('');
        }
      }
    };

    resolveVideoUrl();
    return () => {
      cancelled = true;
    };
  }, [isCourse, activePreviewLesson?.id, activePreviewLesson?.isFreePreview, isEntitled, product.id, product.previewVideoUrl]);

  const formatLabel =
    product.format === 'recorded_course'
      ? 'Recorded Video Course'
      : product.format === 'digital_book'
      ? 'Digital Book (PDF / EPUB)'
      : product.format === 'physical_book'
      ? 'Physical Hardcover Book'
      : 'Hybrid Bundle (Physical Hardcover + Digital PDF)';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-[#0A192F] mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Catalog</span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 space-y-8">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {isCourse && activePreviewLesson ? (
              <div>
                <div className="bg-[#0A192F] p-4 flex items-center justify-between text-xs text-slate-200 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <Play className="w-4 h-4 text-[#D4AF37]" />
                    <span className="font-semibold text-white">
                      {activePreviewLesson.isFreePreview ? 'Free Preview Lesson:' : 'Lesson:'}{' '}
                      {activePreviewLesson.title}
                    </span>
                  </div>
                  <span className="font-mono-tabular text-[#D4AF37]">
                    {activePreviewLesson.durationMinutes} mins
                  </span>
                </div>
                <div className="aspect-video bg-slate-950 relative">
                  {resolvedLessonPlaybackUrl ? (
                    <video
                      key={`${activePreviewLesson.id}-${resolvedLessonPlaybackUrl}`}
                      controls
                      preload="metadata"
                      className="w-full h-full object-contain"
                      src={resolvedLessonPlaybackUrl}
                    >
                      Your browser does not support HTML5 video playback.
                    </video>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 p-6 text-center">
                      Select a free preview lesson or purchase this course to unlock protected module recordings.
                    </div>
                  )}
                </div>
                <div className="p-4 bg-slate-50 border-t border-slate-200 text-xs text-slate-600">
                  <strong className="text-slate-900">Lesson Notes:</strong>{' '}
                  {activePreviewLesson.notes}
                </div>
              </div>
            ) : (
              <div className="aspect-4/3">
                <CoverArtwork product={product} className="w-full h-full" />
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
            <div>
              <p className="text-xs text-slate-500 mb-2">
                <span>{product.category}</span>
                <span aria-hidden="true"> · </span>
                <span>{formatLabel}</span>
                <span aria-hidden="true"> · </span>
                <span>Language: {product.language}</span>
              </p>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#0A192F]">
                {isCourse ? 'Course Introduction & Syllabus' : 'Book Overview & Edition Details'}
              </h2>
              <p className="mt-3 text-sm sm:text-base text-slate-700 leading-relaxed">
                {courseDetails?.introduction || product.description}
              </p>
            </div>

            {isCourse && courseDetails?.syllabusSummary && (
              <div className="pt-4 border-t border-slate-200">
                <h3 className="text-base font-bold text-[#0A192F] mb-2">Syllabus Architecture</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {courseDetails.syllabusSummary}
                </p>
              </div>
            )}

            {isCourse && (
              <div className="pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-[#0A192F]">
                    Recorded Modules & Lesson List ({courseLessons.length} Lessons)
                  </h3>
                  <span className="text-xs text-slate-500">
                    Free preview lessons are open to all visitors
                  </span>
                </div>

                {lockedLessonNotice && (
                  <div
                    role="alert"
                    className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900"
                  >
                    {lockedLessonNotice}
                  </div>
                )}

                <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
                  {courseLessons.map((lesson) => {
                    const canPlay = lesson.isFreePreview || isEntitled;
                    const isSelected = activePreviewLesson?.id === lesson.id;
                    return (
                      <div
                        key={lesson.id}
                        className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                          isSelected ? 'bg-slate-50' : 'bg-white hover:bg-slate-50/70'
                        }`}
                      >
                        <div>
                          <p className="text-xs text-slate-500">{lesson.moduleTitle}</p>
                          <p className="text-sm font-semibold text-slate-900 mt-0.5">
                            {lesson.title}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            <span>Duration: {lesson.durationMinutes} mins</span>
                            <span aria-hidden="true"> · </span>
                            <span>
                              {lesson.isFreePreview
                                ? 'Public Free Preview'
                                : isEntitled
                                ? 'Unlocked in Your Library'
                                : 'Purchase Required'}
                            </span>
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (canPlay) {
                              setLockedLessonNotice(null);
                              setActivePreviewLesson(lesson);
                            } else {
                              setLockedLessonNotice(
                                `Lesson "${lesson.title}" is a protected recording. Add this course to your cart and complete checkout to unlock all modules.`
                              );
                            }
                          }}
                          className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                            canPlay
                              ? 'bg-[#0A192F] text-white hover:bg-slate-800'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {canPlay ? (
                            <>
                              <Play className="w-3.5 h-3.5 text-[#D4AF37]" />
                              <span>{lesson.isFreePreview ? 'Watch Preview' : 'Play Lesson'}</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-3.5 h-3.5 text-slate-500" />
                              <span>Locked Recording</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!isCourse && (
              <div className="pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="flex items-center gap-2 font-semibold text-[#0A192F] mb-1">
                    {requiresPhysicalDelivery ? (
                      <Truck className="w-4 h-4 text-[#B48A1E]" />
                    ) : (
                      <Download className="w-4 h-4 text-[#B48A1E]" />
                    )}
                    <span>Fulfillment & Format</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {requiresPhysicalDelivery
                      ? `Physical book shipped across India. Requires a valid delivery address at checkout. Current warehouse stock: ${product.stock} copies.`
                      : 'Instant digital download (PDF) unlocked in your My Books dashboard immediately after order confirmation.'}
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="flex items-center gap-2 font-semibold text-[#0A192F] mb-1">
                    <BookOpen className="w-4 h-4 text-[#B48A1E]" />
                    <span>Edition Specifications</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Author: {product.authorOrInstructor} · Language: {product.language} · Length:{' '}
                    {product.duration} · Level: {product.level}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 lg:sticky lg:top-24">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
            <div>
              <div className="text-xs text-slate-500 mb-2">
                <span>{product.category}</span>
                <span aria-hidden="true"> · </span>
                <span>{product.level}</span>
                <span aria-hidden="true"> · </span>
                <span>{product.duration}</span>
              </div>
              <h1 className="font-display text-2xl font-bold text-[#0A192F] leading-snug">
                {formatCleanTitle(product.title)}
              </h1>
              <p className="text-sm text-slate-600 mt-2">{product.shortDescription}</p>
            </div>

            <div className="pt-4 border-t border-slate-200 flex items-baseline justify-between">
              <div>
                <span className="text-xs text-slate-500 block">Store Price (INR)</span>
                <div className="flex items-baseline gap-2.5 mt-1">
                  <span className="font-mono-tabular text-3xl font-bold text-[#0A192F]">
                    ₹{product.priceInr.toLocaleString('en-IN')}
                  </span>
                  {product.originalPriceInr > product.priceInr && (
                    <span className="font-mono-tabular text-sm text-slate-400 line-through">
                      ₹{product.originalPriceInr.toLocaleString('en-IN')}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right text-xs text-slate-600">
                {requiresPhysicalDelivery ? (
                  <span
                    className={
                      product.stock > 0 ? 'text-emerald-700 font-semibold' : 'text-red-600 font-semibold'
                    }
                  >
                    {product.stock > 0 ? `In Stock (${product.stock} copies)` : 'Out of Stock'}
                  </span>
                ) : (
                  <span className="text-emerald-700 font-semibold">Instant Digital Access</span>
                )}
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div>
                <dt className="text-slate-500">
                  {isCourse ? 'Instructor' : 'Author / Studio'}
                </dt>
                <dd className="font-semibold text-slate-900 mt-0.5">
                  {product.authorOrInstructor}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Language</dt>
                <dd className="font-semibold text-slate-900 mt-0.5">{product.language}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Format</dt>
                <dd className="font-semibold text-slate-900 mt-0.5">{product.coverType}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Duration / Length</dt>
                <dd className="font-semibold text-slate-900 mt-0.5 font-mono-tabular">
                  {product.duration}
                </dd>
              </div>
            </dl>

            <div className="space-y-3">
              {isEntitled ? (
                <button
                  type="button"
                  onClick={() => onOpenCoursePlayer(product.id)}
                  className="w-full py-3 px-4 bg-emerald-700 text-white text-sm font-semibold rounded-lg hover:bg-emerald-800 transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {isCourse
                      ? 'Purchased — Open Course Player'
                      : 'Purchased — Open in My Books'}
                  </span>
                </button>
              ) : (
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={requiresPhysicalDelivery && product.stock <= 0}
                    onClick={() => {
                      if (onBuyNow) {
                        onBuyNow(product);
                      } else {
                        onAddToCart(product);
                      }
                    }}
                    className="w-full py-3 px-4 bg-[#D4AF37] hover:bg-[#c29d2b] text-[#0A192F] text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                  >
                    <span>
                      {requiresPhysicalDelivery && product.stock <= 0
                        ? 'Currently Out of Stock'
                        : `Buy Now — ₹${product.priceInr.toLocaleString('en-IN')}`}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={requiresPhysicalDelivery && product.stock <= 0}
                    onClick={() => onAddToCart(product)}
                    className="w-full py-2.5 px-4 bg-[#0A192F] text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <ShoppingBag className="w-4 h-4 text-[#D4AF37]" />
                    <span>Add to Cart</span>
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => onToggleWishlist(product.id)}
                className="w-full py-2.5 px-4 border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
              >
                <Heart
                  className={`w-4 h-4 ${
                    isWishlisted ? 'fill-red-500 text-red-500' : 'text-slate-500'
                  }`}
                />
                <span>{isWishlisted ? 'Saved in Your Wishlist' : 'Save to Wishlist'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
