import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const LICENSE_PRIVATE_KEY = process.env.LICENSE_PRIVATE_KEY || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const signature = req.headers["stripe-signature"];
  if (!signature || typeof signature !== "string") {
    return res.status(400).json({ error: "No signature" });
  }

  const rawBody =
    typeof req.body === "string" ? req.body : JSON.stringify(req.body);

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

    await sendLicenseEmail(email, licenseKey);

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

  if (!timestamp || !sig) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
}

function signLicenseKey(email: string, privateKey: string): string {
  const emailHash = crypto.createHash("sha256").update(email).digest("hex");

  const license = {
    email_hash: emailHash,
    purchased_at: Date.now(),
    plan: "lifetime",
    id: crypto.randomBytes(16).toString("hex"),
  };

  const payloadJson = JSON.stringify(license);
  const payloadB64 = Buffer.from(payloadJson).toString("base64url");

  const signature = crypto
    .createHash("sha256")
    .update(payloadB64 + privateKey)
    .digest("base64url");

  return `DC1-${payloadB64}.${signature}`;
}

async function sendLicenseEmail(email: string, key: string) {
  if (!RESEND_API_KEY) return;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
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
    // Silent fail
  }
}
