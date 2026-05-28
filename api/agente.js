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
    prompt = `Sei un agente commerciale per Fablab Perugia (plastici architettonici, stampa 3D, taglio laser, rendering 3D, fresatura CNC).
Genera 4 prospect di tipo "${tipo}" in "${zona}" interessati a "${servizio}". Tono email: ${tono}.
Rispondi SOLO con JSON array, zero testo extra:
[{"nome":"...","contatto":"...","citta":"...","motivo":"...","email_subject":"...","email_body":"..."}]`;
  } else {
    prompt = `Email di presentazione Fablab Perugia per "${prospect.nome}" (${prospect.contatto}). Motivo: ${prospect.motivo}. Servizio: ${servizio}. Tono: ${tono}.
Rispondi SOLO con JSON oggetto, zero testo extra:
{"email_subject":"...","email_body":"..."}`;
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
        }
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return new Response(JSON.stringify({ error: data.error?.message || "Errore Gemini" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const raw = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    
    // Extract first valid JSON array or object
    let parsed = null;
    const arrayMatch = raw.match(/\[[\s\S]*\]/);
    const objMatch = raw.match(/\{[\s\S]*\}/);
    
    if (azione === "cerca" && arrayMatch) {
      parsed = JSON.parse(arrayMatch[0]);
    } else if (azione === "rigenera" && objMatch) {
      parsed = JSON.parse(objMatch[0]);
    } else if (arrayMatch) {
      parsed = JSON.parse(arrayMatch[0]);
    } else if (objMatch) {
      parsed = JSON.parse(objMatch[0]);
    } else {
      return new Response(JSON.stringify({ error: "Nessun JSON trovato nella risposta: " + raw.slice(0, 300) }), {
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
