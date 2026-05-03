/**
 * BagrutAI — Canva Connect Integration Worker
 * ============================================
 * Bridges your BagrutAI app to Canva Connect API for:
 *  - Generating certificates from a Brand Template
 *  - (Future) Generating worksheets, marketing materials, etc.
 *
 * ENDPOINTS:
 *  GET  /canva/auth-url        → returns the OAuth authorization URL
 *  GET  /canva/callback        → handles the OAuth redirect, returns tokens to display
 *  POST /canva/certificate     → autofills a certificate template & returns a PDF URL
 *
 * Authentication model:
 *  Canva Connect uses OAuth 2.0. The admin (you) authorizes ONCE,
 *  then the refresh token is stored as a Worker secret and reused forever.
 *
 * ============================================
 * ONE-TIME SETUP (15-20 min, requires Canva Pro+):
 * ============================================
 *
 * STEP 1 — Create a Canva developer integration
 *   a. Go to https://www.canva.com/developers/integrations
 *   b. "Create an integration" → choose "Public" type or "Internal" (Internal works for your own use)
 *   c. Configuration tab:
 *      - Display name: "BagrutAI"
 *      - Description: "Education platform certificate generator"
 *   d. Authentication tab → Scopes:
 *      ✓ design:content:read
 *      ✓ design:content:write
 *      ✓ brand_template:meta:read
 *      ✓ brand_template:content:read
 *   e. Authentication tab → Authorization URL — add your redirect URL:
 *      https://bagrutai-canva.<your-subdomain>.workers.dev/canva/callback
 *      (you'll know your worker URL after deploying — for now, deploy with placeholder, then add it back)
 *   f. SAVE the integration. Copy "Client ID" and "Client Secret" — you'll need them.
 *
 * STEP 2 — Create your certificate Brand Template in Canva
 *   a. In Canva, design a certificate. Add text fields like:
 *      "Student name", "Subject", "Date", "Achievement"
 *   b. Save as "Brand Template" (right-click design → "Save as Brand Template")
 *   c. Open the template — note the Template ID from URL: /design/<TEMPLATE_ID>
 *   d. The text elements need to be tagged for autofill. In Canva, click each text →
 *      "Connect" tab → set Field Name (e.g. "student_name", "subject", "date")
 *
 * STEP 3 — Deploy this Worker
 *   a. Cloudflare Workers → Create Worker → name: bagrutai-canva
 *   b. Paste this entire file → Deploy
 *   c. Copy the Worker URL (e.g. https://bagrutai-canva.<sub>.workers.dev)
 *
 * STEP 4 — Add Worker secrets:
 *   Worker → Settings → Variables and Secrets → Add 3 secrets:
 *      CANVA_CLIENT_ID         (from step 1f)
 *      CANVA_CLIENT_SECRET     (from step 1f)
 *      CANVA_TEMPLATE_ID       (from step 2c)
 *
 * STEP 5 — Update Canva integration with real Worker URL:
 *   Go back to Canva integration → Authentication → set redirect URL to:
 *      https://bagrutai-canva.<sub>.workers.dev/canva/callback
 *
 * STEP 6 — Authorize ONCE (one-time):
 *   a. Visit https://bagrutai-canva.<sub>.workers.dev/canva/auth-url
 *   b. It returns the URL — open it
 *   c. Sign in to Canva and approve the integration
 *   d. Browser redirects to /canva/callback — page displays a refresh_token
 *   e. Copy the refresh_token, go to Worker secrets, add:
 *      CANVA_REFRESH_TOKEN = <the long token>
 *   f. Save and Deploy
 *
 * STEP 7 — Configure the app:
 *   In app.html set:
 *      const CANVA_API_ENDPOINT = "https://bagrutai-canva.<sub>.workers.dev";
 *
 * Done! The "Generate Certificate" button in BagrutAI now works.
 */

const ALLOWED_ORIGINS = [
  "https://bagrutai.co.il",
  "https://www.bagrutai.co.il",
  "https://odeliayanay6.github.io",
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

const CANVA_API_BASE = "https://api.canva.com/rest/v1";
const CANVA_AUTH_BASE = "https://www.canva.com/api/oauth";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // ---------- /canva/auth-url ----------
    if (url.pathname === "/canva/auth-url" && request.method === "GET") {
      if (!env.CANVA_CLIENT_ID) {
        return jsonError("CANVA_CLIENT_ID not configured", 500, cors);
      }
      const redirectUri = `${url.origin}/canva/callback`;
      const scope = [
        "design:content:read",
        "design:content:write",
        "brand_template:meta:read",
        "brand_template:content:read",
      ].join(" ");
      const authUrl = new URL(`${CANVA_AUTH_BASE}/authorize`);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("client_id", env.CANVA_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("scope", scope);
      authUrl.searchParams.set("state", crypto.randomUUID());
      return new Response(JSON.stringify({ auth_url: authUrl.toString() }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    // ---------- /canva/callback ----------
    if (url.pathname === "/canva/callback" && request.method === "GET") {
      const code = url.searchParams.get("code");
      if (!code) {
        return new Response("Missing code parameter", { status: 400 });
      }
      // Exchange code for tokens
      const tokenRes = await fetch(`${CANVA_API_BASE}/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": "Basic " + btoa(`${env.CANVA_CLIENT_ID}:${env.CANVA_CLIENT_SECRET}`),
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code,
          redirect_uri: `${url.origin}/canva/callback`,
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        return new Response(`<h1>Token exchange failed</h1><pre>${JSON.stringify(tokenData, null, 2)}</pre>`, {
          status: 500, headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
      // Display tokens for admin to copy into secrets
      return new Response(`
<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8">
<title>Canva Authorization Success</title>
<style>body{font-family:Arial;max-width:700px;margin:40px auto;padding:20px}
h1{color:#16a34a}code{background:#f1f5f9;padding:8px;display:block;word-break:break-all;border-radius:8px;font-size:13px}</style>
</head><body>
<h1>✅ הרשאת Canva הושלמה!</h1>
<p>העתיקי את ה-<b>refresh_token</b> והוסיפי אותו כסוד ב-Cloudflare Worker (שם הסוד: <code style="display:inline">CANVA_REFRESH_TOKEN</code>):</p>
<code>${tokenData.refresh_token}</code>
<p style="color:#64748b;font-size:13px;margin-top:20px">
  (access_token תקף לזמן קצר ולא צריך להישמר — ה-Worker ייצור חדש מה-refresh בכל פעם.)
</p>
</body></html>`, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // ---------- /canva/certificate ----------
    if (url.pathname === "/canva/certificate" && request.method === "POST") {
      if (!env.CANVA_REFRESH_TOKEN) return jsonError("CANVA_REFRESH_TOKEN not configured", 500, cors);
      if (!env.CANVA_TEMPLATE_ID)   return jsonError("CANVA_TEMPLATE_ID not configured", 500, cors);

      let body;
      try { body = await request.json(); }
      catch (e) { return jsonError("Invalid JSON", 400, cors); }

      const studentName = (body.student_name || "תלמיד/ה").substring(0, 60);
      const subject = (body.subject || "מקצוע").substring(0, 60);
      const achievement = (body.achievement || "השלים את היחידה").substring(0, 80);
      const date = body.date || new Date().toLocaleDateString("he-IL");

      // 1) Refresh access token
      const accessToken = await refreshAccessToken(env);
      if (!accessToken) return jsonError("Failed to refresh access token — re-authorize Canva", 500, cors);

      // 2) Create autofill job
      const autofillRes = await fetch(`${CANVA_API_BASE}/autofills`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brand_template_id: env.CANVA_TEMPLATE_ID,
          data: {
            student_name: { type: "text", text: studentName },
            subject:      { type: "text", text: subject },
            date:         { type: "text", text: date },
            achievement:  { type: "text", text: achievement },
          },
        }),
      });
      const autofillData = await autofillRes.json();
      if (!autofillRes.ok) return jsonError("Autofill failed: " + JSON.stringify(autofillData), 500, cors);

      const jobId = autofillData?.job?.id;
      if (!jobId) return jsonError("No autofill job ID returned", 500, cors);

      // 3) Poll for completion (up to 30s)
      let designId = null;
      for (let i = 0; i < 15; i++) {
        await sleep(2000);
        const statusRes = await fetch(`${CANVA_API_BASE}/autofills/${jobId}`, {
          headers: { "Authorization": `Bearer ${accessToken}` },
        });
        const statusData = await statusRes.json();
        if (statusData?.job?.status === "success") {
          designId = statusData.job.result?.design?.id;
          break;
        }
        if (statusData?.job?.status === "failed") {
          return jsonError("Autofill job failed: " + JSON.stringify(statusData), 500, cors);
        }
      }
      if (!designId) return jsonError("Autofill timed out", 504, cors);

      // 4) Export the design as PDF
      const exportRes = await fetch(`${CANVA_API_BASE}/exports`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          design_id: designId,
          format: { type: "pdf" },
        }),
      });
      const exportData = await exportRes.json();
      if (!exportRes.ok) return jsonError("Export failed: " + JSON.stringify(exportData), 500, cors);

      const exportJobId = exportData?.job?.id;
      // Poll export
      let downloadUrl = null;
      for (let i = 0; i < 15; i++) {
        await sleep(2000);
        const statusRes = await fetch(`${CANVA_API_BASE}/exports/${exportJobId}`, {
          headers: { "Authorization": `Bearer ${accessToken}` },
        });
        const statusData = await statusRes.json();
        if (statusData?.job?.status === "success") {
          downloadUrl = statusData.job.urls?.[0];
          break;
        }
        if (statusData?.job?.status === "failed") {
          return jsonError("Export job failed: " + JSON.stringify(statusData), 500, cors);
        }
      }
      if (!downloadUrl) return jsonError("Export timed out", 504, cors);

      return new Response(JSON.stringify({
        success: true,
        download_url: downloadUrl,
        design_id: designId,
        student_name: studentName,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    // Default
    return new Response("BagrutAI Canva Worker. Endpoints: /canva/auth-url, /canva/callback, /canva/certificate", {
      status: 200, headers: { "Content-Type": "text/plain", ...cors },
    });
  },
};

async function refreshAccessToken(env) {
  const res = await fetch(`${CANVA_API_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": "Basic " + btoa(`${env.CANVA_CLIENT_ID}:${env.CANVA_CLIENT_SECRET}`),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: env.CANVA_REFRESH_TOKEN,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("Refresh failed:", err);
    return null;
  }
  const data = await res.json();
  return data.access_token;
}

function jsonError(msg, status, cors) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
