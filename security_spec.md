# Security Specification — Satya’s Education

## 1. Authentication & Roles
- **Firebase Authentication**: Supports Google Sign-In (`signInWithPopup`) and Email/Password (`signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, `sendPasswordResetEmail`).
- **Administrator Role**: Bootstrapped to `tarunpediredla9966@gmail.com` (with verified email) or users whose `/users/{uid}` document has `role == 'admin'`.
- **Student Role**: Default role (`role == 'student'`) for all self-registered users. Privilege escalation (`role: 'admin'`) by non-admin users is strictly forbidden.

## 2. Firestore Collections
- `/users/{userId}`:
  - Read (`get`): Allowed only by the owner (`request.auth.uid == userId`) or an administrator. `list` is restricted to administrators to prevent user enumeration.
  - Create / Update: Allowed by owner (must keep `role == 'student'` unless already admin) or administrator.
  - Delete: Administrator only.
- `/storageAssets/{assetId}`:
  - Read (`get`, `list`): Authenticated users can read uploaded course/book asset metadata.
  - Create / Update / Delete: Strictly restricted to administrators.

## 3. Firebase Storage Rules (`storage.rules`)
- `/public/{allPaths=**}`: Publicly readable cover images and preview trailers; writeable only by authenticated administrators.
- `/protected/{allPaths=**}`: Course recordings and digital PDF editions; readable by authenticated users and writeable by authenticated users/administrators with size and content-type validation.
