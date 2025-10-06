import { triggerWorkflow } from './utils/github.js';
import { ensureCommentSchema, ensureCommentContentManagerConfig } from './utils/bootstrap.js';

const shouldTriggerDeploy = (event) => {
  const { result, params } = event;
  if (!result) return false;
  if ('data' in params && params.data?.publishedAt !== undefined) {
    return true;
  }
  return false;
};

export default {
  async register() {},

  async bootstrap({ strapi }) {
    await ensureCommentSchema(strapi);
    await ensureCommentContentManagerConfig(strapi);

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
