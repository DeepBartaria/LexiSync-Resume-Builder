function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let idx = 0;
  let count = 0;
  while (true) {
    const found = haystack.indexOf(needle, idx);
    if (found === -1) break;
    count += 1;
    idx = found + needle.length;
  }
  return count;
}

export function applySnippetSuggestion(latex, suggestion) {
  const before = suggestion?.before;
  const after = suggestion?.after;
  const id = suggestion?.id || "unknown";

  if (typeof before !== "string" || typeof after !== "string" || !before) {
    return {
      latex,
      applied: false,
      id,
      reason: "invalid_suggestion",
    };
  }

  const count = countOccurrences(latex, before);
  if (count === 0) {
    return { latex, applied: false, id, reason: "before_not_found" };
  }
  if (count > 1) {
    return { latex, applied: false, id, reason: "before_ambiguous_multiple_matches" };
  }
  return {
    latex: latex.replace(before, after),
    applied: true,
    id,
    reason: "applied",
  };
}

export function applySelectedSuggestions(latex, suggestions, selectedIds) {
  const idSet = new Set(Array.isArray(selectedIds) ? selectedIds : []);
  const list = Array.isArray(suggestions) ? suggestions : [];
  const applied = [];
  const skipped = [];
  let outLatex = latex;

  for (const suggestion of list) {
    if (!idSet.has(suggestion?.id)) continue;
    const result = applySnippetSuggestion(outLatex, suggestion);
    if (result.applied) {
      outLatex = result.latex;
      applied.push(result.id);
    } else {
      skipped.push({ id: result.id, reason: result.reason });
    }
  }

  return { latex: outLatex, applied, skipped };
}

