import { STRAPI } from '@config/site';

const defaultHeaders: Record<string, string> = STRAPI.token
  ? { Authorization: `Bearer ${STRAPI.token}` }
  : {};

export type Media = {
  url: string;
  alternativeText?: string;
  caption?: string;
  width?: number;
  height?: number;
  formats?: Record<string, { url: string }>;
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
};

export type RankingItem = {
  id: number;
  title: string;
  slug: string;
  score: number;
};

const apiUrl = STRAPI.url?.replace(/\/$/, '');

const createUrl = (path: string, searchParams?: Record<string, string | number | undefined>) => {
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

export const fetchJSON = async <T>(path: string, params?: Record<string, string | number | undefined>) => {
  if (!apiUrl) {
    if (path.includes('/comments')) {
      return { data: [], nextCursor: null } as T;
    }
    return { data: [] } as T;
  }
  const url = createUrl(path, params);
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
      cover?: {
        data: {
          attributes: Media;
        } | null;
      } | null;
      tags: {
        data: { id: number; attributes: { name: string; slug: string } }[];
      };
      blocks: DynamicZoneBlock[];
    };
  }[];
};

const mapPost = (apiPost: PostListResponse['data'][0]) => {
  const attr = apiPost.attributes;
  return {
    id: apiPost.id,
    title: attr.title,
    slug: attr.slug,
    summary: attr.summary,
    publishedAt: attr.publishedAt,
    author: attr.author,
    source: attr.source,
    cover: attr.cover?.data?.attributes,
    tags: attr.tags.data.map((tag) => ({ id: tag.id, ...tag.attributes })),
    blocks: attr.blocks,
  } satisfies Post;
};

export const getLatestPosts = async (limit = 12) => {
  const data = await fetchJSON<PostListResponse>('/api/posts', {
    'pagination[pageSize]': limit,
    sort: 'publishedAt:desc',
    populate: 'cover,tags,blocks',
    'filters[publishedAt][$notNull]': 'true',
  });
  return data.data.map(mapPost);
};

export const getPostBySlug = async (slug: string) => {
  const data = await fetchJSON<PostListResponse>('/api/posts', {
    'filters[slug][$eq]': slug,
    'filters[publishedAt][$notNull]': 'true',
    populate: 'cover,tags,blocks',
  });
  const post = data.data.map(mapPost)[0];
  return post;
};

export const getTags = async () => {
  const data = await fetchJSON<{
    data: { id: number; attributes: { name: string; slug: string } }[];
  }>('/api/tags', {
    sort: 'name:asc',
  });
  return data.data.map((tag) => ({ id: tag.id, ...tag.attributes }));
};

export const getPostsByTag = async (slug: string) => {
  const data = await fetchJSON<PostListResponse>('/api/posts', {
    'filters[tags][slug][$eq]': slug,
    'filters[publishedAt][$notNull]': 'true',
    populate: 'cover,tags,blocks',
    sort: 'publishedAt:desc',
  });
  return data.data.map(mapPost);
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

export type CommentNode = {
  id: number;
  alias: string;
  body: string;
  status: 'published' | 'pending' | 'hidden' | 'shadow';
  createdAt: string;
  children: CommentNode[];
};

export const fetchComments = async (postSlug: string, cursor?: string) => {
  const data = await fetchJSON<{ data: CommentNode[]; nextCursor: string | null }>('/api/comments/list', {
    postSlug,
    cursor,
  });
  return data;
};
