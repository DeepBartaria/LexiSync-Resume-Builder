import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import brandLogoPng from "./assets/lexisync-logo.png";
import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { langs } from "@uiw/codemirror-extensions-langs";

const DEFAULT_SOURCE = `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{lmodern}
\\begin{document}
\\section*{Welcome}
Edit this LaTeX on the left and press \\textbf{Compile} to see the PDF.
\\end{document}
`;

const HOME_IMAGES = [
  "https://images.unsplash.com/photo-1493612276216-ee3925520721?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=80",
];

const SLIDER_IMAGES = [
  "https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1200&q=80",
];

const VIEW = {
  HOME: "home",
  DOCUMENTS: "documents",
  WIZARD: "wizard",
  EDITOR: "editor",
};

function apiBase() {
  return import.meta.env.VITE_API_URL || "";
}

function dedupeList(list) {
  const seen = new Set();
  const out = [];
  for (const item of list || []) {
    if (typeof item !== "string") continue;
    const cleaned = item.trim().replace(/\s+/g, " ");
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

export default function App() {
  const [view, setView] = useState(VIEW.HOME);
  const [navHover, setNavHover] = useState(null);
  const [hoverSection, setHoverSection] = useState(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [title, setTitle] = useState("Untitled");
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const [jobDescription, setJobDescription] = useState("");
  const [skills, setSkills] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [newSkill, setNewSkill] = useState("");
  const [newKeyword, setNewKeyword] = useState("");
  const [pdfUrl, setPdfUrl] = useState(null);
  const [compileError, setCompileError] = useState("");
  const [compiling, setCompiling] = useState(false);
  const [autoCompile, setAutoCompile] = useState(false);
  const [docId, setDocId] = useState(null);
  const [savedList, setSavedList] = useState([]);
  const [hasPdf, setHasPdf] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [engaging, setEngaging] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState([]);
  const [showEngagePanel, setShowEngagePanel] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const debounceRef = useRef(null);
  const lastBlobRef = useRef(null);

  const selectedSet = useMemo(() => new Set(selectedSuggestionIds), [selectedSuggestionIds]);

  const compile = useCallback(async () => {
    setCompiling(true);
    setCompileError("");
    try {
      const res = await fetch(`${apiBase()}/api/compile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.details || err.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      lastBlobRef.current = blob;
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      setHasPdf(true);
    } catch (e) {
      setCompileError(String(e.message || e));
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setHasPdf(false);
      lastBlobRef.current = null;
    } finally {
      setCompiling(false);
    }
  }, [source]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  useEffect(() => {
    if (!autoCompile || view !== VIEW.EDITOR) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      compile();
    }, 1200);
    return () => clearTimeout(debounceRef.current);
  }, [source, autoCompile, compile, view]);

  const refreshList = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase()}/api/documents`);
      if (!r.ok) return;
      const data = await r.json();
      setSavedList(data);
    } catch {
      /* Mongo may be down */
    }
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % SLIDER_IMAGES.length);
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  const saveDoc = async () => {
    try {
      const payload = { title, source, jobDescription, skills, keywords };
      const url = docId ? `${apiBase()}/api/documents/${docId}` : `${apiBase()}/api/documents`;
      const method = docId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
      const doc = await res.json();
      setDocId(doc._id);
      await refreshList();
    } catch (e) {
      setCompileError(String(e.message || e));
    }
  };

  const loadDoc = async (id) => {
    try {
      const res = await fetch(`${apiBase()}/api/documents/${id}`);
      if (!res.ok) return;
      const doc = await res.json();
      setDocId(doc._id);
      setTitle(doc.title || "Untitled");
      setSource(doc.source || "");
      setJobDescription(doc.jobDescription || "");
      setSkills(dedupeList(doc.skills || []));
      setKeywords(dedupeList(doc.keywords || []));
      setSuggestions([]);
      setSelectedSuggestionIds([]);
      setView(VIEW.EDITOR);
    } catch {
      /* ignore */
    }
  };

  const resetDocState = () => {
    setDocId(null);
    setTitle("Untitled");
    setSource(DEFAULT_SOURCE);
    setJobDescription("");
    setSkills([]);
    setKeywords([]);
    setSuggestions([]);
    setSelectedSuggestionIds([]);
    setShowEngagePanel(false);
    setPdfUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setHasPdf(false);
    lastBlobRef.current = null;
    setCompileError("");
  };

  const startNewFlow = () => {
    resetDocState();
    setWizardStep(1);
    setView(VIEW.WIZARD);
  };

  const backHome = async () => {
    setView(VIEW.HOME);
    await refreshList();
  };

  const goDocuments = async () => {
    setView(VIEW.DOCUMENTS);
    await refreshList();
  };

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const goHomeAndScroll = async (id) => {
    if (view !== VIEW.HOME) {
      setView(VIEW.HOME);
      setTimeout(() => scrollToSection(id), 80);
      return;
    }
    scrollToSection(id);
  };

  const renameDoc = async (id) => {
    const doc = savedList.find((d) => d._id === id);
    const next = window.prompt("Rename document", doc?.title || "Untitled");
    if (next == null) return;
    const trimmed = String(next).trim();
    if (!trimmed) return;
    try {
      const res = await fetch(`${apiBase()}/api/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) throw new Error("Rename failed");
      if (docId === id) setTitle(trimmed);
      await refreshList();
    } catch (e) {
      setCompileError(String(e.message || e));
    }
  };

  const deleteDoc = async (id) => {
    if (!window.confirm("Delete this document? This cannot be undone.")) return;
    try {
      const res = await fetch(`${apiBase()}/api/documents/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Delete failed");
      if (docId === id) resetDocState();
      await refreshList();
    } catch (e) {
      setCompileError(String(e.message || e));
    }
  };

  const duplicateDoc = async (id) => {
    try {
      const res = await fetch(`${apiBase()}/api/documents/${id}`);
      if (!res.ok) throw new Error("Could not load for duplication");
      const doc = await res.json();
      const created = await fetch(`${apiBase()}/api/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${doc.title || "Untitled"} (copy)`,
          source: doc.source || "",
          jobDescription: doc.jobDescription || "",
          skills: dedupeList(doc.skills || []),
          keywords: dedupeList(doc.keywords || []),
        }),
      });
      if (!created.ok) throw new Error("Duplicate failed");
      await refreshList();
    } catch (e) {
      setCompileError(String(e.message || e));
    }
  };

  const extractFromJD = async () => {
    if (!jobDescription.trim()) return;
    setExtracting(true);
    setCompileError("");
    try {
      const res = await fetch(`${apiBase()}/api/ai/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.details || err.error || "Extract failed");
      }
      const data = await res.json();
      setSkills(dedupeList(data.skills || []));
      setKeywords(dedupeList(data.keywords || []));
      setWizardStep(2);
    } catch (e) {
      setCompileError(String(e.message || e));
    } finally {
      setExtracting(false);
    }
  };

  const addListItem = (kind) => {
    if (kind === "skill") {
      const val = newSkill.trim();
      if (!val) return;
      setSkills((prev) => dedupeList([...prev, val]));
      setNewSkill("");
      return;
    }
    const val = newKeyword.trim();
    if (!val) return;
    setKeywords((prev) => dedupeList([...prev, val]));
    setNewKeyword("");
  };

  const removeListItem = (kind, item) => {
    if (kind === "skill") setSkills((prev) => prev.filter((v) => v !== item));
    else setKeywords((prev) => prev.filter((v) => v !== item));
  };

  const openEditorFromWizard = () => {
    setView(VIEW.EDITOR);
  };

  const engage = async () => {
    if (!jobDescription.trim()) {
      setCompileError("Add a job description first using New workflow.");
      return;
    }
    setEngaging(true);
    setCompileError("");
    try {
      const res = await fetch(`${apiBase()}/api/ai/engage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobDescription,
          skills,
          keywords,
          latex: source,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.details || err.error || "Engage failed");
      }
      const data = await res.json();
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      setSelectedSuggestionIds((data.suggestions || []).map((s) => s.id));
      setShowEngagePanel(true);
    } catch (e) {
      setCompileError(String(e.message || e));
    } finally {
      setEngaging(false);
    }
  };

  const toggleSuggestion = (id) => {
    setSelectedSuggestionIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const commitSuggestions = async () => {
    if (!selectedSuggestionIds.length) return;
    try {
      const res = await fetch(`${apiBase()}/api/ai/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latex: source,
          suggestions,
          suggestionIds: selectedSuggestionIds,
        }),
      });
      if (!res.ok) throw new Error("Commit failed");
      const data = await res.json();
      setSource(data.latex || source);
      if (Array.isArray(data.skipped) && data.skipped.length > 0) {
        const detail = data.skipped.map((s) => `${s.id}: ${s.reason}`).join("\n");
        setCompileError(`Some suggestions were skipped:\n${detail}`);
      } else {
        setCompileError("");
      }
      setShowEngagePanel(false);
    } catch (e) {
      setCompileError(String(e.message || e));
    }
  };

  const downloadPdf = () => {
    const blob = lastBlobRef.current;
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[^\w.-]+/g, "_") || "document"}.pdf`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const navSelection =
    navHover === "home" || navHover === "documents"
      ? navHover
      : view === VIEW.DOCUMENTS
      ? "documents"
      : "home";

  return (
    <div style={styles.shell}>
      <div style={styles.navWrap}>
        <nav style={styles.navPill}>
          <div style={styles.navInner}>
            <div style={styles.navBrand} onClick={backHome} role="button" tabIndex={0} aria-label="LexiSync Home">
              <img src={brandLogoPng} alt="LexiSync" style={styles.brandLogoImg} />
            </div>
            <div style={styles.navMenu}>
              <span
                style={{
                  ...styles.navBubble,
                  transform: navSelection === "documents" ? "translateX(100%)" : "translateX(0%)",
                }}
              />
              <button
                type="button"
                style={view === VIEW.HOME ? styles.navItemActive : styles.navItem}
                onClick={backHome}
                onMouseEnter={() => setNavHover("home")}
                onMouseLeave={() => setNavHover(null)}
              >
                Home
              </button>
              <button
                type="button"
                style={view === VIEW.DOCUMENTS ? styles.navItemActive : styles.navItem}
                onClick={goDocuments}
                onMouseEnter={() => setNavHover("documents")}
                onMouseLeave={() => setNavHover(null)}
              >
                Documents
              </button>
            </div>
            <div style={styles.navActions}>
              <button
                type="button"
                style={hoverSection === "why" ? styles.navSectionBtnHover : styles.navSectionBtn}
                onMouseEnter={() => setHoverSection("why")}
                onMouseLeave={() => setHoverSection(null)}
                onClick={() => goHomeAndScroll("why-section")}
              >
                Why
              </button>
              <button
                type="button"
                style={hoverSection === "action" ? styles.navSectionBtnHover : styles.navSectionBtn}
                onMouseEnter={() => setHoverSection("action")}
                onMouseLeave={() => setHoverSection(null)}
                onClick={() => goHomeAndScroll("action-section")}
              >
                In Action
              </button>
              <button
                type="button"
                style={hoverSection === "about" ? styles.navSectionBtnHover : styles.navSectionBtn}
                onMouseEnter={() => setHoverSection("about")}
                onMouseLeave={() => setHoverSection(null)}
                onClick={() => goHomeAndScroll("about-section")}
              >
                About
              </button>
              <button
                type="button"
                style={hoverSection === "live" ? styles.navSectionBtnHover : styles.navSectionBtn}
                onMouseEnter={() => setHoverSection("live")}
                onMouseLeave={() => setHoverSection(null)}
                onClick={() => goHomeAndScroll("live-section")}
              >
                Live
              </button>
              <button
                type="button"
                style={hoverSection === "faq" ? styles.navSectionBtnHover : styles.navSectionBtn}
                onMouseEnter={() => setHoverSection("faq")}
                onMouseLeave={() => setHoverSection(null)}
                onClick={() => goHomeAndScroll("faq-section")}
              >
                FAQ's
              </button>
            </div>
          </div>
        </nav>
      </div>

      {view === VIEW.HOME && (
        <main style={styles.landing}>
          <section style={styles.hero}>
            <div style={styles.heroLeft}>
              <div style={styles.heroKicker}>AI-first · ATS-focused · LaTeX-native</div>
              <h1 style={styles.heroTitle}>Build job-matched resumes with a real editor + PDF preview</h1>
              <p style={styles.heroText}>
                Paste a Job Description, extract skills/keywords, then Engage to preview targeted improvements
                before committing safe snippet edits to your LaTeX resume.
              </p>
              <div style={styles.heroActions}>
                <button type="button" style={styles.btnPrimary} onClick={startNewFlow}>
                  Start with Job Description
                </button>
                <button type="button" style={styles.btnGhost} onClick={goDocuments}>
                  View Documents
                </button>
              </div>
              <div style={styles.heroStatsRow}>
                <div style={styles.stat}>
                  <div style={styles.statNum}>Side-by-side</div>
                  <div style={styles.statLabel}>Editor + PDF preview</div>
                </div>
                <div style={styles.stat}>
                  <div style={styles.statNum}>Preview first</div>
                  <div style={styles.statLabel}>Before/after diffs</div>
                </div>
                <div style={styles.stat}>
                  <div style={styles.statNum}>Safe commits</div>
                  <div style={styles.statLabel}>Exact snippet replace</div>
                </div>
              </div>
            </div>
            <div style={styles.heroRight}>
              <div style={styles.mockCard}>
                <div style={styles.mockTop}>
                  <div style={styles.dotRow}>
                    <span style={styles.dot} />
                    <span style={{ ...styles.dot, opacity: 0.8 }} />
                    <span style={{ ...styles.dot, opacity: 0.6 }} />
                  </div>
                  <div style={styles.mockTitle}>Engage preview</div>
                </div>
                <div style={styles.mockBody}>
                  <div style={styles.mockChipRow}>
                    {["Python", "React", "MongoDB", "CI/CD", "Leadership"].map((t) => (
                      <span key={t} style={styles.mockChip}>
                        {t}
                      </span>
                    ))}
                  </div>
                  <div style={styles.mockDiffGrid}>
                    <div style={styles.mockPane}>
                      <div style={styles.mockPaneTitle}>Before</div>
                      <pre style={styles.mockPre}>
{`\\item Built a web app for internal use.
\\item Improved performance.`}
                      </pre>
                    </div>
                    <div style={styles.mockPane}>
                      <div style={styles.mockPaneTitle}>After</div>
                      <pre style={styles.mockPre}>
{`\\item Built a React + Node.js app; added CI/CD and MongoDB persistence.
\\item Improved performance by 35% via profiling and caching.`}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="why-section" style={styles.section}>
            <h2 style={styles.sectionTitle}>Why this builder</h2>
            <div style={styles.featureGrid}>
              {[
                {
                  title: "Overleaf-style workflow",
                  text: "Write LaTeX on the left, see the PDF on the right, download anytime.",
                },
                {
                  title: "Job Description → skills map",
                  text: "Extract relevant skills/keywords and edit them before applying suggestions.",
                },
                {
                  title: "Preview-only diffs",
                  text: "Engage shows before/after for each change, so you stay in control.",
                },
                {
                  title: "Safe commit engine",
                  text: "Applies only exact snippet replacements to avoid accidental rewrites.",
                },
              ].map((f) => (
                <article key={f.title} style={styles.featureCard}>
                  <div style={styles.featureTitle}>{f.title}</div>
                  <div style={styles.featureText}>{f.text}</div>
                </article>
              ))}
            </div>
          </section>

          <section id="action-section" style={styles.section}>
            <h2 style={styles.sectionTitle}>In Action</h2>
            <div style={styles.photoGrid}>
              {HOME_IMAGES.map((src, i) => (
                <article key={src} style={styles.photoCard}>
                  <img src={src} alt={`Resume builder preview ${i + 1}`} style={styles.photoImg} />
                </article>
              ))}
            </div>
          </section>

          <section id="about-section" style={styles.section}>
            <h2 style={styles.sectionTitle}>About</h2>
            <div style={styles.aboutCard}>
              <div style={styles.aboutText}>
                This project is built for candidates who want a clean PDF resume, fast iteration, and a workflow
                that keeps edits auditable. It’s designed like an engineering tool: predictable, previewable,
                and easy to deploy.
              </div>
              <div style={styles.aboutBadges}>
                {["MERN", "LaTeX", "AI Assist", "Render-ready"].map((b) => (
                  <span key={b} style={styles.badge}>
                    {b}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section id="live-section" style={styles.section}>
            <h2 style={styles.sectionTitle}>Live Highlights</h2>
            <div style={styles.sliderViewport}>
              <div
                style={{
                  ...styles.sliderTrack,
                  width: `${SLIDER_IMAGES.length * 100}%`,
                  transform: `translateX(-${(100 / SLIDER_IMAGES.length) * slideIndex}%)`,
                }}
              >
                {SLIDER_IMAGES.map((src, i) => (
                  <div key={src} style={{ ...styles.sliderItem, width: `${100 / SLIDER_IMAGES.length}%` }}>
                    <img src={src} alt={`Dynamic slide ${i + 1}`} style={styles.sliderImg} />
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="faq-section" style={styles.section}>
            <h2 style={styles.sectionTitle}>Frequently Asked Questions</h2>
            <div style={styles.faqList}>
              <details style={styles.faqItem}>
                <summary style={styles.faqQ}>How does the JD-based optimization work?</summary>
                <div style={styles.faqA}>
                  Paste the job description, extract skills/keywords, review them, then use Engage to preview
                  snippet-level improvements before commit.
                </div>
              </details>
              <details style={styles.faqItem}>
                <summary style={styles.faqQ}>Will Engage rewrite my full resume?</summary>
                <div style={styles.faqA}>
                  No. It proposes focused snippet edits with before/after preview. Commit only applies selected
                  exact-match snippets.
                </div>
              </details>
              <details style={styles.faqItem}>
                <summary style={styles.faqQ}>Can I still manually edit LaTeX?</summary>
                <div style={styles.faqA}>
                  Yes. The left editor remains fully manual. AI suggestions are optional and always reviewable.
                </div>
              </details>
              <details style={styles.faqItem}>
                <summary style={styles.faqQ}>Do I need MongoDB to use this?</summary>
                <div style={styles.faqA}>
                  MongoDB is required for saving/loading documents. Compile and preview work even without MongoDB.
                </div>
              </details>
              <details style={styles.faqItem}>
                <summary style={styles.faqQ}>Can I deploy this on Render?</summary>
                <div style={styles.faqA}>
                  Yes. The Docker setup is Render-friendly and includes TeX packages for production PDF generation.
                </div>
              </details>
            </div>
          </section>
        </main>
      )}

      {view === VIEW.DOCUMENTS && (
        <main style={styles.documents}>
          <div style={styles.homeHead}>
            <div>
              <div style={styles.homeTitle}>Your documents</div>
              <div style={styles.homeSubtitle}>Duplicate, continue, rename, or delete resumes.</div>
            </div>
            <button type="button" style={styles.btnPrimary} onClick={startNewFlow}>
              Create new
            </button>
          </div>
          <div style={styles.grid}>
            {savedList.length === 0 ? (
              <div style={styles.emptyCard}>
                <div style={styles.emptyTitle}>No documents yet</div>
                <div style={styles.emptyText}>Click Create new to start from job description.</div>
              </div>
            ) : (
              savedList.map((d) => (
                <article key={d._id} style={styles.card}>
                  <div style={styles.cardTop}>
                    <div style={styles.cardTitle}>{d.title || "Untitled"}</div>
                    <div style={styles.cardMeta}>
                      {d.updatedAt ? new Date(d.updatedAt).toLocaleString() : ""}
                    </div>
                  </div>
                  <div style={styles.cardActions}>
                    <button type="button" style={styles.btnGhost} onClick={() => loadDoc(d._id)}>
                      Continue
                    </button>
                    <button type="button" style={styles.btnGhost} onClick={() => duplicateDoc(d._id)}>
                      Duplicate
                    </button>
                    <button type="button" style={styles.btnGhost} onClick={() => renameDoc(d._id)}>
                      Rename
                    </button>
                    <button type="button" style={styles.btnDanger} onClick={() => deleteDoc(d._id)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </main>
      )}

      {view === VIEW.WIZARD && (
        <main style={styles.wizard}>
          <div style={styles.wizardCard}>
            {wizardStep === 1 && (
              <>
                <h2 style={styles.blockTitle}>Paste Job Description</h2>
                <textarea
                  style={styles.jdInput}
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Paste full job description here..."
                />
                <div style={styles.inlineActions}>
                  <button type="button" style={styles.btnGhost} onClick={backHome}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    style={styles.btnPrimary}
                    onClick={extractFromJD}
                    disabled={!jobDescription.trim() || extracting}
                  >
                    {extracting ? "Extracting..." : "Extract Keywords & Skills"}
                  </button>
                </div>
              </>
            )}
            {wizardStep === 2 && (
              <>
                <h2 style={styles.blockTitle}>Review Skills & Keywords</h2>
                <div style={styles.twoCol}>
                  <section style={styles.panel}>
                    <div style={styles.panelTitle}>Skills</div>
                    <div style={styles.chips}>
                      {skills.map((item) => (
                        <button
                          key={item}
                          type="button"
                          style={styles.chip}
                          onClick={() => removeListItem("skill", item)}
                          title="Click to remove"
                        >
                          {item} ×
                        </button>
                      ))}
                    </div>
                    <div style={styles.addRow}>
                      <input
                        style={styles.smallInput}
                        value={newSkill}
                        onChange={(e) => setNewSkill(e.target.value)}
                        placeholder="Add skill"
                      />
                      <button type="button" style={styles.btnGhost} onClick={() => addListItem("skill")}>
                        Add
                      </button>
                    </div>
                  </section>
                  <section style={styles.panel}>
                    <div style={styles.panelTitle}>Keywords</div>
                    <div style={styles.chips}>
                      {keywords.map((item) => (
                        <button
                          key={item}
                          type="button"
                          style={styles.chip}
                          onClick={() => removeListItem("keyword", item)}
                          title="Click to remove"
                        >
                          {item} ×
                        </button>
                      ))}
                    </div>
                    <div style={styles.addRow}>
                      <input
                        style={styles.smallInput}
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        placeholder="Add keyword"
                      />
                      <button
                        type="button"
                        style={styles.btnGhost}
                        onClick={() => addListItem("keyword")}
                      >
                        Add
                      </button>
                    </div>
                  </section>
                </div>
                <div style={styles.inlineActions}>
                  <button type="button" style={styles.btnGhost} onClick={() => setWizardStep(1)}>
                    Back
                  </button>
                  <button type="button" style={styles.btnPrimary} onClick={openEditorFromWizard}>
                    Open Editor
                  </button>
                </div>
              </>
            )}
          </div>
        </main>
      )}

      {view === VIEW.EDITOR && (
        <main style={styles.editorMain}>
          <div style={styles.editorHeaderRow}>
            <input
              style={styles.titleInput}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title"
              aria-label="Document title"
            />
            {docId && <div style={styles.smallMeta}>Saved</div>}
            <label style={styles.check}>
              <input type="checkbox" checked={autoCompile} onChange={(e) => setAutoCompile(e.target.checked)} />
              Auto
            </label>
            <button type="button" style={styles.btnGhost} onClick={saveDoc}>
              Save
            </button>
            <button type="button" style={styles.btnPrimary} onClick={engage} disabled={engaging}>
              {engaging ? "Engaging..." : "Engage"}
            </button>
            <button type="button" style={styles.btnPrimary} onClick={compile} disabled={compiling}>
              {compiling ? "Compiling..." : "Compile"}
            </button>
            <button type="button" style={styles.btnGhost} onClick={downloadPdf} disabled={!hasPdf}>
              Download
            </button>
          </div>
          <div className="panels-responsive" style={styles.panels}>
            <section style={styles.editorPane}>
              <div style={styles.paneLabel}>Current LaTeX resume code</div>
              <div style={styles.editorCmWrap}>
                <CodeMirror
                  value={source}
                  onChange={(value) => setSource(value)}
                  height="100%"
                  theme={oneDark}
                  extensions={[langs.stex()]}
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    highlightActiveLine: true,
                    highlightSelectionMatches: true,
                    bracketMatching: true,
                  }}
                />
              </div>
            </section>
            <section style={styles.previewPane}>
              <div style={styles.paneLabel}>PDF preview</div>
              <div style={styles.previewFrame}>
                {pdfUrl ? (
                  <iframe title="PDF preview" src={pdfUrl} style={styles.iframe} />
                ) : (
                  <div style={styles.placeholder}>Compile to render PDF preview.</div>
                )}
              </div>
            </section>
          </div>

          {showEngagePanel && (
            <section style={styles.engagePanel}>
              <div style={styles.engageHeader}>
                <h3 style={styles.blockTitle}>Engage suggestions (preview only)</h3>
                <div style={styles.inlineActions}>
                  <button type="button" style={styles.btnGhost} onClick={() => setShowEngagePanel(false)}>
                    Close
                  </button>
                  <button
                    type="button"
                    style={styles.btnPrimary}
                    onClick={commitSuggestions}
                    disabled={!selectedSuggestionIds.length}
                  >
                    Commit selected
                  </button>
                </div>
              </div>
              <div style={styles.suggestionList}>
                {suggestions.map((s) => (
                  <article key={s.id} style={styles.suggestionCard}>
                    <label style={styles.suggestionHead}>
                      <input
                        type="checkbox"
                        checked={selectedSet.has(s.id)}
                        onChange={() => toggleSuggestion(s.id)}
                      />
                      <strong>{s.title}</strong>
                      <span style={styles.cardMeta}>({s.confidence || "medium"})</span>
                    </label>
                    {s.reason && <p style={styles.reason}>{s.reason}</p>}
                    <div style={styles.diffGrid}>
                      <div>
                        <div style={styles.diffTitle}>Before</div>
                        <pre style={styles.diffBlock}>{s.before}</pre>
                      </div>
                      <div>
                        <div style={styles.diffTitle}>After</div>
                        <pre style={styles.diffBlock}>{s.after}</pre>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </main>
      )}

      <footer style={styles.siteFooter}>
        <div style={styles.footerTop}>
          <div style={styles.footerCol}>
            <div style={styles.footerHead}>Job Seekers</div>
            <a href="#" style={styles.footerLink}>
              Build a Resume
            </a>
            <a href="#" style={styles.footerLink}>
              Samples
            </a>
            <a href="#" style={styles.footerLink}>
              Cover Letter Samples
            </a>
            <a href="#" style={styles.footerLink}>
              Apps
            </a>
          </div>
          <div style={styles.footerCol}>
            <div style={styles.footerHead}>Need Help?</div>
            <a href="#" style={styles.footerLink}>
              Help Center
            </a>
            <a href="#" style={styles.footerLink}>
              About Us
            </a>
            <a href="#" style={styles.footerLink}>
              Sitemap
            </a>
          </div>
        </div>

        <div style={styles.footerDivider} />

        <div style={styles.footerBottom}>
          <div style={styles.footerCopy}>Copyright © LexiSync 2026</div>
          <div style={styles.footerPolicyRow}>
            <a href="#" style={styles.footerLinkInline}>
              Terms
            </a>
            <a href="#" style={styles.footerLinkInline}>
              Privacy
            </a>
            <a href="#" style={styles.footerLinkInline}>
              Privacy Center
            </a>
            <a href="#" style={styles.footerLinkInline}>
              Your Privacy ChoicesPrivacy Options
            </a>
            <a href="#" style={styles.footerLinkInline}>
              Accessibility
            </a>
          </div>
          <p style={styles.footerDisclaimer}>
            The information on this site is provided as a courtesy. Resume.com is not a career or legal advisor
            and does not guarantee job interviews or offers.
          </p>
        </div>
      </footer>

      {compileError && (
        <footer style={styles.footer}>
          <strong style={{ color: "var(--error)" }}>Build log</strong>
          <pre style={styles.log}>{compileError}</pre>
        </footer>
      )}
    </div>
  );
}

const styles = {
  shell: { minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" },
  navWrap: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    padding: "0.85rem 0.5rem",
    pointerEvents: "none",
  },
  navPill: {
    pointerEvents: "auto",
    maxWidth: "1400px",
    margin: "0 auto",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(20, 27, 39, 0.30)",
    boxShadow: "0 18px 45px rgba(0,0,0,0.45)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  },
  navInner: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.6rem 0.85rem",
  },
  navBrand: {
    display: "flex",
    flexDirection: "column",
    cursor: "pointer",
    userSelect: "none",
    justifySelf: "start",
  },
  navLogo: { fontWeight: 700, fontSize: "0.95rem", letterSpacing: "-0.02em" },
  navTag: { fontSize: "0.72rem", color: "rgba(231,237,245,0.65)" },
  brandLogoImg: {
    height: "34px",
    width: "auto",
    display: "block",
    objectFit: "contain",
  },
  navMenu: {
    position: "relative",
    display: "flex",
    justifyContent: "center",
    justifySelf: "center",
    gap: "0.1rem",
    padding: "0.18rem",
    borderRadius: "999px",
    overflow: "hidden",
  },
  navBubble: {
    position: "absolute",
    top: "0.18rem",
    left: "0.18rem",
    width: "calc(50% - 0.18rem)",
    height: "calc(100% - 0.36rem)",
    borderRadius: "12px",
    background: "rgba(231, 237, 245, 0.70)",
    transition: "transform 240ms ease",
    pointerEvents: "none",
  },
  navItem: {
    position: "relative",
    zIndex: 1,
    minWidth: "122px",
    padding: "0.45rem 0.95rem",
    borderRadius: "12px",
    border: "1px solid transparent",
    background: "transparent",
    color: "rgba(231,237,245,0.75)",
    fontSize: "0.9rem",
    fontWeight: 600,
  },
  navItemHover: {
    padding: "0.45rem 0.75rem",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(231, 237, 245, 0.70)",
    color: "#0a0e14",
    fontSize: "0.9rem",
    fontWeight: 700,
  },
  navItemActive: {
    position: "relative",
    zIndex: 1,
    minWidth: "122px",
    padding: "0.45rem 0.95rem",
    borderRadius: "12px",
    border: "1px solid transparent",
    background: "transparent",
    color: "#0a0e14",
    fontSize: "0.9rem",
    fontWeight: 800,
  },
  navActions: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: "0.35rem",
    flexWrap: "wrap",
    justifySelf: "end",
  },
  navSectionBtn: {
    padding: "0.45rem 0.7rem",
    borderRadius: "12px",
    border: "1px solid transparent",
    background: "transparent",
    color: "rgba(231,237,245,0.88)",
    fontSize: "0.86rem",
    fontWeight: 600,
  },
  navSectionBtnHover: {
    padding: "0.45rem 0.7rem",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(231, 237, 245, 0.70)",
    color: "#0a0e14",
    fontSize: "0.86rem",
    fontWeight: 700,
  },
  check: {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    fontSize: "0.85rem",
    color: "var(--muted)",
    cursor: "pointer",
    userSelect: "none",
  },
  btnPrimary: {
    padding: "0.45rem 0.9rem",
    borderRadius: "6px",
    border: "none",
    background: "var(--accent)",
    color: "#0a0e14",
    fontWeight: 600,
    fontSize: "0.9rem",
  },
  btnGhost: {
    padding: "0.45rem 0.75rem",
    borderRadius: "6px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(10, 14, 20, 0.15)",
    color: "var(--text)",
    fontSize: "0.88rem",
  },
  btnDanger: {
    padding: "0.45rem 0.75rem",
    borderRadius: "6px",
    border: "1px solid rgba(240,113,120,0.35)",
    background: "rgba(240,113,120,0.10)",
    color: "rgba(240,113,120,0.95)",
    fontSize: "0.88rem",
    fontWeight: 600,
  },
  landing: { width: "100%", maxWidth: "1400px", margin: "0 auto", padding: "6.2rem 1rem 2rem" },
  documents: { width: "100%", maxWidth: "1400px", margin: "0 auto", padding: "6.2rem 1rem 1.25rem" },
  hero: {
    display: "grid",
    gridTemplateColumns: "1.25fr 1fr",
    gap: "1.25rem",
    alignItems: "stretch",
  },
  heroLeft: {
    borderRadius: "18px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(20, 27, 39, 0.45)",
    boxShadow: "0 22px 60px rgba(0,0,0,0.35)",
    padding: "1.25rem",
  },
  heroRight: {
    borderRadius: "18px",
    border: "1px solid rgba(255,255,255,0.10)",
    background:
      "radial-gradient(1200px 300px at 20% 0%, rgba(61,154,237,0.25), transparent 60%), rgba(20, 27, 39, 0.35)",
    boxShadow: "0 22px 60px rgba(0,0,0,0.35)",
    padding: "1.25rem",
  },
  heroKicker: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5rem",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(10, 14, 20, 0.25)",
    padding: "0.35rem 0.65rem",
    color: "rgba(231,237,245,0.75)",
    fontSize: "0.85rem",
    width: "fit-content",
  },
  heroTitle: { margin: "0.85rem 0 0.4rem", fontSize: "2rem", letterSpacing: "-0.03em" },
  heroText: { margin: 0, color: "rgba(231,237,245,0.72)", maxWidth: "56ch", lineHeight: 1.5 },
  heroActions: { display: "flex", gap: "0.65rem", flexWrap: "wrap", marginTop: "1rem" },
  heroStatsRow: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.65rem", marginTop: "1.1rem" },
  stat: {
    borderRadius: "14px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(10, 14, 20, 0.20)",
    padding: "0.7rem",
  },
  statNum: { fontWeight: 800, letterSpacing: "-0.02em" },
  statLabel: { marginTop: "0.2rem", color: "rgba(231,237,245,0.65)", fontSize: "0.85rem" },
  mockCard: {
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(10, 14, 20, 0.35)",
    overflow: "hidden",
  },
  mockTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.65rem 0.75rem",
    borderBottom: "1px solid rgba(255,255,255,0.10)",
  },
  dotRow: { display: "flex", gap: "0.35rem" },
  dot: { width: "9px", height: "9px", borderRadius: "999px", background: "rgba(231,237,245,0.55)" },
  mockTitle: { color: "rgba(231,237,245,0.75)", fontSize: "0.85rem" },
  mockBody: { padding: "0.75rem" },
  mockChipRow: { display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.65rem" },
  mockChip: {
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(61,154,237,0.14)",
    padding: "0.25rem 0.55rem",
    fontSize: "0.78rem",
    color: "rgba(231,237,245,0.85)",
  },
  mockDiffGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem" },
  mockPane: {
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.18)",
    padding: "0.6rem",
  },
  mockPaneTitle: { fontSize: "0.75rem", color: "rgba(231,237,245,0.65)", marginBottom: "0.35rem" },
  mockPre: {
    margin: 0,
    whiteSpace: "pre-wrap",
    fontFamily: '"IBM Plex Mono", monospace',
    fontSize: "0.75rem",
    color: "rgba(231,237,245,0.80)",
    lineHeight: 1.45,
  },
  section: { marginTop: "1.4rem" },
  sectionTitle: { margin: "0 0 0.75rem", fontSize: "1.25rem" },
  featureGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.85rem" },
  featureCard: {
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(20, 27, 39, 0.40)",
    boxShadow: "0 18px 45px rgba(0,0,0,0.30)",
    padding: "0.9rem",
  },
  featureTitle: { fontWeight: 800, letterSpacing: "-0.02em" },
  featureText: { marginTop: "0.35rem", color: "rgba(231,237,245,0.70)", lineHeight: 1.5 },
  aboutCard: {
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.10)",
    background:
      "radial-gradient(800px 250px at 10% 0%, rgba(127,211,148,0.12), transparent 55%), rgba(20, 27, 39, 0.40)",
    boxShadow: "0 18px 45px rgba(0,0,0,0.30)",
    padding: "0.95rem",
  },
  aboutText: { color: "rgba(231,237,245,0.72)", lineHeight: 1.6, maxWidth: "85ch" },
  aboutBadges: { display: "flex", flexWrap: "wrap", gap: "0.45rem", marginTop: "0.75rem" },
  badge: {
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(10, 14, 20, 0.20)",
    padding: "0.25rem 0.6rem",
    color: "rgba(231,237,245,0.80)",
    fontSize: "0.8rem",
    fontWeight: 600,
  },
  photoGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem" },
  photoCard: {
    borderRadius: "14px",
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 16px 40px rgba(0,0,0,0.30)",
    minHeight: "200px",
  },
  photoImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  sliderViewport: {
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.10)",
    overflow: "hidden",
    background: "rgba(20,27,39,0.35)",
    boxShadow: "0 16px 45px rgba(0,0,0,0.3)",
  },
  sliderTrack: {
    display: "flex",
    transition: "transform 700ms ease",
  },
  sliderItem: {
    height: "300px",
    flexShrink: 0,
  },
  sliderImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  faqList: { display: "grid", gap: "0.6rem" },
  faqItem: {
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(20,27,39,0.45)",
    padding: "0.65rem 0.8rem",
  },
  faqQ: { cursor: "pointer", fontWeight: 700 },
  faqA: { marginTop: "0.45rem", color: "rgba(231,237,245,0.72)", lineHeight: 1.55 },
  homeHead: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: "1rem",
    marginBottom: "1rem",
    flexWrap: "wrap",
  },
  homeTitle: { fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em" },
  homeSubtitle: { color: "rgba(231,237,245,0.65)", marginTop: "0.25rem" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.85rem" },
  card: {
    borderRadius: "14px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(20, 27, 39, 0.55)",
    boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
    padding: "0.85rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.65rem",
  },
  cardTop: { display: "flex", flexDirection: "column", gap: "0.25rem" },
  cardTitle: { fontWeight: 700, fontSize: "1.02rem" },
  cardMeta: { fontSize: "0.8rem", color: "rgba(231,237,245,0.65)" },
  cardActions: { display: "flex", gap: "0.45rem", flexWrap: "wrap" },
  emptyCard: {
    gridColumn: "1 / -1",
    borderRadius: "14px",
    border: "1px dashed rgba(255,255,255,0.18)",
    background: "rgba(20, 27, 39, 0.35)",
    padding: "1.2rem",
  },
  emptyTitle: { fontWeight: 700, fontSize: "1.05rem" },
  emptyText: { marginTop: "0.35rem", color: "rgba(231,237,245,0.65)" },
  wizard: { maxWidth: "1120px", width: "100%", margin: "0 auto", padding: "6.2rem 1rem 1.25rem" },
  wizardCard: {
    borderRadius: "14px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(20, 27, 39, 0.55)",
    boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
    padding: "1rem",
  },
  blockTitle: { margin: "0 0 0.75rem", fontSize: "1.1rem" },
  jdInput: {
    width: "100%",
    minHeight: "220px",
    resize: "vertical",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(10,14,20,0.55)",
    color: "var(--text)",
    padding: "0.75rem",
    fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
  },
  inlineActions: { display: "flex", gap: "0.6rem", marginTop: "0.8rem", flexWrap: "wrap" },
  twoCol: { display: "grid", gap: "0.8rem", gridTemplateColumns: "1fr 1fr" },
  panel: {
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "0.65rem",
    background: "rgba(10,14,20,0.3)",
  },
  panelTitle: { fontWeight: 600, marginBottom: "0.45rem" },
  chips: { display: "flex", flexWrap: "wrap", gap: "0.45rem", minHeight: "2rem" },
  chip: {
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(61,154,237,0.12)",
    color: "var(--text)",
    padding: "0.3rem 0.6rem",
    fontSize: "0.8rem",
  },
  addRow: { display: "flex", gap: "0.5rem", marginTop: "0.65rem" },
  smallInput: {
    flex: 1,
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(10,14,20,0.55)",
    color: "var(--text)",
    padding: "0.45rem 0.6rem",
  },
  editorMain: { paddingTop: "5.4rem", flex: 1, display: "flex", flexDirection: "column" },
  editorHeaderRow: {
    maxWidth: "1120px",
    width: "100%",
    margin: "0 auto",
    padding: "0.85rem 1rem 0.75rem",
    display: "flex",
    alignItems: "center",
    gap: "0.85rem",
  },
  titleInput: {
    flex: "1 1 420px",
    width: "100%",
    minWidth: "180px",
    padding: "0.45rem 0.65rem",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(10, 14, 20, 0.55)",
    color: "var(--text)",
    fontSize: "0.95rem",
  },
  smallMeta: { color: "rgba(231,237,245,0.60)", fontSize: "0.85rem" },
  panels: { flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: 0 },
  editorPane: {
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid var(--border)",
    minHeight: "calc(100vh - 110px)",
  },
  previewPane: { display: "flex", flexDirection: "column", minHeight: "calc(100vh - 110px)" },
  paneLabel: {
    padding: "0.35rem 0.75rem",
    fontSize: "0.72rem",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--muted)",
    borderBottom: "1px solid var(--border)",
    background: "var(--surface)",
  },
  editor: {
    flex: 1,
    width: "100%",
    margin: 0,
    padding: "0.75rem",
    border: "none",
    resize: "none",
    background: "#0a0e14",
    color: "#dce7f5",
    fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
    fontSize: "13px",
    lineHeight: 1.45,
    tabSize: 2,
  },
  editorCmWrap: {
    flex: 1,
    minHeight: 0,
    background: "#0a0e14",
  },
  previewFrame: { flex: 1, minHeight: 0, background: "#252525" },
  iframe: { width: "100%", height: "100%", border: "none", minHeight: "400px" },
  placeholder: {
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--muted)",
    padding: "2rem",
    textAlign: "center",
  },
  engagePanel: {
    borderTop: "1px solid var(--border)",
    background: "rgba(20,27,39,0.92)",
    padding: "0.9rem",
    maxHeight: "42vh",
    overflow: "auto",
  },
  engageHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" },
  suggestionList: { display: "grid", gap: "0.7rem", marginTop: "0.75rem" },
  suggestionCard: {
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: "10px",
    background: "rgba(10,14,20,0.35)",
    padding: "0.65rem",
  },
  suggestionHead: { display: "flex", alignItems: "center", gap: "0.55rem" },
  reason: { color: "rgba(231,237,245,0.78)", margin: "0.4rem 0" },
  diffGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem" },
  diffTitle: { fontSize: "0.78rem", color: "rgba(231,237,245,0.65)", marginBottom: "0.25rem" },
  diffBlock: {
    margin: 0,
    whiteSpace: "pre-wrap",
    fontFamily: '"IBM Plex Mono", monospace',
    fontSize: "0.76rem",
    background: "rgba(10,14,20,0.55)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: "8px",
    padding: "0.5rem",
    maxHeight: "10rem",
    overflow: "auto",
  },
  footer: {
    borderTop: "1px solid var(--border)",
    padding: "0.5rem 1rem",
    maxHeight: "140px",
    overflow: "auto",
    background: "#151c28",
  },
  siteFooter: {
    marginTop: "1.75rem",
    borderTop: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(10,14,20,0.70)",
    padding: "1.15rem 1rem",
  },
  footerTop: {
    width: "100%",
    maxWidth: "1200px",
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(220px, 1fr))",
    gap: "1.25rem",
  },
  footerCol: { display: "grid", gap: "0.38rem" },
  footerHead: { fontWeight: 800, marginBottom: "0.2rem" },
  footerLink: { color: "rgba(231,237,245,0.78)", textDecoration: "none", fontSize: "0.92rem" },
  footerDivider: {
    borderTop: "1px solid rgba(255,255,255,0.10)",
    width: "100%",
    maxWidth: "1200px",
    margin: "1rem auto 0.8rem",
  },
  footerBottom: { width: "100%", maxWidth: "1200px", margin: "0 auto" },
  footerCopy: { fontWeight: 700, marginBottom: "0.5rem" },
  footerPolicyRow: { display: "flex", flexWrap: "wrap", gap: "0.65rem", marginBottom: "0.5rem" },
  footerLinkInline: { color: "rgba(231,237,245,0.78)", textDecoration: "none", fontSize: "0.9rem" },
  footerDisclaimer: { margin: 0, color: "rgba(231,237,245,0.60)", lineHeight: 1.55, fontSize: "0.86rem" },
  log: {
    margin: "0.35rem 0 0",
    whiteSpace: "pre-wrap",
    fontFamily: '"IBM Plex Mono", monospace',
    fontSize: "0.78rem",
    color: "var(--muted)",
  },
};

