import { triggerWorkflow } from './utils/github.js';

const COMMENT_ACTIONS = [
  'plugin::comments.client.findAllInHierarchy',
  'plugin::comments.client.post',
  'plugin::comments.client.reportAbuse',
];

const COMMENT_ROLES = ['public', 'authenticated'];

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
