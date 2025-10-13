import { marked } from 'marked';

const POST_UID = 'api::post.post';

const sanitizeSlug = (value = '') =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-]+|[-]+$/g, '');

const DEFAULT_COMMENT_AUTHOR = '名無しのユーザーさん';
const DEFAULT_BODY_FONT_SCALE = 'default';
const BODY_FONT_SCALE_VALUES = new Set(['default', 'large', 'xlarge']);
const RICH_TEXT_SCALE_MIN = 0.7;
const RICH_TEXT_SCALE_MAX = 1.8;

const escapeHtml = (value = '') =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeAttribute = (value = '') => escapeHtml(value).replace(/`/g, '&#96;');

const sanitizeHref = (href) => {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (/^javascript:/i.test(trimmed)) {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/')) {
    return trimmed;
  }
  return trimmed;
};

const markdownRenderer = new marked.Renderer();

markdownRenderer.text = (text) => escapeHtml(text);
markdownRenderer.paragraph = (text) => {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (/^<figure[\s>]/i.test(trimmed)) {
    return trimmed;
  }
  return `<p>${trimmed}</p>`;
};
markdownRenderer.br = () => '<br />';
markdownRenderer.strong = (text) => `<strong>${text}</strong>`;
markdownRenderer.em = (text) => `<em>${text}</em>`;
markdownRenderer.del = (text) => `<del>${text}</del>`;
markdownRenderer.codespan = (code) => `<code>${escapeHtml(code)}</code>`;
markdownRenderer.blockquote = (quote) => `<blockquote>${quote}</blockquote>`;
markdownRenderer.code = (code, infostring) => {
  const language = typeof infostring === 'string' ? infostring.trim().split(/\s+/)[0] ?? '' : '';
  const classAttr = language ? ` class="language-${escapeAttribute(language)}"` : '';
  return `<pre><code${classAttr}>${escapeHtml(code)}</code></pre>`;
};
markdownRenderer.link = (href, title, text) => {
  const safeHref = sanitizeHref(href);
  if (!safeHref) {
    return text;
  }
  const titleAttr = title ? ` title="${escapeAttribute(title)}"` : '';
  const label = text || escapeHtml(safeHref);
  return `<a href="${escapeAttribute(safeHref)}" rel="noopener" target="_blank"${titleAttr}>${label}</a>`;
};
markdownRenderer.image = (href, title, text) => {
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
markdownRenderer.list = (body, ordered, start) => {
  const tag = ordered ? 'ol' : 'ul';
  const startAttr = ordered && typeof start === 'number' && start > 1 ? ` start="${start}"` : '';
  return `<${tag}${startAttr}>${body}</${tag}>`;
};
markdownRenderer.listitem = (text) => `<li>${text}</li>`;
markdownRenderer.heading = (text, level) => {
  const safeLevel = Math.min(6, Math.max(1, level));
  return `<h${safeLevel}>${text}</h${safeLevel}>`;
};
markdownRenderer.hr = () => '<hr />';
markdownRenderer.table = (header, body) => {
  const head = header ? `<thead>${header}</thead>` : '';
  const bodyHtml = body ? `<tbody>${body}</tbody>` : '';
  return `<table>${head}${bodyHtml}</table>`;
};
markdownRenderer.tablerow = (content) => `<tr>${content}</tr>`;
markdownRenderer.tablecell = (content, { header, align }) => {
  const tag = header ? 'th' : 'td';
  const alignment = align && ['center', 'left', 'right'].includes(align) ? ` style="text-align:${align}"` : '';
  return `<${tag}${alignment}>${content}</${tag}>`;
};

marked.setOptions({
  renderer: markdownRenderer,
  gfm: true,
  breaks: true,
  mangle: false,
  headerIds: false,
  smartLists: true,
});

const convertMarkdownToHtml = (value) => {
  const output = marked.parse(value);
  return typeof output === 'string' ? output.trim() : '';
};

const SIMPLE_WRAPPER_PATTERN = /^<(p|div)>([\s\S]*)<\/\1>$/i;

const normalizeWhitespace = (value) =>
  value
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>(?=\s|$)/gi, '\n')
    .replace(/&nbsp;/gi, ' ');

const stripSimpleWrappers = (value) => {
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

const normalizeRichBodyValue = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const normalized = normalizeWhitespace(trimmed);
  const { text: unwrapped } = stripSimpleWrappers(normalized);
  const candidate = (unwrapped && unwrapped.trim()) || normalized;
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

const parseScaleValue = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const clampScaleValue = (value) => {
  const numeric = parseScaleValue(value);
  if (numeric === null) {
    return null;
  }

  const clamped = Math.min(RICH_TEXT_SCALE_MAX, Math.max(RICH_TEXT_SCALE_MIN, numeric));
  return Math.round(clamped * 100) / 100;
};

const normalizeRichTextBlock = (block) => {
  if (!block || typeof block !== 'object') {
    return block;
  }

  if (block.__component !== 'content.rich-text') {
    return block;
  }

  const next = { ...block };
  const normalizedScale = clampScaleValue(next.fontScale ?? next.font_scale ?? null);

  if (normalizedScale === null) {
    delete next.fontScale;
  } else {
    next.fontScale = normalizedScale;
  }

  if (Object.prototype.hasOwnProperty.call(next, 'font_scale')) {
    delete next.font_scale;
  }

  return next;
};

const applyRichTextFontScale = (data) => {
  if (!data || typeof data !== 'object') {
    return;
  }

  if (!Array.isArray(data.blocks)) {
    return;
  }

  data.blocks = data.blocks.map((block) => normalizeRichTextBlock(block));
};

const normalizeId = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? value : parsed;
  }
  return null;
};

const normalizeDocumentId = (value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
};

const extractDocumentId = (source) => {
  if (!source || typeof source !== 'object') {
    return null;
  }

  return (
    normalizeDocumentId(source.documentId) ??
    normalizeDocumentId(source.document_id) ??
    null
  );
};

const resolveEntityIdentity = async (event) => {
  const identity = {
    id: null,
    documentId: null,
  };

  const whereId = normalizeId(event?.params?.where?.id);
  if (whereId !== null && whereId !== undefined) {
    identity.id = whereId;
  } else {
    const dataId = normalizeId(event?.params?.data?.id);
    if (dataId !== null && dataId !== undefined) {
      identity.id = dataId;
    }
  }

  const documentIdSources = [event?.params?.where, event?.params?.data, event?.result];
  for (const source of documentIdSources) {
    const candidate = extractDocumentId(source);
    if (candidate) {
      identity.documentId = candidate;
      break;
    }
  }

  const hasIdentity = identity.id !== null && identity.documentId;
  if (hasIdentity) {
    return identity;
  }

  const candidateQueries = [];
  const pushQuery = (source) => {
    if (!source || typeof source !== 'object') {
      return;
    }

    const query = {};
    const normalizedSourceId = normalizeId(source.id);
    const sourceId = typeof normalizedSourceId === 'number' ? normalizedSourceId : null;
    const sourceDocumentId = extractDocumentId(source);

    if (sourceId !== null && sourceId !== undefined) {
      query.id = sourceId;
    }

    if (sourceDocumentId) {
      query.$or = [
        { documentId: sourceDocumentId },
        { document_id: sourceDocumentId },
      ];
    }

    if (Object.keys(query).length > 0) {
      candidateQueries.push(query);
    }
  };

  pushQuery(event?.params?.where);
  pushQuery(event?.params?.data);
  pushQuery(event?.result);
  pushQuery(event?.state);

  if (!candidateQueries.length && typeof event?.params?.where?.slug === 'string') {
    candidateQueries.push({ slug: event.params.where.slug });
  }

  for (const query of candidateQueries) {
    try {
      const record = await strapi.db.query(POST_UID).findOne({
        where: query,
        select: ['id', 'documentId', 'document_id'],
      });

      if (record) {
        if (identity.id === null || identity.id === undefined) {
          identity.id = normalizeId(record.id);
        }

        if (!identity.documentId) {
          identity.documentId =
            normalizeDocumentId(record.documentId) ??
            normalizeDocumentId(record.document_id);
        }

        if (identity.id !== null && identity.documentId) {
          break;
        }
      }
    } catch (error) {
      strapi.log.debug(`[posts] Failed to resolve identity for slug guard: ${error.message}`);
    }
  }

  return identity;
};

const buildSlugConflictFilter = (slug, { id, documentId }) => {
  const baseConditions = [{ slug: { $eq: slug } }, { slug: { $eqi: slug } }];

  if (!documentId && (id === null || id === undefined)) {
    return { $or: baseConditions };
  }

  const exclusion = [];
  if (documentId) {
    exclusion.push({ documentId: { $ne: documentId } });
  }
  if (id !== null && id !== undefined) {
    exclusion.push({ id: { $ne: id } });
  }

  return {
    $and: [{ $or: baseConditions }, ...exclusion],
  };
};

const matchesCurrentEntity = (match, identity) => {
  if (!match || typeof match !== 'object') {
    return false;
  }

  const matchId = normalizeId(match.id ?? match?.attributes?.id);
  if (
    matchId !== null &&
    matchId !== undefined &&
    identity.id !== null &&
    identity.id !== undefined &&
    matchId === identity.id
  ) {
    return true;
  }

  if (identity.documentId) {
    const matchDocumentId = extractDocumentId(match) ?? extractDocumentId(match.attributes);
    if (matchDocumentId && matchDocumentId === identity.documentId) {
      return true;
    }
  }

  return false;
};

const hasSlugConflict = async (slug, identity) => {
  const filters = buildSlugConflictFilter(slug, identity);

  try {
    const docService = strapi.documents?.('api::post.post');
    if (docService && typeof docService.findMany === 'function') {
      const conflicts = await docService.findMany({
        filters,
        limit: 1,
        publicationState: 'preview',
      });

      const collection = Array.isArray(conflicts)
        ? conflicts
        : Array.isArray(conflicts?.results)
        ? conflicts.results
        : [];

      if (collection.some((match) => !matchesCurrentEntity(match, identity))) {
        return true;
      }
    }
  } catch (error) {
    strapi.log.debug(`[posts] Document slug conflict check failed: ${error.message}`);
  }

  const fallbackMatches = await strapi.entityService.findMany('api::post.post', {
    filters: { slug: { $eqi: slug } },
    limit: 20,
    publicationState: 'preview',
  });

  return fallbackMatches.some((match) => !matchesCurrentEntity(match, identity));
};

const ensureUniqueSlug = async (event) => {
  const data = event?.params?.data;
  if (!data) return;

  const source = data.slug || data.title;
  if (!source) return;

  const base = sanitizeSlug(source);
  const fallback = base || `post-${Date.now()}`;
  let candidate = base || fallback;
  let attempt = 1;
  const identity = await resolveEntityIdentity(event);

  while (await hasSlugConflict(candidate, identity)) {
    attempt += 1;
    candidate = `${fallback}-${attempt}`;
  }

  data.slug = candidate;
};

const COMMENT_DEFAULT_AUTHOR_KEYS = ['commentDefaultAuthor', 'comment_default_author'];

const applyDefaultCommentAuthor = (data, { requireExistingField = false } = {}) => {
  if (!data || typeof data !== 'object') {
    return;
  }

  const hasField = COMMENT_DEFAULT_AUTHOR_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(data, key)
  );

  if (!hasField) {
    if (requireExistingField) {
      return;
    }
    data.commentDefaultAuthor = DEFAULT_COMMENT_AUTHOR;
    return;
  }

  const valueKey = COMMENT_DEFAULT_AUTHOR_KEYS.find((key) =>
    Object.prototype.hasOwnProperty.call(data, key)
  );
  const value = valueKey ? data[valueKey] : data.commentDefaultAuthor;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    data.commentDefaultAuthor = trimmed.length > 0 ? trimmed : DEFAULT_COMMENT_AUTHOR;
  } else if (value === null || value === undefined) {
    data.commentDefaultAuthor = DEFAULT_COMMENT_AUTHOR;
  }

  COMMENT_DEFAULT_AUTHOR_KEYS.forEach((key) => {
    if (key !== 'commentDefaultAuthor' && Object.prototype.hasOwnProperty.call(data, key)) {
      delete data[key];
    }
  });
};

const BODY_FONT_SCALE_KEYS = ['bodyFontScale', 'body_font_scale'];

const applyBodyFontScale = (data, { requireExistingField = false } = {}) => {
  if (!data || typeof data !== 'object') {
    return;
  }

  const hasKey = BODY_FONT_SCALE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(data, key));

  if (!hasKey) {
    if (requireExistingField) {
      return;
    }
    data.bodyFontScale = DEFAULT_BODY_FONT_SCALE;
    return;
  }

  const key = BODY_FONT_SCALE_KEYS.find((candidate) => Object.prototype.hasOwnProperty.call(data, candidate));
  const value = key ? data[key] : data.bodyFontScale;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    data.bodyFontScale = BODY_FONT_SCALE_VALUES.has(normalized) ? normalized : DEFAULT_BODY_FONT_SCALE;
  } else if (value === null || value === undefined) {
    data.bodyFontScale = DEFAULT_BODY_FONT_SCALE;
  }

  BODY_FONT_SCALE_KEYS.forEach((candidate) => {
    if (candidate !== 'bodyFontScale' && Object.prototype.hasOwnProperty.call(data, candidate)) {
      delete data[candidate];
    }
  });
};

const normalizeBlockMarkdown = (block) => {
  if (!block || typeof block !== 'object') {
    return block;
  }

  const next = { ...block };

  if (next.__component === 'content.rich-text') {
    if (typeof next.body === 'string') {
      next.body = normalizeRichBodyValue(next.body);
    }
    return next;
  }

  if (next.__component === 'layout.callout') {
    if (typeof next.body === 'string') {
      next.body = normalizeRichBodyValue(next.body);
    }
    return next;
  }

  if (next.__component === 'layout.columns' && Array.isArray(next.columns)) {
    next.columns = next.columns.map((column) => {
      if (!column || typeof column !== 'object') {
        return column;
      }
      const columnCopy = { ...column };
      if (typeof columnCopy.body === 'string') {
        columnCopy.body = normalizeRichBodyValue(columnCopy.body);
      }
      return columnCopy;
    });
    return next;
  }

  return next;
};

const normalizeEntityBlocks = (entity) => {
  if (!entity || typeof entity !== 'object') {
    return;
  }

  const target =
    entity.attributes && typeof entity.attributes === 'object' ? entity.attributes : entity;

  if (!Array.isArray(target.blocks)) {
    return;
  }

  target.blocks = target.blocks.map((block) => normalizeBlockMarkdown(block));

  if (entity.attributes && target === entity.attributes) {
    entity.attributes = { ...target };
    if (Array.isArray(entity.blocks)) {
      entity.blocks = entity.attributes.blocks;
    }
  } else if (Array.isArray(entity.blocks)) {
    entity.blocks = target.blocks;
  }
};

const normalizeResultPayload = (payload) => {
  if (!payload) {
    return;
  }

  if (Array.isArray(payload)) {
    payload.forEach((item) => normalizeResultPayload(item));
    return;
  }

  if (Array.isArray(payload.results)) {
    normalizeResultPayload(payload.results);
  }

  if (Array.isArray(payload.data)) {
    normalizeResultPayload(payload.data);
  } else if (payload.data && typeof payload.data === 'object') {
    normalizeResultPayload(payload.data);
  }

  normalizeEntityBlocks(payload);
};

export default {
  async beforeCreate(event) {
    await ensureUniqueSlug(event);
    applyDefaultCommentAuthor(event?.params?.data);
    applyBodyFontScale(event?.params?.data);
    applyRichTextFontScale(event?.params?.data);
  },
  async beforeUpdate(event) {
    await ensureUniqueSlug(event);
    applyDefaultCommentAuthor(event?.params?.data, { requireExistingField: true });
    applyBodyFontScale(event?.params?.data, { requireExistingField: true });
    applyRichTextFontScale(event?.params?.data);
  },
  async afterCreate(event) {
    normalizeResultPayload(event?.result);
  },
  async afterUpdate(event) {
    normalizeResultPayload(event?.result);
  },
  async afterFindMany(event) {
    normalizeResultPayload(event?.result);
  },
  async afterFindOne(event) {
    normalizeResultPayload(event?.result);
  },
};
