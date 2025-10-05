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

export const paginateComments = async (strapi, { postId, limit, cursor }) => {
  const where = {
    post: postId,
    status: { $eqi: COMMENT_STATUSES.PUBLISHED },
    parent: null,
  };
  if (cursor) {
    where.createdAt = { $lt: cursor };
  }
  const rootComments = await strapi.entityService.findMany('api::comment.comment', {
    filters: where,
    sort: { createdAt: 'desc' },
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
  const nextCursor = rootComments.length === limit ? rootComments[rootComments.length - 1].createdAt : null;
  return {
    data: rootComments.map(buildCommentResponse),
    nextCursor,
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
