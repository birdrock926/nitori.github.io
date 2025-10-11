import { triggerWorkflow } from './utils/github.js';

const COMMENT_ACTIONS = [
  'plugin::comments.client.findAllInHierarchy',
  'plugin::comments.client.post',
  'plugin::comments.client.reportAbuse',
];

const COMMENT_ROLES = ['public', 'authenticated'];
const COMMENT_RELATION_PREFIX = 'api::post.post:';
const POST_UID = 'api::post.post';
const NUMERIC_PATTERN = /^\d+$/;

const coerceDocumentId = (post) => {
  if (!post) {
    return null;
  }

  if (typeof post.documentId === 'string' && post.documentId.trim().length > 0) {
    return post.documentId.trim();
  }

  if (typeof post.document_id === 'string' && post.document_id.trim().length > 0) {
    return post.document_id.trim();
  }

  return null;
};

const coerceRelationId = (post) => {
  if (!post) {
    return null;
  }

  const idValue = post.id ?? post.entryId ?? post.entry_id;
  const parsed = Number(idValue);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.trunc(parsed);
  }

  return null;
};

const coerceRelationIdentifier = (post) => {
  if (!post || typeof post !== 'object') {
    return null;
  }

  const documentIdentifier = coerceDocumentId(post);
  if (documentIdentifier) {
    return documentIdentifier;
  }

  const numericIdentifier = coerceRelationId(post);
  if (numericIdentifier) {
    return String(numericIdentifier);
  }

  if (typeof post.slug === 'string' && post.slug.trim().length > 0) {
    return post.slug.trim();
  }

  return null;
};

const fetchPostByWhere = async (strapi, where) => {
  try {
    return await strapi.db
      .query(POST_UID)
      .findOne({ where, select: ['id', 'documentId', 'document_id', 'slug'] });
  } catch (error) {
    strapi.log.error('[comments] Failed to resolve post for relation normalization.', error);
    return null;
  }
};

const resolvePostRelationIdentifier = async (strapi, identifier, cache) => {
  if (!identifier) {
    return null;
  }

  if (cache.has(identifier)) {
    return cache.get(identifier);
  }

  let relationIdentifier = null;

  if (NUMERIC_PATTERN.test(identifier)) {
    const post = await fetchPostByWhere(strapi, { id: Math.trunc(Number(identifier)) });
    relationIdentifier = coerceRelationIdentifier(post);
    if (relationIdentifier) {
      cache.set(identifier, relationIdentifier);
      return relationIdentifier;
    }
  }

  if (!relationIdentifier) {
    const direct = await fetchPostByWhere(strapi, {
      $or: [
        { documentId: identifier },
        { document_id: identifier },
      ],
    });

    if (direct) {
      relationIdentifier = coerceRelationIdentifier(direct) || identifier;
    }
  }

  if (!relationIdentifier) {
    const bySlug = await fetchPostByWhere(strapi, { slug: identifier });
    relationIdentifier = coerceRelationIdentifier(bySlug);
  }

  if (relationIdentifier) {
    cache.set(identifier, relationIdentifier);
    return relationIdentifier;
  }

  cache.set(identifier, null);
  return null;
};

const normalizeCommentRelations = async (strapi) => {
  try {
    const comments = await strapi.db.query('plugin::comments.comment').findMany({
      where: {
        related: {
          $contains: COMMENT_RELATION_PREFIX,
        },
      },
      select: ['id', 'related'],
    });

    if (!comments.length) {
      return;
    }

    const cache = new Map();
    let normalizedCount = 0;

    for (const comment of comments) {
      if (typeof comment.related !== 'string' || !comment.related.startsWith(COMMENT_RELATION_PREFIX)) {
        continue;
      }

      const identifier = comment.related.slice(COMMENT_RELATION_PREFIX.length).trim();
      if (!identifier) {
        continue;
      }

      const resolvedRelationIdentifier = await resolvePostRelationIdentifier(strapi, identifier, cache);
      if (!resolvedRelationIdentifier) {
        continue;
      }

      const normalizedRelation = `${COMMENT_RELATION_PREFIX}${resolvedRelationIdentifier}`;
      if (normalizedRelation === comment.related) {
        continue;
      }

      await strapi.db
        .query('plugin::comments.comment')
        .update({ where: { id: comment.id }, data: { related: normalizedRelation } });

      normalizedCount += 1;
    }

      if (normalizedCount > 0) {
        strapi.log.info(`[comments] Normalized ${normalizedCount} comment relations to document identifiers.`);
      }
  } catch (error) {
    strapi.log.error('[comments] Failed to normalize comment relations.', error);
  }
};

const shouldTriggerDeploy = (event) => {
  const { result, params } = event;
  if (!result) return false;
  if ('data' in params && params.data?.publishedAt !== undefined) {
    return true;
  }
  return false;
};

const ensureCommentPermissions = async (strapi) => {
  try {
    for (const type of COMMENT_ROLES) {
      const role = await strapi.db
        .query('plugin::users-permissions.role')
        .findOne({ where: { type }, select: ['id', 'name'] });

      if (!role) {
        strapi.log.warn(`[comments] Unable to find "${type}" role while syncing permissions.`);
        continue;
      }

      const existingPermissions = await strapi.db
        .query('plugin::users-permissions.permission')
        .findMany({ where: { role: role.id }, select: ['action'] });

      const granted = new Set(existingPermissions.map((item) => item.action));
      const missing = COMMENT_ACTIONS.filter((action) => !granted.has(action));

      if (!missing.length) {
        continue;
      }

      await Promise.all(
        missing.map((action) =>
          strapi.db
            .query('plugin::users-permissions.permission')
            .create({ data: { action, role: role.id } }),
        ),
      );

      strapi.log.info(
        `[comments] Granted ${missing.join(', ')} to ${role.name || type} role for public comment access.`,
      );
    }
  } catch (error) {
    strapi.log.error('[comments] Failed to synchronize public comment permissions.', error);
  }
};

export default {
  async register() {},

  async bootstrap({ strapi }) {
    await ensureCommentPermissions(strapi);
    await normalizeCommentRelations(strapi);

    const owner = process.env.GITHUB_WORKFLOW_OWNER;
    const repo = process.env.GITHUB_WORKFLOW_REPO;
    const workflowId = process.env.GITHUB_WORKFLOW_ID;
    const token = process.env.GITHUB_WORKFLOW_TOKEN;
    const branch = process.env.GITHUB_WORKFLOW_BRANCH || 'main';

    strapi.db.lifecycles.subscribe({
      models: ['api::post.post'],
      async afterCreate(event) {
        if (event.result?.publishedAt) {
          await triggerWorkflow({ owner, repo, workflowId, token, ref: branch });
        }
      },
      async afterUpdate(event) {
        if (shouldTriggerDeploy(event)) {
          await triggerWorkflow({ owner, repo, workflowId, token, ref: branch });
        }
      },
    });
  },
};
