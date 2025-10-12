import { marked } from 'marked';

import { STRAPI, TWITCH } from '@config/site';

export type MediaFormat = {
  url: string;
  width?: number;
  height?: number;
  size?: number;
  mime?: string;
  ext?: string;
};

export type Media = {
  url: string;
  alternativeText?: string;
  caption?: string;
  width?: number;
  height?: number;
  mime?: string;
  size?: number;
  ext?: string;
  formats?: Record<string, MediaFormat>;
};

export type Tag = {
  id: number;
  name: string;
  slug: string;
};

export type DynamicZoneBlock =
  | {
      __component: 'content.rich-text';
      body: string;
      fontScale?: number;
    }
  | {
      __component: 'content.colored-text';
      text: string;
      color: string;
      background?: string;
      isInline?: boolean;
    }
  | {
      __component: 'media.figure';
      image: Media;
      alt: string;
      caption?: string;
      credit?: string;
      displayMode?: 'auto' | 'image' | 'gif';
    }
  | {
      __component: 'media.gallery';
      items: { image: Media; alt: string; displayMode?: 'auto' | 'image' | 'gif' }[];
    }
  | {
      __component: 'embed.twitch-live';
      channel: string;
      title?: string;
    }
  | {
      __component: 'embed.twitch-vod';
      vodId: string;
      title?: string;
    }
  | {
      __component: 'embed.youtube';
      videoId: string;
      title?: string;
    }
  | {
      __component: 'layout.callout';
      title?: string;
      tone?: 'info' | 'success' | 'warning' | 'danger';
      icon?: string;
      body: string;
    }
  | {
      __component: 'layout.columns';
      layout?: 'two' | 'three';
      gutter?: 'normal' | 'wide' | 'compact';
      background?: 'none' | 'subtle' | 'accent';
      columns: {
        title?: string;
        body: string;
      }[];
    }
  | {
      __component: 'layout.separator';
      style?: 'line' | 'dots' | 'space';
      label?: string;
    }
  | {
      __component: 'ads.inline-slot';
      slot: string;
      placement?: string;
      label?: string;
      note?: string;
    };

export type Post = {
  id: number;
  documentId: string;
  title: string;
  slug: string;
  summary: string;
  cover?: Media;
  tags: Tag[];
  blocks: DynamicZoneBlock[];
  author?: string;
  source?: string;
  publishedAt: string;
  commentDefaultAuthor: string;
  bodyFontScale: 'default' | 'large' | 'xlarge';
};

export type RankingItem = {
  id: number;
  title: string;
  slug: string;
  score: number;
};

const BODY_FONT_SCALE_VALUES = new Set(['default', 'large', 'xlarge']);
const RICH_TEXT_FONT_SCALE_MIN = 0.7;
const RICH_TEXT_FONT_SCALE_MAX = 1.8;

const apiUrl = STRAPI.url?.replace(/\/$/, '');

const ensureAbsoluteUrl = (input?: string | null) => {
  if (!input) return undefined;
  if (/^https?:\/\//i.test(input)) {
    return input;
  }
  const base = STRAPI.mediaUrl?.replace(/\/$/, '') || STRAPI.url?.replace(/\/$/, '');
  if (!base) return input;
  return `${base}${input.startsWith('/') ? '' : '/'}${input}`;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeAttribute = (value: string) => escapeHtml(value).replace(/`/g, '&#96;');

const markdownRenderer = new marked.Renderer();

markdownRenderer.link = (href, title, text) => {
  const target = typeof href === 'string' ? href.trim() : '';
  const resolved = ensureAbsoluteUrl(target) ?? target;
  if (!resolved) {
    return text;
  }

  const isAnchor = resolved.startsWith('#');
  const titleAttr = title ? ` title="${escapeAttribute(title)}"` : '';
  const relAttr = isAnchor ? '' : ' rel="noopener"';
  const targetAttr = isAnchor ? '' : ' target="_blank"';

  return `<a href="${escapeAttribute(resolved)}"${titleAttr}${relAttr}${targetAttr}>${text}</a>`;
};

markdownRenderer.image = (href, title, text) => {
  const target = typeof href === 'string' ? href.trim() : '';
  const resolved = ensureAbsoluteUrl(target) ?? target;
  if (!resolved) {
    return text ?? '';
  }

  const altAttr = text ? ` alt="${escapeAttribute(text)}"` : ' alt=""';
  const titleAttr = title ? ` title="${escapeAttribute(title)}"` : '';

  return `<img src="${escapeAttribute(resolved)}"${altAttr} loading="lazy" decoding="async"${titleAttr} />`;
};

marked.use({
  gfm: true,
  breaks: true,
  smartLists: true,
  headerIds: false,
  mangle: false,
  async: false,
  renderer: markdownRenderer,
});

const stripSimpleHtmlWrappers = (value: string) =>
  value
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>(\r?\n)?/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<\/?p[^>]*>/gi, '\n')
    .replace(/<\/?div[^>]*>/gi, '\n')
    .replace(/<\/?span[^>]*>/gi, '')
    .replace(/&nbsp;/gi, ' ');

const MARKDOWN_TOKEN_REGEX =
  /(\*\*|__|\*(?=\S)(?:[^*]|\*[^*])*\*(?=\s|$)|_(?=\S)(?:[^_]|_[^_])*_(?=\s|$)|~~|`{1,3}|\!\[[^\]]*\]\([^\)]+\)|\[[^\]]+\]\([^\)]+\)|^>\s|\n>\s|\n\s*[-*+]\s|\n\s*\d+\.\s)/m;

const HTML_TAG_REGEX = /<[^>]+>/i;

const containsMarkdownTokens = (value: string) => MARKDOWN_TOKEN_REGEX.test(value);

const looksLikeHtml = (value: string) => HTML_TAG_REGEX.test(value);

const renderMarkdown = (value: string) => {
  const normalized = value.replace(/\r\n?/g, '\n');
  const html = marked.parse(normalized) as string;
  return html.trim();
};

export const normalizeRichMarkup = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const preprocessed = stripSimpleHtmlWrappers(trimmed).trim();
  const candidate = preprocessed || trimmed;

  if (containsMarkdownTokens(candidate)) {
    const html = renderMarkdown(candidate);
    return html || trimmed;
  }

  if (looksLikeHtml(trimmed) && !containsMarkdownTokens(preprocessed)) {
    return trimmed;
  }

  const html = renderMarkdown(candidate);
  return html || trimmed;
};

const parseMedia = (value: any): Media | undefined => {
  if (!value) return undefined;
  if (value.data?.attributes) {
    return value.data.attributes as Media;
  }
  if (value.attributes) {
    return value.attributes as Media;
  }
  return value as Media;
};

const normalizeMedia = (media: Media | undefined) => {
  if (!media) return undefined;
  const normalizedFormats = media.formats
    ? Object.fromEntries(
        Object.entries(media.formats)
          .filter(([, format]) => Boolean(format?.url))
          .map(([key, format]) => [
            key,
            {
              ...format,
              url: ensureAbsoluteUrl(format?.url) ?? format?.url ?? '',
            },
          ])
      )
    : undefined;

  return {
    ...media,
    url: ensureAbsoluteUrl(media.url) ?? media.url,
    formats: normalizedFormats,
  } satisfies Media;
};

const extractRichBody = (value: any): string => {
  if (!value) return '';
  if (typeof value === 'string') {
    return normalizeRichMarkup(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => extractRichBody(item))
      .filter((item) => typeof item === 'string' && item.trim().length > 0)
      .join('\n\n');
  }
  if (typeof value === 'object') {
    const candidate =
      (value.body && typeof value.body === 'string' ? value.body : undefined) ??
      (value.content && typeof value.content === 'string' ? value.content : undefined) ??
      (value.text && typeof value.text === 'string' ? value.text : undefined) ??
      (value.value && typeof value.value === 'string' ? value.value : undefined) ??
      (value.document && typeof value.document === 'string' ? value.document : undefined) ??
      (value.attributes && typeof value.attributes.body === 'string' ? value.attributes.body : undefined) ??
      (value.data && typeof value.data.attributes?.body === 'string' ? value.data.attributes.body : undefined);
    if (candidate) {
      return normalizeRichMarkup(candidate);
    }
  }
  return '';
};

const toObject = (value: any) => (value && typeof value === 'object' ? value : {});

const clampRichTextScale = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    const clamped = Math.min(RICH_TEXT_FONT_SCALE_MAX, Math.max(RICH_TEXT_FONT_SCALE_MIN, value));
    return Math.round(clamped * 100) / 100;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number.parseFloat(trimmed);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    const clamped = Math.min(RICH_TEXT_FONT_SCALE_MAX, Math.max(RICH_TEXT_FONT_SCALE_MIN, parsed));
    return Math.round(clamped * 100) / 100;
  }

  return null;
};

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

const parseTag = (tag: any): Tag | null => {
  const base = toObject(tag);
  const attr = toObject(base.attributes ?? base);
  const name = typeof attr.name === 'string' && attr.name.trim() ? attr.name.trim() : undefined;
  if (!name) {
    return null;
  }
  const slug =
    (typeof attr.slug === 'string' && attr.slug.trim()) ||
    slugify(name) ||
    name.trim();
  const id = Number.isFinite(Number(base.id)) ? Number(base.id) : undefined;
  return {
    id: id ?? Math.abs(slug.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)),
    name,
    slug,
  };
};

const normalizeBlock = (block: any): DynamicZoneBlock => {
  if (!block || !block.__component) {
    return block;
  }

  if (block.__component === 'content.rich-text') {
    const fontScale = clampRichTextScale(block.fontScale ?? block.font_scale);
    const normalized: DynamicZoneBlock = {
      __component: 'content.rich-text',
      body: extractRichBody(block.body ?? block.content ?? block.value),
    };
    if (fontScale !== null) {
      normalized.fontScale = fontScale;
    }
    return normalized;
  }

  if (block.__component === 'content.colored-text') {
    const textValue =
      typeof block.text === 'string'
        ? block.text
        : typeof block.content === 'string'
        ? block.content
        : '';
    const color = typeof block.color === 'string' && block.color ? block.color : '#2563eb';
    const background = typeof block.background === 'string' && block.background ? block.background : 'transparent';
    return {
      __component: 'content.colored-text',
      text: textValue,
      color,
      background,
      isInline: Boolean(block.isInline),
    };
  }

  if (block.__component === 'media.figure') {
    const media = normalizeMedia(parseMedia(block.image));
    if (!media) {
      return block;
    }
    const displayMode =
      typeof block.displayMode === 'string' && block.displayMode.length
        ? block.displayMode
        : 'auto';
    return {
      __component: 'media.figure',
      image: media,
      alt: block.alt ?? media.alternativeText ?? '',
      caption: block.caption ?? media.caption,
      credit: block.credit,
      displayMode: displayMode === 'gif' || displayMode === 'image' ? displayMode : 'auto',
    };
  }

  if (block.__component === 'media.gallery') {
    const rawItems = Array.isArray(block.items)
      ? block.items
      : Array.isArray(block.items?.data)
      ? block.items.data
      : Array.isArray(block.images)
      ? block.images
      : Array.isArray(block.images?.data)
      ? block.images.data
      : Array.isArray(block.gallery)
      ? block.gallery
      : Array.isArray(block.gallery?.data)
      ? block.gallery.data
      : [];
    const items = rawItems
      .map((item: any) => {
        const base = item?.attributes ?? item;
        const mediaSource = base?.image ?? base?.media ?? base;
        const media = normalizeMedia(parseMedia(mediaSource));
        if (!media) return undefined;
        const displayMode =
          typeof base.displayMode === 'string' && base.displayMode.length
            ? base.displayMode
            : typeof base.mode === 'string' && base.mode.length
            ? base.mode
            : 'auto';
        const altCandidate =
          typeof base.alt === 'string'
            ? base.alt
            : typeof base.caption === 'string'
            ? base.caption
            : media.alternativeText ?? '';
        const alt = typeof altCandidate === 'string' ? altCandidate.trim() : '';
        return {
          image: media,
          alt,
          displayMode: displayMode === 'gif' || displayMode === 'image' ? displayMode : 'auto',
        } satisfies { image: Media; alt: string; displayMode?: 'auto' | 'image' | 'gif' };
      })
      .filter((entry): entry is { image: Media; alt: string; displayMode?: 'auto' | 'image' | 'gif' } => Boolean(entry));
    return {
      __component: 'media.gallery',
      items,
    };
  }

  if (block.__component === 'layout.callout') {
    const tone = ['info', 'success', 'warning', 'danger'].includes(block.tone)
      ? block.tone
      : 'info';
    return {
      __component: 'layout.callout',
      title: typeof block.title === 'string' ? block.title : undefined,
      tone,
      icon: typeof block.icon === 'string' ? block.icon : undefined,
      body: extractRichBody(block.body),
    };
  }

  if (block.__component === 'layout.columns') {
    const columns = Array.isArray(block.columns)
      ? block.columns
          .map((col: any) => {
            const column = toObject(col);
            const body = extractRichBody(column.body);
            if (!body) return undefined;
            return {
              title:
                typeof column.title === 'string' && column.title.trim()
                  ? column.title.trim()
                  : undefined,
              body,
            };
          })
          .filter(Boolean)
      : [];

    const layout = ['two', 'three'].includes(block.layout) ? block.layout : undefined;
    const gutter = ['normal', 'wide', 'compact'].includes(block.gutter) ? block.gutter : undefined;
    const background = ['none', 'subtle', 'accent'].includes(block.background)
      ? block.background
      : undefined;

    return {
      __component: 'layout.columns',
      layout: layout ?? (columns.length >= 3 ? 'three' : 'two'),
      gutter: gutter ?? 'normal',
      background: background ?? 'none',
      columns: columns as { title?: string; body: string }[],
    };
  }

  if (block.__component === 'layout.separator') {
    const style = ['line', 'dots', 'space'].includes(block.style) ? block.style : 'line';
    const label = typeof block.label === 'string' && block.label.trim() ? block.label.trim() : undefined;
    return {
      __component: 'layout.separator',
      style,
      label,
    };
  }

  if (block.__component === 'ads.inline-slot') {
    const slot = typeof block.slot === 'string' ? block.slot.trim() : '';
    if (!slot) {
      return block as DynamicZoneBlock;
    }
    const placement = typeof block.placement === 'string' ? block.placement.trim() : undefined;
    const label = typeof block.label === 'string' && block.label.trim() ? block.label.trim() : undefined;
    const note = typeof block.note === 'string' && block.note.trim() ? block.note.trim() : undefined;
    return {
      __component: 'ads.inline-slot',
      slot,
      placement,
      label,
      note,
    };
  }

  return block as DynamicZoneBlock;
};

const defaultHeaders: Record<string, string> = STRAPI.token
  ? { Authorization: `Bearer ${STRAPI.token}` }
  : {};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createUrl = (path: string, searchParams?: Record<string, string | number | undefined>) => {
  if (!apiUrl) {
    return undefined;
  }
  const url = new URL(`${apiUrl}${path}`);
  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });
  }
  return url;
};

const emptyResponseFor = <T>(path: string) => {
  if (path.includes('/posts/by-slug')) {
    return { data: null } as T;
  }
  return { data: [] } as T;
};

export const fetchJSON = async <T>(path: string, params?: Record<string, string | number | undefined>) => {
  const url = createUrl(path, params);
  if (!url) {
    return emptyResponseFor<T>(path);
  }

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...defaultHeaders,
      },
    });
    if (!response.ok) {
      throw new Error(`Strapi API error: ${response.status}`);
    }
    const json = (await response.json()) as T & { error?: unknown };
    if (json && typeof json === 'object' && 'error' in json) {
      throw new Error('Strapi API error payload');
    }
    return json as T;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[strapi] Falling back to empty response for ${url}: ${reason}`);
    return emptyResponseFor<T>(path);
  }
};

export type PostListResponse = {
  data: {
    id: number;
    attributes: {
      title: string;
      slug: string;
      summary: string;
      publishedAt: string;
      author?: string;
      source?: string;
      commentDefaultAuthor?: string;
      cover?: {
        data: { attributes: Media } | null;
      } | null;
      tags: {
        data: { id: number; attributes: { name: string; slug: string } }[];
      };
      blocks: any[];
    };
  }[];
};

export type PostSingleResponse = {
  data: PostListResponse['data'][number] | null;
  meta?: unknown;
};

const asObject = (value: unknown) => (value && typeof value === 'object' ? (value as Record<string, unknown>) : {});

const extractArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) {
    return value as T[];
  }
  if (value && typeof value === 'object' && Array.isArray((value as any).data)) {
    return ((value as any).data as T[]).filter(Boolean);
  }
  return [];
};

const fallbackPost = (): Post => ({
  id: 0,
  documentId: '',
  title: '',
  slug: '',
  summary: '',
  publishedAt: '',
  tags: [],
  blocks: [],
  commentDefaultAuthor: '名無しのユーザーさん',
  bodyFontScale: 'default',
});

const mapPost = (apiPost: PostListResponse['data'][number]) => {
  try {
    if (!apiPost || typeof apiPost !== 'object') {
      return fallbackPost();
    }

    const base = asObject(apiPost);
    const attr = asObject(base.attributes ?? base);
    const coverSource = attr.cover ?? base.cover;
    const coverRelation = asObject(coverSource);
    const cover = normalizeMedia(parseMedia(coverRelation.data ?? coverSource));
    const tagsArray = extractArray<any>(attr.tags ?? base.tags)
      .map(parseTag)
      .filter((tag): tag is Tag => Boolean(tag));
    const blockSource = attr.blocks ?? base.blocks;
    const rawBlocks = Array.isArray(blockSource) ? blockSource : [];
    const defaults = fallbackPost();
    const commentDefaultSource =
      attr.commentDefaultAuthor ??
      attr.comment_default_author ??
      base.commentDefaultAuthor ??
      base.comment_default_author;
    const commentDefaultAuthor =
      typeof commentDefaultSource === 'string' && commentDefaultSource.trim().length > 0
        ? commentDefaultSource.trim()
        : defaults.commentDefaultAuthor;
    const fontScaleSource =
      attr.bodyFontScale ??
      attr.body_font_scale ??
      base.bodyFontScale ??
      base.body_font_scale;
    const normalizedFontScale =
      typeof fontScaleSource === 'string' && fontScaleSource.trim().length > 0
        ? fontScaleSource.trim().toLowerCase()
        : defaults.bodyFontScale;
    const bodyFontScale = BODY_FONT_SCALE_VALUES.has(normalizedFontScale)
      ? (normalizedFontScale as Post['bodyFontScale'])
      : defaults.bodyFontScale;

    return {
      ...defaults,
      id: Number.isFinite(Number(base.id)) ? Number(base.id) : defaults.id,
      documentId:
        (typeof base.documentId === 'string' && base.documentId) ||
        (typeof base.document_id === 'string' && base.document_id) ||
        (typeof attr.documentId === 'string' && attr.documentId) ||
        defaults.documentId,
      title: typeof attr.title === 'string' ? attr.title : '',
      slug: typeof attr.slug === 'string' ? attr.slug : '',
      summary: typeof attr.summary === 'string' ? attr.summary : '',
      publishedAt: typeof attr.publishedAt === 'string' ? attr.publishedAt : '',
      author: typeof attr.author === 'string' ? attr.author : undefined,
      source: typeof attr.source === 'string' ? attr.source : undefined,
      cover,
      tags: tagsArray,
      blocks: rawBlocks.map(normalizeBlock),
      commentDefaultAuthor,
      bodyFontScale,
    } satisfies Post;
  } catch (error) {
    console.warn('[strapi] Failed to map post payload', error);
    return fallbackPost();
  }
};

const ensureArray = <T>(value: unknown): T[] => extractArray<T>(value);

const filterValidPosts = (posts: Post[]) => posts.filter((post) => Boolean(post?.slug?.trim()));

const mapPostCollection = (items: PostListResponse['data']) => filterValidPosts(items.map(mapPost));

const normalizeSearchParams = (params?: Record<string, string | number | undefined>) => {
  const normalized: Record<string, string> = {
    'pagination[page]': '1',
  };
  let sortValue: string | undefined;
  let prefersArraySort = false;

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (key === 'sort') {
        sortValue = String(value);
        return;
      }
      if (key === 'sort[0]') {
        sortValue = String(value);
        prefersArraySort = true;
        return;
      }
      normalized[key] = String(value);
    });
  }

  if (!sortValue) {
    sortValue = 'publishedAt:desc';
  }

  normalized.sort = sortValue;
  if (prefersArraySort) {
    normalized['sort[0]'] = sortValue;
  }

  return normalized;
};

const fetchPostCollection = async (params?: Record<string, string | number | undefined>) => {
  const seen = new Set<string>();
  const attempts: Record<string, string>[] = [];
  const addAttempt = (query: Record<string, string>) => {
    const key = JSON.stringify(Object.keys(query).sort().map((k) => `${k}:${query[k]}`));
    if (!seen.has(key)) {
      attempts.push(query);
      seen.add(key);
    }
  };

  const base = normalizeSearchParams(params);
  const sortValue = base.sort ?? 'publishedAt:desc';
  const candidates: Record<string, string>[] = [
    base,
    { ...base, 'sort[0]': sortValue },
    { ...base, sort: sortValue, 'sort[0]': sortValue },
    { ...base, sort: sortValue },
    { 'pagination[page]': '1', sort: sortValue, 'sort[0]': sortValue },
    { 'pagination[page]': '1', sort: sortValue },
    { 'pagination[page]': '1' },
  ];

  if (base['pagination[pageSize]']) {
    candidates.push({ 'pagination[page]': '1', 'pagination[pageSize]': base['pagination[pageSize]'] });
  }

  candidates.forEach(addAttempt);

  for (const query of attempts) {
    const response = await fetchJSON<PostListResponse>('/api/posts', query);
    const collection = ensureArray<PostListResponse['data'][number]>(response?.data);
    if (collection.length) {
      return collection;
    }
  }

  return [];
};

const fetchMappedPosts = async (params?: Record<string, string | number | undefined>) => {
  const collection = await fetchPostCollection(params);
  return mapPostCollection(collection);
};

export const getLatestPosts = async (limit = 12) => {
  let mapped = await fetchMappedPosts({
    'pagination[pageSize]': limit,
    sort: 'publishedAt:desc',
  });

  if (!mapped.length) {
    mapped = await fetchMappedPosts({ 'pagination[pageSize]': limit });
  }

  if (!mapped.length) {
    mapped = await fetchMappedPosts();
  }

  return mapped;
};

export const getAllPosts = async () => {
  let mapped = await fetchMappedPosts({
    'pagination[pageSize]': 100,
    sort: 'publishedAt:desc',
  });

  if (!mapped.length) {
    mapped = await fetchMappedPosts({ 'pagination[pageSize]': 100 });
  }

  if (!mapped.length) {
    mapped = await fetchMappedPosts();
  }

  return mapped;
};

export const getPostBySlug = async (slug: string) => {
  const normalizedSlug = slug?.toString().trim();
  if (!normalizedSlug) return null;

  const single = await fetchJSON<PostSingleResponse>(
    `/api/posts/by-slug/${encodeURIComponent(normalizedSlug)}`
  );
  if (single?.data) {
    return mapPost(single.data);
  }

  const directMatches = await fetchPostCollection({
    "filters[slug][$eq]": normalizedSlug,
    'pagination[pageSize]': 5,
  });
  if (directMatches.length) {
    const mapped = mapPostCollection(directMatches);
    const exact = mapped.find((item) => item.slug === normalizedSlug);
    if (exact) return exact;
    const lower = normalizedSlug.toLowerCase();
    const insensitive = mapped.find((item) => item.slug.toLowerCase() === lower);
    if (insensitive) return insensitive;
  }

  const insensitiveMatches = await fetchPostCollection({
    "filters[slug][$eqi]": normalizedSlug,
    'pagination[pageSize]': 5,
  });
  if (insensitiveMatches.length) {
    const mapped = mapPostCollection(insensitiveMatches);
    const lower = normalizedSlug.toLowerCase();
    const insensitive = mapped.find((item) => item.slug.toLowerCase() === lower);
    if (insensitive) {
      return insensitive;
    }
  }

  const lower = normalizedSlug.toLowerCase();
  const posts = await getAllPosts();
  return (
    posts.find((item) => item.slug === normalizedSlug) ||
    posts.find((item) => item.slug.toLowerCase() === lower) ||
    null
  );
};

export const getTags = async () => {
  const data = await fetchJSON<{
    data: { id: number; attributes: { name: string; slug: string } }[];
  }>('/api/tags', {
    sort: 'name:asc',
  });
  const items = ensureArray<{ id: number; attributes: { name: string; slug: string } }>(data?.data);
  return items
    .map((tag) => parseTag(tag))
    .filter((tag): tag is Tag => Boolean(tag));
};

export const getPostsByTag = async (slug: string) => {
  const params = {
    'filters[tags][slug][$eq]': slug,
    sort: 'publishedAt:desc',
  } as Record<string, string | number | undefined>;
  let items = await fetchPostCollection(params);

  if (!items.length) {
    const allPosts = await getAllPosts();
    const lower = slug.toLowerCase();
    return allPosts.filter((post) =>
      post.tags.some((tag) => tag.slug === slug || tag.slug.toLowerCase() === lower)
    );
  }

  return filterValidPosts(items.map(mapPost));
};

const extractSlugsFromCollection = (collection: PostListResponse['data']) =>
  Array.from(
    new Set(
      collection
        .map((item) => {
          const base = asObject(item);
          const attr = asObject(base.attributes ?? base);
          const slugValue = attr.slug ?? base.slug;
          return typeof slugValue === 'string' ? slugValue.trim() : '';
        })
        .filter((slug) => slug.length > 0)
    )
  );

let lastKnownSlugs: string[] = [];

const fetchSlugsOnce = async () => {
  const fallbackResponse = await fetchJSON<{ data: { slug?: string }[] }>('/api/posts/slugs');
  const fromEndpoint = ensureArray<{ slug?: string }>(fallbackResponse?.data)
    .map((item) => (typeof item.slug === 'string' ? item.slug.trim() : ''))
    .filter((value) => value.length > 0);

  if (fromEndpoint.length) {
    return Array.from(new Set(fromEndpoint));
  }

  const primaryCollection = await fetchPostCollection({
    'pagination[pageSize]': 200,
    sort: 'publishedAt:desc',
  });
  const fromCollection = extractSlugsFromCollection(primaryCollection);

  if (fromCollection.length) {
    return fromCollection;
  }

  const posts = await getAllPosts();
  if (posts.length) {
    return Array.from(new Set(posts.map((post) => post.slug).filter((slug) => slug.length > 0)));
  }

  return [];
};

export const getPostSlugs = async () => {
  const isProd = import.meta.env.PROD;
  const devMaxAttempts = Number(import.meta.env.STRAPI_DEV_MAX_WAIT_ATTEMPTS ?? '0');
  const maxAttempts = isProd
    ? 6
    : Number.isFinite(devMaxAttempts) && devMaxAttempts > 0
    ? devMaxAttempts
    : Number.POSITIVE_INFINITY;
  const intervalMs = isProd ? 1500 : 2500;

  let slugs: string[] = [];
  let attempt = 0;
  let notified = false;

  while (!slugs.length && attempt < maxAttempts) {
    slugs = await fetchSlugsOnce();
    if (slugs.length) {
      break;
    }

    attempt += 1;

    if (!isProd && !notified) {
      console.warn('[strapi] Published posts are not available yet. Waiting for Strapi to become ready...');
      notified = true;
    }

    if (attempt < maxAttempts) {
      await sleep(intervalMs);
    }
  }

  if (!slugs.length && lastKnownSlugs.length) {
    console.warn('[strapi] Using cached slugs because CMS did not return any within the wait window.');
    return lastKnownSlugs;
  }

  if (!slugs.length) {
    console.warn('[strapi] No slugs were returned from Strapi; continuing with an empty list.');
  } else {
    lastKnownSlugs = slugs;
  }

  return slugs;
};

export const getRanking = async () => {
  try {
    const res = await fetchJSON<{
      data: RankingItem[];
      meta?: { count?: number };
    }>('/api/ranking');
    const items = ensureArray(res.data).filter(
      (item): item is RankingItem => Boolean(item && item.slug && item.title)
    );
    if (!items.length && res.meta?.count) {
      console.warn('[strapi] Ranking endpoint returned metadata without items.');
    }
    return items;
  } catch (error) {
    console.warn('[strapi] Ranking API fallback triggered', error);
    return [];
  }
};

export const getTwitchParentHosts = () => {
  const fallback = typeof window !== 'undefined' ? window.location.hostname : undefined;
  const hosts = new Set<string>();
  TWITCH.parentHosts.forEach((host) => hosts.add(host));
  if (fallback) {
    hosts.add(fallback);
  }
  return Array.from(hosts).filter(Boolean);
};
