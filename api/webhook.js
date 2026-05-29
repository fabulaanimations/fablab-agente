export const config = { runtime: "edge" };

async function verifySignature(req, secret) {
  const signature = req.headers.get("svix-signature") || req.headers.get("webhook-signature") || "";
  const timestamp = req.headers.get("svix-timestamp") || req.headers.get("webhook-timestamp") || "";
  const msgId = req.headers.get("svix-id") || req.headers.get("webhook-id") || "";
  
  if (!signature || !timestamp) return true; // skip verification in dev
  
  const body = await req.clone().text();
  const signedContent = `${msgId}.${timestamp}.${body}`;
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret.replace(/^whsec_/, ''));
  
  // decode base64 secret
  const binarySecret = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), c => c.charCodeAt(0));
  
  const key = await crypto.subtle.importKey("raw", binarySecret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(signedContent));
  const computedSig = btoa(String.fromCharCode(...new Uint8Array(sig)));
  
  const signatures = signature.split(" ").map(s => s.split(",")[1]);
  return signatures.some(s => s === computedSig);
}

async function getRedisUrl() {
  // Upstash sets KV_URL or STORAGE_URL
  return process.env.KV_URL || process.env.STORAGE_URL || process.env.UPSTASH_REDIS_REST_URL || null;
}

async function addBounce(email) {
  const redisUrl = await getRedisUrl();
  const token = process.env.KV_REST_API_TOKEN || process.env.STORAGE_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  
  if (!redisUrl || !token) return;
  
  await fetch(`${redisUrl}/sadd/bounced_emails/${encodeURIComponent(email)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { type, data } = body;

  if (type === "email.bounced" || type === "email.complained") {
    const email = data?.to?.[0] || data?.email_address;
    if (email) {
      await addBounce(email);
      console.log(`Bounce registrato: ${email} (${type})`);
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}
