# Agente Clienti — Fablab Perugia

Strumento AI per trovare prospect e generare email di presentazione personalizzate.

## Deploy su Vercel (gratuito, 5 minuti)

### 1. Crea un account Vercel
Vai su [vercel.com](https://vercel.com) e registrati gratis con il tuo account GitHub, GitLab o email.

### 2. Carica il progetto

**Opzione A — Via GitHub (consigliata)**
1. Crea un nuovo repository su [github.com](https://github.com)
2. Carica tutti i file di questa cartella
3. Su Vercel: "Add New Project" → importa il repo GitHub

**Opzione B — Via Vercel CLI**
```bash
npm install -g vercel
cd fablab-agente
vercel
```

### 3. Configura la variabile d'ambiente

Nella dashboard Vercel del tuo progetto:
1. Vai su **Settings → Environment Variables**
2. Aggiungi:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** la tua chiave API Anthropic (da [console.anthropic.com](https://console.anthropic.com))
3. Clicca **Save**
4. Vai su **Deployments** → clicca i tre puntini sull'ultimo deploy → **Redeploy**

### 4. Pronto!
Vercel ti dà un URL tipo `https://fablab-agente.vercel.app` — condividilo con chi vuoi.

## Struttura file

```
fablab-agente/
├── api/
│   └── agente.js        ← backend serverless (chiama Anthropic)
├── public/
│   └── index.html       ← frontend dell'app
├── vercel.json          ← configurazione routing
└── README.md
```

## Costi
- **Vercel**: gratuito per uso personale/piccole aziende
- **Anthropic API**: circa €0,01–0,03 per ogni ricerca (dipende dalla lunghezza)

## Personalizzazioni possibili
- Modificare i servizi nel menu in `public/index.html`
- Aggiungere nuove zone geografiche
- Cambiare il prompt in `api/agente.js` per adattarlo al vostro stile
