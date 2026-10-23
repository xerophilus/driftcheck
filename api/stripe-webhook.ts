import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const LICENSE_PRIVATE_KEY = process.env.LICENSE_PRIVATE_KEY || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY;

export const config = { api: { bodyParser: false } };

async function readRawBody(req: VercelRequest): Promise<string> {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  const chunks: Buffer[] = [];
  for await (const chunk of req as any) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const signature = req.headers["stripe-signature"];
  if (!signature || typeof signature !== "string") {
    return res.status(400).json({ error: "No signature" });
  }

  const rawBody = await readRawBody(req);

  if (!verifyStripeSignature(rawBody, signature, STRIPE_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = session.customer_details?.email;

    if (!email) {
      return res.status(400).json({ error: "No email in session" });
    }

    const licenseKey = signLicenseKey(email, LICENSE_PRIVATE_KEY);

    if (RESEND_API_KEY) {
      await sendLicenseEmail(email, licenseKey, RESEND_API_KEY);
    }

    return res.status(200).json({ received: true, key: licenseKey });
  }

  return res.status(200).json({ received: true });
}

function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const parts = signature.split(",");
  const timestamp = parts
    .find((p) => p.startsWith("t="))
    ?.split("=")[1];
  const sig = parts.find((p) => p.startsWith("v1="))?.split("=")[1];

  if (!timestamp || !sig || !secret) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function signLicenseKey(email: string, privateKeyHex: string): string {
  const emailHash = crypto.createHash("sha256").update(email).digest("hex");

  const license = {
    email_hash: emailHash,
    purchased_at: Date.now(),
    plan: "lifetime",
    id: crypto.randomBytes(16).toString("hex"),
  };

  const payloadJson = JSON.stringify(license);
  const payloadBuffer = Buffer.from(payloadJson);
  const payloadB64 = payloadBuffer.toString("base64url");

  const privateKeyBuffer = Buffer.from(privateKeyHex, "hex");

  const privateKey = crypto.createPrivateKey({
    key: privateKeyBuffer,
    format: "der",
    type: "pkcs8",
  });

  const signature = crypto.sign(null, payloadBuffer, {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });

  const signatureB64 = signature.toString("base64url");

  return `DC1-${payloadB64}.${signatureB64}`;
}

async function sendLicenseEmail(
  email: string,
  key: string,
  resendApiKey: string
) {
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "driftcheck <noreply@driftcheck.dev>",
        to: email,
        subject: "Your driftcheck License Key",
        html: `
          <h1>Thanks for purchasing driftcheck!</h1>
          <p>Your lifetime license key:</p>
          <pre>${key}</pre>
          <p>Activate it by running:</p>
          <pre>driftcheck activate ${key}</pre>
          <p>Or set it in your CI:</p>
          <pre>DRIFTCHECK_LICENSE=${key}</pre>
        `,
      }),
    });
  } catch {
    // Silent fail - key is shown on success page
  }
}
