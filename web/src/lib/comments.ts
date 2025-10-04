import { STRAPI } from '@config/site';
import type { CommentNode } from './strapi';

const baseUrl = STRAPI.url?.replace(/\/$/, '');

const headers: Record<string, string> = STRAPI.token
  ? { Authorization: `Bearer ${STRAPI.token}` }
  : {};

export type SubmitCommentPayload = {
  postSlug: string;
  parentId?: number;
  body: string;
  alias?: string;
  captchaToken?: string;
  honeypot?: string;
};

export type SubmittedComment = CommentNode & { parent?: number | null };

export const submitComment = async (payload: SubmitCommentPayload) => {
  if (!baseUrl) throw new Error('STRAPI_API_URL が未設定です');
  const response = await fetch(`${baseUrl}/api/comments/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    let message: string | undefined;
    try {
      const parsed = JSON.parse(text);
      message = parsed?.error?.message || parsed?.message;
    } catch (error) {
      // ignore parse error and fall back to raw text
    }
    throw new Error(message || text || '投稿に失敗しました');
  }
  return (await response.json()) as { data: { comment: SubmittedComment; editKey: string } };
};

export type ReportReason = 'spam' | 'abuse' | 'copyright' | 'other';

export const reportComment = async (id: number, reason: ReportReason) => {
  if (!baseUrl) throw new Error('STRAPI_API_URL が未設定です');
  const response = await fetch(`${baseUrl}/api/comments/${id}/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ reason }),
  });
  const text = await response.text();
  let parsed: any = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      // ignore JSON parse error
    }
  }
  if (!response.ok) {
    const message = parsed?.error?.message || parsed?.message || '通報に失敗しました';
    throw new Error(message);
  }
  return (parsed || { ok: true }) as { ok: boolean; alreadyReported?: boolean; reportCount?: number };
};

export const deleteOwnComment = async (id: number, editKey: string) => {
  if (!baseUrl) throw new Error('STRAPI_API_URL が未設定です');
  const response = await fetch(`${baseUrl}/api/comments/${id}/delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ edit_key: editKey }),
  });
  if (!response.ok) {
    throw new Error('削除に失敗しました');
  }
  return (await response.json()) as { ok: boolean };
};
