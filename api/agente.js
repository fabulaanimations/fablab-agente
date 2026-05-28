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
    prompt = `Sei un agente commerciale esperto per Fablab Perugia, laboratorio di fabbricazione digitale che offre: plastici architettonici, stampa 3D, taglio laser, rendering 3D, fresatura CNC, progettazione grafica.

Genera 4 prospect realistici (nomi inventati ma plausibili) di tipo "${tipo}" nella zona "${zona}" che potrebbero aver bisogno di "${servizio}".

Rispondi ESCLUSIVAMENTE con un array JSON valido. Niente testo, niente backtick, niente markdown. Solo il JSON grezzo:
[{"nome":"...","contatto":"...","citta":"...","motivo":"...","email_subject":"...","email_body":"..."},{"nome":"...","contatto":"...","citta":"...","motivo":"...","email_subject":"...","email_body":"..."},{"nome":"...","contatto":"...","citta":"...","motivo":"...","email_subject":"...","email_body":"..."},{"nome":"...","contatto":"...","citta":"...","motivo":"...","email_subject":"...","email_body":"..."}]`;
  } else {
    prompt = `Scrivi una nuova email di presentazione per Fablab Perugia diretta a "${prospect.nome}" (${prospect.contatto}). Motivo: ${prospect.motivo}. Servizio: ${servizio}. Tono: ${tono}. Rispondi ESCLUSIVAMENTE con JSON grezzo senza backtick: {"email_subject":"...","email_body":"..."}`;
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2000,
          responseMimeType: "application/json"
        },
        thinkingConfig: { thinkingBudget: 0 }
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return new Response(JSON.stringify({ error: data.error?.message || "Errore Gemini" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      const match = clean.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        return new Response(JSON.stringify({ error: "Risposta non valida: " + clean.slice(0, 300) }), {
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
    }

    return new Response(JSON.stringify({ result: parsed }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
}
