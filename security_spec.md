# Satya’s Education — Zero-Trust Firestore Security Specification

## 1. Data Invariants & Master Source of Truth

1. **Privilege Escalation Prevention**: Users can never promote themselves to `admin`. Admin privileges require either a verified email matching the bootstrapped administrator (`tarunpediredla9966@gmail.com` with `email_verified == true`) or a document in `/admins/{uid}` created exclusively by the server Admin SDK or bootstrapped admin.
2. **PII Isolation**: `/users/{userId}`, `/addresses/{addressId}`, and `/orders/{orderId}` contain PII (emails, phone numbers, physical addresses). Blanket reads are forbidden; `get` and `list` are strictly restricted to the owning user (`request.auth.uid`) or verified administrator.
3. **Entitlement & Payment Integrity**: Clients cannot mark an order as `paid` or create documents in `/entitlements/{entitlementId}`. Only the verified server backend (using Firebase Admin SDK after Cashfree HMAC webhook or order verification) or a verified administrator can issue entitlements or transition an order to `paid`.
4. **Protected Lesson Recordings**: Non-preview lessons (`isFreePreview == false`) in `/lessons/{lessonId}` can only be read by users who possess a valid entitlement document `/entitlements/{uid + '_' + courseId}` or by an admin.
5. **Temporal & Structural Integrity**: Every write enforces strict key allowlists (`hasAll` + `hasOnly`), bounded string sizes, regex-validated document IDs (`^[a-zA-Z0-9_\-]+$`), and server timestamp verification (`request.time`).

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Self-Admin Promotion**: User `u1` creates `/users/u1` with `"role": "admin"`. -> `PERMISSION_DENIED`
2. **Shadow Field Injection on Profile**: User `u1` updates `/users/u1` with `{"name": "Satya", "isSuperAdmin": true}`. -> `PERMISSION_DENIED`
3. **Unverified Admin Email Spoof**: Attacker signs in with unverified email `tarunpediredla9966@gmail.com` (`email_verified: false`) and attempts to create a product. -> `PERMISSION_DENIED`
4. **Client-Side Order Payment Bypass**: User `u1` updates `/orders/ord_1` changing `paymentStatus` from `"pending"` to `"paid"`. -> `PERMISSION_DENIED`
5. **Terminal Order Mutation**: User `u1` attempts to cancel `/orders/ord_1` after `paymentStatus` is already `"paid"`. -> `PERMISSION_DENIED`
6. **Self-Granted Course Entitlement**: User `u1` attempts `create` on `/entitlements/u1_course_python` without server Admin SDK. -> `PERMISSION_DENIED`
7. **Unauthorized Paid Lesson Read**: User `u2` (no entitlement) calls `get` on `/lessons/lesson_paid_1` where `isFreePreview == false`. -> `PERMISSION_DENIED`
8. **Cross-User Address PII Read**: User `u2` calls `get` on `/addresses/addr_u1` belonging to `u1`. -> `PERMISSION_DENIED`
9. **Blanket User List Scraping**: Authenticated user `u1` runs an unconstrained `list` query on `/orders` without filtering `userId == request.auth.uid`. -> `PERMISSION_DENIED`
10. **ID Poisoning Attack**: User attempts to create `/addresses/invalid$id!with*spaces` violating `^[a-zA-Z0-9_\-]+$`. -> `PERMISSION_DENIED`
11. **Value Poisoning / Denial of Wallet**: User updates `/users/u1` with a 5,000-character `name` string exceeding `maxLength: 120`. -> `PERMISSION_DENIED`
12. **Timestamp Forgery**: User creates `/wishlists/w1` with a backdated `createdAt` instead of `request.time`. -> `PERMISSION_DENIED`
