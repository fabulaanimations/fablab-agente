export const config = { runtime: "edge" };

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
  if (!GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY non configurata" }), { status: 500 });
  }

  let prompt;

  if (azione === "cerca") {
    prompt = `Sei agente commerciale Fablab Perugia (plastici architettonici, stampa 3D, taglio laser, rendering 3D, fresatura CNC).
Genera 4 prospect di tipo "${tipo}" in "${zona}" per "${servizio}". Tono email: ${tono}.
Ogni motivo max 1 frase. Ogni email_body max 3 frasi brevi + concludi SEMPRE con: "Potete visitare i nostri lavori su www.fablabperugia.it/portfolio"
Rispondi SOLO con questo JSON, niente altro:
[{"nome":"Azienda Srl","contatto":"Mario Rossi (titolare)","citta":"Ancona (AN)","motivo":"Frase breve motivo.","email_subject":"Oggetto breve","email_body":"Frase 1. Frase 2. Frase 3. Potete visitare i nostri lavori su www.fablabperugia.it/portfolio"},{"nome":"Studio Bianchi","contatto":"Anna Bianchi (arch.)","citta":"Pesaro (PU)","motivo":"Frase breve.","email_subject":"Oggetto","email_body":"Frase 1. Frase 2. Frase 3. Potete visitare i nostri lavori su www.fablabperugia.it/portfolio"},{"nome":"Arch Studio","contatto":"Luca Verdi (socio)","citta":"Macerata (MC)","motivo":"Frase breve.","email_subject":"Oggetto","email_body":"Frase 1. Frase 2. Frase 3. Potete visitare i nostri lavori su www.fablabperugia.it/portfolio"},{"nome":"Design Office","contatto":"Sara Neri (titolare)","citta":"Fermo (FM)","motivo":"Frase breve.","email_subject":"Oggetto","email_body":"Frase 1. Frase 2. Frase 3. Potete visitare i nostri lavori su www.fablabperugia.it/portfolio"}]`;
  } else {
    prompt = `Email breve Fablab Perugia per "${prospect.nome}". Servizio: ${servizio}. Tono: ${tono}. Max 3 frasi + concludi SEMPRE con: "Potete visitare i nostri lavori su www.fablabperugia.it/portfolio"
Rispondi SOLO con questo JSON:
{"email_subject":"Oggetto email","email_body":"Frase 1. Frase 2. Frase 3. Potete visitare i nostri lavori su www.fablabperugia.it/portfolio"}`;
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 4000 }
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return new Response(JSON.stringify({ error: data.error?.message || "Errore Gemini" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const parts = data.candidates?.[0]?.content?.parts || [];
    const raw = parts.map(p => p.text || "").join("");

    const arrayMatch = raw.match(/\[[\s\S]*?\]/);
    const objMatch = raw.match(/\{[\s\S]*?\}/);

    let parsed = null;
    try {
      if (azione === "cerca" && arrayMatch) parsed = JSON.parse(arrayMatch[0]);
      else if (objMatch) parsed = JSON.parse(objMatch[0]);
      else if (arrayMatch) parsed = JSON.parse(arrayMatch[0]);
    } catch(pe) {
      return new Response(JSON.stringify({ error: "Parse error: " + raw.slice(0, 400) }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    return new Response(JSON.stringify({ result: parsed }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
}
