# Firebase Authentication setup for Satya Education

This branch replaces the unsafe local demo sessions with real Firebase Authentication.

## Firebase Console

1. Open https://console.firebase.google.com/project/famous-campaign-mcbh2/authentication/providers
2. Enable **Email/Password** and **Google** in Sign-in method.
3. Under Authentication → Settings → Authorized domains, add `satyaeducation.in`, `www.satyaeducation.in` (if used) and your Vercel deployment hostname.
4. Verify the Firebase project is `famous-campaign-mcbh2`. The committed `firebase-applet-config.json` contains *public Firebase web app identifiers only*, not a service account.

## Vercel server configuration

In Vercel → Project → Settings → Environment Variables, add:

- `FIREBASE_SERVICE_ACCOUNT_JSON`: **private** Firebase Admin service account JSON, from Firebase Console → Project settings → Service accounts → Generate new private key. Never add this to GitHub or a `VITE_` variable.
- `FIREBASE_PROJECT_ID`: `famous-campaign-mcbh2`.
- `CONTENT_URL_SIGNING_SECRET`: a long random private value (at least 32 bytes), used to protect short-lived download links.

Set these on Preview and Production environments as appropriate, then redeploy. Authentication on protected API endpoints fails closed if Firebase Admin credentials are not configured.

## Security warning / merge blocker

The old checkout endpoint marked purchases paid without Cashfree verification. This branch **intentionally disables order creation** until a proper Cashfree order + server-verified payment flow is implemented. Restore checkout only after signed webhooks or server-to-server verification confirm the exact order amount, currency and payment status. Otherwise customers could unlock paid courses without paying.

The public demo "Quick Admin Login" and fake password-reset confirmation are removed. Admin authorization now requires a Firebase server-verified token containing an administrator custom claim, or the email-verified business owner account.

## Quick testing

1. Register an email/password user on the website.
2. Confirm they appear in Firebase Authentication → Users.
3. Check the verification email and use the link.
4. Sign out, sign in again, and use Google sign-in.
5. Check unverified or non-owner users cannot use admin endpoints; absent or invalid bearer tokens return 401/403.
6. Verify the checkout gives a clear unavailable message instead of claiming payment succeeded.

**Never share Firebase service account private keys, secrets, or your private key JSON in chat or GitHub.**
