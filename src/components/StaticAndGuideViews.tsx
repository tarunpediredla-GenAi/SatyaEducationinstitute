import React, { useState } from 'react';
import {
  CheckCircle2,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Building2,
  Clock,
} from 'lucide-react';
import { BUSINESS_COMPLIANCE_INFO } from '../utils/commerceRules';

export type StaticPageType =
  | 'about'
  | 'contact'
  | 'privacy'
  | 'terms'
  | 'refund'
  | 'cancellation';

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

  /* -------------------------------------------------------------------------- */
  /* TAB 1: ABOUT US                                                            */
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
                Online Software Engineering, Cloud & Agentic AI Academy
              </h1>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Verified Educational Institute
            </span>
          </div>

          <p className="text-sm sm:text-base text-slate-700 leading-relaxed">
            <strong>{BUSINESS_COMPLIANCE_INFO.tradeName}</strong> is an independent online technology academy
            dedicated to delivering high-impact, practical software engineering and artificial intelligence courses
            for students and working professionals across India.
          </p>

          <p className="text-sm text-slate-600 leading-relaxed">
            Our mission is to eliminate superficial learning by providing learners with deep, conceptually rigorous
            recorded online courses in Python, Django, React, SQL, Cloud Architecture, DevOps, Generative AI, and
            Agentic AI. Each program is paired with downloadable source code, production architecture notes, and
            hands-on engineering projects.
          </p>

          {/* Three Core Pillars */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
              <div className="w-8 h-8 rounded-lg bg-[#0A192F] text-[#D4AF37] flex items-center justify-center font-bold text-xs">
                01
              </div>
              <h2 className="text-sm font-bold text-[#0A192F]">HD Recorded Courses</h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Structured self-paced video lessons in English and Telugu with instant lifetime access, downloadable
                code notes, and real backend projects.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
              <div className="w-8 h-8 rounded-lg bg-[#0A192F] text-[#D4AF37] flex items-center justify-center font-bold text-xs">
                02
              </div>
              <h2 className="text-sm font-bold text-[#0A192F]">Production AI & Cloud Tracks</h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                In-depth specialization tracks covering AWS DevOps, PostgreSQL optimization, Generative AI pipelines,
                and deterministic Agentic AI systems.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
              <div className="w-8 h-8 rounded-lg bg-[#0A192F] text-[#D4AF37] flex items-center justify-center font-bold text-xs">
                03
              </div>
              <h2 className="text-sm font-bold text-[#0A192F]">Dedicated Student Portal</h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Stream protected 1080p course recordings directly from your private Student Dashboard with saved module
                completion tracking.
              </p>
            </div>
          </div>

          <div className="p-5 bg-amber-50/60 border border-amber-200 rounded-xl space-y-2">
            <h2 className="text-sm font-bold text-amber-950 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#B48A1E]" />
              Transparent Pricing & Direct Access
            </h2>
            <p className="text-xs text-amber-900 leading-relaxed">
              All online courses are priced transparently in <strong>Indian Rupees (INR - ₹)</strong> across
              career-focused tiers starting from ₹10,000, with one-time enrollment and zero hidden recurring fees.
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
                <span className="text-slate-500 block">Registered Office Address</span>
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
  /* TAB 2: CONTACT US                                                          */
  /* -------------------------------------------------------------------------- */
  if (page === 'contact') {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          <div className="md:col-span-5 bg-[#0A192F] text-white rounded-2xl p-6 sm:p-8 space-y-6 shadow-md">
            <div>
              <p className="text-xs font-mono-tabular text-[#D4AF37] font-semibold tracking-wide uppercase">
                STUDENT & COURSE SUPPORT
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold mt-1">Contact Us</h1>
              <p className="text-xs text-slate-300 leading-relaxed mt-2">
                Have questions about course syllabus details, enrollment assistance, or team training programs? Reach
                out to our academic support desk.
              </p>
            </div>

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
                  placeholder="e.g. Order #ORD_12345 or Course Query"
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
                placeholder="Please describe your inquiry, course syllabus question, or enrollment assistance request in detail..."
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
  /* TAB 3: TERMS & CONDITIONS                                                  */
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
                By visiting, accessing, or enrolling on this website, you agree to be bound by these Terms and
                Conditions, our Privacy Policy, Refund Policy, and Cancellation Policy. If you do not agree with any
                part of these terms, you must refrain from using our website and services.
              </p>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">2. Online Course Access & License</h2>
              <p>
                {BUSINESS_COMPLIANCE_INFO.tradeName} exclusively provides online recorded technology courses and
                accompanying lesson notes. Every enrolled course grants the registered student a personal,
                non-exclusive, non-transferable license for individual educational use. Account sharing, commercial
                resale, or public broadcasting of our video lessons is strictly prohibited.
              </p>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">3. User Accounts and Security</h2>
              <p>
                To access enrolled courses and dashboard tools, users must sign in to their student account. You are
                responsible for maintaining the confidentiality of your login credentials and for all activities that
                occur under your account.
              </p>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">4. Pricing & Currency</h2>
              <p>
                All course fees on this website are listed in <strong>Indian Rupees (INR - ₹)</strong> and are
                inclusive of applicable taxes unless explicitly indicated otherwise. Access to enrolled online courses
                is delivered digitally and instantaneously upon verified payment confirmation.
              </p>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">5. Intellectual Property Rights</h2>
              <p>
                All course curriculum, recorded video lessons, architecture diagrams, lesson notes, software source
                code, and website branding are the exclusive intellectual property of{' '}
                <strong>{BUSINESS_COMPLIANCE_INFO.legalName}</strong> and{' '}
                <strong>{BUSINESS_COMPLIANCE_INFO.tradeName}</strong>, protected under the Copyright Act, 1957 of India.
              </p>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">6. Governing Law & Jurisdiction</h2>
              <p>
                These Terms and Conditions shall be governed by and construed in accordance with the laws of India. Any
                dispute, controversy, or claim arising out of or relating to these terms shall be subject to the
                exclusive jurisdiction of the competent courts in <strong>Visakhapatnam, Andhra Pradesh, India</strong>.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* TAB 4: PRIVACY POLICY                                                      */
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
              Compliant with Information Technology Act, 2000 · Last Updated: October 2026
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
            <p className="font-bold text-slate-900">
              {BUSINESS_COMPLIANCE_INFO.operatedByStatement}
            </p>
            <p className="text-slate-600">
              We respect your privacy and are committed to protecting your personal information.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">1. Information We Collect</h2>
              <p>When you register or enroll in an online course on our platform, we collect:</p>
              <ul className="list-disc pl-5 mt-1.5 space-y-1 text-xs text-slate-600">
                <li>
                  <strong>Personal Identity Details:</strong> Full Name, Email Address, and Phone Number.
                </li>
                <li>
                  <strong>Enrollment & Learning Progress:</strong> Enrolled course IDs, verified order references, and
                  lesson completion progress.
                </li>
              </ul>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">2. How We Use Your Information</h2>
              <ul className="list-disc pl-5 mt-1.5 space-y-1 text-xs text-slate-600">
                <li>To grant instant digital access to enrolled online video courses in your Student Dashboard.</li>
                <li>To save your module completion status and deliver syllabus updates.</li>
                <li>To provide dedicated student enrollment and technical support.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">3. User Rights & Data Deletion</h2>
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
  /* TAB 5: RETURN & REFUND POLICY                                              */
  /* -------------------------------------------------------------------------- */
  if (page === 'refund') {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 space-y-6 text-sm text-slate-700 leading-relaxed shadow-xs">
          <div>
            <p className="text-xs font-mono-tabular uppercase tracking-wider text-[#B48A1E] font-semibold">
              TRANSPARENT ENROLLMENT POLICY
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0A192F] mt-1">
              Refund Policy
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Official refund window, eligibility, and settlement guidelines for {BUSINESS_COMPLIANCE_INFO.tradeName}.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
              <span className="text-slate-500 font-medium block">Refund Window</span>
              <span className="font-bold text-[#0A192F] text-sm block">7 Calendar Days</span>
              <span className="text-[11px] text-slate-500">From date of course enrollment</span>
            </div>
            <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
              <span className="text-slate-500 font-medium block">Refund Mode</span>
              <span className="font-bold text-[#0A192F] text-sm block">Original Source Account</span>
              <span className="text-[11px] text-slate-500">Bank / UPI / Card</span>
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
                1. Online Recorded Courses Refund Eligibility
              </h2>
              <p>
                <strong>Duration:</strong> Online course refund requests must be submitted within{' '}
                <strong>{BUSINESS_COMPLIANCE_INFO.returnDurationDays} days of enrollment</strong>, provided less than 20%
                of the total course video curriculum has been viewed.
              </p>
            </div>

            <div>
              <h2 className="text-base font-bold text-[#0A192F] mb-1">2. How to Request a Refund</h2>
              <p>
                Send an email to{' '}
                <a href={`mailto:${BUSINESS_COMPLIANCE_INFO.supportEmail}`} className="text-[#0A192F] font-semibold underline">
                  {BUSINESS_COMPLIANCE_INFO.supportEmail}
                </a>{' '}
                with the subject line <strong>“Refund Request - [Your Order ID]”</strong>. Our support desk will review
                and confirm your refund status within 24 business hours.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* TAB 6: CANCELLATION POLICY                                                 */
  /* -------------------------------------------------------------------------- */
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 space-y-6 text-sm text-slate-700 leading-relaxed shadow-xs">
        <div>
          <p className="text-xs font-mono-tabular uppercase tracking-wider text-[#B48A1E] font-semibold">
            ENROLLMENT MANAGEMENT POLICY
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0A192F] mt-1">
            Cancellation Policy
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Clear timelines, duration, and cancellation procedure for {BUSINESS_COMPLIANCE_INFO.tradeName}.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
          <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
            <span className="text-slate-500 font-medium block">Cancellation Window</span>
            <span className="font-bold text-[#0A192F] text-sm block">Within 24 Hours</span>
            <span className="text-[11px] text-slate-500">Before streaming paid lessons</span>
          </div>
          <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
            <span className="text-slate-500 font-medium block">Cancellation Fee</span>
            <span className="font-bold text-emerald-700 text-sm block">₹0 (Zero Charges)</span>
            <span className="text-[11px] text-slate-500">100% full refund on eligible enrollments</span>
          </div>
          <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
            <span className="text-slate-500 font-medium block">Refund Settlement</span>
            <span className="font-bold text-[#0A192F] text-sm block">5 to 7 Business Days</span>
            <span className="text-[11px] text-slate-500">Credited to original source</span>
          </div>
        </div>

        <div className="space-y-4 pt-2">
          <div>
            <h2 className="text-base font-bold text-[#0A192F] mb-1">
              1. Online Course Enrollment Cancellation
            </h2>
            <p>
              Online course enrollments can be cancelled within{' '}
              <strong>{BUSINESS_COMPLIANCE_INFO.cancellationDurationHours} hours of purchase</strong>, provided zero
              paid video lessons have been streamed or downloaded.
            </p>
          </div>

          <div>
            <h2 className="text-base font-bold text-[#0A192F] mb-1">2. How to Submit a Cancellation Request</h2>
            <p>
              Email{' '}
              <a href={`mailto:${BUSINESS_COMPLIANCE_INFO.supportEmail}`} className="text-[#0A192F] font-semibold underline">
                {BUSINESS_COMPLIANCE_INFO.supportEmail}
              </a>{' '}
              with the subject <strong>“Order Cancellation - [Your Order ID]”</strong> or call{' '}
              <strong>{BUSINESS_COMPLIANCE_INFO.supportPhone}</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
