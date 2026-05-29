export const config = { runtime: "edge", maxDuration: 60 };

function extractEmail(text) {
  const match = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

async function findEmail(nome, citta, tipo, serperKey) {
  try {
    const query = `${nome} ${citta} email contatti`;
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": serperKey },
      body: JSON.stringify({ q: query, gl: "it", hl: "it", num: 5 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const texts = [];
    if (data.organic) for (const r of data.organic) { if (r.snippet) texts.push(r.snippet); }
    if (data.knowledgeGraph?.description) texts.push(data.knowledgeGraph.description);
    if (data.knowledgeGraph?.attributes) for (const v of Object.values(data.knowledgeGraph.attributes)) texts.push(v);
    for (const t of texts) { const email = extractEmail(t); if (email) return email; }
    return null;
  } catch { return null; }
}

async function callGemini(prompt, maxTokens, apiKey, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens } }),
      });
      const data = await res.json();
      // 503 = sovraccarico, riprova
      if (res.status === 503 || res.status === 429) {
        if (attempt < retries - 1) { await new Promise(r => setTimeout(r, 1500 * (attempt + 1))); continue; }
        throw new Error("Modello sovraccarico, riprova tra poco");
      }
      if (!res.ok) throw new Error(data.error?.message || "Errore Gemini");
      return (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
    } catch (e) {
      if (attempt < retries - 1) { await new Promise(r => setTimeout(r, 1500 * (attempt + 1))); continue; }
      throw e;
    }
  }
}

async function sendEmail(to, subject, body, resendKey) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${resendKey}` },
    body: JSON.stringify({ from: "Fablab Perugia <info@fablabperugia.it>", to: [to], subject, text: body }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Errore invio email");
  return data;
}

async function getBounces() {
  const redisUrl = process.env.KV_URL || process.env.STORAGE_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.STORAGE_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !token) return [];
  try {
    const res = await fetch(`${redisUrl}/smembers/bounced_emails`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    return data.result || [];
  } catch { return []; }
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
  }
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });

  const body = await req.json();
  const { azione } = body;
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const SERPER_API_KEY = process.env.SERPER_API_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  if (!GEMINI_API_KEY) return new Response(JSON.stringify({ error: "GEMINI_API_KEY non configurata" }), { status: 500, headers });

  try {
    // CONTROLLA BOUNCE
    if (azione === "check_bounces") {
      const bounces = await getBounces();
      return new Response(JSON.stringify({ bounces }), { headers });
    }

    // INVIA EMAIL
    if (azione === "invia") {
      if (!RESEND_API_KEY) return new Response(JSON.stringify({ error: "RESEND_API_KEY non configurata" }), { status: 500, headers });
      await sendEmail(body.to, body.subject, body.emailBody, RESEND_API_KEY);
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    // RIGENERA EMAIL
    if (azione === "rigenera") {
      const { servizio, tono, prospect } = body;
      const prompt = `Email breve Fablab Perugia per "${prospect.nome}". Servizio: ${servizio}. Tono: ${tono}. Max 3 frasi + concludi SEMPRE con: "Potete visitare i nostri lavori su www.fablabperugia.it/portfolio"
Rispondi SOLO con questo JSON:
{"email_subject":"Oggetto email","email_body":"Frase 1. Frase 2. Frase 3. Potete visitare i nostri lavori su www.fablabperugia.it/portfolio"}`;
      const raw = await callGemini(prompt, 1000, GEMINI_API_KEY);
      const objMatch = raw.match(/\{[\s\S]*\}/);
      return new Response(JSON.stringify({ result: objMatch ? JSON.parse(objMatch[0]) : null }), { headers });
    }

    // CERCA PROSPECT
    if (!SERPER_API_KEY) return new Response(JSON.stringify({ error: "SERPER_API_KEY non configurata" }), { status: 500, headers });
    const { servizio, tipo, zona, tono } = body;
    const prompt = `Sei agente commerciale Fablab Perugia (plastici architettonici, stampa 3D, taglio laser, rendering 3D, fresatura CNC).
Genera 20 prospect REALI (nomi plausibili di studi/aziende) di tipo "${tipo}" in "${zona}" per "${servizio}".
Ogni motivo max 1 frase. Ogni email_body max 3 frasi + concludi SEMPRE con: "Potete visitare i nostri lavori su www.fablabperugia.it/portfolio"
Tono email: ${tono}.
Rispondi SOLO con JSON array, niente altro:
[{"nome":"Nome Studio","contatto":"Nome Cognome (ruolo)","citta":"Città (provincia)","motivo":"Motivo breve.","email_subject":"Oggetto","email_body":"Frase 1. Frase 2. Frase 3. Potete visitare i nostri lavori su www.fablabperugia.it/portfolio"}]`;

    const raw = await callGemini(prompt, 8000, GEMINI_API_KEY);
    const arrayMatch = raw.match(/\[[\s\S]*\]/);
    if (!arrayMatch) return new Response(JSON.stringify({ error: "Nessun JSON: " + raw.slice(0, 300) }), { status: 500, headers });

    let prospects;
    try { prospects = JSON.parse(arrayMatch[0]); }
    catch(e) { return new Response(JSON.stringify({ error: "Parse error: " + e.message }), { status: 500, headers }); }

    const bounces = await getBounces();

    // Cerca email in batch da 5 per evitare timeout
    const withEmails = [];
    for (let i = 0; i < prospects.length; i += 5) {
      const batch = prospects.slice(i, i + 5);
      const results = await Promise.all(batch.map(async (p) => {
        const email = await findEmail(p.nome, p.citta, tipo, SERPER_API_KEY);
        const isBounced = email ? bounces.includes(email.toLowerCase()) : false;
        return { ...p, email: email || null, bounced: isBounced };
      }));
      withEmails.push(...results);
    }

    return new Response(JSON.stringify({ result: withEmails }), { headers });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
