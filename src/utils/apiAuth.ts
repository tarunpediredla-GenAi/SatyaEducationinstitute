import { auth } from '../firebase';
import type { ActiveUserSession } from '../components/AuthModal';

/**
 * Generates request headers containing ONLY the cryptographically signed
 * Firebase Authentication ID token. Never sends client-spoofable UID/role headers.
 */
export async function getClientAuthHeaders(
  _session?: ActiveUserSession | null
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (auth.currentUser) {
    try {
      const idToken = await auth.currentUser.getIdToken();
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }
    } catch {
      // Token retrieval failed
    }
  }

  return headers;
}

export async function getClientAuthPayload(_session?: ActiveUserSession | null) {
  return {};
}
