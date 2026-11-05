import React, { useState } from 'react';
import { X, Mail, Lock, User, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleQuickLogin = (role: 'student' | 'admin') => {
    const session: ActiveUserSession =
      role === 'admin'
        ? {
            uid: 'admin-tarun',
            name: 'Pediredla Tarunraj',
            email: BOOTSTRAPPED_ADMIN_EMAIL,
            phone: '+91 8074080773',
            emailVerified: true,
            role: 'admin',
          }
        : {
            uid: 'student-demo',
            name: 'Ananya Rao',
            email: 'ananya.student@example.com',
            phone: '+91 9876543210',
            emailVerified: true,
            role: 'student',
          };

    onSessionAuthenticated(session);
    onClose();
  };

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    if (mode === 'reset') {
      setInfoMessage(
        `Password reset instructions have been sent to ${email.trim()}. Please check your inbox.`
      );
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

    const normalizedEmail = email.trim().toLowerCase();
    const isAdmin = normalizedEmail === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
    const role: 'student' | 'admin' = isAdmin ? 'admin' : 'student';
    const resolvedName =
      name.trim() || (isAdmin ? 'Pediredla Tarunraj' : email.trim().split('@')[0]);
    const uid = `user_${normalizedEmail.replace(/[^a-z0-9]/g, '_')}`;

    onSessionAuthenticated({
      uid,
      name: resolvedName,
      email: email.trim(),
      phone: phone.trim() || '+91 9876543210',
      emailVerified: true,
      role,
    });
    onClose();
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
          <div className="mb-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQuickLogin('student')}
              className="py-2.5 px-3 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5"
            >
              <User className="w-3.5 h-3.5 text-[#B48A1E]" />
              <span>Quick Student Login</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('admin')}
              className="py-2.5 px-3 border border-[#D4AF37]/50 bg-[#D4AF37]/10 rounded-lg text-xs font-semibold text-[#0A192F] hover:bg-[#D4AF37]/20 transition-colors flex items-center justify-center gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#B48A1E]" />
              <span>Quick Admin Login</span>
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
            className="w-full py-2.5 px-4 bg-[#0A192F] text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors"
          >
            {mode === 'login'
              ? 'Sign In with Email'
              : mode === 'register'
              ? 'Create Student Account'
              : 'Send Password Reset Link'}
          </button>
        </form>
      </div>
    </div>
  );
};
