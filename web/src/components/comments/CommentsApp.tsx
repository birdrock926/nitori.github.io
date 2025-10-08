import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { CommentNode } from '@lib/comments';
import { fetchComments, submitComment } from '@lib/comments';

export type CommentsConfig = {
  enabled?: boolean;
  requireApproval?: boolean;
  pageSize?: number;
  maxLength?: number;
};

type Props = {
  headingId: string;
  documentId?: string;
  slug: string;
  config?: CommentsConfig;
};

const AUTHOR_STORAGE_KEY = 'knn-comments-author';

const isPubliclyVisible = (comment: CommentNode) => {
  if (comment.removed || comment.blocked) {
    return false;
  }
  if (comment.approvalStatus && comment.approvalStatus !== 'APPROVED') {
    return false;
  }
  return true;
};

const countComments = (items: CommentNode[]): number =>
  items.reduce((total, item) => {
    const visibleSelf = isPubliclyVisible(item) ? 1 : 0;
    const childrenCount = item.children ? countComments(item.children) : 0;
    return total + visibleSelf + childrenCount;
  }, 0);

const buildAuthorId = (name: string, email?: string) => {
  if (email && email.trim().length > 0) {
    return email.trim().toLowerCase();
  }
  return name.trim();
};

const sanitizeContent = (value: string) => value.replace(/\r\n?/g, '\n').trim();

const resolveErrorMessage = (error: unknown, fallback: string) => {
  if (!error) {
    return fallback;
  }

  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : String(error);

  const message = raw?.toString().trim();
  if (!message) {
    return fallback;
  }

  if (/forbidden/i.test(message) || /\(403\)/.test(message)) {
    return 'コメントにアクセスできません。時間をおいて再度お試しください。';
  }

  if (/unauthori[sz]ed/i.test(message) || /\(401\)/.test(message)) {
    return 'コメント機能にアクセスできませんでした。ページを再読み込みしてから再度お試しください。';
  }

  return message;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderBody = (content: string) => {
  const normalized = sanitizeContent(content);
  if (!normalized.length) {
    return <p className="comment-content">(本文がありません)</p>;
  }

  const paragraphs = normalized.split(/\n{2,}/);
  return (
    <div className="comment-content">
      {paragraphs.map((paragraph, index) => (
        <p key={index} dangerouslySetInnerHTML={{ __html: escapeHtml(paragraph).replace(/\n/g, '<br />') }} />
      ))}
    </div>
  );
};

const defaultConfig: Required<CommentsConfig> = {
  enabled: true,
  requireApproval: true,
  pageSize: 50,
  maxLength: 1200,
};

const CommentsApp = ({ headingId, documentId, slug, config }: Props) => {
  const mergedConfig = { ...defaultConfig, ...(config ?? {}) } satisfies Required<CommentsConfig>;
  const relationId = documentId?.trim() ?? '';
  const isEnabled = mergedConfig.enabled !== false && relationId.length > 0;

  const [comments, setComments] = useState<CommentNode[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    isEnabled ? 'loading' : 'idle'
  );
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [author, setAuthor] = useState<{ name: string; email: string }>({ name: '', email: '' });
  const [content, setContent] = useState('');
  const [replyContent, setReplyContent] = useState('');
  const [replyTarget, setReplyTarget] = useState<CommentNode | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);

  const applyComments = useCallback(
    (data: CommentNode[], options?: { goToLastPage?: boolean }) => {
      setComments(data);

      if (!mergedConfig.pageSize || mergedConfig.pageSize <= 0) {
        setPage(1);
        setReplyTarget(null);
        setReplyContent('');
        return;
      }

      const nextPageCount = Math.max(1, Math.ceil(data.length / mergedConfig.pageSize));

      setPage((previous) => {
        const nextPage = options?.goToLastPage ? nextPageCount : Math.min(previous, nextPageCount);
        if (nextPage !== previous) {
          setReplyTarget(null);
          setReplyContent('');
        }
        return nextPage;
      });
    },
    [mergedConfig.pageSize, setReplyContent, setReplyTarget],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const stored = window.localStorage.getItem(AUTHOR_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { name?: string; email?: string };
        setAuthor({
          name: typeof parsed.name === 'string' ? parsed.name : '',
          email: typeof parsed.email === 'string' ? parsed.email : '',
        });
      }
    } catch (error) {
      console.warn('[comments] failed to parse cached author', error);
    }
  }, []);

  useEffect(() => {
    if (!isEnabled) {
      setStatus('idle');
      setComments([]);
      setPage(1);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setStatus('loading');
      setError(null);
      try {
        const data = await fetchComments(relationId, mergedConfig.pageSize);
        if (cancelled) {
          return;
        }
        applyComments(data);
        setStatus('ready');
      } catch (err) {
        if (cancelled) {
          return;
        }
        setError(resolveErrorMessage(err, 'コメントの読み込みに失敗しました。'));
        setStatus('error');
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [applyComments, isEnabled, mergedConfig.pageSize, relationId]);

  useEffect(() => {
    if (!successMessage) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    const timeout = window.setTimeout(() => setSuccessMessage(null), 6000);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [successMessage]);

  const storeAuthor = useCallback((name: string, email: string) => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(
        AUTHOR_STORAGE_KEY,
        JSON.stringify({ name: name.trim(), email: email.trim() })
      );
    } catch (error) {
      console.warn('[comments] failed to cache author', error);
    }
  }, []);

  const refreshComments = useCallback(
    async (options?: { goToLastPage?: boolean; showLoading?: boolean }) => {
      if (!relationId) {
        setComments([]);
        setStatus('idle');
        setPage(1);
        setReplyTarget(null);
        setReplyContent('');
        return;
      }

      if (options?.showLoading) {
        setStatus('loading');
      }

      setError(null);

      try {
        const data = await fetchComments(relationId, mergedConfig.pageSize);
        applyComments(data, { goToLastPage: options?.goToLastPage });
        setStatus('ready');
      } catch (err) {
        setError(resolveErrorMessage(err, 'コメントの読み込みに失敗しました。'));
        setStatus('error');
      }
    },
    [applyComments, mergedConfig.pageSize, relationId, setReplyContent, setReplyTarget],
  );

  const sendComment = useCallback(
    async (body: string, threadOf: number | null) => {
      if (!isEnabled || !relationId) {
        setError('コメント機能が無効化されています。');
        return false;
      }

      const trimmedName = author.name.trim();
      const trimmedContent = sanitizeContent(body);
      const trimmedEmail = author.email.trim();

      if (!trimmedName.length) {
        setError('ニックネームを入力してください。');
        return false;
      }

      if (!trimmedContent.length) {
        setError('コメント本文を入力してください。');
        return false;
      }

      if (trimmedContent.length > mergedConfig.maxLength) {
        setError(`コメントは${mergedConfig.maxLength}文字以内で入力してください。`);
        return false;
      }

      setSubmitting(true);
      setError(null);

      try {
        await submitComment(relationId, {
          content: trimmedContent,
          threadOf: threadOf ?? undefined,
          author: {
            id: buildAuthorId(trimmedName, trimmedEmail || undefined) || `${trimmedName}-${slug}`,
            name: trimmedName,
            email: trimmedEmail || undefined,
          },
        });

        storeAuthor(trimmedName, trimmedEmail);
        setSuccessMessage(
          mergedConfig.requireApproval
            ? 'コメントを送信しました。承認後に公開されます。'
            : 'コメントを投稿しました。'
        );
        await refreshComments({ goToLastPage: true });
        return true;
      } catch (err) {
        setError(resolveErrorMessage(err, 'コメントの送信に失敗しました。'));
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [
      author.email,
      author.name,
      isEnabled,
      mergedConfig.requireApproval,
      mergedConfig.maxLength,
      refreshComments,
      relationId,
      slug,
      storeAuthor,
    ]
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const success = await sendComment(content, null);
      if (success) {
        setContent('');
      }
    },
    [content, sendComment]
  );

  const handleReplySubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>, targetId: number) => {
      event.preventDefault();
      const success = await sendComment(replyContent, targetId);
      if (success) {
        setReplyContent('');
        setReplyTarget(null);
      }
    },
    [replyContent, sendComment]
  );

  const handleReplyClick = useCallback((comment: CommentNode) => {
    setReplyTarget(comment);
    setReplyContent('');
    setSuccessMessage(null);
  }, []);

  const totalCount = useMemo(() => countComments(comments), [comments]);

  const pageCount = useMemo(() => {
    if (!mergedConfig.pageSize || mergedConfig.pageSize <= 0) {
      return 1;
    }
    return Math.max(1, Math.ceil(comments.length / mergedConfig.pageSize));
  }, [comments.length, mergedConfig.pageSize]);

  useEffect(() => {
    setPage((previous) => Math.min(previous, pageCount));
  }, [pageCount]);

  useEffect(() => {
    setPage(1);
  }, [mergedConfig.pageSize, relationId]);

  const pagedComments = useMemo(() => {
    if (!mergedConfig.pageSize || mergedConfig.pageSize <= 0) {
      return comments;
    }
    const start = (page - 1) * mergedConfig.pageSize;
    const end = start + mergedConfig.pageSize;
    return comments.slice(start, end);
  }, [comments, mergedConfig.pageSize, page]);

  const threadsStart = useMemo(() => {
    if (!mergedConfig.pageSize || mergedConfig.pageSize <= 0) {
      return comments.length > 0 ? 1 : 0;
    }
    return comments.length > 0 ? (page - 1) * mergedConfig.pageSize + 1 : 0;
  }, [comments.length, mergedConfig.pageSize, page]);

  const threadsEnd = useMemo(() => {
    if (!mergedConfig.pageSize || mergedConfig.pageSize <= 0) {
      return comments.length;
    }
    return Math.min(page * mergedConfig.pageSize, comments.length);
  }, [comments.length, mergedConfig.pageSize, page]);

  const paginationItems = useMemo(() => {
    if (pageCount <= 7) {
      return Array.from({ length: pageCount }, (_, index) => index + 1);
    }

    const items: Array<number | 'ellipsis'> = [1];
    const start = Math.max(2, page - 1);
    const end = Math.min(pageCount - 1, page + 1);

    if (start > 2) {
      items.push('ellipsis');
    }

    for (let value = start; value <= end; value += 1) {
      items.push(value);
    }

    if (end < pageCount - 1) {
      items.push('ellipsis');
    }

    items.push(pageCount);
    return items;
  }, [page, pageCount]);

  useEffect(() => {
    if (!replyTarget) {
      return;
    }

    const findComment = (nodes: CommentNode[]): boolean =>
      nodes.some((node) => node.id === replyTarget.id || (node.children ? findComment(node.children) : false));

    if (!findComment(comments)) {
      setReplyTarget(null);
      setReplyContent('');
    }
  }, [comments, replyTarget]);

  const handlePageChange = useCallback(
    (nextPage: number) => {
      const safeNext = Math.min(Math.max(1, nextPage), pageCount);
      if (safeNext === page) {
        return;
      }
      setPage(safeNext);
      setReplyTarget(null);
      setReplyContent('');
      setSuccessMessage(null);
    },
    [page, pageCount, setReplyContent, setReplyTarget, setSuccessMessage],
  );

  const renderStatusPill = useCallback((comment: CommentNode) => {
    if (comment.removed || comment.blocked) {
      return <span className="comment-status-pill comment-status-pill--blocked">非表示</span>;
    }
    if (comment.approvalStatus && comment.approvalStatus !== 'APPROVED') {
      return <span className="comment-status-pill comment-status-pill--pending">承認待ち</span>;
    }
    if (comment.blockedThread) {
      return <span className="comment-status-pill">返信停止中</span>;
    }
    return null;
  }, []);

  const renderComment = useCallback(
    (comment: CommentNode) => {
      const isHidden = Boolean(comment.removed || comment.blocked);
      const isPending = Boolean(comment.approvalStatus && comment.approvalStatus !== 'APPROVED');
      const canReply =
        isEnabled &&
        !submitting &&
        !comment.blockedThread &&
        !isHidden &&
        relationId.length > 0;

      return (
        <div key={comment.id} className="comment-item">
          <div className="comment-header">
            <div className="comment-author">{comment.author?.name || 'ゲスト'}</div>
            <div className="comment-meta">
              {comment.createdAt && (
                <time dateTime={comment.createdAt}>
                  {new Date(comment.createdAt).toLocaleString('ja-JP', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              )}
              {renderStatusPill(comment)}
            </div>
          </div>
          {isHidden ? (
            <p className="comment-content">このコメントは管理者によって非表示になりました。</p>
          ) : isPending ? (
            <p className="comment-content">このコメントは承認待ちです。</p>
          ) : (
            renderBody(comment.content)
          )}
          <div className="comment-actions">
            {canReply ? (
              <button type="button" onClick={() => handleReplyClick(comment)}>
                返信する
              </button>
            ) : null}
          </div>
          {replyTarget?.id === comment.id && (
            <form
              className="comment-reply-form"
              onSubmit={(event) => handleReplySubmit(event, comment.id)}
              aria-label={`「${comment.author?.name || 'ゲスト'}」への返信フォーム`}
            >
              <div className="comments-field">
                <label htmlFor={`${headingId}-reply-${comment.id}`}>返信内容</label>
                <textarea
                  id={`${headingId}-reply-${comment.id}`}
                  value={replyContent}
                  onChange={(event) => setReplyContent(event.target.value)}
                  maxLength={mergedConfig.maxLength}
                  disabled={submitting}
                  required
                />
                <div className="comments-hint">残り {mergedConfig.maxLength - replyContent.length} 文字</div>
              </div>
              <div className="comments-form-actions">
                <button type="submit" className="comments-submit" disabled={submitting}>
                  {submitting ? '送信中…' : '返信を送信'}
                </button>
                <button
                  type="button"
                  className="ghost-button ghost-button--small"
                  onClick={() => {
                    setReplyTarget(null);
                    setReplyContent('');
                  }}
                >
                  キャンセル
                </button>
              </div>
            </form>
          )}
          {comment.children && comment.children.length > 0 ? (
            <div className="comment-children">
              {comment.children.map((child) => (
                <Fragment key={child.id}>{renderComment(child)}</Fragment>
              ))}
            </div>
          ) : null}
        </div>
      );
    },
    [handleReplyClick, handleReplySubmit, headingId, isEnabled, mergedConfig.maxLength, relationId.length, renderStatusPill, replyContent, replyTarget?.id, submitting]
  );

  return (
    <div className="comments-card">
      <header className="comments-header">
        <div>
          <h2 id={headingId}>コメント</h2>
          <p className="comments-meta">
            {!isEnabled
              ? 'コメント機能は現在利用できません。'
              : status === 'loading'
              ? 'コメントを読み込み中です…'
              : totalCount > 0
              ? pageCount > 1
                ? `${totalCount}件の公開コメント（${threadsStart}〜${threadsEnd}件を表示中）`
                : `${totalCount}件の公開コメント`
              : 'まだ公開コメントはありません。'}
          </p>
        </div>
        {mergedConfig.requireApproval ? (
          <span className="comment-status-pill comment-status-pill--pending" aria-label="承認制">
            承認制
          </span>
        ) : null}
      </header>

      {!mergedConfig.enabled ? (
        <p className="comments-alert" role="status">
          コメント機能は管理者によって停止されています。
        </p>
      ) : relationId.length === 0 ? (
        <p className="comments-alert comments-alert--warning" role="alert">
          コメント識別子を取得できなかったため、このページではコメントを表示できません。
        </p>
      ) : (
        <>
          {error ? (
            <p className="comments-alert comments-alert--warning" role="alert">
              {error}
            </p>
          ) : null}
          {successMessage ? (
            <p className="comments-alert" role="status">
              {successMessage}
            </p>
          ) : null}
          {status === 'loading' ? <p className="comments-spinner">読み込み中…</p> : null}
          {status === 'ready' && totalCount === 0 ? (
            <p className="comments-empty">まだコメントはありません。最初のコメントを投稿してみませんか？</p>
          ) : null}
          {status === 'ready' && pagedComments.length > 0 ? (
            <div className="comment-thread" aria-live="polite">
              {pagedComments.map((comment) => renderComment(comment))}
            </div>
          ) : null}

          {status === 'ready' && comments.length > 0 && pageCount > 1 ? (
            <nav className="comments-pagination" aria-label="コメントのページ切り替え">
              <div className="comments-pagination__summary">
                ページ {page} / {pageCount}
                {comments.length > 0 && threadsStart > 0
                  ? `（スレッド ${threadsStart}〜${threadsEnd} 件）`
                  : null}
              </div>
              <div className="comments-pagination__controls">
                <button
                  type="button"
                  className="comments-pagination__button"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 1}
                >
                  前へ
                </button>
                <ul className="comments-pagination__list" role="list">
                  {paginationItems.map((item, index) =>
                    typeof item === 'number' ? (
                      <li key={`page-${item}`}>
                        <button
                          type="button"
                          className={`comments-pagination__page${item === page ? ' comments-pagination__page--current' : ''}`}
                          onClick={() => handlePageChange(item)}
                          aria-current={item === page ? 'page' : undefined}
                        >
                          {item}
                        </button>
                      </li>
                    ) : (
                      <li key={`ellipsis-${index}`} className="comments-pagination__ellipsis" aria-hidden="true">
                        …
                      </li>
                    ),
                  )}
                </ul>
                <button
                  type="button"
                  className="comments-pagination__button"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page === pageCount}
                >
                  次へ
                </button>
              </div>
            </nav>
          ) : null}

          <form className="comments-form" onSubmit={handleSubmit} aria-label="新規コメントフォーム">
            <div className="comments-fields">
              <div className="comments-field">
                <label htmlFor={`${headingId}-author`}>ニックネーム</label>
                <input
                  id={`${headingId}-author`}
                  name="author"
                  value={author.name}
                  onChange={(event) => setAuthor((prev) => ({ ...prev, name: event.target.value }))}
                  disabled={submitting}
                  required
                />
              </div>
              <div className="comments-field">
                <label htmlFor={`${headingId}-email`}>メールアドレス（任意）</label>
                <input
                  id={`${headingId}-email`}
                  name="email"
                  type="email"
                  inputMode="email"
                  value={author.email}
                  onChange={(event) => setAuthor((prev) => ({ ...prev, email: event.target.value }))}
                  disabled={submitting}
                  placeholder="example@example.com"
                />
                <span className="comments-hint">公開されることはありません。返信のご連絡に利用します。</span>
              </div>
            </div>
            <div className="comments-field">
              <label htmlFor={`${headingId}-content`}>コメント本文</label>
              <textarea
                id={`${headingId}-content`}
                name="content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                disabled={submitting}
                maxLength={mergedConfig.maxLength}
                required
              />
              <div className="comments-hint">残り {mergedConfig.maxLength - content.length} 文字</div>
            </div>
            <div className="comments-form-actions">
              <button type="submit" className="comments-submit" disabled={submitting}>
                {submitting ? '送信中…' : 'コメントを投稿'}
              </button>
              <span className="comments-hint">ガイドラインに沿った丁寧なコメントを心掛けましょう。</span>
            </div>
          </form>
        </>
      )}
    </div>
  );
};

export default CommentsApp;
