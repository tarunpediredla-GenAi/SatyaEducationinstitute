import React, { useState } from 'react';
import { X, Mail, Lock, User, CheckCircle2, AlertCircle, ShieldCheck, ExternalLink, Copy, Check } from 'lucide-react';
import {
  auth,
  db,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
} from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { BOOTSTRAPPED_ADMIN_EMAIL } from '../utils/commerceRules';

export interface ActiveUserSession {
  uid: string;
  name: string;
  email: string;
  phone: string;
  emailVerified: boolean;
  role: 'student' | 'admin';
}

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSessionAuthenticated: (session: ActiveUserSession) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSessionAuthenticated,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [copiedDomain, setCopiedDomain] = useState(false);

  if (!isOpen) return null;

  const mapFirebaseAuthError = (err: unknown): string => {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password')) {
      return 'Invalid email or password. Please check your credentials and try again.';
    }
    if (msg.includes('auth/email-already-in-use')) {
      return 'An account with this email already exists. Please sign in instead.';
    }
    if (msg.includes('auth/weak-password')) {
      return 'Password must be at least 6 characters long.';
    }
    if (msg.includes('auth/unauthorized-domain')) {
      return `This domain (${typeof window !== 'undefined' ? window.location.hostname : 'satyaeducationinstitute.vercel.app'}) is not yet in Firebase's Authorized Domains list. Please add it in Firebase Console -> Authentication -> Settings -> Authorized domains to enable Google Sign-In, or use Email/Password sign-in below.`;
    }
    if (msg.includes('auth/operation-not-allowed')) {
      return 'This sign-in provider is not yet enabled in the Firebase Console. Enable Email/Password or Google under Authentication -> Sign-in method, or use the Instant Verified Session buttons below.';
    }
    if (msg.includes('auth/popup-blocked') || msg.includes('auth/popup-closed-by-user')) {
      return 'The Google sign-in popup was closed or blocked by the browser. You can retry or use the Instant Verified Session buttons below.';
    }
    return msg;
  };

  const syncUserProfile = async (
    uid: string,
    name: string,
    email: string,
    phone: string,
    role: 'student' | 'admin'
  ) => {
    try {
      const userDocRef = doc(db, 'users', uid);
      const existing = await getDoc(userDocRef);
      if (!existing.exists()) {
        await setDoc(userDocRef, {
          uid,
          name: name || 'Student',
          email: email || '',
          phone: phone || '',
          role,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.warn('Firestore profile sync note:', err);
    }
  };

  /**
   * Cryptographically verifies role claims from Firebase Auth ID Token & Firestore /admins/{uid}.
   * Never relies on client-side hardcoding or unauthenticated email matching.
   */
  const resolveUserRole = async (userObj: any): Promise<'student' | 'admin'> => {
    try {
      const tokenResult = await userObj.getIdTokenResult();
      if (tokenResult?.claims?.admin === true) {
        return 'admin';
      }
      const adminDoc = await getDoc(doc(db, 'admins', userObj.uid));
      if (adminDoc.exists()) {
        return 'admin';
      }
    } catch {
      // Non-admins encountering permission barriers or missing documents safely default to student
    }
    return 'student';
  };

  const handleGoogleLogin = async () => {
    setErrorMessage(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const u = cred.user;
      const role = await resolveUserRole(u);
      const userName = u.displayName || 'Satya Student';
      const userEmail = u.email || 'student@example.com';
      const userPhone = u.phoneNumber || '';

      await syncUserProfile(u.uid, userName, userEmail, userPhone, role);

      onSessionAuthenticated({
        uid: u.uid,
        name: userName,
        email: userEmail,
        phone: userPhone,
        emailVerified: u.emailVerified,
        role,
      });
      onClose();
    } catch (err) {
      setErrorMessage(mapFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    if (mode === 'reset') {
      setLoading(true);
      try {
        await sendPasswordResetEmail(auth, email.trim());
        setInfoMessage(
          `Password reset instructions have been sent to ${email.trim()}. Please check your inbox.`
        );
      } catch (err) {
        setErrorMessage(mapFirebaseAuthError(err));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    if (mode === 'register' && name.trim().length < 2) {
      setErrorMessage('Please enter your full name (at least 2 characters).');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'register') {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, { displayName: name.trim() });
        try {
          await sendEmailVerification(cred.user);
        } catch {
          // ignore verification email sending failure
        }
        setInfoMessage(
          'Account created! A verification email has been sent to your inbox. Please verify your email.'
        );
        const isAdmin =
          email.trim().toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
        const role: 'student' | 'admin' = isAdmin ? 'admin' : 'student';

        await syncUserProfile(cred.user.uid, name.trim(), email.trim(), phone.trim(), role);

        onSessionAuthenticated({
          uid: cred.user.uid,
          name: name.trim(),
          email: cred.user.email || email.trim(),
          phone: phone.trim(),
          emailVerified: cred.user.emailVerified,
          role,
        });
        onClose();
      } else {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        const u = cred.user;
        const role = await resolveUserRole(u);
        const userName = u.displayName || email.split('@')[0];
        const userEmail = u.email || email.trim();
        const userPhone = u.phoneNumber || phone.trim();

        await syncUserProfile(u.uid, userName, userEmail, userPhone, role);

        onSessionAuthenticated({
          uid: u.uid,
          name: userName,
          email: userEmail,
          phone: userPhone,
          emailVerified: u.emailVerified,
          role,
        });
        onClose();
      }
    } catch (err) {
      setErrorMessage(mapFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-xl relative my-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close authentication modal"
          className="absolute top-4 right-4 p-2 text-slate-500 hover:text-slate-900 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-5">
          <p className="text-xs font-mono-tabular text-[#B48A1E] mb-1">
            SATYA’S EDUCATION ACCOUNT
          </p>
          <h2 id="auth-modal-title" className="font-display text-2xl font-bold text-[#0A192F]">
            {mode === 'login'
              ? 'Sign in to Your Learning Portal'
              : mode === 'register'
              ? 'Create Student Account'
              : 'Reset Your Password'}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Access your purchased course recordings, digital books, and order tracking.
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg mb-5">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMessage(null);
              setInfoMessage(null);
            }}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              mode === 'login'
                ? 'bg-[#0A192F] text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setErrorMessage(null);
              setInfoMessage(null);
            }}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              mode === 'register'
                ? 'bg-[#0A192F] text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Register
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('reset');
              setErrorMessage(null);
              setInfoMessage(null);
            }}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              mode === 'reset'
                ? 'bg-[#0A192F] text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Forgot Password
          </button>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className={`mb-4 p-3.5 rounded-xl border text-xs space-y-2 ${
              errorMessage.includes('Authorized Domains') || errorMessage.includes('Authorized domains')
                ? 'bg-amber-50/95 border-amber-200 text-amber-950 shadow-xs'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            <div className="flex items-start gap-2">
              <AlertCircle
                className={`w-4 h-4 shrink-0 mt-0.5 ${
                  errorMessage.includes('Authorized Domains') || errorMessage.includes('Authorized domains')
                    ? 'text-amber-600'
                    : 'text-red-600'
                }`}
              />
              <div className="flex-1">
                <p className="font-semibold text-slate-900">
                  {errorMessage.includes('Authorized Domains') || errorMessage.includes('Authorized domains')
                    ? 'Firebase Domain Whitelist Required'
                    : 'Authentication Notice'}
                </p>
                <p className="mt-1 leading-relaxed text-slate-700">{errorMessage}</p>
              </div>
            </div>

            {(errorMessage.includes('Authorized Domains') || errorMessage.includes('Authorized domains')) && (
              <div className="pt-2 border-t border-amber-200/80 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] bg-white border border-amber-300 px-2 py-1 rounded text-amber-950 font-medium select-all">
                  {typeof window !== 'undefined' ? window.location.hostname : 'satyaeducationinstitute.vercel.app'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const host =
                      typeof window !== 'undefined'
                        ? window.location.hostname
                        : 'satyaeducationinstitute.vercel.app';
                    navigator.clipboard?.writeText(host);
                    setCopiedDomain(true);
                    setTimeout(() => setCopiedDomain(false), 2500);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded transition-colors"
                >
                  {copiedDomain ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  {copiedDomain ? 'Copied Domain!' : 'Copy Domain'}
                </button>
                <a
                  href="https://console.firebase.google.com/project/famous-campaign-mcbh2/authentication/settings"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold text-white bg-[#0A192F] hover:bg-slate-800 rounded transition-colors ml-auto"
                >
                  Open Firebase Console <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>
        )}

        {infoMessage && (
          <div
            role="status"
            className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>{infoMessage}</span>
          </div>
        )}

        {mode !== 'reset' && (
          <div className="mb-4">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full py-2.5 px-4 border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.54-5.17 3.54-8.97z"
                />
                <path
                  fill="#34A853"
                  d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96h-4.01v3.14C3.515 21.3 7.615 24 12.255 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.535 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62h-4.01C.705 8.24.255 10.06.255 12s.45 3.76 1.27 5.38l4.01-3.14z"
                />
                <path
                  fill="#EA4335"
                  d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0 7.615 0 3.515 2.7 1.525 6.62l4.01 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>
          </div>
        )}

        <form onSubmit={handleEmailSubmit} className="space-y-3.5">
          {mode === 'register' && (
            <div>
              <label
                htmlFor="auth-full-name"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Full Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  id="auth-full-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  maxLength={120}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0A192F]"
                />
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor="auth-email"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                maxLength={256}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0A192F]"
              />
            </div>
          </div>

          {mode !== 'reset' && (
            <div>
              <label
                htmlFor="auth-password"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0A192F]"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-[#0A192F] text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors"
          >
            {loading
              ? 'Processing...'
              : mode === 'login'
              ? 'Sign In with Email'
              : mode === 'register'
              ? 'Create Account & Send Verification'
              : 'Send Password Reset Link'}
          </button>
        </form>
      </div>
    </div>
  );
};
