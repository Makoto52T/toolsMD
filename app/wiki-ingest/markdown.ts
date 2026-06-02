// Lightweight, dependency-free markdown -> HTML renderer for the wiki preview.
//
// SECURITY: every input chunk is HTML-escaped *before* any markup is injected,
// so no raw HTML from the model (or the user's raw content) can reach the DOM.
// Only a fixed, known set of tags (h1-h3, p, ul/li, table, code, strong, em,
// a, hr) is ever produced here. This is a preview convenience, not a spec-
// complete markdown engine.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Inline formatting applied to already-escaped text: **bold**, *italic*,
// `code`, [[wikilinks]] and [text](url) links.
function inline(escaped: string): string {
  let out = escaped;
  out = out.replace(/`([^`]+)`/g, '<code class="wiki-code">$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // [[backlink]] — render as a muted token (no navigation in preview).
  out = out.replace(
    /\[\[([^\]]+)\]\]/g,
    '<span class="wiki-link">[[$1]]</span>'
  );
  // [label](url) — only allow http(s) and relative urls; escape already applied.
  out = out.replace(
    /\[([^\]]+)\]\(((?:https?:&#x2F;&#x2F;|https?:\/\/|\/|#)[^)\s]*)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return out;
}

export function renderMarkdown(md: string): string {
  if (!md) return '';
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];

  let i = 0;
  let inList = false;
  let inCode = false;
  const codeBuf: string[] = [];

  const closeList = () => {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block.
    const fence = line.match(/^\s*```/);
    if (fence) {
      if (inCode) {
        html.push(
          `<pre class="wiki-pre"><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`
        );
        codeBuf.length = 0;
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      i += 1;
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      i += 1;
      continue;
    }

    // YAML frontmatter block (--- ... ---) at the very top: render as a code box.
    if (i === 0 && line.trim() === '---') {
      const fm: string[] = [];
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== '---') {
        fm.push(lines[j]);
        j += 1;
      }
      if (j < lines.length) {
        html.push(
          `<pre class="wiki-frontmatter"><code>${escapeHtml(fm.join('\n'))}</code></pre>`
        );
        i = j + 1;
        continue;
      }
    }

    // Horizontal rule.
    if (/^\s*---\s*$/.test(line)) {
      closeList();
      html.push('<hr />');
      i += 1;
      continue;
    }

    // Headings.
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      const level = Math.min(h[1].length, 3);
      html.push(`<h${level}>${inline(escapeHtml(h[2].trim()))}</h${level}>`);
      i += 1;
      continue;
    }

    // Table: a header row followed by a |---|---| separator.
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) &&
      lines[i + 1].includes('-')
    ) {
      closeList();
      const parseRow = (row: string): string[] =>
        row
          .replace(/^\s*\|/, '')
          .replace(/\|\s*$/, '')
          .split('|')
          .map((c) => c.trim());
      const headers = parseRow(line);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].includes('|')) {
        rows.push(parseRow(lines[j]));
        j += 1;
      }
      const thead =
        '<thead><tr>' +
        headers.map((c) => `<th>${inline(escapeHtml(c))}</th>`).join('') +
        '</tr></thead>';
      const tbody =
        '<tbody>' +
        rows
          .map(
            (r) =>
              '<tr>' +
              r.map((c) => `<td>${inline(escapeHtml(c))}</td>`).join('') +
              '</tr>'
          )
          .join('') +
        '</tbody>';
      html.push(`<table class="wiki-table">${thead}${tbody}</table>`);
      i = j;
      continue;
    }

    // List items.
    const li = line.match(/^\s*[-*+]\s+(.*)$/);
    if (li) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${inline(escapeHtml(li[1]))}</li>`);
      i += 1;
      continue;
    }

    // Blank line.
    if (line.trim() === '') {
      closeList();
      i += 1;
      continue;
    }

    // Paragraph.
    closeList();
    html.push(`<p>${inline(escapeHtml(line))}</p>`);
    i += 1;
  }

  closeList();
  if (inCode && codeBuf.length) {
    html.push(
      `<pre class="wiki-pre"><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`
    );
  }

  return html.join('\n');
}
