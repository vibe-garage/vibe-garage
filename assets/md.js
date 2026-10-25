/* Tiny safe Markdown renderer for native Vibe Garage guides. No raw HTML. */
(function () {
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function inline(text) {
    const codes = [];
    let s = esc(text).replace(/`([^`]+)`/g, (_m, code) => {
      codes.push(code);
      return "\u0000" + (codes.length - 1) + "\u0000";
    });
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, label, href) => {
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    s = s.replace(/\u0000(\d+)\u0000/g, (_m, i) => `<code>${codes[+i]}</code>`);
    return s;
  }

  const isFence = (line) => /^\s*```/.test(line);
  const isHeading = (line) => /^#{1,3}\s+/.test(line);
  const isQuote = (line) => /^\s*>\s?/.test(line);
  const isUl = (line) => /^\s*[-*+]\s+/.test(line);
  const isOl = (line) => /^\s*\d+[.)]\s+/.test(line);
  const isList = (line) => isUl(line) || isOl(line);
  const isBlock = (line) => isFence(line) || isHeading(line) || isQuote(line) || isList(line);

  function render(md) {
    const lines = String(md ?? "").replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (!line.trim()) { i += 1; continue; }

      if (isFence(line)) {
        i += 1;
        const code = [];
        while (i < lines.length && !isFence(lines[i])) code.push(lines[i++]);
        if (i < lines.length) i += 1;
        out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
        continue;
      }

      if (isHeading(line)) {
        const level = line.match(/^(#{1,3})/)[1].length;
        const text = line.replace(/^#{1,3}\s+/, "");
        out.push(`<h${level}>${inline(text)}</h${level}>`);
        i += 1;
        continue;
      }

      if (isQuote(line)) {
        const parts = [];
        while (i < lines.length && isQuote(lines[i])) {
          parts.push(lines[i].replace(/^\s*>\s?/, ""));
          i += 1;
        }
        out.push(`<blockquote><p>${inline(parts.join(" "))}</p></blockquote>`);
        continue;
      }

      if (isList(line)) {
        const ordered = isOl(line);
        const items = [];
        while (i < lines.length && (ordered ? isOl(lines[i]) : isUl(lines[i]))) {
          items.push(lines[i].replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/, ""));
          i += 1;
        }
        out.push(`<${ordered ? "ol" : "ul"}>${items.map((item) => `<li>${inline(item)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`);
        continue;
      }

      const parts = [line];
      i += 1;
      while (i < lines.length && lines[i].trim() && !isBlock(lines[i])) parts.push(lines[i++]);
      out.push(`<p>${inline(parts.join(" "))}</p>`);
    }

    return out.join("\n");
  }

  window.VGMD = { render };
})();
