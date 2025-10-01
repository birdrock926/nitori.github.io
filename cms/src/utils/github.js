import axios from 'axios';

export const triggerWorkflow = async ({ owner, repo, workflowId, token, ref }) => {
  if (!owner || !repo || !workflowId || !token) {
    return;
  }
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;
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
    }
  );
};
