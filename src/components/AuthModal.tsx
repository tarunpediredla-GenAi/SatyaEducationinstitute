import React, { useEffect, useState } from 'react';
import { X, Mail, Lock, User, CheckCircle2, AlertCircle, Phone } from 'lucide-react';
import {
  auth,
  db,
  doc,
  getDoc,
  setDoc,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  type FirebaseUser,
} from '../firebase';

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
  initialMode?: 'login' | 'register' | 'reset';
  onClose: () => void;
  onSessionAuthenticated: (session: ActiveUserSession) => void;
}

export async function buildAndSyncFirebaseUserSession(
  fbUser: FirebaseUser,
  overrideName?: string,
  overridePhone?: string
): Promise<ActiveUserSession> {
  const email = (fbUser.email || '').trim();
  let resolvedRole: 'student' | 'admin' = 'student';
  let resolvedEmailVerified = Boolean(fbUser.emailVerified);
  let resolvedName = fbUser.displayName || overrideName || email.split('@')[0] || 'Student';
  let resolvedPhone = overridePhone || fbUser.phoneNumber || '';

  // 1. Verify session and role with trusted server-side endpoint using Firebase ID Token
  try {
    const idToken = await fbUser.getIdToken();
    const res = await fetch('/api/auth/session', {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });
    if (res.ok) {
      const serverSession = await res.json();
      if (serverSession.role === 'admin') {
        resolvedRole = 'admin';
      }
      if (typeof serverSession.emailVerified === 'boolean') {
        resolvedEmailVerified = serverSession.emailVerified;
      }
    }
  } catch {
    // Fallback to default 'student' role if offline
  }

  // 2. Sync customer profile with Firestore `/users/{uid}`
  try {
    const userDocRef = doc(db, 'users', fbUser.uid);
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data.role === 'admin') {
        resolvedRole = 'admin';
      }
      if (typeof data.name === 'string' && data.name.trim()) {
        resolvedName = overrideName?.trim() || data.name.trim();
      }
      if (typeof data.phone === 'string' && data.phone.trim()) {
        resolvedPhone = overridePhone?.trim() || data.phone.trim();
      }
      if (overrideName?.trim() || overridePhone?.trim()) {
        await setDoc(
          userDocRef,
          {
            uid: fbUser.uid,
            name: resolvedName.slice(0, 120),
            email: email.slice(0, 256),
            phone: resolvedPhone.slice(0, 40),
            role: data.role === 'admin' ? 'admin' : 'student',
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }
    } else {
      // New customers always receive the 'student' role by default in client writes
      await setDoc(userDocRef, {
        uid: fbUser.uid,
        name: resolvedName.slice(0, 120),
        email: email.slice(0, 256),
        phone: resolvedPhone.slice(0, 40),
        role: 'student',
        updatedAt: new Date().toISOString(),
      });
    }
  } catch {
    // Continue with authenticated Firebase session if Firestore profile read/write is skipped
  }

  return {
    uid: fbUser.uid,
    name: resolvedName,
    email,
    phone: resolvedPhone,
    emailVerified: resolvedEmailVerified,
    role: resolvedRole,
  };
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'login',
  onClose,
  onSessionAuthenticated,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setErrorMessage(null);
      setInfoMessage(null);
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setInfoMessage(null);
    setSubmitting(true);
    try {
      const credential = await signInWithPopup(auth, googleProvider);
      const session = await buildAndSyncFirebaseUserSession(credential.user);
      onSessionAuthenticated(session);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('auth/popup-closed-by-user')) {
        setErrorMessage('Sign-in popup was closed before completing authentication.');
      } else if (msg.includes('auth/unauthorized-domain')) {
        setErrorMessage(
          'This domain is not yet authorized in Firebase Console > Authentication > Settings > Authorized domains.'
        );
      } else {
        setErrorMessage('Unable to sign in with Google right now. Please try again or use Email.');
      }
    } finally {
      setSubmitting(false);
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

    setSubmitting(true);
    try {
      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, email.trim());
        setInfoMessage(
          `Password reset link sent to ${email.trim()}. Please check your inbox.`
        );
        return;
      }

      if (password.length < 6) {
        setErrorMessage('Password must be at least 6 characters.');
        return;
      }

      if (mode === 'register') {
        if (name.trim().length < 2) {
          setErrorMessage('Please enter your full name (at least 2 characters).');
          return;
        }
        const credential = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );
        await updateProfile(credential.user, { displayName: name.trim() });
        try {
          await sendEmailVerification(credential.user);
        } catch {
          // Verification email can also be resent from the Profile dashboard
        }
        const session = await buildAndSyncFirebaseUserSession(
          credential.user,
          name.trim(),
          phone.trim()
        );
        onSessionAuthenticated(session);
        onClose();
        return;
      }

      const credential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      const session = await buildAndSyncFirebaseUserSession(credential.user);
      onSessionAuthenticated(session);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('auth/invalid-credential') ||
        msg.includes('auth/wrong-password') ||
        msg.includes('auth/user-not-found')
      ) {
        setErrorMessage(
          'Invalid email or password. Please verify your credentials or create an account.'
        );
      } else if (msg.includes('auth/email-already-in-use')) {
        setErrorMessage('An account with this email already exists. Please sign in instead.');
      } else if (msg.includes('auth/too-many-requests')) {
        setErrorMessage('Too many attempts. Please wait a moment or reset your password.');
      } else {
        setErrorMessage('Authentication failed. Please check your details and try again.');
      }
    } finally {
      setSubmitting(false);
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

        <div className="flex items-center gap-3 mb-4">
          <img
            src="/logo.png"
            alt="Satya's Education Logo"
            className="w-12 h-12 object-contain rounded-xl border border-slate-200 bg-white p-0.5 shadow-xs shrink-0"
          />
          <div>
            <p className="text-xs font-mono-tabular font-bold tracking-wider text-[#B48A1E]">
              SATYA’S EDUCATION
            </p>
            <p className="text-[11px] text-slate-500 font-medium">
              Official Learning & Reading Portal
            </p>
          </div>
        </div>

        <div className="mb-5">
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
            Log In
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
            Sign Up
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
            className="mb-4 p-3.5 rounded-xl border bg-red-50 border-red-200 text-red-800 text-xs flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
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
              disabled={submitting}
              onClick={handleGoogleSignIn}
              className="w-full py-2.5 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-2xs disabled:opacity-60"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-[11px] uppercase">
                <span className="bg-white px-2 text-slate-400 font-medium">
                  Or continue with email
                </span>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleEmailSubmit} className="space-y-3.5">
          {mode === 'register' && (
            <>
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

              <div>
                <label
                  htmlFor="auth-phone"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Mobile Number (Optional)
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    id="auth-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 9876543210"
                    maxLength={40}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0A192F]"
                  />
                </div>
              </div>
            </>
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
            disabled={submitting}
            className="w-full py-2.5 px-4 bg-[#0A192F] text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-60"
          >
            {submitting
              ? 'Please wait...'
              : mode === 'login'
              ? 'Log In with Email'
              : mode === 'register'
              ? 'Create Student Account'
              : 'Send Password Reset Link'}
          </button>
        </form>
      </div>
    </div>
  );
};
