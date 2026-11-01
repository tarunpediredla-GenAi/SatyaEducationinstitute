/**
 * Secure One-Time Script to Grant the First Administrator Role
 * Usage:
 *   npx tsx scripts/grant-admin.ts <user-email-or-uid>
 *
 * Security Invariants:
 * - Never run in browser code.
 * - Requires FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.
 * - Sets Firebase Auth Custom Claim `{ admin: true }` AND writes `/admins/{uid}` in Firestore.
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: npx tsx scripts/grant-admin.ts <user-email-or-uid>');
    process.exit(1);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    console.error(
      'Missing Firebase Admin credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in your .env file.'
    );
    process.exit(1);
  }

  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  const auth = getAuth();
  const db = getFirestore();

  const userRecord = target.includes('@')
    ? await auth.getUserByEmail(target)
    : await auth.getUser(target);

  if (!userRecord.emailVerified) {
    console.error(
      `Refusing to grant admin to ${userRecord.email} (${userRecord.uid}): Email is not verified.`
    );
    process.exit(1);
  }

  await auth.setCustomUserClaims(userRecord.uid, {
    ...(userRecord.customClaims || {}),
    admin: true,
  });

  await db.collection('admins').doc(userRecord.uid).set({
    uid: userRecord.uid,
    email: userRecord.email || '',
    grantedBy: 'cli_bootstrap_script',
    createdAt: FieldValue.serverTimestamp(),
  });

  await db.collection('users').doc(userRecord.uid).set(
    {
      role: 'admin',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log(
    `Successfully granted Firebase custom claim { admin: true } and /admins/${userRecord.uid} record to ${userRecord.email}.`
  );
  console.log('Ask the user to sign out and sign back in to refresh their ID token.');
}

main().catch((err) => {
  console.error('Failed to grant admin role:', err);
  process.exit(1);
});
