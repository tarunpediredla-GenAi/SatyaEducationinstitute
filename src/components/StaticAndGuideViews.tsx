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
  Building2,
  Clock,
  RotateCcw,
  AlertCircle,
  FileText,
  Package,
  Truck,
  ArrowRight,
} from 'lucide-react';
import firebaseConfig from '../../firebase-applet-config.json';
import { BUSINESS_COMPLIANCE_INFO } from '../utils/commerceRules';

export type StaticPageType =
  | 'about'
  | 'contact'
  | 'privacy'
  | 'terms'
  | 'refund'
  | 'cancellation'
  | 'shipping'
  | 'deployment';

interface StaticAndGuideViewsProps {
  page: StaticPageType;
}

export const StaticAndGuideViews: React.FC<StaticAndGuideViewsProps> = ({ page }) => {
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSubmitted, setContactSubmitted] = useState(false);

  const [vercelDomainInput, setVercelDomainInput] = useState('satyaeducationinstitute.vercel.app');
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

  /* -------------------------------------------------------------------------- */
  /* TAB 1: ABOUT US (Payment Gateway Compliance & Storefront Overview)        */
  /* -------------------------------------------------------------------------- */
  if (page === 'about') {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 space-y-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-5">
            <div>
              <p className="text-xs font-mono-tabular uppercase tracking-wider text-[#B48A1E] font-semibold">
                ABOUT {BUSINESS_COMPLIANCE_INFO.tradeName.toUpperCase()}
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0A192F] mt-1">
                Engineering Education, Authoritative Textbooks & Young Reader Storybooks
              </h1>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Verified Educational Institute
            </span>
          </div>

          <p className="text-sm sm:text-base text-slate-700 leading-relaxed">
            <strong>{BUSINESS_COMPLIANCE_INFO.tradeName}</strong> is an independent educational publisher and learning
            portal dedicated to delivering high-impact, practical software engineering instruction, authoritative
            technical textbooks, and curiosity-building STEM storybooks for children across India.
          </p>

          <p className="text-sm text-slate-600 leading-relaxed">
            Our mission is to eliminate superficial learning by providing students and software engineers with deep,
            conceptually rigorous courses in Python, Django, React, SQL, Cloud Architecture, DevOps, Generative AI, and
            Agentic AI. Each program is paired with downloadable source code, production architecture notes, and
            hands-on lab exercises.
          </p>

          {/* Three Core Pillars */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
              <div className="w-8 h-8 rounded-lg bg-[#0A192F] text-[#D4AF37] flex items-center justify-center font-bold text-xs">
                01
              </div>
              <h2 className="text-sm font-bold text-[#0A192F]">HD Recorded Courses</h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Structured self-paced video lessons in English and Telugu with lifetime access, downloadable code notes,
                and real backend projects.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
              <div className="w-8 h-8 rounded-lg bg-[#0A192F] text-[#D4AF37] flex items-center justify-center font-bold text-xs">
                02
              </div>
              <h2 className="text-sm font-bold text-[#0A192F]">Engineering Textbooks</h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Comprehensive reference textbooks available in hardcover print and digital PDF formats, shipped directly
                to students nationwide.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
              <div className="w-8 h-8 rounded-lg bg-[#0A192F] text-[#D4AF37] flex items-center justify-center font-bold text-xs">
                03
              </div>
              <h2 className="text-sm font-bold text-[#0A192F]">STEM Children’s Books</h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Beautifully illustrated storybooks that introduce young minds to computational thinking, algorithms,
                and scientific wonder.
              </p>
            </div>
          </div>

          {/* Transparent Pricing & Payment Guarantee */}
          <div className="p-5 bg-amber-50/60 border border-amber-200 rounded-xl space-y-2">
            <h2 className="text-sm font-bold text-amber-950 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#B48A1E]" />
              Transparent Pricing & Secure Cashfree Checkout
            </h2>
            <p className="text-xs text-amber-900 leading-relaxed">
              All courses, books, and storybooks are priced transparently in <strong>Indian Rupees (INR - ₹)</strong> with
              zero hidden subscription recurring fees. Online payments are securely processed through{' '}
              <strong>Cashfree Payments India Private Limited</strong>, an RBI-authorized, PCI-DSS Level 1 compliant
              payment gateway.
            </p>
          </div>

          {/* Legal Entity & Operational Card */}
          <div className="border-t border-slate-200 pt-6">
            <h2 className="text-xs font-mono-tabular uppercase tracking-wider text-slate-500 font-semibold mb-3">
              OFFICIAL BUSINESS & LEGAL DISCLOSURE
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-700">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <span className="text-slate-500 block">Trade Name / Brand</span>
                <span className="font-semibold text-slate-900">{BUSINESS_COMPLIANCE_INFO.tradeName}</span>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <span className="text-slate-500 block">Legal Name / Proprietor</span>
                <span className="font-semibold text-slate-900">{BUSINESS_COMPLIANCE_INFO.legalName}</span>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1 sm:col-span-2">
                <span className="text-slate-500 block">Registered Office Address (Full Address)</span>
                <span className="font-semibold text-slate-900 leading-relaxed">
                  {BUSINESS_COMPLIANCE_INFO.registeredAddress}
                </span>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <span className="text-slate-500 block">Support Desk</span>
                <span className="font-semibold text-slate-900">{BUSINESS_COMPLIANCE_INFO.supportEmail}</span>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <span className="text-slate-500 block">Helpline Hours</span>
                <span className="font-semibold text-slate-900">{BUSINESS_COMPLIANCE_INFO.workingHours}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* TAB 2: CONTACT US (With Full Registered Address & Legal Name)              */
  /* -------------------------------------------------------------------------- */
  if (page === 'contact') {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          {/* Left Column: Registered Office & Contact Info */}
          <div className="md:col-span-5 bg-[#0A192F] text-white rounded-2xl p-6 sm:p-8 space-y-6 shadow-md">
            <div>
              <p className="text-xs font-mono-tabular text-[#D4AF37] font-semibold tracking-wide uppercase">
                STUDENT & BOOKSTORE SUPPORT
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold mt-1">Contact Us</h1>
              <p className="text-xs text-slate-300 leading-relaxed mt-2">
                Have questions about course syllabus details, bulk textbook orders, or order status? Reach out to our
                publishing and student support desk.
              </p>
            </div>

            {/* Official Entity Card */}
            <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-2 text-xs">
              <p className="text-[#D4AF37] font-semibold uppercase tracking-wider text-[11px]">
                Legal & Operating Entity
              </p>
              <p className="font-bold text-white text-sm">{BUSINESS_COMPLIANCE_INFO.tradeName}</p>
              <p className="text-slate-300">
                <strong>Legal Name:</strong> {BUSINESS_COMPLIANCE_INFO.legalName}
              </p>
              <p className="text-slate-300">
                <strong>Operated by:</strong> {BUSINESS_COMPLIANCE_INFO.legalName}
              </p>
            </div>

            {/* Contact Details List */}
            <div className="space-y-4 text-xs text-slate-200">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-[#D4AF37] shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-white">Full Registered Address:</strong>
                  <span className="text-slate-300 leading-relaxed block mt-0.5">
                    {BUSINESS_COMPLIANCE_INFO.registeredAddress}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-[#D4AF37] shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-white">Email Address:</strong>
                  <a
                    href={`mailto:${BUSINESS_COMPLIANCE_INFO.supportEmail}`}
                    className="text-[#D4AF37] hover:underline block mt-0.5"
                  >
                    {BUSINESS_COMPLIANCE_INFO.supportEmail}
                  </a>
                  <span className="text-slate-400 text-[11px] block mt-0.5">
                    Direct admin: {BUSINESS_COMPLIANCE_INFO.ownerEmail}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Phone className="w-5 h-5 text-[#D4AF37] shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-white">Telephone / Helpline:</strong>
                  <span className="text-slate-300 block mt-0.5">{BUSINESS_COMPLIANCE_INFO.supportPhone}</span>
                  <span className="text-slate-400 text-[11px] block">
                    Operating Hours: {BUSINESS_COMPLIANCE_INFO.workingHours}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-[#D4AF37] shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-white">Response Time:</strong>
                  <span className="text-slate-300 block mt-0.5">
                    Support queries are typically answered within 24 business hours.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Inquiry Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!contactName.trim() || !contactEmail.trim() || !contactMessage.trim()) return;
              setContactSubmitted(true);
            }}
            className="md:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-4 shadow-xs"
          >
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#0A192F]">Send an Inquiry</h2>
              <p className="text-xs text-slate-500 mt-1">
                Fill in the form below and our team will get back to you promptly.
              </p>
            </div>

            {contactSubmitted && (
              <div
                role="status"
                className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2.5"
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-semibold">Thank you, {contactName}!</strong>
                  <span>
                    Your inquiry has been successfully received by our support desk. We will reach out to{' '}
                    <strong>{contactEmail}</strong> shortly.
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="contact-name" className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  id="contact-name"
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="e.g. Tarunraj Pediredla"
                  required
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0A192F] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="contact-email" className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Address *
                </label>
                <input
                  id="contact-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0A192F] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="contact-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                  Contact Phone Number
                </label>
                <input
                  id="contact-phone"
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0A192F] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="contact-subject" className="block text-xs font-semibold text-slate-700 mb-1">
                  Order ID or Subject
                </label>
                <input
                  id="contact-subject"
                  type="text"
                  value={contactSubject}
                  onChange={(e) => setContactSubject(e.target.value)}
                  placeholder="e.g. Order #CF_12345 or Course Query"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0A192F] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="contact-msg" className="block text-xs font-semibold text-slate-700 mb-1">
                Your Message / Question *
              </label>
              <textarea
                id="contact-msg"
                rows={4}
                value={contactMessage}
                onChange={(e) => setContactMessage(e.target.value)}
                placeholder="Please describe your inquiry, book delivery question, or course syllabus query in detail..."
                required
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0A192F] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              className="w-full sm:w-auto px-6 py-2.5 bg-[#0A192F] text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors shadow-xs"
            >
              Submit Support Inquiry
            </button>
          </form>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* TAB 3: TERMS & CONDITIONS (Payment Gateway Mandatory Trade Name Statement) */
  /* -------------------------------------------------------------------------- */
  if (page === 'terms') {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 space-y-6 text-sm text-slate-700 leading-relaxed shadow-xs">
          <div>
            <p className="text-xs font-mono-tabular uppercase tracking-wider text-[#B48A1E] font-semibold">
              LEGAL TERMS & USER AGREEMENT
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0A192F] mt-1">
              Terms and Conditions of Use
            </h1>
            <p className="text-xs text-slate-500 mt-1">Last Updated: October 2026</p>
          </div>

          {/* Mandatory Payment Gateway Compliance Highlight */}
          <div className="p-4 bg-amber-50 border-l-4 border-[#D4AF37] rounded-r-xl space-y-1.5 text-xs text-amber-950">
            <p className="font-bold text-sm text-amber-950">
              {BUSINESS_COMPLIANCE_INFO.operatedByStatement}
            </p>
            <p className="text-amber-900 leading-relaxed">
              Trade Name: <strong>{BUSINESS_COMPLIANCE_INFO.tradeName}</strong> | Legal Name:{' '}
              <strong>{BUSINESS_COMPLIANCE_INFO.legalName}</strong> | Registered Address:{' '}
              <strong>{BUSINESS_COMPLIANCE_INFO.registeredAddress}</strong>.
            </p>
          </div>

          <div className="space-y-4 pt-2">
            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">1. Acceptance of Agreement</h2>
              <p>
                By visiting, accessing, or purchasing from this website (
                <code className="font-mono-tabular text-xs bg-slate-100 px-1 py-0.5 rounded">
                  satyaeducationinstitute.vercel.app
                </code>
                ), you agree to be bound by these Terms and Conditions, our Privacy Policy, Return & Refund Policy,
                and Cancellation Policy. If you do not agree with any part of these terms, you must refrain from using
                our website and services.
              </p>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">2. Educational Services & Digital Access</h2>
              <p>
                {BUSINESS_COMPLIANCE_INFO.tradeName} provides online recorded technology courses, digital reference
                books (e-books/PDFs), and physical educational textbooks and storybooks. All courses and digital books
                purchased grant the registered student a personal, non-exclusive, non-transferable license for
                individual educational use. Account sharing, commercial resale, or public broadcasting of our video
                lessons is strictly prohibited.
              </p>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">3. User Accounts and Security</h2>
              <p>
                To access purchased courses, dashboard tools, and digital books, users must create a verified account
                using Firebase Authentication (Google Sign-In or Email/Password). You are responsible for maintaining
                the confidentiality of your login credentials and for all activities that occur under your account.
              </p>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">
                4. Pricing, Currency & Cashfree Payment Gateway
              </h2>
              <p>
                All prices on this website are listed in <strong>Indian Rupees (INR - ₹)</strong> and are inclusive of
                applicable taxes unless explicitly indicated otherwise.
              </p>
              <p className="mt-2">
                All digital and physical transactions are processed through authorized payment aggregators, primarily{' '}
                <strong>Cashfree Payments India Private Limited</strong>. By placing an order, you agree to comply with
                Cashfree’s secure payment checkout protocols. We do not store raw credit/debit card numbers, CVV codes,
                or UPI PINs on our servers.
              </p>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">5. Physical Book Orders & Delivery</h2>
              <p>
                Physical educational textbooks and children’s storybooks are dispatched via recognized Indian courier
                partners within 24–48 business hours and delivered within 4–7 business days across India. Orders of
                ₹999 or above qualify for free standard shipping. Delivery timelines are subject to courier network
                conditions.
              </p>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">6. Intellectual Property Rights</h2>
              <p>
                All course curriculum, recorded video lessons, textbook manuscripts, diagrams, storybook artwork,
                software source code, and website branding are the exclusive intellectual property of{' '}
                <strong>{BUSINESS_COMPLIANCE_INFO.legalName}</strong> and{' '}
                <strong>{BUSINESS_COMPLIANCE_INFO.tradeName}</strong>, protected under the Copyright Act, 1957 of India.
                Unauthorized duplication, reproduction, or distribution is subject to legal action.
              </p>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">7. Return, Refund & Cancellation Rights</h2>
              <p>
                All purchases are covered under our dedicated <strong>Return & Refund Policy</strong> (7 days return for
                damaged physical books; 7 days money-back for courses under 20% viewed) and{' '}
                <strong>Cancellation Policy</strong> (cancellation within 24 hours of ordering or before dispatch).
                Approved refunds are processed back to the original source account via Cashfree Payments within 5 to 7
                business days.
              </p>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">8. Disclaimers & Limitation of Liability</h2>
              <p>
                Our educational courses and textbooks are created with professional rigor to provide high-quality
                software engineering knowledge. However, {BUSINESS_COMPLIANCE_INFO.tradeName} does not guarantee
                specific employment offers, salaries, or examination results. In no event shall our liability exceed
                the total fee paid by the customer for the specific product in dispute.
              </p>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">9. Governing Law & Jurisdiction</h2>
              <p>
                These Terms and Conditions shall be governed by and construed in accordance with the laws of India. Any
                dispute, controversy, or claim arising out of or relating to these terms shall be subject to the
                exclusive jurisdiction of the competent courts in <strong>Visakhapatnam, Andhra Pradesh, India</strong>.
              </p>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">10. Grievance Officer & Contact</h2>
              <p>
                In accordance with the Information Technology Act, 2000 and rules made thereunder, the Grievance
                Officer for the purpose of this website is:
              </p>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1 mt-2">
                <p>
                  <strong>Grievance Officer:</strong> {BUSINESS_COMPLIANCE_INFO.legalName}
                </p>
                <p>
                  <strong>Entity:</strong> {BUSINESS_COMPLIANCE_INFO.tradeName}
                </p>
                <p>
                  <strong>Address:</strong> {BUSINESS_COMPLIANCE_INFO.registeredAddress}
                </p>
                <p>
                  <strong>Email:</strong> {BUSINESS_COMPLIANCE_INFO.supportEmail}
                </p>
                <p>
                  <strong>Phone:</strong> {BUSINESS_COMPLIANCE_INFO.supportPhone}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* TAB 4: PRIVACY POLICY (PCI-DSS & Cashfree Data Compliance)                 */
  /* -------------------------------------------------------------------------- */
  if (page === 'privacy') {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 space-y-6 text-sm text-slate-700 leading-relaxed shadow-xs">
          <div>
            <p className="text-xs font-mono-tabular uppercase tracking-wider text-[#B48A1E] font-semibold">
              DATA SECURITY & PRIVACY
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0A192F] mt-1">
              Privacy Policy
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Compliant with Information Technology Act, 2000 & SPDI Rules · Last Updated: October 2026
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
            <p className="font-bold text-slate-900">
              {BUSINESS_COMPLIANCE_INFO.operatedByStatement}
            </p>
            <p className="text-slate-600">
              We respect your privacy and are committed to protecting personally identifiable information through
              industry-standard cloud security and secure payment gateways.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">1. Information We Collect</h2>
              <p>When you register, enroll in a course, or purchase a textbook on our platform, we collect:</p>
              <ul className="list-disc pl-5 mt-1.5 space-y-1 text-xs text-slate-600">
                <li>
                  <strong>Personal Identity Details:</strong> Full Name, Email Address, and Phone Number.
                </li>
                <li>
                  <strong>Shipping Details (for physical book orders):</strong> Recipient Name, Street Address, City,
                  State, and Postal PIN Code.
                </li>
                <li>
                  <strong>Order & Entitlement History:</strong> Purchased course IDs, textbook order IDs, payment status,
                  and lesson completion progress.
                </li>
              </ul>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">
                2. Zero Raw Card Storage & Cashfree Payment Security
              </h2>
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-950 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-emerald-900">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>PCI-DSS Level 1 Compliant Payments via Cashfree</span>
                </div>
                <p className="leading-relaxed">
                  <strong>{BUSINESS_COMPLIANCE_INFO.tradeName} never collects, stores, or processes raw credit or debit
                  card numbers, CVV codes, net banking passwords, or UPI PINs.</strong>
                </p>
                <p className="leading-relaxed">
                  All monetary transactions are handled securely by <strong>Cashfree Payments India Private Limited</strong>,
                  an RBI-licensed Payment Aggregator. Only payment session tokens, Cashfree Order IDs, and payment
                  verification statuses are stored on our database to confirm your access to purchased materials.
                </p>
              </div>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">3. Cloud Firestore Data Isolation</h2>
              <p>
                All student profile information, book shipping addresses, and order histories are stored in Google Cloud
                Firestore under strict database isolation rules (
                <code className="font-mono-tabular text-xs bg-slate-100 px-1 py-0.5 rounded">
                  resource.data.userId == request.auth.uid
                </code>
                ). No student can view, search, or access another customer’s personal information or order records.
              </p>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">4. How We Use Your Information</h2>
              <ul className="list-disc pl-5 mt-1.5 space-y-1 text-xs text-slate-600">
                <li>To grant instant access to purchased video courses and digital books on your dashboard.</li>
                <li>To dispatch and deliver physical hardcover textbooks to your shipping address via our courier partners.</li>
                <li>To send transactional receipts, order confirmation emails, and delivery tracking updates.</li>
                <li>To provide dedicated student and bookstore customer support.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">5. Cookies and Local State</h2>
              <p>
                We use secure local session tokens strictly for authentication persistence and shopping cart state. We do
                not use third-party behavioral advertising tracking cookies.
              </p>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">6. User Rights & Data Deletion</h2>
              <p>
                Under applicable Indian data protection guidelines, you have the right to request access to your personal
                data, correct any inaccuracies, or request the deletion of your account. To request data deletion, contact
                our privacy desk at{' '}
                <a href={`mailto:${BUSINESS_COMPLIANCE_INFO.supportEmail}`} className="text-[#0A192F] font-semibold underline">
                  {BUSINESS_COMPLIANCE_INFO.supportEmail}
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* TAB 5: RETURN & REFUND POLICY (Duration: 7 Days | Mode: Cashfree Source)   */
  /* -------------------------------------------------------------------------- */
  if (page === 'refund') {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 space-y-6 text-sm text-slate-700 leading-relaxed shadow-xs">
          <div>
            <p className="text-xs font-mono-tabular uppercase tracking-wider text-[#B48A1E] font-semibold">
              TRANSPARENT STORE POLICY
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0A192F] mt-1">
              Return & Refund Policy
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Official return window, duration, and refund mode guidelines for {BUSINESS_COMPLIANCE_INFO.tradeName}.
            </p>
          </div>

          {/* Quick Metrics Badges for Payment Gateway Reviewers */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
              <span className="text-slate-500 font-medium block">Return & Refund Duration</span>
              <span className="font-bold text-[#0A192F] text-sm block">7 Calendar Days</span>
              <span className="text-[11px] text-slate-500">From delivery or purchase date</span>
            </div>
            <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
              <span className="text-slate-500 font-medium block">Refund Mode</span>
              <span className="font-bold text-[#0A192F] text-sm block">Original Source Account</span>
              <span className="text-[11px] text-slate-500">Via Cashfree (Bank / UPI / Card)</span>
            </div>
            <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
              <span className="text-slate-500 font-medium block">Settlement Duration</span>
              <span className="font-bold text-[#0A192F] text-sm block">5 to 7 Working Days</span>
              <span className="text-[11px] text-slate-500">Credited to customer bank account</span>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">
                1. Physical Textbooks & Storybooks (Return & Replacement)
              </h2>
              <p>
                <strong>Duration:</strong> Customers may report damaged, misprinted, or defective physical books within{' '}
                <strong>{BUSINESS_COMPLIANCE_INFO.returnDurationDays} days of delivery</strong>.
              </p>
              <p className="mt-1.5">
                If your book arrives with physical transit damage, torn binding, missing pages, or incorrect titles,
                contact us with your Order ID and photographic evidence. You may choose between:
              </p>
              <ul className="list-disc pl-5 mt-1.5 space-y-1 text-xs text-slate-600">
                <li>
                  <strong>Free Replacement:</strong> A brand-new replacement copy shipped at zero additional shipping
                  fee.
                </li>
                <li>
                  <strong>100% Full Refund:</strong> A complete refund credited to your original payment method.
                </li>
              </ul>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">
                2. Digital Recorded Courses & E-Books (Refund Policy)
              </h2>
              <p>
                <strong>Duration:</strong> Digital course refund requests must be submitted within{' '}
                <strong>{BUSINESS_COMPLIANCE_INFO.returnDurationDays} days of enrollment</strong>.
              </p>
              <p className="mt-1.5">
                Because digital course video recordings and downloadable notes unlock immediately upon verified payment,
                refund requests for courses are honored if:
              </p>
              <ul className="list-disc pl-5 mt-1.5 space-y-1 text-xs text-slate-600">
                <li>Less than 20% of the total course video curriculum has been viewed; AND</li>
                <li>Downloadable course source code repositories and PDF notes have not been downloaded.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">
                3. Refund Mode & Settlement Duration
              </h2>
              <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-950 space-y-2">
                <p>
                  <strong>Refund Mode:</strong> All approved refunds are processed exclusively to the{' '}
                  <strong>original payment method</strong> (Bank Account, UPI ID, Credit Card, or Debit Card) through{' '}
                  <strong>Cashfree Payment Gateway</strong>. We do not issue cash refunds or non-transferable coupons.
                </p>
                <p>
                  <strong>Settlement Duration:</strong> Once a refund is approved by our support desk, the refund is
                  initiated through Cashfree within 24–48 hours. The amount will reflect in your bank account or card
                  statement within <strong>{BUSINESS_COMPLIANCE_INFO.refundTurnaroundDays}</strong>, depending on your
                  issuing bank’s settlement cycle.
                </p>
              </div>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">4. How to Request a Refund</h2>
              <p>To request a return or refund, follow these simple steps:</p>
              <ol className="list-decimal pl-5 mt-1.5 space-y-1 text-xs text-slate-600">
                <li>
                  Send an email to{' '}
                  <a href={`mailto:${BUSINESS_COMPLIANCE_INFO.supportEmail}`} className="text-[#0A192F] font-semibold underline">
                    {BUSINESS_COMPLIANCE_INFO.supportEmail}
                  </a>{' '}
                  with the subject line <strong>“Refund Request - [Your Order ID]”</strong>.
                </li>
                <li>Include your registered email address, contact phone number, and reason for the refund request.</li>
                <li>For physical book returns, please attach clear photos of the damaged packaging and book pages.</li>
                <li>
                  Our support desk will review and confirm your refund status within 24 business hours.
                </li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* TAB 6: CANCELLATION POLICY (Duration: Within 24 Hours / Before Dispatch)   */
  /* -------------------------------------------------------------------------- */
  if (page === 'cancellation') {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 space-y-6 text-sm text-slate-700 leading-relaxed shadow-xs">
          <div>
            <p className="text-xs font-mono-tabular uppercase tracking-wider text-[#B48A1E] font-semibold">
              ORDER MANAGEMENT POLICY
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0A192F] mt-1">
              Cancellation Policy
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Clear timelines, duration, and cancellation procedure for {BUSINESS_COMPLIANCE_INFO.tradeName}.
            </p>
          </div>

          {/* Quick Metrics Badges for Payment Gateway Reviewers */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
              <span className="text-slate-500 font-medium block">Cancellation Window</span>
              <span className="font-bold text-[#0A192F] text-sm block">Within 24 Hours</span>
              <span className="text-[11px] text-slate-500">Or prior to warehouse dispatch</span>
            </div>
            <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
              <span className="text-slate-500 font-medium block">Cancellation Fee</span>
              <span className="font-bold text-emerald-700 text-sm block">₹0 (Zero Charges)</span>
              <span className="text-[11px] text-slate-500">100% full refund on eligible orders</span>
            </div>
            <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
              <span className="text-slate-500 font-medium block">Refund Settlement</span>
              <span className="font-bold text-[#0A192F] text-sm block">5 to 7 Business Days</span>
              <span className="text-[11px] text-slate-500">Via Cashfree original source</span>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">
                1. Physical Textbook & Storybook Order Cancellation
              </h2>
              <p>
                <strong>Duration / Timeline:</strong> Orders for physical printed books can be cancelled within{' '}
                <strong>{BUSINESS_COMPLIANCE_INFO.cancellationDurationHours} hours of order placement</strong>, or
                prior to the package being dispatched from our publishing fulfillment center, whichever occurs first.
              </p>
              <p className="mt-1.5 text-xs text-slate-600">
                Once a consignment has been handed over to the courier partner and a tracking number generated, the
                order cannot be cancelled in transit. However, you can utilize our 7-day Return & Refund Policy upon
                delivery.
              </p>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">
                2. Digital Course Registration Cancellation
              </h2>
              <p>
                <strong>Duration / Timeline:</strong> Course enrollments can be cancelled within{' '}
                <strong>{BUSINESS_COMPLIANCE_INFO.cancellationDurationHours} hours of purchase</strong>, provided zero
                video lessons have been streamed or downloaded.
              </p>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">3. Zero Cancellation Penalty</h2>
              <p>
                There are <strong>no cancellation fees or administrative penalties</strong>. If an order is cancelled
                within the eligible cancellation duration, 100% of the transaction amount is refunded.
              </p>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">4. Refund Processing on Cancellation</h2>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
                <p>
                  Upon receiving your cancellation request, the order status is updated to <em>Cancelled</em> in our
                  system, and an automated refund request is submitted through{' '}
                  <strong>Cashfree Payment Gateway</strong>.
                </p>
                <p>
                  The refund will be credited directly to your original payment source (Bank Account, UPI, Debit Card,
                  or Credit Card) within <strong>{BUSINESS_COMPLIANCE_INFO.refundTurnaroundDays}</strong>.
                </p>
              </div>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">5. How to Submit a Cancellation Request</h2>
              <p>To cancel an order, please contact our support desk immediately:</p>
              <ul className="list-disc pl-5 mt-1.5 space-y-1 text-xs text-slate-600">
                <li>
                  Email:{' '}
                  <a href={`mailto:${BUSINESS_COMPLIANCE_INFO.supportEmail}`} className="text-[#0A192F] font-semibold underline">
                    {BUSINESS_COMPLIANCE_INFO.supportEmail}
                  </a>{' '}
                  with the subject <strong>“Order Cancellation - [Your Order ID]”</strong>.
                </li>
                <li>
                  Phone Helpline:{' '}
                  <span className="font-semibold text-slate-800">{BUSINESS_COMPLIANCE_INFO.supportPhone}</span> (Mon–Sat,
                  9 AM – 6 PM IST).
                </li>
                <li>
                  Online Form: Submit an inquiry via our{' '}
                  <span className="font-semibold text-slate-800">Contact Us</span> page with your Order Reference.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* TAB 7: SHIPPING & DELIVERY POLICY (Physical Educational Books)             */
  /* -------------------------------------------------------------------------- */
  if (page === 'shipping') {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 space-y-6 text-sm text-slate-700 leading-relaxed shadow-xs">
          <div>
            <p className="text-xs font-mono-tabular uppercase tracking-wider text-[#B48A1E] font-semibold">
              DOMESTIC FULFILLMENT & LOGISTICS
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0A192F] mt-1">
              Shipping & Delivery Policy (Physical Books)
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Nationwide delivery guidelines for {BUSINESS_COMPLIANCE_INFO.tradeName}.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
              <span className="text-slate-500 font-medium block">Dispatch Window</span>
              <span className="font-bold text-[#0A192F] text-sm block">24 to 48 Hours</span>
              <span className="text-[11px] text-slate-500">From order confirmation</span>
            </div>
            <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
              <span className="text-slate-500 font-medium block">Delivery Timeline</span>
              <span className="font-bold text-[#0A192F] text-sm block">4 to 7 Business Days</span>
              <span className="text-[11px] text-slate-500">Across serviceable Indian pin codes</span>
            </div>
            <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
              <span className="text-slate-500 font-medium block">Free Shipping</span>
              <span className="font-bold text-[#0A192F] text-sm block">Orders ₹999 & Above</span>
              <span className="text-[11px] text-slate-500">Flat ₹79 fee on smaller orders</span>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">1. Dispatch & Transit Timeline</h2>
              <p>
                All physical hardcover educational textbooks and children’s storybooks are carefully packaged and
                dispatched from our publishing fulfillment hub within <strong>24 to 48 business hours</strong> of payment
                confirmation. Standard delivery across India typically takes <strong>4 to 7 business days</strong>.
              </p>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">2. Shipping Charges</h2>
              <ul className="list-disc pl-5 mt-1.5 space-y-1 text-xs text-slate-600">
                <li>
                  <strong>Free Shipping:</strong> All book orders with a cart subtotal of <strong>₹999 or above</strong>{' '}
                  qualify for 100% free delivery across India.
                </li>
                <li>
                  <strong>Standard Flat Shipping:</strong> Physical book orders below ₹999 incur a nominal flat shipping
                  and handling fee of <strong>₹79</strong>.
                </li>
                <li>
                  <strong>Digital Courses & E-Books:</strong> Digital products have zero shipping fees and are delivered
                  instantly online.
                </li>
              </ul>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">3. Courier Partners & Tracking</h2>
              <p>
                We partner with reputable domestic courier services including India Post Speed Post, Blue Dart, DTDC,
                and Delhivery. As soon as your order is dispatched, a consignment tracking number and link are sent to
                your registered email address and displayed in your Student Dashboard.
              </p>
            </div>
          </div>
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

