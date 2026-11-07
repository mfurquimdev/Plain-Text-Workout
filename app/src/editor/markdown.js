// The little Markdown that hover text uses: paragraphs, line breaks,
// `- ` lists, **bold**, *italic* and `code`. Everything is escaped first.

const esc = s => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
}

export function renderMarkdown(md) {
  return String(md ?? "").trim().split(/\n\s*\n/).map(block => {
    const lines = block.split("\n")
    if (lines.every(l => /^\s*[-*] /.test(l))) {
      return `<ul>${lines.map(l => `<li>${inline(l.replace(/^\s*[-*] /, ""))}</li>`).join("")}</ul>`
    }
    return `<p>${lines.map(inline).join("<br>")}</p>`
  }).join("")
}
