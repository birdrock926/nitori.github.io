import { STRAPI } from '@config/site';

export type CommentAuthor = {
  id?: string;
  name?: string;
  email?: string;
  avatar?: string | null;
  moderator?: boolean;
  badge?: string;
  badges?: string[];
  role?: string;
  roles?: string[];
  type?: string;
};

export type CommentNode = {
  id: number;
  documentId?: string;
  content: string;
  blocked?: boolean | null;
  blockedThread?: boolean | null;
  blockReason?: string | null;
  removed?: boolean | null;
  approvalStatus?: string | null;
  threadOf?: number | null;
  author?: CommentAuthor | null;
  createdAt?: string;
  updatedAt?: string;
  children?: CommentNode[];
};

export type CommentPostPayload = {
  content: string;
  author?: {
    id?: string;
    name: string;
    email?: string;
    avatar?: string;
  };
  threadOf?: number | null;
  locale?: string;
};

const apiBase = STRAPI.url?.replace(/\/$/, '');

const defaultHeaders: Record<string, string> = STRAPI.token
  ? { Authorization: `Bearer ${STRAPI.token}` }
  : {};

const normalizeAuthor = (value: any): CommentAuthor | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const idValue = value.id;
  const nameValue = value.name ?? value.username ?? value.displayName;
  const emailValue = value.email;
  const avatarValue = value.avatar ?? value.picture ?? value.image;
  const moderatorValue = parseBoolean(value.moderator ?? value.isModerator ?? value.admin);
  const badgeValue = typeof value.badge === 'string' ? value.badge : undefined;
  const badgesValue = Array.isArray(value.badges)
    ? value.badges
        .map((badge) => {
          if (typeof badge === 'string') {
            return badge;
          }
          if (badge && typeof badge === 'object') {
            if (typeof badge.name === 'string') {
              return badge.name;
            }
            if (typeof badge.label === 'string') {
              return badge.label;
            }
            if (typeof badge.title === 'string') {
              return badge.title;
            }
          }
          return null;
        })
        .filter((badge): badge is string => typeof badge === 'string' && badge.trim().length > 0)
    : undefined;
  const roleValue = typeof value.role === 'string' ? value.role : undefined;
  const rolesValue = Array.isArray(value.roles)
    ? value.roles
        .map((role) => {
          if (typeof role === 'string') {
            return role;
          }
          if (role && typeof role === 'object') {
            if (typeof role.name === 'string') {
              return role.name;
            }
            if (typeof role.type === 'string') {
              return role.type;
            }
          }
          return null;
        })
        .filter((role): role is string => typeof role === 'string' && role.trim().length > 0)
    : undefined;
  const typeValue = typeof value.type === 'string' ? value.type : undefined;

  const author: CommentAuthor = {
    id: typeof idValue === 'number' || typeof idValue === 'string' ? String(idValue) : undefined,
    name: typeof nameValue === 'string' && nameValue.trim().length > 0 ? nameValue.trim() : undefined,
    email: typeof emailValue === 'string' && emailValue.trim().length > 0 ? emailValue.trim() : undefined,
    avatar: typeof avatarValue === 'string' ? avatarValue : null,
  };

  if (moderatorValue !== null) {
    author.moderator = moderatorValue;
  }

  const normalizedBadges = Array.from(
    new Set(
      [badgeValue, ...(badgesValue ?? [])]
        .filter((badge): badge is string => typeof badge === 'string' && badge.trim().length > 0)
        .map((badge) => badge.trim())
    )
  );

  if (normalizedBadges.length > 0) {
    author.badges = normalizedBadges;
    author.badge = normalizedBadges[0];
  }

  if (typeof roleValue === 'string' && roleValue.trim().length > 0) {
    author.role = roleValue.trim();
  }

  if (rolesValue && rolesValue.length > 0) {
    author.roles = Array.from(new Set(rolesValue.map((role) => role.trim())));
  }

  if (typeof typeValue === 'string' && typeValue.trim().length > 0) {
    author.type = typeValue.trim();
  }

  return author;
};

const parseBoolean = (value: any): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }
  return null;
};

const normalizeComment = (value: any): CommentNode | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const idValue = typeof value.id === 'number' ? value.id : Number(value.id);
  if (!Number.isFinite(idValue)) {
    return null;
  }

  const blocked = parseBoolean(value.blocked);
  const blockedThread = parseBoolean(value.blockedThread);
  const removed = parseBoolean(value.removed);

  const threadSource = value.threadOf ?? value.thread_of;
  const threadOf =
    typeof threadSource === 'number'
      ? threadSource
      : typeof threadSource === 'string'
      ? Number(threadSource)
      : typeof threadSource === 'object' && threadSource !== null && Number.isFinite(Number(threadSource.id))
      ? Number(threadSource.id)
      : null;

  const children = Array.isArray(value.children)
    ? value.children
        .map((child) => normalizeComment(child))
        .filter((child): child is CommentNode => Boolean(child))
    : undefined;

  const approvalStatus = typeof value.approvalStatus === 'string' ? value.approvalStatus : undefined;

  return {
    id: idValue,
    documentId: typeof value.documentId === 'string' ? value.documentId : undefined,
    content: typeof value.content === 'string' ? value.content : '',
    blocked,
    blockedThread,
    removed,
    blockReason: typeof value.blockReason === 'string' ? value.blockReason : undefined,
    approvalStatus,
    threadOf,
    author: normalizeAuthor(value.author),
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : undefined,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : undefined,
    children,
  };
};

const sanitizeRelationIdentifier = (value: string) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    throw new Error('comment relation identifier is required');
  }
  return trimmed;
};

const commentsPath = (identifier: string) => {
  const relation = `api::post.post:${sanitizeRelationIdentifier(identifier)}`;
  return `/api/comments/${relation}`;
};

const commentActionPath = (identifier: string, commentId: number, action?: string) => {
  const base = commentsPath(identifier);
  if (!Number.isFinite(commentId)) {
    throw new Error('commentId must be a finite number');
  }

  const suffix = action ? `${action}` : '';
  const actionSegment = suffix.length > 0 ? `/${suffix}` : '';
  return `${base}/comment/${commentId}${actionSegment}`;
};

const request = async (path: string, init?: RequestInit) => {
  if (!apiBase) {
    throw new Error('Strapi API URL is not configured');
  }

  const url = new URL(path, apiBase);
  const response = await fetch(url.toString(), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...defaultHeaders,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
    let message = `Strapi comments request failed (${response.status})`;
    try {
      const data = await response.json();
      if (data && typeof data === 'object') {
        const errorMessage =
          data.error?.message ||
          data.message ||
          (Array.isArray(data) && data[0]?.messages?.[0]?.message) ||
          data?.data?.message;
        if (typeof errorMessage === 'string' && errorMessage.trim().length > 0) {
          message = errorMessage.trim();
        }
      }
    } catch (error) {
      // ignore JSON parse errors
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  try {
    return await response.json();
  } catch (error) {
    return null;
  }
};

type CommentsPagination = {
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
};

type CommentsPage = {
  items: CommentNode[];
  pagination: CommentsPagination;
};

const toPagination = (
  value: any,
  fallback: CommentsPagination,
): CommentsPagination => {
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const resolveNumber = (input: any, defaultValue: number) => {
    const parsed = Number(input);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
  };

  const page = resolveNumber(value.page, fallback.page);
  const pageSize = resolveNumber(value.pageSize, fallback.pageSize);
  const pageCount = resolveNumber(value.pageCount, fallback.pageCount);
  const total = resolveNumber(value.total, fallback.total);

  return { page, pageSize, pageCount, total };
};

const parseCommentsResponse = (value: any, currentPage: number, pageSize: number): CommentsPage => {
  const normalizeList = (input: any): CommentNode[] =>
    Array.isArray(input)
      ? input
          .map((item) => normalizeComment(item))
          .filter((item): item is CommentNode => Boolean(item))
      : [];

  if (Array.isArray(value)) {
    const items = normalizeList(value);
    return {
      items,
      pagination: {
        page: currentPage,
        pageSize,
        pageCount: 1,
        total: items.length,
      },
    };
  }

  if (value && typeof value === 'object') {
    const data = normalizeList((value as any).data ?? (value as any).results ?? []);
    const paginationSource =
      (value as any).meta?.pagination ?? (value as any).pagination ?? (value as any).meta;
    const pagination = toPagination(paginationSource, {
      page: currentPage,
      pageSize,
      pageCount: 1,
      total: data.length,
    });

    return { items: data, pagination };
  }

  return {
    items: [],
    pagination: {
      page: currentPage,
      pageSize,
      pageCount: 1,
      total: 0,
    },
  };
};

export const fetchComments = async (relationId: string, pageSize?: number): Promise<CommentNode[]> => {
  if (!relationId) {
    return [];
  }

  const normalizedPageSize = Number.isFinite(pageSize) && pageSize ? Math.max(1, Math.floor(pageSize)) : 50;

  const fetchPage = async (page: number): Promise<CommentsPage> => {
    try {
      const searchParams = new URLSearchParams();
      searchParams.set('sort', 'createdAt:asc');
      searchParams.set('pagination[page]', String(page));
      searchParams.set('pagination[pageSize]', String(normalizedPageSize));

      const response = await request(`${commentsPath(relationId)}?${searchParams.toString()}`);
      return parseCommentsResponse(response, page, normalizedPageSize);
    } catch (error) {
      console.warn('[comments] failed to fetch comments page', { page, error });
      throw error;
    }
  };

  try {
    const firstPage = await fetchPage(1);
    const allItems = [...firstPage.items];

    if (firstPage.pagination.pageCount > 1) {
      for (let nextPage = 2; nextPage <= firstPage.pagination.pageCount; nextPage += 1) {
        try {
          const next = await fetchPage(nextPage);
          allItems.push(...next.items);
        } catch (error) {
          // Stop fetching additional pages but return the comments we already have.
          break;
        }
      }
    }

    return allItems;
  } catch (error) {
    console.warn('[comments] failed to fetch comments', error);
    throw error instanceof Error ? error : new Error('Failed to fetch comments');
  }
};

export const submitComment = async (
  relationId: string,
  payload: CommentPostPayload,
): Promise<CommentNode | null> => {
  if (!relationId) {
    throw new Error('relationId is required');
  }

  const body: Record<string, unknown> = {
    content: payload.content,
  };

  if (payload.threadOf) {
    body.threadOf = payload.threadOf;
  }

  if (payload.locale) {
    body.locale = payload.locale;
  }

  if (payload.author && payload.author.name.trim().length > 0) {
    body.author = {
      ...payload.author,
      name: payload.author.name.trim(),
      email: payload.author.email?.trim() || undefined,
      id: payload.author.id?.toString(),
    };
  }

  const data = await request(commentsPath(relationId), {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!data) {
    return null;
  }

  const normalized = normalizeComment(data);
  return normalized;
};

export type CommentReportReason = 'BAD_LANGUAGE' | 'DISCRIMINATION' | 'OTHER';

export type CommentReportPayload = {
  reason?: CommentReportReason | string;
  content?: string;
};

export const reportComment = async (
  relationId: string,
  commentId: number,
  payload: CommentReportPayload,
): Promise<void> => {
  if (!relationId) {
    throw new Error('relationId is required');
  }

  if (!Number.isFinite(commentId) || commentId <= 0) {
    throw new Error('commentId must be a positive number');
  }

  const body: Record<string, unknown> = {};

  if (payload.reason && payload.reason.trim().length > 0) {
    body.reason = payload.reason.trim();
  }

  if (payload.content && payload.content.trim().length > 0) {
    body.content = payload.content.trim();
  }

  await request(commentActionPath(relationId, commentId, 'report-abuse'), {
    method: 'POST',
    body: JSON.stringify(body),
  });
};
