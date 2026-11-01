import React, { useState } from 'react';
import {
  CheckCircle2,
  Mail,
  MapPin,
  Phone,
  Terminal,
  ShieldCheck,
  Globe,
  Copy,
  Check,
  Rocket,
  KeyRound,
  Server,
} from 'lucide-react';
import firebaseConfig from '../../firebase-applet-config.json';

export type StaticPageType =
  | 'about'
  | 'contact'
  | 'privacy'
  | 'terms'
  | 'refund'
  | 'shipping'
  | 'deployment';

interface StaticAndGuideViewsProps {
  page: StaticPageType;
}

export const StaticAndGuideViews: React.FC<StaticAndGuideViewsProps> = ({ page }) => {
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSubmitted, setContactSubmitted] = useState(false);

  const [vercelDomainInput, setVercelDomainInput] = useState('satyas-education.vercel.app');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyText = (key: string, text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 2200);
  };

  if (page === 'about') {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-4">
          <p className="text-xs font-mono-tabular text-[#B48A1E]">ABOUT SATYA’S EDUCATION</p>
          <h1 className="font-display text-3xl font-bold text-[#0A192F]">
            Structured Technology Education, Technical Books & Young Reader Storybooks
          </h1>
          <p className="text-sm sm:text-base text-slate-700 leading-relaxed">
            Satya’s Education is an independent educational storefront and learning platform
            dedicated to clear, rigorous instruction across Python, Django, Frontend Web
            Engineering, Cloud & DevOps, Generative AI, and Agentic AI—alongside printed and
            digital textbooks and illustrated STEM storybooks for children.
          </p>
          <p className="text-sm text-slate-600 leading-relaxed">
            Transparency Notice: All catalog items currently displayed with a{' '}
            <code className="font-mono-tabular text-xs bg-slate-100 px-1.5 py-0.5 rounded">
              [Sample Course]
            </code>
            ,{' '}
            <code className="font-mono-tabular text-xs bg-slate-100 px-1.5 py-0.5 rounded">
              [Sample Book]
            </code>
            , or{' '}
            <code className="font-mono-tabular text-xs bg-slate-100 px-1.5 py-0.5 rounded">
              [Sample Storybook]
            </code>{' '}
            label are demonstration items designed to showcase end-to-end catalog browsing, preview
            playback, server-verified Cashfree INR checkout, and entitlement fulfillment without
            fabricated reviews or exaggerated sales claims.
          </p>
        </div>
      </div>
    );
  }

  if (page === 'contact') {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          <div className="md:col-span-5 bg-[#0A192F] text-white rounded-xl p-6 space-y-4">
            <p className="text-xs font-mono-tabular text-[#D4AF37]">STUDENT & BOOKSTORE SUPPORT</p>
            <h1 className="font-display text-2xl font-bold">Contact Satya’s Education</h1>
            <p className="text-xs text-slate-300 leading-relaxed">
              Have questions about course syllabus details, bulk textbook orders, or physical book
              delivery status? Reach out to our support desk.
            </p>
            <div className="space-y-3 pt-4 border-t border-white/15 text-xs text-slate-200">
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-[#D4AF37]" />
                <span>support@satyaeducation.in</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-[#D4AF37]" />
                <span>+91 (040) 2345-6789 (Mon–Sat, 9 AM – 6 PM IST)</span>
              </div>
              <div className="flex items-center gap-2.5">
                <MapPin className="w-4 h-4 text-[#D4AF37]" />
                <span>Academic Publishing Desk, Hyderabad, Telangana, India</span>
              </div>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!contactName.trim() || !contactEmail.trim() || !contactMessage.trim()) return;
              setContactSubmitted(true);
            }}
            className="md:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <h2 className="font-display text-xl font-bold text-[#0A192F]">Send an Inquiry</h2>
            {contactSubmitted && (
              <div
                role="status"
                className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Thank you, {contactName}. Your message has been logged for our support team.
                </span>
              </div>
            )}
            <div>
              <label htmlFor="contact-name" className="block text-xs font-semibold mb-1">
                Your Name
              </label>
              <input
                id="contact-name"
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="contact-email" className="block text-xs font-semibold mb-1">
                Email Address
              </label>
              <input
                id="contact-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="contact-msg" className="block text-xs font-semibold mb-1">
                Message or Order Reference
              </label>
              <textarea
                id="contact-msg"
                rows={4}
                value={contactMessage}
                onChange={(e) => setContactMessage(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-2.5 bg-[#0A192F] text-white text-xs font-semibold rounded-lg hover:bg-slate-800"
            >
              Submit Inquiry
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (page === 'privacy' || page === 'terms' || page === 'refund' || page === 'shipping') {
    const titles: Record<string, string> = {
      privacy: 'Privacy Policy & Data Isolation',
      terms: 'Terms & Conditions of Use',
      refund: 'Refund & Cancellation Policy',
      shipping: 'Shipping & Delivery Policy (Physical Books)',
    };
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-5 text-sm text-slate-700 leading-relaxed">
          <p className="text-xs font-mono-tabular text-[#B48A1E]">OFFICIAL STORE POLICY</p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0A192F]">
            {titles[page]}
          </h1>

          {page === 'privacy' && (
            <>
              <p>
                <strong>1. PII Isolation:</strong> Satya’s Education isolates personally
                identifiable information (email addresses, phone numbers, and shipping addresses) in
                Cloud Firestore using strict ownership rules (
                <code className="font-mono-tabular text-xs">resource.data.userId == request.auth.uid</code>
                ). Users can never read or list another customer’s profile, orders, or delivery
                addresses.
              </p>
              <p>
                <strong>2. Zero Card Storage:</strong> All INR payments are processed through
                Cashfree Payment Gateway. Satya’s Education never collects, processes, or stores raw
                credit/debit card numbers, CVVs, or UPI PINs on its servers or in Firestore. Only
                the Cashfree Order ID, Payment Reference ID, and verification status are persisted.
              </p>
            </>
          )}

          {page === 'terms' && (
            <>
              <p>
                <strong>1. Personal Educational License:</strong> Purchased course recordings and
                digital books are licensed solely to the individual account holder. Sharing account
                credentials or redistributing downloaded files is prohibited.
              </p>
              <p>
                <strong>2. Server-Authoritative Pricing:</strong> All product prices and stock
                counts are verified server-side against Cloud Firestore at checkout.
              </p>
            </>
          )}

          {page === 'refund' && (
            <>
              <p>
                <strong>1. Physical Books:</strong> Damaged or misprinted physical books may be
                reported within 7 days of delivery for a replacement or full refund via Cashfree to
                the original payment method.
              </p>
              <p>
                <strong>2. Digital Courses & Digital Books:</strong> Because digital downloads and
                full course recordings unlock immediately upon verified payment, refund requests for
                digital items are eligible within 7 days only if less than 20% of the course
                recordings have been watched and the digital book file has not been downloaded.
              </p>
            </>
          )}

          {page === 'shipping' && (
            <>
              <p>
                <strong>1. Dispatch & Transit Timeline:</strong> Physical hardcover educational
                books and storybooks are dispatched within 24–48 business hours from our warehouse
                and delivered across India within 4–7 business days.
              </p>
              <p>
                <strong>2. Shipping Charges:</strong> Orders containing physical books totaling
                ₹999 or above qualify for FREE delivery across India. Physical orders below ₹999
                incur a flat ₹79 shipping fee. Digital courses and digital books have zero shipping
                charges.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  const normalizedDomain = vercelDomainInput
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '') || 'satyas-education.vercel.app';
  const generatedWebhookUrl = `https://${normalizedDomain}/api/cashfree/webhook`;

  const vercelEnvBlock = `# 1. Public Vite Client Variables (Pre-populated from your provisioned Firebase project)
VITE_FIREBASE_API_KEY="${firebaseConfig.apiKey}"
VITE_FIREBASE_AUTH_DOMAIN="${firebaseConfig.authDomain}"
VITE_FIREBASE_PROJECT_ID="${firebaseConfig.projectId}"
VITE_FIREBASE_STORAGE_BUCKET="${firebaseConfig.storageBucket}"
VITE_FIREBASE_MESSAGING_SENDER_ID="${firebaseConfig.messagingSenderId}"
VITE_FIREBASE_APP_ID="${firebaseConfig.appId}"
VITE_FIREBASE_DATABASE_ID="${firebaseConfig.firestoreDatabaseId}"
VITE_CASHFREE_ENV="sandbox"

# 2. Server-Only Variables (Firebase Admin SDK & Cashfree INR Gateway)
FIREBASE_PROJECT_ID="${firebaseConfig.projectId}"
FIREBASE_STORAGE_BUCKET="${firebaseConfig.storageBucket}"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxxx@${firebaseConfig.projectId}.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nYOUR_PRIVATE_KEY_HERE\\n-----END PRIVATE KEY-----\\n"
CASHFREE_ENV="sandbox"
CASHFREE_APP_ID="TEST_YOUR_CASHFREE_APP_ID"
CASHFREE_SECRET_KEY="TEST_YOUR_CASHFREE_SECRET_KEY"`;

  const vercelCliCommands = `# Install or run Vercel CLI directly from the project root
npx vercel login
npx vercel
# When ready to deploy to your production .vercel.app or custom domain:
npx vercel --prod`;

  // Deployment, Firebase, Cashfree & Vercel Setup Guide
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      {/* Hero Banner for Vercel Deployment */}
      <div className="bg-gradient-to-br from-[#071120] via-[#0A192F] to-[#112240] text-white rounded-2xl p-6 sm:p-8 border border-slate-800 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-mono-tabular uppercase tracking-widest text-[#D4AF37]">
              <Rocket className="w-4 h-4" />
              <span>VERCEL READY • ZERO-CONFIG VITE + SERVERLESS API</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
              Deploy Satya’s Education to Vercel
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              This repository includes a pre-configured{' '}
              <code className="font-mono-tabular text-[#F3E5AB]">vercel.json</code> and serverless
              API entrypoint (<code className="font-mono-tabular text-[#F3E5AB]">/api/index.ts</code>
              ). Follow the 4 steps below to deploy your frontend and backend to Vercel in minutes.
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-xs space-y-1.5 font-mono-tabular">
            <div className="text-slate-400">Build Preset: <span className="text-white font-semibold">Vite</span></div>
            <div className="text-slate-400">Build Command: <span className="text-[#F3E5AB]">npm run build</span></div>
            <div className="text-slate-400">Output Dir: <span className="text-[#F3E5AB]">dist</span></div>
            <div className="text-slate-400">API Route: <span className="text-emerald-400">/api/* → /api/index.ts</span></div>
          </div>
        </div>
      </div>

      {/* Interactive Domain & Webhook Helper */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <p className="text-xs font-mono-tabular font-semibold uppercase tracking-wider text-[#B48A1E]">
              INTERACTIVE VERCEL DOMAIN HELPER
            </p>
            <h2 className="font-display text-xl font-bold text-[#0A192F] mt-0.5">
              Enter Your Vercel or Custom Domain
            </h2>
          </div>
          <div className="w-full sm:w-80">
            <label htmlFor="vercel-domain-input" className="sr-only">
              Your Vercel or Custom Domain
            </label>
            <input
              id="vercel-domain-input"
              type="text"
              value={vercelDomainInput}
              onChange={(e) => setVercelDomainInput(e.target.value)}
              placeholder="e.g. satyas-education.vercel.app"
              className="w-full px-3.5 py-2 text-xs sm:text-sm font-mono-tabular border border-slate-300 rounded-lg focus:outline-none focus:border-[#0A192F]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#0A192F]">
                Firebase Authorized Domain to Add:
              </span>
              <button
                type="button"
                onClick={() => copyText('domain', normalizedDomain)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-[#0A192F] hover:bg-slate-100 font-medium"
              >
                {copiedKey === 'domain' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Domain</span>
                  </>
                )}
              </button>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900 text-[#F3E5AB] font-mono-tabular truncate">
              {normalizedDomain}
            </div>
            <p className="text-[11px] text-slate-600">
              Add in <strong>Firebase Console → Authentication → Settings → Authorized domains</strong>.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#0A192F]">
                Cashfree Webhook Endpoint URL:
              </span>
              <button
                type="button"
                onClick={() => copyText('webhook', generatedWebhookUrl)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-[#0A192F] hover:bg-slate-100 font-medium"
              >
                {copiedKey === 'webhook' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy URL</span>
                  </>
                )}
              </button>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900 text-emerald-300 font-mono-tabular truncate">
              {generatedWebhookUrl}
            </div>
            <p className="text-[11px] text-slate-600">
              Register in <strong>Cashfree Dashboard → Developers → Webhooks</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Step-by-Step Guide */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xs">
        <div className="space-y-5 text-xs sm:text-sm text-slate-700 leading-relaxed">
          {/* Step 1: Push or CLI */}
          <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-[#0A192F] text-sm sm:text-base">
                <Server className="w-4 h-4 text-[#B48A1E]" />
                <span>Step 1: Import Project into Vercel (GitHub or Vercel CLI)</span>
              </div>
              <button
                type="button"
                onClick={() => copyText('cli', vercelCliCommands)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A192F] text-white text-xs font-semibold hover:bg-slate-800"
              >
                {copiedKey === 'cli' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Copied CLI Commands</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy CLI Commands</span>
                  </>
                )}
              </button>
            </div>
            <p>
              <strong>Option A (Vercel Dashboard):</strong> Export or push this repository to GitHub,
              open{' '}
              <span className="font-mono-tabular text-xs bg-white px-1.5 py-0.5 rounded border border-slate-200">
                vercel.com/new
              </span>
              , and import the repository. Vercel automatically detects{' '}
              <code className="font-mono-tabular text-xs">vercel.json</code> (Build Command:{' '}
              <code className="font-mono-tabular text-xs">npm run build</code>, Output Directory:{' '}
              <code className="font-mono-tabular text-xs">dist</code>).
            </p>
            <p>
              <strong>Option B (Vercel CLI):</strong> Run these commands from your project root:
            </p>
            <pre className="p-3.5 bg-slate-900 text-slate-100 rounded-lg font-mono-tabular text-xs overflow-x-auto">
              {vercelCliCommands}
            </pre>
          </div>

          {/* Step 2: Environment Variables */}
          <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-[#0A192F] text-sm sm:text-base">
                <KeyRound className="w-4 h-4 text-[#B48A1E]" />
                <span>Step 2: Paste Environment Variables in Vercel</span>
              </div>
              <button
                type="button"
                onClick={() => copyText('env', vercelEnvBlock)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A192F] text-white text-xs font-semibold hover:bg-slate-800"
              >
                {copiedKey === 'env' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Copied .env Block</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy .env Block for Vercel</span>
                  </>
                )}
              </button>
            </div>
            <p>
              In <strong>Vercel Project Settings → Environment Variables</strong>, you can paste the
              entire block below at once. Your public{' '}
              <code className="font-mono-tabular text-xs">VITE_FIREBASE_*</code> variables are
              already filled in for your provisioned Firebase project (
              <code className="font-mono-tabular text-xs">{firebaseConfig.projectId}</code>):
            </p>
            <pre className="p-3.5 bg-slate-900 text-slate-100 rounded-lg font-mono-tabular text-xs overflow-x-auto leading-relaxed">
              {vercelEnvBlock}
            </pre>
          </div>

          {/* Step 3: Firebase Authorized Domains */}
          <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-[#0A192F] text-sm sm:text-base">
              <Globe className="w-4 h-4 text-[#B48A1E]" />
              <span>Step 3: Configure Firebase Authorized Domains (Add Individually)</span>
            </div>
            <p>
              Firebase Authentication blocks Google Sign-In and Email action links on any domain not
              explicitly allowlisted. In the{' '}
              <strong>
                Firebase Console → Authentication → Settings → Authorized domains
              </strong>
              , add each domain <strong>individually</strong> (wildcard entries are not supported):
            </p>
            <ul className="list-disc pl-5 space-y-1 font-mono-tabular text-xs">
              <li>localhost (for local development)</li>
              <li>{normalizedDomain} (your Vercel deployment domain)</li>
              <li>www.satyaeducation.in and satyaeducation.in (your custom domains, added one by one)</li>
            </ul>
          </div>

          {/* Step 4: Admin Bootstrap & Cashfree Webhooks */}
          <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-[#0A192F] text-sm sm:text-base">
              <Terminal className="w-4 h-4 text-[#B48A1E]" />
              <span>Step 4: One-Time Admin Bootstrap & Cashfree Webhook Verification</span>
            </div>
            <p>
              To grant the first administrator role using Firebase Admin SDK custom claims and create
              the <code className="font-mono-tabular text-xs">/admins/&#123;uid&#125;</code>{' '}
              document, run either the TypeScript or Python CLI script once:
            </p>
            <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg font-mono-tabular text-xs overflow-x-auto">
              npx tsx scripts/grant-admin.ts tarunpediredla9966@gmail.com{'\n'}
              # OR using Python:{'\n'}
              python scripts/grant_admin.py tarunpediredla9966@gmail.com
            </pre>
            <div className="pt-2 flex items-start gap-2 text-xs text-slate-600">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Whenever you update environment variables in Vercel, click{' '}
                <strong>Deployments → Redeploy</strong> so both the Vite client bundle and{' '}
                <code className="font-mono-tabular">/api/*</code> serverless functions load the new
                configuration.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

