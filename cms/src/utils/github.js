import axios from 'axios';

const PLACEHOLDER_VALUES = new Set([
  'local-owner',
  'local-repo',
  'dispatch-workflow.yml',
  'github-token-placeholder',
  'github-owner',
  'github-repo',
  'ghp_xxx',
]);

const logger = globalThis?.strapi?.log ?? console;

const isConfigured = (value) => {
  if (!value) {
    return false;
  }
  const trimmed = `${value}`.trim();
  if (!trimmed) {
    return false;
  }
  return !PLACEHOLDER_VALUES.has(trimmed.toLowerCase()) && !/placeholder/i.test(trimmed);
};

export const triggerWorkflow = async ({ owner, repo, workflowId, token, ref }) => {
  if (!isConfigured(owner) || !isConfigured(repo) || !isConfigured(workflowId) || !isConfigured(token)) {
    logger.debug?.('[github] Webhook dispatch skipped: credentials are not fully configured.');
    return;
  }
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;
  try {
    await axios.post(
      url,
      {
        ref,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      },
    );
    logger.info?.('[github] Triggered GitHub Actions workflow dispatch.');
  } catch (error) {
    logger.warn?.('[github] Failed to trigger GitHub Actions workflow dispatch.');
    logger.debug?.(error);
  }
};
