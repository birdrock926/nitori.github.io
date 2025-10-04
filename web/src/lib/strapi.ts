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
    }
  | {
      __component: 'media.gallery';
      items: { image: Media; alt: string }[];
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
    };

export type Post = {
  id: number;
  title: string;
  slug: string;
  summary: string;
  cover?: Media;
  tags: Tag[];
  blocks: DynamicZoneBlock[];
  author?: string;
  source?: string;
  publishedAt: string;
  commentAliasDefault?: string;
};

export type RankingItem = {
  id: number;
  title: string;
  slug: string;
  score: number;
};

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

const convertPlainTextToHtml = (value: string) => {
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return '';
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`);
  return paragraphs.join('\n');
};

const normalizeRichMarkup = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/<[a-z][^>]*>/i.test(trimmed)) {
    return trimmed;
  }
  return convertPlainTextToHtml(trimmed);
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
    return {
      __component: 'content.rich-text',
      body: extractRichBody(block.body ?? block.content ?? block.value),
    };
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
    return {
      __component: 'media.figure',
      image: media,
      alt: block.alt ?? media.alternativeText ?? '',
      caption: block.caption ?? media.caption,
      credit: block.credit,
    };
  }

  if (block.__component === 'media.gallery') {
    const items = Array.isArray(block.items)
      ? block.items
          .map((item: any) => {
            const media = normalizeMedia(parseMedia(item.image));
            if (!media) return undefined;
            return {
              image: media,
              alt: item.alt ?? media.alternativeText ?? '',
            };
          })
          .filter(Boolean)
      : [];
    return {
      __component: 'media.gallery',
      items: items as { image: Media; alt: string }[],
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

  return block as DynamicZoneBlock;
};

const defaultHeaders: Record<string, string> = STRAPI.token
  ? { Authorization: `Bearer ${STRAPI.token}` }
  : {};

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
  if (path.includes('/comments')) {
    return { data: [], nextCursor: null } as T;
  }
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
      commentAliasDefault?: string;
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
  title: '',
  slug: '',
  summary: '',
  publishedAt: '',
  tags: [],
  blocks: [],
  commentAliasDefault: '名無しのプレイヤーさん',
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

    return {
      ...defaults,
      id: Number.isFinite(Number(base.id)) ? Number(base.id) : defaults.id,
      title: typeof attr.title === 'string' ? attr.title : '',
      slug: typeof attr.slug === 'string' ? attr.slug : '',
      summary: typeof attr.summary === 'string' ? attr.summary : '',
      publishedAt: typeof attr.publishedAt === 'string' ? attr.publishedAt : '',
      author: typeof attr.author === 'string' ? attr.author : undefined,
      source: typeof attr.source === 'string' ? attr.source : undefined,
      cover,
      tags: tagsArray,
      blocks: rawBlocks.map(normalizeBlock),
      commentAliasDefault:
        typeof attr.commentAliasDefault === 'string' && attr.commentAliasDefault.trim()
          ? attr.commentAliasDefault
          : '名無しのプレイヤーさん',
    } satisfies Post;
  } catch (error) {
    console.warn('[strapi] Failed to map post payload', error);
    return fallbackPost();
  }
};

const ensureArray = <T>(value: unknown): T[] => extractArray<T>(value);

const filterValidPosts = (posts: Post[]) => posts.filter((post) => Boolean(post?.slug?.trim()));

const normalizeSearchParams = (params?: Record<string, string | number | undefined>) => {
  if (!params) return undefined;
  const normalized: Record<string, string | number> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (key === 'sort' || key === 'sort[0]') {
      normalized['sort[0]'] = String(value);
      return;
    }
    normalized[key] = value;
  });

  if (!('sort[0]' in normalized)) {
    normalized['sort[0]'] = 'publishedAt:desc';
  }

  return normalized;
};

const fetchPostCollection = async (params?: Record<string, string | number | undefined>) => {
  const response = await fetchJSON<PostListResponse>('/api/posts', normalizeSearchParams(params));
  return ensureArray<PostListResponse['data'][number]>(response?.data);
};

export const getLatestPosts = async (limit = 12) => {
  const items = await fetchPostCollection({
    'pagination[pageSize]': limit,
    'sort[0]': 'publishedAt:desc',
  });
  return filterValidPosts(items.map(mapPost));
};

export const getAllPosts = async () => {
  const items = await fetchPostCollection({
    'pagination[pageSize]': 100,
    'sort[0]': 'publishedAt:desc',
  });
  return filterValidPosts(items.map(mapPost));
};

export const getPostBySlug = async (slug: string) => {
  const single = await fetchJSON<PostSingleResponse>(`/api/posts/by-slug/${encodeURIComponent(slug)}`);
  if (single?.data) {
    return mapPost(single.data);
  }

  const params = {
    'filters[slug][$eqi]': slug,
    'sort[0]': 'publishedAt:desc',
  } as Record<string, string | number | undefined>;
  let items = await fetchPostCollection(params);

  if (!items.length) {
    const fallbackSlug = slugify(slug);
    if (fallbackSlug && fallbackSlug !== slug) {
      const retryParams = {
        ...params,
        'filters[slug][$eqi]': fallbackSlug,
      } as Record<string, string | number | undefined>;
      items = await fetchPostCollection(retryParams);
    }
  }

  let mapped = filterValidPosts(items.map(mapPost));
  const normalized = slug.toString();
  const lower = normalized.toLowerCase();
  let match = mapped.find((item) => item.slug === normalized);

  if (!match) {
    match = mapped.find((item) => item.slug.toLowerCase() === lower);
  }

  if (!match) {
    const allPosts = await getAllPosts();
    mapped = filterValidPosts(allPosts);
    match =
      mapped.find((item) => item.slug === normalized) ||
      mapped.find((item) => item.slug.toLowerCase() === lower) ||
      null;
  }

  return match ?? mapped[0] ?? null;
};

export const getTags = async () => {
  const data = await fetchJSON<{
    data: { id: number; attributes: { name: string; slug: string } }[];
  }>('/api/tags', {
    'sort[0]': 'name:asc',
  });
  const items = ensureArray<{ id: number; attributes: { name: string; slug: string } }>(data?.data);
  return items
    .map((tag) => parseTag(tag))
    .filter((tag): tag is Tag => Boolean(tag));
};

export const getPostsByTag = async (slug: string) => {
  const params = {
    'filters[tags][slug][$eqi]': slug,
    'sort[0]': 'publishedAt:desc',
  } as Record<string, string | number | undefined>;
  let items = await fetchPostCollection(params);

  if (!items.length) {
    const fallbackSlug = slugify(slug);
    if (fallbackSlug && fallbackSlug !== slug) {
      const retryParams = {
        ...params,
        'filters[tags][slug][$eq]': fallbackSlug,
      } as Record<string, string | number | undefined>;
      items = await fetchPostCollection(retryParams);
    }
  }

  return filterValidPosts(items.map(mapPost));
};

export const getPostSlugs = async () => {
  const response = await fetchJSON<{ data: { slug?: string }[] }>('/api/posts/slugs');
  const items = ensureArray<{ slug?: string }>(response?.data);
  return items
    .map((item) => (typeof item.slug === 'string' ? item.slug.trim() : ''))
    .filter((slug) => slug.length > 0);
};

export const getRanking = async () => {
  try {
    const res = await fetchJSON<{
      data: RankingItem[];
    }>('/api/ranking');
    return res.data;
  } catch (error) {
    return [];
  }
};

export type ModerationReason =
  | { type: 'word'; matches: string[] }
  | { type: 'link-count'; count: number }
  | { type: 'link-host'; hosts: string[] };

export type CommentMeta = {
  aliasColor?: string;
  aliasLabel?: string;
  aliasProvided?: boolean;
  requiresReview?: boolean;
  flaggedReasons?: ModerationReason[];
  reportCount?: number;
  moderatorFlagged?: boolean;
};

export type CommentNode = {
  id: number;
  alias: string;
  body: string;
  status: 'published' | 'pending' | 'hidden' | 'shadow';
  createdAt: string;
  isModerator?: boolean;
  meta?: CommentMeta | null;
  parent?: number | null;
  children: CommentNode[];
};

export const fetchComments = async (postSlug: string, cursor?: string) => {
  const data = await fetchJSON<{ data: CommentNode[]; nextCursor: string | null }>(
    '/api/comments/list',
    {
      postSlug,
      cursor,
    }
  );
  return data;
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
