import { COMMENT_STATUSES } from './constants.js';
import { extractDisplayMeta } from './meta.js';
import { normalizeStatus } from './slug.js';

const FALLBACK_MAX_FETCH = 500;

const isPublished = (status) => normalizeStatus(status) === COMMENT_STATUSES.PUBLISHED;

const filterChildren = (children = []) =>
  Array.isArray(children)
    ? children
        .filter((child) => isPublished(child.status))
        .map((child) => ({
          ...child,
          children: filterChildren(child.children),
        }))
    : [];

export const buildCommentResponse = (comment) => ({
  id: comment.id,
  body: comment.body,
  alias: comment.alias,
  status: normalizeStatus(comment.status),
  createdAt: comment.createdAt,
  isModerator: Boolean(comment.isModerator),
  meta: extractDisplayMeta(comment.meta),
  children:
    comment.children?.map((child) => buildCommentResponse({
      ...child,
      children: child.children ?? [],
    })) || [],
});

export const paginateComments = async (strapi, { postId, page = 1, pageSize = 20 }) => {
  const limit = Math.min(Math.max(Number(pageSize) || 20, 5), 50);
  const requestedPage = Math.max(Number(page) || 1, 1);
  const baseFilters = {
    post: postId,
    parent: null,
  };

  const publishedFilters = {
    ...baseFilters,
    status: { $eqi: COMMENT_STATUSES.PUBLISHED },
  };

  let useFallback = false;
  let total = 0;

  try {
    total = await strapi.entityService.count('api::comment.comment', {
      filters: publishedFilters,
    });
  } catch (error) {
    useFallback = true;
    strapi.log.warn('[comments] status ベースの集計に失敗したため、フォールバックします', error);
    total = await strapi.entityService.count('api::comment.comment', {
      filters: baseFilters,
    });
  }

  const pageCount = Math.max(Math.ceil(total / limit) || 1, 1);
  const currentPage = Math.min(requestedPage, pageCount);
  const start = (currentPage - 1) * limit;

  if (!useFallback) {
    const rootComments = await strapi.entityService.findMany('api::comment.comment', {
      filters: publishedFilters,
      sort: { createdAt: 'desc' },
      start,
      limit,
      fields: ['id', 'body', 'alias', 'status', 'createdAt', 'isModerator', 'meta'],
      populate: {
        children: {
          filters: { status: { $eqi: COMMENT_STATUSES.PUBLISHED } },
          sort: { createdAt: 'asc' },
          fields: ['id', 'body', 'alias', 'status', 'createdAt', 'isModerator', 'meta'],
        },
      },
    });

    return {
      data: rootComments.map(buildCommentResponse),
      pagination: {
        page: currentPage,
        pageSize: limit,
        pageCount,
        total,
      },
    };
  }

  const fallbackLimit = Math.min(Math.max(total, limit * currentPage), FALLBACK_MAX_FETCH);
  const fallbackComments = await strapi.entityService.findMany('api::comment.comment', {
    filters: baseFilters,
    sort: { createdAt: 'desc' },
    start: 0,
    limit: fallbackLimit,
    fields: ['id', 'body', 'alias', 'status', 'createdAt', 'isModerator', 'meta'],
    populate: {
      children: {
        sort: { createdAt: 'asc' },
        fields: ['id', 'body', 'alias', 'status', 'createdAt', 'isModerator', 'meta'],
      },
    },
  });

  const publishedRoots = fallbackComments
    .filter((comment) => isPublished(comment.status))
    .map((comment) => ({
      ...comment,
      children: filterChildren(comment.children),
    }));

  const filteredTotal = publishedRoots.length;
  const filteredPageCount = Math.max(Math.ceil(filteredTotal / limit) || 1, 1);
  const safeCurrentPage = Math.min(currentPage, filteredPageCount);
  const sliceStart = (safeCurrentPage - 1) * limit;
  const slice = publishedRoots.slice(sliceStart, sliceStart + limit);

  return {
    data: slice.map(buildCommentResponse),
    pagination: {
      page: safeCurrentPage,
      pageSize: limit,
      pageCount: filteredPageCount,
      total: filteredTotal,
    },
  };
};

export const toPublicComment = (comment) => ({
  id: comment.id,
  alias: comment.alias,
  body: comment.body,
  status: normalizeStatus(comment.status),
  createdAt: comment.createdAt,
  isModerator: Boolean(comment.isModerator),
  meta: extractDisplayMeta(comment.meta),
  parent: comment.parent ? comment.parent.id : null,
});
