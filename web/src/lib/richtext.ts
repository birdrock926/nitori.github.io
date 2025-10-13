import { marked } from 'marked';
import { STRAPI } from '@config/site';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeAttribute = (value: string) => escapeHtml(value).replace(/`/g, '&#96;');

const ensureAbsoluteUrl = (input?: string | null) => {
  if (!input) return undefined;
  if (/^https?:\/\//i.test(input)) {
    return input;
  }
  const base = STRAPI.mediaUrl?.replace(/\/$/, '') || STRAPI.url?.replace(/\/$/, '');
  if (!base) {
    return input;
  }
  return `${base}${input.startsWith('/') ? '' : '/'}${input}`;
};

const sanitizeHref = (href?: string | null) => {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (/^javascript:/i.test(trimmed)) {
    return null;
  }
  const resolved = ensureAbsoluteUrl(trimmed) ?? trimmed;
  if (/^https?:\/\//i.test(resolved) || resolved.startsWith('/')) {
    return resolved;
  }
  return resolved;
};

const renderer = new marked.Renderer();

renderer.text = (text) => escapeHtml(text);
renderer.paragraph = (text) => {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (/^<figure[\s>]/i.test(trimmed)) {
    return trimmed;
  }
  return `<p>${trimmed}</p>`;
};
renderer.br = () => '<br />';
renderer.strong = (text) => `<strong>${text}</strong>`;
renderer.em = (text) => `<em>${text}</em>`;
renderer.del = (text) => `<del>${text}</del>`;
renderer.codespan = (code) => `<code>${escapeHtml(code)}</code>`;
renderer.blockquote = (quote) => `<blockquote>${quote}</blockquote>`;
renderer.code = (code, infostring) => {
  const language = typeof infostring === 'string' ? infostring.trim().split(/\s+/)[0] ?? '' : '';
  const classAttr = language ? ` class="language-${escapeAttribute(language)}"` : '';
  return `<pre><code${classAttr}>${escapeHtml(code)}</code></pre>`;
};
renderer.link = (href, title, text) => {
  const safeHref = sanitizeHref(href);
  if (!safeHref) {
    return text ?? '';
  }
  const titleAttr = title ? ` title="${escapeAttribute(title)}"` : '';
  const label = text || escapeHtml(safeHref);
  return `<a href="${escapeAttribute(safeHref)}" rel="noopener" target="_blank"${titleAttr}>${label}</a>`;
};
renderer.image = (href, title, text) => {
  const safeHref = sanitizeHref(href);
  if (!safeHref) {
    return text ? escapeHtml(text) : '';
  }
  const altAttr = escapeAttribute(text ?? '');
  const titleAttr = title ? ` title="${escapeAttribute(title)}"` : '';
  const caption = title?.trim() ? `<figcaption>${escapeHtml(title.trim())}</figcaption>` : '';
  const img = `<img src="${escapeAttribute(safeHref)}" alt="${altAttr}" loading="lazy" decoding="async"${titleAttr} />`;
  return `<figure class="richtext-figure">${img}${caption}</figure>`;
};
renderer.list = (body, ordered, start) => {
  const tag = ordered ? 'ol' : 'ul';
  const startAttr = ordered && typeof start === 'number' && start > 1 ? ` start="${start}"` : '';
  return `<${tag}${startAttr}>${body}</${tag}>`;
};
renderer.listitem = (text) => `<li>${text}</li>`;
renderer.heading = (text, level) => {
  const safeLevel = Math.min(6, Math.max(1, level));
  return `<h${safeLevel}>${text}</h${safeLevel}>`;
};
renderer.hr = () => '<hr />';
renderer.table = (header, body) => {
  const head = header ? `<thead>${header}</thead>` : '';
  const bodyHtml = body ? `<tbody>${body}</tbody>` : '';
  return `<table>${head}${bodyHtml}</table>`;
};
renderer.tablerow = (content) => `<tr>${content}</tr>`;
renderer.tablecell = (content, { header, align }) => {
  const tag = header ? 'th' : 'td';
  const alignment = align && ['center', 'left', 'right'].includes(align) ? ` style="text-align:${align}"` : '';
  return `<${tag}${alignment}>${content}</${tag}>`;
};

marked.setOptions({
  renderer,
  gfm: true,
  breaks: true,
  mangle: false,
  headerIds: false,
  smartLists: true,
});

const SIMPLE_WRAPPER_PATTERN = /^<(p|div)>([\s\S]*)<\/\1>$/i;

const normalizeWhitespace = (value: string) =>
  value
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>(?=\s|$)/gi, '\n')
    .replace(/&nbsp;/gi, ' ');

const stripSimpleWrappers = (value: string) => {
  let current = value.trim();
  let changed = false;

  while (true) {
    const match = current.match(SIMPLE_WRAPPER_PATTERN);
    if (!match) {
      break;
    }
    const inner = match[2].trim();
    if (!inner) {
      current = inner;
      changed = true;
      continue;
    }
    if (/<[a-z][^>]*>/i.test(inner)) {
      break;
    }
    current = inner;
    changed = true;
  }

  return { text: current, changed };
};

const convertMarkdownToHtml = (value: string) => {
  const output = marked.parse(value);
  return typeof output === 'string' ? output.trim() : '';
};

export const renderRichText = (input: string): string => {
  if (typeof input !== 'string') {
    return '';
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }

  const normalized = normalizeWhitespace(trimmed);
  const { text: unwrapped } = stripSimpleWrappers(normalized);
  const candidate = unwrapped || normalized;
  const html = convertMarkdownToHtml(candidate);

  if (html) {
    return html;
  }

  const fallback = convertMarkdownToHtml(normalized);
  if (fallback) {
    return fallback;
  }

  return escapeHtml(normalized).replace(/\n/g, '<br />');
};
