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

const normalizeBlock = (block: any): DynamicZoneBlock => {
  if (!block || !block.__component) {
    return block;
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
    return (await response.json()) as T;
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

const mapPost = (apiPost: PostListResponse['data'][number]) => {
  const attr = apiPost.attributes;
  const cover = normalizeMedia(parseMedia(attr.cover?.data));

  return {
    id: apiPost.id,
    title: attr.title,
    slug: attr.slug,
    summary: attr.summary,
    publishedAt: attr.publishedAt,
    author: attr.author,
    source: attr.source,
    cover,
    tags: Array.isArray(attr.tags?.data)
      ? attr.tags.data.map((tag) => ({ id: tag.id, ...tag.attributes }))
      : [],
    blocks: Array.isArray(attr.blocks) ? attr.blocks.map(normalizeBlock) : [],
    commentAliasDefault: attr.commentAliasDefault ?? '名無しのプレイヤーさん',
  } satisfies Post;
};

const defaultPostParams = {
  'filters[publishedAt][$notNull]': 'true',
} as const;

const ensureArray = <T>(value: unknown): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? (value as T[]) : [];
};

export const getLatestPosts = async (limit = 12) => {
  const data = await fetchJSON<PostListResponse>('/api/posts', {
    ...defaultPostParams,
    'pagination[pageSize]': limit,
    sort: 'publishedAt:desc',
  });
  const items = ensureArray<PostListResponse['data'][number]>(data?.data);
  return items.map(mapPost);
};

export const getAllPosts = async () => {
  const data = await fetchJSON<PostListResponse>('/api/posts', {
    ...defaultPostParams,
    'pagination[pageSize]': 100,
    sort: 'publishedAt:desc',
  });
  const items = ensureArray<PostListResponse['data'][number]>(data?.data);
  return items.map(mapPost);
};

export const getPostBySlug = async (slug: string) => {
  const data = await fetchJSON<PostListResponse>('/api/posts', {
    ...defaultPostParams,
    'filters[slug][$eq]': slug,
    sort: 'publishedAt:desc',
  });
  const items = ensureArray<PostListResponse['data'][number]>(data?.data);
  const post = items.map(mapPost)[0];
  return post;
};

export const getTags = async () => {
  const data = await fetchJSON<{
    data: { id: number; attributes: { name: string; slug: string } }[];
  }>('/api/tags', {
    sort: 'name:asc',
  });
  const items = ensureArray<{ id: number; attributes: { name: string; slug: string } }>(data?.data);
  return items.map((tag) => ({ id: tag.id, ...tag.attributes }));
};

export const getPostsByTag = async (slug: string) => {
  const data = await fetchJSON<PostListResponse>('/api/posts', {
    ...defaultPostParams,
    'filters[tags][slug][$eq]': slug,
    sort: 'publishedAt:desc',
  });
  const items = ensureArray<PostListResponse['data'][number]>(data?.data);
  return items.map(mapPost);
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

export type CommentMeta = {
  aliasColor?: string;
  aliasLabel?: string;
  aliasProvided?: boolean;
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
