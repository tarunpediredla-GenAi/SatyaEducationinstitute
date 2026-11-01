# Satya’s Education — E-Commerce Storefront & Learning Platform

Full-stack e-commerce website and student/admin portal for **Satya’s Education**, built for selling technology course recordings (`Python`, `Django`, `HTML`, `CSS`, `JavaScript`, `React`, `SQL`, `AWS`, `DevOps`, `GenAI`, `Agentic AI`), educational textbooks (digital PDF & physical hardcover), and children’s storybooks in **INR (₹)**.

---

## 1. Architecture Overview

- **Frontend (`src/`)**: React 19, TypeScript, and Tailwind CSS using Vite (`import.meta.env.VITE_*` conventions only; never mixed with Next.js `NEXT_PUBLIC_*`).
- **Backend (`/server.ts` & `/backend_django/`)**:
  - **Local & Container Full-Stack Runtime (`/server.ts`)**: Express + TypeScript server handling `/api/*` routes, raw-body Cashfree HMAC-SHA256 webhook verification, Firebase Admin token checks, and short-lived signed content URLs.
  - **Vercel Python + Django Serverless Backend (`/backend_django/`, `/vercel.json`, `/requirements.txt`)**: Complete Django 5 WSGI serverless views (`backend_django/api/views.py`) implementing the exact same `/api/*` routes with `firebase-admin` and `requests`.
- **Database & Storage Security**:
  - `firestore.rules`: Hardened Zero-Trust rules enforcing PII isolation, terminal order locking, and RBAC.
  - `storage.rules`: Enforces purchase entitlement checks (`/entitlements/{uid}_{productId}`) for protected course videos and digital books, plus file type and size limits.
  - `firestore.indexes.json`: Composite indexes for catalog filtering, lesson ordering, and user order history.

---

## 2. Step-by-Step Local Setup

1. **Install Node dependencies**:
   ```bash
   npm install
   ```
2. **Copy `.env.example` to `.env`**:
   ```bash
   cp .env.example .env
   ```
   Fill in your public `VITE_FIREBASE_*` variables and server-only `FIREBASE_*` and `CASHFREE_*` credentials.
3. **Run unit & security tests**:
   ```bash
   npx --yes tsx --test src/utils/commerceRules.test.ts firestore.rules.test.ts
   npx eslint firestore.rules
   ```
4. **Start the development server on Port 3000**:
   ```bash
   npm run dev
   ```

---

## 3. Manual Steps Required in External Dashboards

The following steps must be completed manually in your Firebase, Cashfree, and Vercel dashboards when deploying to your own cloud environment:

### Step A: Firebase Console Setup
1. **Enable Sign-In Providers**:
   - Open **Firebase Console → Authentication → Sign-in method**.
   - Enable **Google** and **Email/Password**.
2. **Add Authorized Domains Individually**:
   - Open **Firebase Console → Authentication → Settings → Authorized domains**.
   - Add each domain **individually** (Firebase does not support wildcards):
     - `localhost`
     - `your-app-name.vercel.app`
     - `yourdomain.com` and `www.yourdomain.com`
3. **Deploy Firestore & Storage Security Rules and Indexes**:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes,storage
   ```
4. **Grant the First Admin Role (One-Time CLI Script)**:
   - Generate a Firebase Admin Service Account key from **Project Settings → Service accounts** and set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` in `.env`.
   - Run:
     ```bash
     npx tsx scripts/grant-admin.ts your-verified-admin-email@example.com
     # Or with Python:
     python scripts/grant_admin.py your-verified-admin-email@example.com
     ```
   - Ask the admin user to sign out and sign back in so their ID token refreshes with `admin: true`.

### Step B: Cashfree Payment Gateway Setup (INR)
1. Log in to the **Cashfree Merchant Dashboard** (switch between **Test/Sandbox** and **Production** as needed).
2. Navigate to **Developers → API Keys** and generate your `CASHFREE_APP_ID` and `CASHFREE_SECRET_KEY`.
3. Navigate to **Developers → Webhooks** and add your webhook endpoint:
   ```text
   https://your-domain.com/api/cashfree/webhook
   ```
   Cashfree computes the `x-webhook-signature` header using `HMAC-SHA256(x-webhook-timestamp + rawBody, CASHFREE_SECRET_KEY)` in Base64—no separate webhook secret variable is needed.
4. Add your Vercel and custom domain to Cashfree’s whitelisted domains if domain restriction is enabled on your merchant account.

### Step C: GitHub-to-Vercel Deployment & Custom Domain
1. Push this repository to GitHub (never commit `.env` or service account JSON files).
2. Import the repository into **Vercel**.
3. Add all variables from `.env.example` under **Vercel Project Settings → Environment Variables**.
   - Ensure `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, and `CASHFREE_SECRET_KEY` do **not** have the `VITE_` prefix.
4. Click **Deploy**.
5. Once deployed, copy your `.vercel.app` domain and add it to **Firebase Authorized Domains** and **Cashfree Webhooks**.
6. To attach a custom domain, go to **Vercel Project Settings → Domains**, add your domain, configure the DNS records shown by Vercel, and add the custom domain to Firebase Authorized Domains.
7. **Important**: Whenever you change any environment variable in Vercel, trigger a new **Redeploy** from the **Deployments** tab so updated variables take effect.

---

## 4. Troubleshooting Common Errors

- **`auth/unauthorized-domain` on Google Sign-In**:
  - Cause: The current hostname (`localhost`, `.vercel.app`, or custom domain) is missing from Firebase Console → Authentication → Settings → Authorized domains.
  - Fix: Add the exact hostname individually in the Firebase Console.
- **`Missing or insufficient permissions` in Firestore**:
  - Cause: Attempting a write with an unverified email (`email_verified == false`), attempting an admin write without an `/admins/{uid}` record, or missing required schema fields.
  - Fix: Verify the user’s email address and ensure the one-time `scripts/grant-admin.ts` script was executed for admin accounts.
- **`Invalid Cashfree webhook HMAC-SHA256 signature`**:
  - Cause: Middleware parsed and re-serialized `req.body` before verifying the signature, or `CASHFREE_SECRET_KEY` does not match the active environment (Sandbox vs. Production).
  - Fix: Ensure `/api/cashfree/webhook` reads the exact raw request bytes and `CASHFREE_SECRET_KEY` matches the mode in `CASHFREE_ENV`.

---

Developed by **PEDIREDLA TARUNRAJ**
