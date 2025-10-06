import { COMMENT_STATUSES } from './constants.js';
import { extractDisplayMeta } from './meta.js';
import { normalizeStatus } from './slug.js';

export const buildCommentResponse = (comment) => ({
  id: comment.id,
  body: comment.body,
  alias: comment.alias,
  status: normalizeStatus(comment.status),
  createdAt: comment.createdAt,
  isModerator: Boolean(comment.isModerator),
  meta: extractDisplayMeta(comment.meta),
  children: comment.children?.map((child) => buildCommentResponse(child)) || [],
});

export const paginateComments = async (strapi, { postId, page = 1, pageSize = 20 }) => {
  const baseFilters = {
    post: postId,
    status: { $eqi: COMMENT_STATUSES.PUBLISHED },
    parent: null,
  };

  const limit = Math.min(Math.max(Number(pageSize) || 20, 5), 50);
  const requestedPage = Math.max(Number(page) || 1, 1);

  const total = await strapi.entityService.count('api::comment.comment', {
    filters: baseFilters,
  });

  const pageCount = Math.max(Math.ceil(total / limit) || 1, 1);
  const currentPage = Math.min(requestedPage, pageCount);
  const start = (currentPage - 1) * limit;

  const rootComments = await strapi.entityService.findMany('api::comment.comment', {
    filters: baseFilters,
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
