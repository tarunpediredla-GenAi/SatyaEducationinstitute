import React from 'react';
import type { CatalogProduct } from '../utils/commerceRules';

interface CoverArtworkProps {
  product: CatalogProduct;
  className?: string;
}

export function formatCleanTitle(rawTitle: string): string {
  return rawTitle.replace(/^\[Sample (Course|Book|Storybook)\]\s*/i, '').trim();
}

function getCategoryTheme(category: string) {
  const key = category.toLowerCase();
  if (key.includes('python')) {
    return {
      bgGrad: 'from-[#0B1D3A] via-[#102A52] to-[#09152B]',
      bookCover: 'from-[#0D254C] via-[#133366] to-[#091936]',
      accent: '#D4AF37',
      badge: '#38BDF8',
      codeTitle: 'pipeline_async.py',
      codeLines: [
        'async def verify_order(ctx, order_id: str):',
        '    record = await db.orders.get(order_id)',
        '    assert record.currency == "INR"',
        '    return GrantEntitlement(record.uid)',
      ],
    };
  }
  if (key.includes('django')) {
    return {
      bgGrad: 'from-[#09221C] via-[#0F352B] to-[#071915]',
      bookCover: 'from-[#0C2D24] via-[#134235] to-[#081F19]',
      accent: '#D4AF37',
      badge: '#34D399',
      codeTitle: 'views_webhook.py',
      codeLines: [
        '@csrf_exempt',
        'def cashfree_webhook(request):',
        '    sig = request.headers["x-webhook-signature"]',
        '    verify_hmac_sha256(request.body, sig)',
      ],
    };
  }
  if (key.includes('react') || key.includes('javascript') || key.includes('css') || key.includes('html')) {
    return {
      bgGrad: 'from-[#0F172A] via-[#1E293B] to-[#090F1D]',
      bookCover: 'from-[#162447] via-[#1F3A68] to-[#0F1A34]',
      accent: '#D4AF37',
      badge: '#60A5FA',
      codeTitle: 'CoursePlayer.tsx',
      codeLines: [
        'export function CoursePlayer({ lesson }) {',
        '  const { progress } = useEntitlement(lesson.id);',
        '  return <VideoStage src={lesson.streamUrl} />;',
        '}',
      ],
    };
  }
  if (key.includes('ai') || key.includes('genai') || key.includes('agentic')) {
    return {
      bgGrad: 'from-[#1A1033] via-[#26174A] to-[#0F0920]',
      bookCover: 'from-[#231542] via-[#311E5C] to-[#140B29]',
      accent: '#FDE047',
      badge: '#C084FC',
      codeTitle: 'agent_workflow.py',
      codeLines: [
        'agent = ToolCallingAgent(model="gemini-2.5")',
        'plan = await agent.reason(query, tools=[sql])',
        'result = await plan.execute_verified()',
        'return StructuredReport(result)',
      ],
    };
  }
  return {
    bgGrad: 'from-[#0F1E36] via-[#1B3154] to-[#0A1424]',
    bookCover: 'from-[#162A4A] via-[#213B66] to-[#0E1C33]',
    accent: '#D4AF37',
    badge: '#FBBF24',
    codeTitle: 'deploy_cloud.yml',
    codeLines: [
      'steps:',
      '  - run: pytest --cov=satya_backend',
      '  - run: docker build -t satya-edu:release .',
      '  - run: vercel deploy --prod',
    ],
  };
}

/**
 * Renders bespoke studio product visuals:
 * 1. Courses -> Dark-navy architectural IDE & video player preview stage with syntax-highlighted code and Play medallion
 * 2. Technical Books -> 3D angled hardcover book on warm gallery travertine paper (#F3EFE6) with realistic spine & gold foil
 * 3. Storybooks -> Illustrated hardcover children's edition on warm cream paper (#FBF6EC) with celestial/lantern vector art
 */
export const CoverArtwork: React.FC<CoverArtworkProps> = ({ product, className = '' }) => {
  const isCourse = product.type === 'course';
  const isStorybook = product.type === 'storybook';
  const cleanTitle = formatCleanTitle(product.title);
  const theme = getCategoryTheme(product.category);

  // 1. RECORDED COURSE VISUAL: Studio Video & Code Architecture Stage
  if (isCourse) {
    return (
      <div
        className={`relative overflow-hidden select-none bg-gradient-to-br ${theme.bgGrad} text-white ${className}`}
        role="img"
        aria-label={`Course preview illustration for ${cleanTitle}`}
      >
        {/* Subtle radial glow & architectural grid */}
        <svg
          className="absolute inset-0 w-full h-full opacity-20 pointer-events-none"
          viewBox="0 0 400 300"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <pattern id={`grid-${product.id}`} width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#D4AF37" strokeWidth="0.4" />
            </pattern>
          </defs>
          <rect width="400" height="300" fill={`url(#grid-${product.id})`} />
          <circle cx="330" cy="60" r="95" stroke="#D4AF37" strokeWidth="1" strokeDasharray="4 4" />
          <circle cx="330" cy="60" r="60" stroke="#38BDF8" strokeWidth="0.7" />
        </svg>

        {/* Gold foil top rule */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#B48A1E] via-[#FDE047] to-[#B48A1E]" />

        <div className="relative z-10 h-full flex flex-col justify-between p-4 sm:p-5">
          {/* Top studio header bar */}
          <div className="flex items-center justify-between text-[11px] font-mono-tabular">
            <span className="text-[#D4AF37] font-semibold tracking-wider uppercase">
              {product.category} · HD COURSE
            </span>
            <span className="text-slate-300 bg-black/30 px-2 py-0.5 rounded border border-white/10">
              {product.duration}
            </span>
          </div>

          {/* Center IDE & Video Frame Window */}
          <div className="my-auto bg-[#070E1B]/90 border border-white/15 rounded-lg p-3 shadow-xl backdrop-blur-xs">
            <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2.5">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-400/80" />
                <span className="w-2 h-2 rounded-full bg-amber-400/80" />
                <span className="w-2 h-2 rounded-full bg-emerald-400/80" />
                <span className="text-[10px] font-mono-tabular text-slate-400 ml-1.5">
                  {theme.codeTitle}
                </span>
              </div>
              <span
                className="text-[10px] font-mono-tabular font-semibold"
                style={{ color: theme.badge }}
              >
                1080p · 60fps
              </span>
            </div>

            <div className="relative">
              <div className="space-y-1 font-mono-tabular text-[10px] sm:text-[11px] leading-relaxed text-slate-300">
                {theme.codeLines.map((line, idx) => (
                  <div key={idx} className="truncate">
                    <span className="text-slate-600 select-none mr-2">{idx + 1}</span>
                    <span className={idx === 0 ? 'text-[#FDE047]' : idx === 2 ? 'text-sky-300' : 'text-slate-200'}>
                      {line}
                    </span>
                  </div>
                ))}
              </div>

              {/* Floating Play Preview Medallion */}
              <div className="absolute right-1 bottom-0 w-9 h-9 rounded-full bg-[#D4AF37] text-[#0A192F] shadow-lg flex items-center justify-center ring-4 ring-[#0A192F]/80">
                <svg className="w-4 h-4 fill-current ml-0.5" viewBox="0 0 24 24">
                  <polygon points="6,4 20,12 6,20" />
                </svg>
              </div>
            </div>
          </div>

          {/* Bottom Instructor & Curriculum strip */}
          <div className="flex items-center justify-between text-[11px] text-slate-300 pt-1">
            <span className="truncate">Instructor: {product.authorOrInstructor}</span>
            <span className="text-[#D4AF37] font-mono-tabular shrink-0">Free Preview Included</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. STORYBOOK VISUAL: Illustrated Hardcover Children's Edition on Warm Cream Pedestal
  if (isStorybook) {
    const isTara = product.id.includes('tara');
    return (
      <div
        className={`relative overflow-hidden select-none bg-[#F7F2E7] text-[#0A192F] flex items-center justify-center p-4 ${className}`}
        role="img"
        aria-label={`Illustrated storybook cover for ${cleanTitle}`}
      >
        {/* Subtle warm studio lighting backdrop */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#FBF8F1] via-[#F4EBDC] to-[#E9DEC8]" />

        {/* 3D Hardcover Storybook Object */}
        <div className="relative z-10 w-[78%] max-w-[230px] aspect-[4/3.1] rounded-r-lg rounded-l-xs bg-gradient-to-br from-[#13294B] via-[#1B3B6F] to-[#0B1930] text-white shadow-[0_14px_28px_-8px_rgba(10,25,47,0.45)] border border-[#D4AF37]/60 flex overflow-hidden">
          {/* Book Spine Fold */}
          <div className="w-3.5 h-full bg-gradient-to-r from-[#071120] via-[#1D3557] to-[#0A192F] border-r border-[#D4AF37]/40 shrink-0" />

          {/* Illustrated Cover Face */}
          <div className="flex-1 p-3.5 flex flex-col justify-between relative overflow-hidden">
            {/* Celestial / Lantern SVG Illustration */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 220 170"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              {/* Stars */}
              <circle cx="35" cy="30" r="1.8" fill="#FDE047" />
              <circle cx="85" cy="22" r="1.4" fill="#FDE047" />
              <circle cx="175" cy="28" r="2" fill="#FDE047" />
              <circle cx="195" cy="58" r="1.5" fill="#FDE047" />
              {/* Golden Arch */}
              <path
                d="M16 155 V65 A94 65 0 0 1 204 65 V155"
                stroke="#D4AF37"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.45"
              />
              {isTara ? (
                <>
                  {/* Glowing Clockwork Lantern */}
                  <circle cx="162" cy="82" r="26" fill="#FDE047" fillOpacity="0.14" />
                  <circle cx="162" cy="82" r="16" stroke="#FDE047" strokeWidth="1.5" />
                  <polygon points="162,60 172,72 152,72" fill="#D4AF37" />
                  <rect x="155" y="72" width="14" height="20" rx="2" stroke="#FDE047" strokeWidth="1.5" />
                  <circle cx="162" cy="82" r="4" fill="#FDE047" />
                </>
              ) : (
                <>
                  {/* Starlight Bridge & Compass */}
                  <path d="M25 135 Q110 85 195 135" stroke="#FDE047" strokeWidth="2" />
                  <path d="M45 140 Q110 100 175 140" stroke="#38BDF8" strokeWidth="1.2" />
                  <circle cx="160" cy="68" r="18" stroke="#FDE047" strokeWidth="1.4" />
                  <polygon points="160,52 164,68 160,84 156,68" fill="#FDE047" />
                </>
              )}
            </svg>

            <div className="relative z-10 flex items-center justify-between text-[9px] font-mono-tabular text-[#FDE047] tracking-wider uppercase">
              <span>SATYA STORYBOOK</span>
              <span>{product.level}</span>
            </div>

            <div className="relative z-10 my-auto max-w-[75%]">
              <p className="font-display text-xs sm:text-sm font-bold text-white leading-snug line-clamp-2">
                {cleanTitle.replace(/\s*\([^)]*\)\s*$/g, '')}
              </p>
              <p className="text-[10px] text-amber-200/90 mt-1">{product.language}</p>
            </div>

            <div className="relative z-10 flex items-center justify-between text-[9px] text-slate-300 border-t border-white/15 pt-1.5">
              <span>Illustrated Edition</span>
              <span className="text-[#FDE047] font-mono-tabular">{product.duration}</span>
            </div>
          </div>

          {/* Book Page Fore-edge */}
          <div className="w-1.5 h-full bg-gradient-to-r from-[#E2D9C5] to-[#F8F4EC] shrink-0" />
        </div>

        {/* Quiet corner caption on pedestal */}
        <span className="absolute bottom-2.5 right-3 text-[10px] font-mono-tabular text-slate-500">
          {product.format === 'physical_book' ? 'Hardcover Print' : 'Digital Illustrated'}
        </span>
      </div>
    );
  }

  // 3. TECHNICAL BOOK VISUAL: 3D Hardcover Engineering Textbook on Warm Travertine Paper (#F3EFE6)
  return (
    <div
      className={`relative overflow-hidden select-none bg-[#F3EFE6] text-[#0A192F] flex items-center justify-center p-4 ${className}`}
      role="img"
      aria-label={`Hardcover textbook presentation for ${cleanTitle}`}
    >
      {/* Studio surface gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#F8F5EE] via-[#EFEAE0] to-[#E5DEC9]" />

      {/* 3D Standing Hardcover Book Mockup */}
      <div
        className={`relative z-10 w-[76%] max-w-[224px] aspect-[4/3.1] rounded-r-md rounded-l-xs bg-gradient-to-br ${theme.bookCover} text-white shadow-[0_16px_30px_-8px_rgba(15,23,42,0.45)] border border-white/15 flex overflow-hidden`}
      >
        {/* Book Binding Spine */}
        <div className="w-4 h-full bg-gradient-to-r from-black/60 via-white/10 to-black/30 border-r border-[#D4AF37]/50 shrink-0" />

        {/* Book Cover Front */}
        <div className="flex-1 p-3.5 flex flex-col justify-between relative">
          {/* Top Gold Ribbon */}
          <div className="absolute top-0 inset-x-0 h-1 bg-[#D4AF37]" />

          {/* Geometric Emblem */}
          <svg
            className="absolute right-2.5 bottom-7 w-16 h-16 opacity-25 pointer-events-none"
            viewBox="0 0 80 80"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="40" cy="40" r="32" stroke="#D4AF37" strokeWidth="1.5" />
            <polygon points="40,14 64,54 16,54" stroke="#D4AF37" strokeWidth="1.2" />
            <circle cx="40" cy="40" r="10" stroke="#FDE047" strokeWidth="1" />
          </svg>

          <div className="flex items-center justify-between text-[9px] font-mono-tabular text-[#D4AF37] tracking-wider uppercase">
            <span>SATYA PRESS</span>
            <span>{product.category}</span>
          </div>

          <div className="my-auto pr-4">
            <p className="font-display text-xs sm:text-sm font-bold text-white leading-snug line-clamp-2">
              {cleanTitle.replace(/\s*\([^)]*\)\s*$/g, '')}
            </p>
            <p className="text-[10px] text-slate-300 mt-1">{product.authorOrInstructor}</p>
          </div>

          <div className="flex items-center justify-between text-[9px] font-mono-tabular text-slate-300 border-t border-white/15 pt-1.5">
            <span>
              {product.format === 'digital_book'
                ? 'DIGITAL PDF'
                : product.format === 'hybrid_book'
                ? 'PRINT + PDF'
                : 'HARDCOVER'}
            </span>
            <span className="text-[#D4AF37]">{product.duration}</span>
          </div>
        </div>

        {/* Realistic Cream Page Edges */}
        <div className="w-2 h-full bg-gradient-to-r from-[#DCD4C0] via-[#F5F1E6] to-[#CFC6B0] shrink-0" />
      </div>

      <span className="absolute bottom-2.5 right-3 text-[10px] font-mono-tabular text-slate-500">
        {product.duration}
      </span>
    </div>
  );
};
