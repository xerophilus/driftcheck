import type { VercelRequest, VercelResponse } from "@vercel/node";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const email = req.query.email;

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Missing email parameter" });
  }

  try {
    const response = await fetch(
      `https://api.stripe.com/v1/checkout/sessions?limit=10`,
      {
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        },
      }
    );

    if (!response.ok) {
      return res.status(500).json({ error: "Failed to query Stripe" });
    }

    const data = await response.json();
    const matchingSessions = data.data.filter(
      (session: any) =>
        session.customer_details?.email?.toLowerCase() === email.toLowerCase() &&
        session.payment_status === "paid"
    );

    if (matchingSessions.length === 0) {
      return res.status(404).json({ error: "No paid sessions found" });
    }

    return res.status(200).json({
      message: "License key will be sent to your email",
      sessions: matchingSessions.length,
    });
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
}
