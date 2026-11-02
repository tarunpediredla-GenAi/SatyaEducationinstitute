import crypto from 'node:crypto';

/**
 * Official Cashfree PG v2023-08-01 Webhook Signature Verification.
 * Cashfree signs `timestamp + rawBody` using HMAC-SHA256 with the merchant's CASHFREE_SECRET_KEY
 * and encodes the digest in Base64.
 */
export function computeCashfreeWebhookSignature(
  timestamp: string,
  rawBody: string,
  secretKey: string
): string {
  return crypto
    .createHmac('sha256', secretKey)
    .update(`${timestamp}${rawBody}`)
    .digest('base64');
}

export function verifyCashfreeWebhookSignature(params: {
  timestampHeader: string | undefined;
  signatureHeader: string | undefined;
  rawBody: string;
  secretKey: string;
}): boolean {
  const { timestampHeader, signatureHeader, rawBody, secretKey } = params;
  if (!timestampHeader || !signatureHeader || !rawBody || !secretKey) {
    return false;
  }
  const expected = computeCashfreeWebhookSignature(timestampHeader, rawBody, secretKey);
  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(signatureHeader, 'utf8');
  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
