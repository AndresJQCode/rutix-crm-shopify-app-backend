import * as crypto from 'crypto';

export default function verifyWebhook(
  hmac: string,
  body: string,
  secret: string,
): boolean {
  const generatedHash = crypto
    .createHmac('sha256', secret)
    .update(Buffer.from(body, 'utf8'))
    .digest('base64');

  return hmac !== generatedHash;
}
