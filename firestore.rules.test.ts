import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const rulesContent = fs.readFileSync(rulesPath, 'utf8');

test('Firestore rules enforce Global Safety Net and rules_version 2', () => {
  assert.match(rulesContent, /rules_version\s*=\s*'2';/);
  assert.match(rulesContent, /match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s*false;\s*\}/);
});

test('Dirty Dozen #1 & #2: Self-Admin Promotion & Shadow Field Injection blocked on UserProfile', () => {
  // User creation requires role == 'student' unless isBootstrappedAdmin()
  assert.match(rulesContent, /\(incoming\(\)\.role == 'student' \|\| isBootstrappedAdmin\(\)\)/);
  // User profile updates restrict keys via affectedKeys().hasOnly(['name', 'phone', 'updatedAt'])
  assert.match(rulesContent, /affectedKeys\(\)\.hasOnly\(\['name',\s*'phone',\s*'updatedAt'\]\)/);
  assert.match(rulesContent, /incoming\(\)\.role == existing\(\)\.role/);
});

test('Dirty Dozen #3: Email Spoofing Test — email_verified == true is enforced before email comparison', () => {
  assert.match(rulesContent, /function isVerifiedUser\(\)\s*\{\s*return isSignedIn\(\) && request\.auth\.token\.email_verified == true;\s*\}/);
  assert.match(rulesContent, /function isBootstrappedAdmin\(\)\s*\{\s*return isVerifiedUser\(\) && request\.auth\.token\.email == 'tarunpediredla9966@gmail\.com';\s*\}/);
});

test('Dirty Dozen #4, #5, #6: Order Payment Bypass, Terminal State Lock, and Self-Granted Entitlements blocked', () => {
  // Order creation must start as 'pending'
  assert.match(rulesContent, /incoming\(\)\.paymentStatus == 'pending'/);
  // Client order update only allows pending -> cancelled, never pending -> paid
  assert.match(rulesContent, /existing\(\)\.paymentStatus == 'pending'\s*&&\s*incoming\(\)\.paymentStatus == 'cancelled'/);
  // Entitlement creation requires isAdmin()
  assert.match(rulesContent, /match \/entitlements\/\{entitlementId\}[\s\S]*?allow create: if isValidId\(entitlementId\) && isValidEntitlement\(incoming\(\)\) && isAdmin\(\)/);
});

test('Dirty Dozen #7, #8, #9: Paid Lesson Gate, PII Isolation, and Query Enforcer on list rules', () => {
  // Paid lessons require entitlement existence check
  assert.match(rulesContent, /exists\(\/databases\/\$\(database\)\/documents\/entitlements\/\$\(request\.auth\.uid \+ '_' \+ resource\.data\.courseId\)\)/);
  // Orders and Addresses list rules enforce resource.data.userId == request.auth.uid
  assert.match(rulesContent, /match \/orders\/\{orderId\}[\s\S]*?allow list: if \(isSignedIn\(\) && resource\.data\.userId == request\.auth\.uid\) \|\| isBootstrappedAdmin\(\);/);
  assert.match(rulesContent, /match \/addresses\/\{addressId\}[\s\S]*?allow list: if \(isSignedIn\(\) && resource\.data\.userId == request\.auth\.uid\) \|\| isBootstrappedAdmin\(\);/);
});

test('Dirty Dozen #10, #11, #12: ID Regex Guard, String Size Limits, and Server Timestamps enforced', () => {
  assert.match(rulesContent, /id\.matches\('\^\[a-zA-Z0-9_\\\\-\]\+\$'\)/);
  assert.match(rulesContent, /data\.name is string && data\.name\.size\(\) >= 1 && data\.name\.size\(\) <= 120/);
  assert.match(rulesContent, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rulesContent, /incoming\(\)\.updatedAt == request\.time/);
});
