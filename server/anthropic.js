import Anthropic from "@anthropic-ai/sdk";

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }
  return new Anthropic({ apiKey: key });
}

function getGeminiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set.");
  }
  return key;
}

function getOpenRouterKey() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error("OPENROUTER_API_KEY is not set.");
  }
  return key;
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Claude did not return JSON.");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function normalizeStringList(list, maxItems = 30) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const value of list) {
    if (typeof value !== "string") continue;
    const cleaned = value.trim().replace(/\s+/g, " ");
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= maxItems) break;
  }
  return out;
}

function validateSuggestions(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const s of list.slice(0, 12)) {
    if (!s || typeof s !== "object") continue;
    const before = typeof s.before === "string" ? s.before : "";
    const after = typeof s.after === "string" ? s.after : "";
    if (!before.trim() || !after.trim()) continue;
    if (before.length > 2000 || after.length > 2400) continue;
    out.push({
      id:
        typeof s.id === "string" && s.id.trim()
          ? s.id.trim()
          : `s_${Math.random().toString(36).slice(2, 10)}`,
      title: typeof s.title === "string" && s.title.trim() ? s.title.trim() : "Improvement",
      reason: typeof s.reason === "string" ? s.reason.trim().slice(0, 280) : "",
      before,
      after,
      confidence: ["high", "medium", "low"].includes(s.confidence) ? s.confidence : "medium",
      tags: normalizeStringList(s.tags, 10),
    });
  }
  return out;
}

async function requestJson(prompt, maxTokens = 2200) {
  const systemText =
    "Return only valid JSON. No markdown fences. No extra text. Keep responses concise and deterministic.";
  const anthropicModel = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest";
  const geminiModel = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const openRouterModel = process.env.OPENROUTER_MODEL || "meta-llama/llama-3-8b-instruct";
  const aiProvider = (process.env.AI_PROVIDER || "").trim().toLowerCase();
  const provider =
    aiProvider ||
    (process.env.OPENROUTER_API_KEY
      ? "openrouter"
      : process.env.GEMINI_API_KEY
      ? "gemini"
      : process.env.ANTHROPIC_API_KEY
      ? "anthropic"
      : "");

  if (provider === "openrouter") {
    const key = getOpenRouterKey();
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: openRouterModel,
        temperature: 0.2,
        messages: [
          { role: "system", content: systemText },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenRouter request failed (${response.status}): ${body}`);
    }
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || "";
    return extractJson(String(text).trim());
  }

  if (provider === "gemini") {
    const key = getGeminiKey();
    const candidates = dedupeList([
      geminiModel,
      "gemini-1.5-flash",
      "gemini-1.5-pro-latest",
      "gemini-2.0-flash",
    ]);

    let lastError = null;
    for (const model of candidates) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent?key=${encodeURIComponent(key)}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: `${systemText}\n\n${prompt}` }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: maxTokens,
            responseMimeType: "application/json",
          },
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        lastError = `Gemini model ${model} failed (${response.status}): ${body}`;
        // Retry on model-not-found. For other errors, stop immediately.
        if (response.status !== 404) {
          throw new Error(lastError);
        }
        continue;
      }
      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n") || "";
      return extractJson(text.trim());
    }
    throw new Error(lastError || "Gemini request failed for all fallback models.");
  }

  const client = getClient();
  const msg = await client.messages.create({
    model: anthropicModel,
    max_tokens: maxTokens,
    temperature: 0.2,
    system: systemText,
    messages: [{ role: "user", content: prompt }],
  });
  const text = msg.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();
  return extractJson(text);
}

function dedupeList(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const v = String(item || "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export async function extractKeywordsAndSkills(jobDescription) {
  const prompt = [
    "You are an ATS-focused resume assistant.",
    "From the provided job description, extract important skills and keywords.",
    "Return JSON exactly with fields: {\"skills\": string[], \"keywords\": string[]}.",
    "Rules:",
    "- skills: technical and professional capabilities.",
    "- keywords: tools, domains, certifications, role-specific terms.",
    "- deduplicate and keep short phrases.",
    "- max 20 per list.",
    "",
    "Job Description:",
    jobDescription,
  ].join("\n");
  const json = await requestJson(prompt, 1200);
  return {
    skills: normalizeStringList(json.skills, 20),
    keywords: normalizeStringList(json.keywords, 20),
  };
}

export async function engageResumeSuggestions({ jobDescription, skills, keywords, latex }) {
  const prompt = [
    "You are an expert technical resume editor for LaTeX resumes.",
    "Goal: suggest small, high-impact snippet edits to align a resume with a job description.",
    "IMPORTANT: Return JSON only with shape:",
    "{\"suggestions\":[{\"id\":\"...\",\"title\":\"...\",\"reason\":\"...\",\"before\":\"...\",\"after\":\"...\",\"confidence\":\"high|medium|low\",\"tags\":[\"...\"]}]}",
    "Rules:",
    "- Suggest 3 to 8 changes.",
    "- before must be exact text copied from latex input.",
    "- after must be valid LaTeX and should naturally include relevant skills/keywords.",
    "- Do not rewrite whole document.",
    "- Keep edits local and realistic.",
    "",
    `Skills: ${JSON.stringify(normalizeStringList(skills, 25))}`,
    `Keywords: ${JSON.stringify(normalizeStringList(keywords, 25))}`,
    "",
    "Job Description:",
    jobDescription,
    "",
    "Resume LaTeX:",
    latex,
  ].join("\n");
  const json = await requestJson(prompt, 3200);
  return { suggestions: validateSuggestions(json.suggestions) };
}

