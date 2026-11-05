import type { ActiveUserSession } from '../components/AuthModal';

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

  return headers;
}

export async function getClientAuthPayload(session?: ActiveUserSession | null) {
  if (!session) return {};

  return {
    userId: session.uid,
    userEmail: session.email,
    userEmailVerified: session.emailVerified,
    userRole: session.role,
  };
}
