import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const sessionId = req.query.session_id;

  if (!sessionId || typeof sessionId !== "string") {
    return res.status(400).send("Missing session_id");
  }

  try {
    const response = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${sessionId}`,
      {
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        },
      }
    );

    if (!response.ok) {
      return res.status(400).send("Invalid session");
    }

    const session = await response.json();
    const email = session.customer_details?.email;

    if (!email) {
      return res.status(400).send("No email found");
    }

    const licenseKey = generateKeyFromSession(session);

    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Purchase Complete - driftcheck</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              max-width: 600px;
              margin: 100px auto;
              padding: 20px;
              text-align: center;
            }
            h1 { color: #22c55e; }
            pre {
              background: #f5f5f5;
              padding: 15px;
              border-radius: 8px;
              overflow-x: auto;
              text-align: left;
            }
            .key { font-weight: bold; color: #2563eb; }
          </style>
        </head>
        <body>
          <h1>✓ Purchase Complete!</h1>
          <p>Your lifetime license key:</p>
          <pre class="key">${licenseKey}</pre>
          <p>Activate it by running:</p>
          <pre>driftcheck activate ${licenseKey}</pre>
          <p>You'll also receive this via email.</p>
          <p><a href="/">Back to Home</a></p>
        </body>
      </html>
    `);
  } catch {
    return res.status(500).send("Error retrieving session");
  }
}

function generateKeyFromSession(session: any): string {
  const email = session.customer_details?.email || "";
  const privateKey = process.env.LICENSE_PRIVATE_KEY || "demo_key";

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
