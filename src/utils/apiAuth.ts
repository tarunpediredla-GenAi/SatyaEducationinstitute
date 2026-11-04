import { auth } from '../firebase';
import type { ActiveUserSession } from '../components/AuthModal';

/**
 * Builds resilient request headers including Firebase Auth ID Token,
 * custom session headers, and Content-Type.
 */
export async function getClientAuthHeaders(
  session?: ActiveUserSession | null
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (!session) return headers;

  headers['x-satya-uid'] = session.uid;
  headers['x-satya-email'] = session.email;
  headers['x-satya-email-verified'] = String(session.emailVerified);
  headers['x-satya-admin-claim'] = String(session.role === 'admin');

  try {
    const idToken = await auth.currentUser?.getIdToken();
    if (idToken) {
      headers['Authorization'] = `Bearer ${idToken}`;
    }
  } catch {
    // Fall back to custom headers and body attributes
  }

  return headers;
}

/**
 * Extracts session attributes and current ID token for embedding inside
 * POST/PUT request bodies or GET query params to survive proxy header-stripping.
 */
export async function getClientAuthPayload(session?: ActiveUserSession | null) {
  if (!session) return {};

  let idToken: string | undefined = undefined;
  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) idToken = token;
  } catch {
    // ignore
  }

  return {
    userId: session.uid,
    userEmail: session.email,
    userEmailVerified: session.emailVerified,
    userRole: session.role,
    idToken,
  };
}
