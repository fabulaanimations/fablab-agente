export const config = { runtime: "edge" };

function extractEmail(text) {
  const match = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

async function findEmail(nome, citta, tipo, serperKey) {
  try {
    const query = `${nome} ${citta} ${tipo} email contatti`;
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": serperKey,
      },
      body: JSON.stringify({ q: query, gl: "it", hl: "it", num: 3 }),
    });
    const data = await res.json();

    // cerca email in snippet e sitelinks
    const texts = [];
    if (data.organic) {
      for (const r of data.organic) {
        if (r.snippet) texts.push(r.snippet);
        if (r.link) texts.push(r.link);
      }
    }
    if (data.knowledgeGraph?.description) texts.push(data.knowledgeGraph.description);

    for (const t of texts) {
      const email = extractEmail(t);
      if (email) return email;
    }

    // prova a fare fetch del primo risultato
    if (data.organic?.[0]?.link) {
      try {
        const pageRes = await fetch(data.organic[0].link, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(4000),
        });
        const html = await pageRes.text();
        const email = extractEmail(html);
        if (email) return email;
      } catch {}
    }

    return null;
  } catch {
    return null;
  }
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const { servizio, tipo, zona, tono, azione, prospect } = await req.json();

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const SERPER_API_KEY = process.env.SERPER_API_KEY;

  if (!GEMINI_API_KEY) return new Response(JSON.stringify({ error: "GEMINI_API_KEY non configurata" }), { status: 500 });
  if (!SERPER_API_KEY) return new Response(JSON.stringify({ error: "SERPER_API_KEY non configurata" }), { status: 500 });

  // RIGENERA EMAIL
  if (azione === "rigenera") {
    const prompt = `Email breve Fablab Perugia per "${prospect.nome}". Servizio: ${servizio}. Tono: ${tono}. Max 3 frasi + concludi SEMPRE con: "Potete visitare i nostri lavori su www.fablabperugia.it/portfolio"
Rispondi SOLO con questo JSON:
{"email_subject":"Oggetto email","email_body":"Frase 1. Frase 2. Frase 3. Potete visitare i nostri lavori su www.fablabperugia.it/portfolio"}`;

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1000 }
        }),
      });
      const data = await res.json();
      const raw = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
      const objMatch = raw.match(/\{[\s\S]*?\}/);
      const parsed = objMatch ? JSON.parse(objMatch[0]) : null;
      return new Response(JSON.stringify({ result: parsed }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
    }
  }

  // CERCA PROSPECT
  const prompt = `Sei agente commerciale Fablab Perugia (plastici architettonici, stampa 3D, taglio laser, rendering 3D, fresatura CNC).
Genera 20 prospect REALI (nomi di studi/aziende che potrebbero esistere davvero) di tipo "${tipo}" in "${zona}" per "${servizio}".
Ogni motivo max 1 frase. Ogni email_body max 3 frasi + concludi SEMPRE con: "Potete visitare i nostri lavori su www.fablabperugia.it/portfolio"
Tono email: ${tono}.
Rispondi SOLO con JSON array, niente altro:
[{"nome":"Nome Studio","contatto":"Nome Cognome (ruolo)","citta":"Città (provincia)","motivo":"Motivo breve.","email_subject":"Oggetto","email_body":"Frase 1. Frase 2. Frase 3. Potete visitare i nostri lavori su www.fablabperugia.it/portfolio"}]`;

  try {
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 8000 }
      }),
    });

    const geminiData = await geminiRes.json();
    if (!geminiRes.ok) {
      return new Response(JSON.stringify({ error: geminiData.error?.message || "Errore Gemini" }), {
        status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const raw = (geminiData.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
    const arrayMatch = raw.match(/\[[\s\S]*\]/);
    if (!arrayMatch) {
      return new Response(JSON.stringify({ error: "Nessun JSON trovato: " + raw.slice(0, 300) }), {
        status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    let prospects = JSON.parse(arrayMatch[0]);

    // Cerca email reali in parallelo con Serper
    const withEmails = await Promise.all(
      prospects.map(async (p) => {
        const email = await findEmail(p.nome, p.citta, tipo, SERPER_API_KEY);
        return { ...p, email: email || null };
      })
    );

    return new Response(JSON.stringify({ result: withEmails }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
}
