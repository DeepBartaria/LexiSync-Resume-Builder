import "dotenv/config";
import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import { compileLatexToPdf } from "./compileLatex.js";
import { Document } from "./models/Document.js";
import path from "path";
import { fileURLToPath } from "url";
import { applySelectedSuggestions } from "./applySuggestions.js";
import { engageResumeSuggestions, extractKeywordsAndSkills } from "./anthropic.js";

function dbOk() {
  return mongoose.connection.readyState === 1;
}

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/overleaf-clone";

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

// Serve the built React app in production (Render-friendly single service).
if (process.env.NODE_ENV === "production") {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const clientDist = path.resolve(__dirname, "..", "client", "dist");
  app.use(express.static(clientDist));
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/compile", async (req, res) => {
  const source = req.body?.source;
  if (typeof source !== "string") {
    return res.status(400).json({ error: "Missing string body field `source`." });
  }
  try {
    const pdf = await compileLatexToPdf(source);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="document.pdf"');
    return res.send(Buffer.from(pdf));
  } catch (err) {
    console.error(err);
    return res.status(422).json({
      error: "Compilation failed",
      details: String(err.message || err),
    });
  }
});

app.post("/api/ai/extract", async (req, res) => {
  const jobDescription = req.body?.jobDescription;
  if (typeof jobDescription !== "string" || !jobDescription.trim()) {
    return res.status(400).json({ error: "Missing `jobDescription` string." });
  }
  try {
    const result = await extractKeywordsAndSkills(jobDescription);
    return res.json(result);
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "AI extract failed.",
      details: String(e.message || e),
    });
  }
});

app.post("/api/ai/engage", async (req, res) => {
  const { jobDescription, skills, keywords, latex } = req.body || {};
  if (typeof jobDescription !== "string" || typeof latex !== "string") {
    return res.status(400).json({ error: "Missing `jobDescription` or `latex`." });
  }
  try {
    const result = await engageResumeSuggestions({
      jobDescription,
      skills,
      keywords,
      latex,
    });
    return res.json(result);
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "AI engage failed.",
      details: String(e.message || e),
    });
  }
});

app.post("/api/ai/commit", async (req, res) => {
  const { latex, suggestions, suggestionIds } = req.body || {};
  if (typeof latex !== "string") {
    return res.status(400).json({ error: "Missing `latex` string." });
  }
  const result = applySelectedSuggestions(latex, suggestions, suggestionIds);
  return res.json(result);
});

app.get("/api/documents", async (_req, res) => {
  if (!dbOk()) {
    return res.status(503).json({
      error: "MongoDB not connected. Set MONGODB_URI and ensure MongoDB is running.",
    });
  }
  try {
    const docs = await Document.find().sort({ updatedAt: -1 }).limit(50).lean();
    res.json(docs);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not list documents." });
  }
});

app.get("/api/documents/:id", async (req, res) => {
  if (!dbOk()) {
    return res.status(503).json({ error: "MongoDB not connected." });
  }
  try {
    const doc = await Document.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (e) {
    res.status(400).json({ error: "Invalid id" });
  }
});

app.post("/api/documents", async (req, res) => {
  if (!dbOk()) {
    return res.status(503).json({ error: "MongoDB not connected." });
  }
  const { title, source, jobDescription, skills, keywords } = req.body || {};
  if (typeof source !== "string") {
    return res.status(400).json({ error: "Missing `source` string." });
  }
  try {
    const doc = await Document.create({
      title: typeof title === "string" ? title : "Untitled",
      source,
      jobDescription: typeof jobDescription === "string" ? jobDescription : "",
      skills: Array.isArray(skills) ? skills.filter((s) => typeof s === "string") : [],
      keywords: Array.isArray(keywords) ? keywords.filter((k) => typeof k === "string") : [],
    });
    res.status(201).json(doc);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not save document." });
  }
});

app.patch("/api/documents/:id", async (req, res) => {
  if (!dbOk()) {
    return res.status(503).json({ error: "MongoDB not connected." });
  }
  const { title, source, jobDescription, skills, keywords } = req.body || {};
  try {
    const doc = await Document.findByIdAndUpdate(
      req.params.id,
      {
        ...(typeof title === "string" ? { title } : {}),
        ...(typeof source === "string" ? { source } : {}),
        ...(typeof jobDescription === "string" ? { jobDescription } : {}),
        ...(Array.isArray(skills) ? { skills: skills.filter((s) => typeof s === "string") } : {}),
        ...(Array.isArray(keywords)
          ? { keywords: keywords.filter((k) => typeof k === "string") }
          : {}),
      },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (e) {
    res.status(400).json({ error: "Invalid update" });
  }
});

app.delete("/api/documents/:id", async (req, res) => {
  if (!dbOk()) {
    return res.status(503).json({ error: "MongoDB not connected." });
  }
  try {
    const r = await Document.findByIdAndDelete(req.params.id);
    if (!r) return res.status(404).json({ error: "Not found" });
    res.status(204).send();
  } catch {
    res.status(400).json({ error: "Invalid id" });
  }
});

async function main() {
  const server = app.listen(PORT, () => {
    console.log(`API http://localhost:${PORT}`);
  });
  server.on("error", (err) => {
    // Handle cases like EADDRINUSE so dev-watch doesn't just keep crashing.
    if (err && err.code === "EADDRINUSE") {
      console.error(
        `Failed to start API: port ${PORT} is already in use. Try setting a different PORT env var (e.g. PORT=5001).`
      );
    } else {
      console.error("Failed to start API:", err);
    }
    process.exit(1);
  });

  // Connect to MongoDB after the server is up.
  // Use a short timeout so local dev doesn't hang if Mongo isn't running.
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 1500 });
    console.log("MongoDB connected");
  } catch (e) {
    console.warn("MongoDB not available — document save/load disabled:", e.message);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
