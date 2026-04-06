import { spawn } from "child_process";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

const PDF_ENGINES = ["pdflatex", "xelatex", "lualatex"];

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      // e.g. ENOENT when engine isn't installed / not on PATH
      err.stdout = stdout;
      err.stderr = stderr;
      reject(err);
    });
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else {
        const err = new Error(`${cmd} exited ${code}\n${stderr || stdout}`.trim());
        err.code = code;
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }
    });
  });
}

async function tryEngine(engine, source) {
  const id = randomUUID();
  const dir = join(tmpdir(), `latex-${id}`);
  const texPath = join(dir, "main.tex");
  const pdfPath = join(dir, "main.pdf");
  const logPath = join(dir, "main.log");

  await mkdir(dir, { recursive: true });
  await writeFile(texPath, source, "utf8");

  try {
    await run(engine, ["-interaction=nonstopmode", "-halt-on-error", "main.tex"], dir);
    try {
      await run(engine, ["-interaction=nonstopmode", "-halt-on-error", "main.tex"], dir);
    } catch {
      /* second pass optional for refs/TOC */
    }
    const pdf = await readFile(pdfPath);
    return pdf;
  } catch (e) {
    let logSnippet = "";
    try {
      const log = await readFile(logPath, "utf8");
      // Keep it small for the API response.
      logSnippet = log.split("\n").slice(-80).join("\n");
    } catch {
      // ignore
    }

    if (e?.code === "ENOENT") {
      throw new Error(
        `${engine} not found on PATH.\nInstall a LaTeX distribution (BasicTeX/MacTeX/TeX Live) and ensure its bin directory is on PATH.`
      );
    }

    const details = [
      e?.message || "LaTeX compile failed",
      logSnippet ? `\n--- main.log (last lines) ---\n${logSnippet}` : "",
    ].join("");
    throw new Error(details.trim());
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Compile LaTeX source to PDF using the first available engine.
 * Requires a TeX distribution (e.g. MacTeX, BasicTeX, texlive) on PATH.
 */
export async function compileLatexToPdf(source) {
  let lastErr;
  for (const engine of PDF_ENGINES) {
    try {
      return await tryEngine(engine, source);
    } catch (e) {
      lastErr = e;
    }
  }
  const hint =
    "Install a LaTeX distribution and ensure pdflatex is on your PATH (e.g. brew install --cask basictex).";
  throw new Error(`${lastErr?.message || "LaTeX compile failed"}\n${hint}`);
}
