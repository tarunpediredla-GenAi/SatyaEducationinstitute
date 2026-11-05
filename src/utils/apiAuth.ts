import { auth } from '../firebase';
import type { ActiveUserSession } from '../components/AuthModal';

/**
 * Never trust browser-provided user IDs, roles, or verification flags.
 * The API verifies the Firebase ID token independently.
 */
export async function getClientAuthHeaders(
  session?: ActiveUserSession | null
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!session || !auth.currentUser) return headers;
  const idToken = await auth.currentUser.getIdToken();
  headers.Authorization = `Bearer ${idToken}`;
  return headers;
}

/** Backward-compatible request shape; the server ignores these identity fields. */
export async function getClientAuthPayload(session?: ActiveUserSession | null) {
  return session ? { userId: session.uid, userEmail: session.email } : {};
}
