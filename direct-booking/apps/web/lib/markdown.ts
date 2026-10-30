// A small Markdown renderer for the site's own content files (FAQ and policy
// pages): headings, paragraphs, lists, **bold**, *italic*, [links](url) and
// HTML comments (dropped). All text is escaped; no raw HTML passes through.

export interface MarkdownSection {
  /** The text of a "## " heading. */
  heading: string;
  /** Rendered HTML of everything up to the next "## " heading. */
  html: string;
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(text: string): string {
  return escape(text)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) => {
      const safe = /^(https?:|mailto:|\/|#)/.test(href) ? href : "#";
      return `<a href="${safe}">${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

export function renderMarkdown(source: string): string {
  const lines = source.replace(/<!--[\s\S]*?-->/g, "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let paragraph: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | undefined;

  const flush = () => {
    if (paragraph.length) out.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`);
    list = undefined;
  };

  for (const raw of lines) {
    const line = raw.trim();
    let m: RegExpExecArray | null;
    if (!line) {
      flush();
    } else if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) {
      flush();
      const level = m[1]!.length;
      out.push(`<h${level}>${inline(m[2]!)}</h${level}>`);
    } else if ((m = /^([-*]|\d+\.)\s+(.*)$/.exec(line))) {
      if (paragraph.length) flush();
      const tag = /\d/.test(m[1]!) ? "ol" : "ul";
      if (list && list.tag !== tag) flush();
      list ??= { tag, items: [] };
      list.items.push(m[2]!);
    } else if (list && /^\s{2,}/.test(raw)) {
      list.items[list.items.length - 1] += ` ${line}`;
    } else {
      if (list) flush();
      paragraph.push(line);
    }
  }
  flush();
  return out.join("\n");
}

/** Split on "## " headings, e.g. one section per FAQ question. */
export function markdownSections(source: string): MarkdownSection[] {
  const cleaned = source.replace(/<!--[\s\S]*?-->/g, "");
  return cleaned
    .split(/^## /m)
    .slice(1)
    .map((chunk) => {
      const [heading = "", ...rest] = chunk.split("\n");
      return { heading: heading.trim(), html: renderMarkdown(rest.join("\n")) };
    });
}
