/**
 * BagrutAI — DALL-E Image Generation Proxy
 * =========================================
 * Cloudflare Worker that proxies image generation requests to OpenAI's DALL-E API.
 * Keeps your OPENAI_API_KEY secret server-side.
 *
 * ===========================================
 * DEPLOYMENT (5 minutes, free Cloudflare tier):
 * ===========================================
 * 1. Get an OpenAI API key:
 *    a. Go to https://platform.openai.com/api-keys
 *    b. Sign up / log in
 *    c. "Create new secret key" — copy it (starts with sk-)
 *    d. Add billing info (DALL-E 3 costs ~$0.04 per image, $5 minimum prepaid)
 *
 * 2. Deploy this worker:
 *    a. Go to https://workers.cloudflare.com (use existing account)
 *    b. "Create Worker" → name it: bagrutai-dalle
 *    c. Copy-paste this entire file in the editor
 *    d. Click "Deploy"
 *
 * 3. Add the API key as a secret:
 *    Worker → Settings → Variables and Secrets → Add
 *    Name:  OPENAI_API_KEY
 *    Value: <your sk-... key>
 *    Type:  Secret
 *
 * 4. Copy your Worker URL (e.g. https://bagrutai-dalle.<sub>.workers.dev)
 *
 * 5. In app.html — set:
 *    const DALLE_API_ENDPOINT = "https://bagrutai-dalle.<sub>.workers.dev/generate";
 *
 * 6. Push the change. The flashcard "🎨 Generate Image" button will now work!
 */

const ALLOWED_ORIGINS = [
  "https://bagrutai.co.il",
  "https://www.bagrutai.co.il",
  "https://odeliayanay6.github.io",
];
const DEV_ALLOW_ANY_ORIGIN = false;

function corsHeaders(origin) {
  const allowed = DEV_ALLOW_ANY_ORIGIN || ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method === "GET") {
      return new Response("BagrutAI DALL-E Proxy is running.", {
        status: 200,
        headers: { "Content-Type": "text/plain", ...cors },
      });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: cors });
    }

    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
        status: 500, headers: { "Content-Type": "application/json", ...cors },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400, headers: { "Content-Type": "application/json", ...cors },
      });
    }

    // Limit prompt length to control cost & abuse
    const userPrompt = (body.prompt || "").substring(0, 500);
    if (!userPrompt) {
      return new Response(JSON.stringify({ error: "Missing 'prompt' field" }), {
        status: 400, headers: { "Content-Type": "application/json", ...cors },
      });
    }

    // Wrap with educational style guide
    const finalPrompt = `Educational illustration for high school students studying for matriculation exam (Bagrut). Topic: ${userPrompt}. Style: clean, colorful, infographic-like, suitable for memorization. Avoid text in image.`;

    try {
      const apiRes = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: body.model || "dall-e-3",
          prompt: finalPrompt,
          n: 1,
          size: body.size || "1024x1024",
          quality: body.quality || "standard",  // "standard" or "hd"
          style: body.style || "natural",        // "vivid" or "natural"
        }),
      });

      const data = await apiRes.json();

      if (!apiRes.ok) {
        console.error("DALL-E API error:", data);
        return new Response(JSON.stringify({ error: data.error?.message || "DALL-E error" }), {
          status: apiRes.status, headers: { "Content-Type": "application/json", ...cors },
        });
      }

      // Extract URL from OpenAI response
      const imageUrl = data?.data?.[0]?.url;
      if (!imageUrl) {
        return new Response(JSON.stringify({ error: "No image URL in response" }), {
          status: 500, headers: { "Content-Type": "application/json", ...cors },
        });
      }

      return new Response(JSON.stringify({ url: imageUrl, prompt: finalPrompt }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...cors },
      });
    } catch (e) {
      console.error("Worker error:", e);
      return new Response(JSON.stringify({ error: "Internal proxy error: " + e.message }), {
        status: 500, headers: { "Content-Type": "application/json", ...cors },
      });
    }
  },
};
