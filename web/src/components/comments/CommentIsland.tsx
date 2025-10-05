import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CommentNode, ModerationReason } from '@lib/strapi';
import { fetchComments } from '@lib/strapi';
import { deleteOwnComment, reportComment, submitComment, type ReportReason } from '@lib/comments';
import { formatDateTime, relative } from '@lib/format';
import { CAPTCHA } from '@config/site';

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, any>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    grecaptcha?: {
      ready: (callback: () => void) => void;
      execute: (siteKey: string, options: Record<string, any>) => Promise<string>;
    };
  }
}

type Props = {
  postSlug: string;
  defaultAlias?: string;
};

type Notification = {
  message: string;
  type: 'success' | 'error';
};

const REPORT_OPTIONS: { value: ReportReason; label: string; description: string }[] = [
  { value: 'spam', label: 'スパム・広告', description: '宣伝や無関係な内容' },
  { value: 'abuse', label: '誹謗中傷', description: '攻撃的・差別的な内容' },
  { value: 'copyright', label: '権利侵害', description: '著作権や規約違反が疑われる' },
  { value: 'other', label: 'その他', description: 'その他の問題' },
];

const describeModerationReasons = (reasons: ModerationReason[] = []) => {
  if (!reasons.length) {
    return '';
  }
  const labels = reasons
    .map((reason) => {
      if (reason.type === 'word') {
        return `特定語句（${reason.matches.join(', ')}）`;
      }
      if (reason.type === 'link-count') {
        return `リンク数が多い（${reason.count}件）`;
      }
      if (reason.type === 'link-host') {
        return `要確認リンク（${reason.hosts.join(', ')}）`;
      }
      return null;
    })
    .filter(Boolean);
  return labels.join('、');
};

const normalizeStatus = (status: CommentNode['status'] | string | undefined): CommentNode['status'] => {
  const value = typeof status === 'string' ? status.toLowerCase() : 'pending';
  if (value === 'published' || value === 'pending' || value === 'hidden' || value === 'shadow') {
    return value as CommentNode['status'];
  }
  return 'pending';
};

const normalizeNodes = (nodes: CommentNode[] = []): CommentNode[] =>
  nodes.map((node) => ({
    ...node,
    status: normalizeStatus(node.status),
    children: normalizeNodes(node.children ?? []),
  }));

const normalizeNode = (node: CommentNode): CommentNode => ({
  ...node,
  status: normalizeStatus(node.status),
  children: normalizeNodes(node.children ?? []),
});

const appendReply = (nodes: CommentNode[], parentId: number, comment: CommentNode): CommentNode[] =>
  nodes.map((node) => {
    if (node.id === parentId) {
      return { ...node, children: [...node.children, { ...comment, children: comment.children ?? [] }] };
    }
    if (node.children?.length) {
      return { ...node, children: appendReply(node.children, parentId, comment) };
    }
    return node;
  });

const removeCommentById = (nodes: CommentNode[], id: number): CommentNode[] =>
  nodes
    .filter((node) => node.id !== id)
    .map((node) => ({ ...node, children: node.children ? removeCommentById(node.children, id) : [] }));

const updateCommentMeta = (
  nodes: CommentNode[],
  targetId: number,
  updater: (meta: CommentNode['meta']) => CommentNode['meta']
): CommentNode[] => {
  let changed = false;
  const next = nodes.map((node) => {
    let nextNode = node;
    if (node.id === targetId) {
      changed = true;
      nextNode = { ...node, meta: updater(node.meta) };
    }
    if (node.children?.length) {
      const updatedChildren = updateCommentMeta(node.children, targetId, updater);
      if (updatedChildren !== node.children) {
        changed = true;
        nextNode = { ...nextNode, children: updatedChildren };
      }
    }
    return nextNode;
  });
  return changed ? next : nodes;
};

const CommentIsland = ({ postSlug, defaultAlias }: Props) => {
  const [comments, setComments] = useState<CommentNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [alias, setAlias] = useState('');
  const [parentId, setParentId] = useState<number | null>(null);
  const [editKeys, setEditKeys] = useState<Record<number, string>>({});
  const [notification, setNotification] = useState<Notification | null>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const [honeypot, setHoneypot] = useState('');
  const [reportTargetId, setReportTargetId] = useState<number | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>('spam');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const configuredProvider = CAPTCHA.provider;
  const turnstileSiteKey = CAPTCHA.turnstileSiteKey;
  const recaptchaSiteKey = CAPTCHA.recaptchaSiteKey;
  const captchaProvider =
    configuredProvider === 'turnstile' && !turnstileSiteKey
      ? 'none'
      : configuredProvider === 'recaptcha' && !recaptchaSiteKey
        ? 'none'
        : configuredProvider;
  const requiresCaptcha = captchaProvider !== 'none';
  const captchaContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetId = useRef<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReady, setCaptchaReady] = useState(captchaProvider !== 'turnstile');
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const fallbackAlias = defaultAlias?.trim() || '名無しのプレイヤーさん';
  const aliasInputId = 'comment-alias';
  const aliasHelpId = 'comment-alias-help';

  const announce = (note: Notification) => {
    setNotification(note);
    setTimeout(() => setNotification(null), 4000);
  };

  const loadComments = async (cursor?: string | null) => {
    try {
      setLoading(true);
      const res = await fetchComments(postSlug, cursor ?? undefined);
      const normalized = normalizeNodes(res.data ?? []);
      if (cursor) {
        setComments((prev) => [...prev, ...normalized]);
      } else {
        setComments(normalized);
      }
      setNextCursor(res.nextCursor);
      setError(null);
    } catch (err) {
      setError('コメントの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setAlias('');
    setBody('');
    setParentId(null);
    setCaptchaToken(null);
    setCaptchaError(null);
    setReportTargetId(null);
    setReportReason('spam');
    setReportSubmitting(false);
    if (captchaProvider === 'turnstile' && window.turnstile && turnstileWidgetId.current) {
      window.turnstile.reset(turnstileWidgetId.current);
      setCaptchaReady(false);
    }
    loadComments();
  }, [postSlug]);

  useEffect(() => {
    if (captchaProvider !== 'turnstile') {
      if (captchaProvider === 'none') {
        setCaptchaReady(true);
      }
      return;
    }

    setCaptchaReady(false);
    setCaptchaToken(null);
    setCaptchaError(null);

    const container = captchaContainerRef.current;
    if (!container) {
      return;
    }

    if (!turnstileSiteKey) {
      console.warn('Turnstile のサイトキーが未設定のため、CAPTCHA をスキップします');
      setCaptchaReady(true);
      return;
    }

    const renderWidget = () => {
      if (!window.turnstile || !container) {
        return;
      }

      if (turnstileWidgetId.current) {
        window.turnstile.reset(turnstileWidgetId.current);
        return;
      }

      turnstileWidgetId.current = window.turnstile.render(container, {
        sitekey: turnstileSiteKey,
        theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
        callback: (token: string) => {
          setCaptchaToken(token);
          setCaptchaReady(true);
          setCaptchaError(null);
        },
        'expired-callback': () => {
          setCaptchaToken(null);
          setCaptchaReady(false);
        },
        'error-callback': () => {
          setCaptchaToken(null);
          setCaptchaReady(false);
          setCaptchaError('セキュリティ確認の読み込みに失敗しました。再読み込みしてください。');
        },
      });
    };

    const handleThemeChange = () => {
      if (window.turnstile && turnstileWidgetId.current) {
        window.turnstile.reset(turnstileWidgetId.current);
        setCaptchaToken(null);
        setCaptchaReady(false);
      }
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
      if (existing) {
        existing.addEventListener('load', renderWidget, { once: true });
      } else {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.dataset.turnstile = 'true';
        script.addEventListener('load', renderWidget, { once: true });
        document.head.appendChild(script);
      }
    }

    document.addEventListener('themechange', handleThemeChange);

    return () => {
      const script = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
      script?.removeEventListener('load', renderWidget);
      if (window.turnstile && turnstileWidgetId.current) {
        window.turnstile.remove(turnstileWidgetId.current);
        turnstileWidgetId.current = null;
      }
      document.removeEventListener('themechange', handleThemeChange);
    };
  }, [captchaProvider, turnstileSiteKey, postSlug]);

  useEffect(() => {
    if (captchaProvider !== 'recaptcha') {
      if (captchaProvider === 'none') {
        setCaptchaReady(true);
      }
      return;
    }

    setCaptchaReady(false);
    setCaptchaToken(null);

    if (!recaptchaSiteKey) {
      console.warn('reCAPTCHA のサイトキーが未設定のため、CAPTCHA をスキップします');
      setCaptchaReady(true);
      return;
    }

    const onReady = () => {
      setCaptchaReady(true);
    };

    const handleLoad = () => window.grecaptcha?.ready(onReady);
    let createdScript: HTMLScriptElement | null = null;

    if (window.grecaptcha) {
      window.grecaptcha.ready(onReady);
    } else {
      const existing = document.querySelector<HTMLScriptElement>('script[data-recaptcha]');
      if (existing) {
        existing.addEventListener('load', handleLoad, { once: true });
      } else {
        const script = document.createElement('script');
        script.src = `https://www.google.com/recaptcha/api.js?render=${recaptchaSiteKey}`;
        script.async = true;
        script.defer = true;
        script.dataset.recaptcha = 'true';
        script.addEventListener('load', handleLoad, { once: true });
        document.head.appendChild(script);
        createdScript = script;
      }
    }

    return () => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-recaptcha]');
      existing?.removeEventListener('load', handleLoad);
      createdScript?.removeEventListener('load', handleLoad);
    };
  }, [captchaProvider, recaptchaSiteKey]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!body.trim()) {
      announce({ message: 'コメントを入力してください', type: 'error' });
      return;
    }
    if (requiresCaptcha && !captchaReady) {
      announce({ message: 'セキュリティ確認の準備中です。数秒後に再試行してください。', type: 'error' });
      return;
    }

    let captchaTokenForSubmit: string | undefined;
    if (captchaProvider === 'turnstile') {
      if (!captchaToken) {
        announce({ message: 'セキュリティチェックを完了してください', type: 'error' });
        return;
      }
      captchaTokenForSubmit = captchaToken;
    } else if (captchaProvider === 'recaptcha') {
      if (!recaptchaSiteKey || !window.grecaptcha) {
        announce({ message: 'reCAPTCHA の設定が完了していません', type: 'error' });
        return;
      }
      try {
        captchaTokenForSubmit = await window.grecaptcha.execute(recaptchaSiteKey, { action: 'comment_submit' });
      } catch (error) {
        announce({ message: 'reCAPTCHA の検証に失敗しました', type: 'error' });
        return;
      }
    }

    try {
      const trimmedAlias = alias.trim();
      const res = await submitComment({
        postSlug,
        parentId: parentId ?? undefined,
        body,
        alias: trimmedAlias ? trimmedAlias : undefined,
        honeypot,
        captchaToken: captchaTokenForSubmit,
      });
      const { comment, editKey } = res.data;
      const normalized = normalizeNode({ ...comment, children: comment.children ?? [] });
      setEditKeys((prev) => ({ ...prev, [comment.id]: editKey }));
      if (parentId) {
        setComments((prev) => appendReply(prev, parentId, normalized));
      } else {
        setComments((prev) => [normalized, ...prev]);
      }
      setBody('');
      setParentId(null);
      if (captchaProvider === 'turnstile' && window.turnstile && turnstileWidgetId.current) {
        window.turnstile.reset(turnstileWidgetId.current);
        setCaptchaToken(null);
        setCaptchaReady(false);
      } else if (captchaProvider === 'recaptcha') {
        setCaptchaToken(null);
      }
      const successMessage =
        comment.status === 'published'
          ? 'コメントを公開しました'
          : 'コメントを受け付けました。モデレーションをお待ちください。';
      announce({ message: successMessage, type: 'success' });
    } catch (err: any) {
      if (captchaProvider === 'turnstile' && window.turnstile && turnstileWidgetId.current) {
        window.turnstile.reset(turnstileWidgetId.current);
        setCaptchaToken(null);
        setCaptchaReady(false);
      }
      announce({ message: err.message ?? '投稿に失敗しました', type: 'error' });
    }
  };

  const startReport = (id: number) => {
    if (reportTargetId === id) {
      setReportTargetId(null);
      return;
    }
    setReportSubmitting(false);
    setReportTargetId(id);
    setReportReason('spam');
  };

  const cancelReport = () => {
    setReportTargetId(null);
    setReportSubmitting(false);
  };

  const submitReport = async (id: number) => {
    try {
      setReportSubmitting(true);
      const res = await reportComment(id, reportReason);
      const message = res.alreadyReported
        ? '既に通報済みのため内容を更新しました'
        : '通報を受け付けました';
      if (typeof res.reportCount === 'number') {
        setComments((prev) =>
          updateCommentMeta(prev, id, (meta) => ({ ...(meta ?? {}), reportCount: res.reportCount }))
        );
      }
      announce({ message, type: 'success' });
      setReportTargetId(null);
    } catch (err: any) {
      announce({ message: err.message ?? '通報に失敗しました', type: 'error' });
    } finally {
      setReportSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    const editKey = editKeys[id];
    if (!editKey) {
      announce({ message: '削除には編集キーが必要です', type: 'error' });
      return;
    }
    try {
      await deleteOwnComment(id, editKey);
      setComments((prev) => removeCommentById(prev, id));
      announce({ message: 'コメントを非表示にしました', type: 'success' });
    } catch (err: any) {
      announce({ message: err.message ?? '削除に失敗しました', type: 'error' });
    }
  };

  return (
    <section aria-labelledby="comments-title" style={{ marginTop: '3rem' }}>
      <div className="card" style={{ gap: '1rem' }}>
        <div>
          <h2 id="comments-title" style={{ margin: 0 }}>匿名コメント</h2>
          <p className="muted" style={{ margin: '0.5rem 0 0' }}>
            モデレーション後に公開されます。不適切な内容は投稿しないでください。
          </p>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
          <label htmlFor={aliasInputId}>表示名（任意）</label>
          <input
            id={aliasInputId}
            name="alias"
            type="text"
          value={alias}
          maxLength={24}
          onChange={(event) => {
            setAlias(event.target.value);
          }}
            placeholder={fallbackAlias}
            aria-describedby={aliasHelpId}
            autoComplete="nickname"
            style={{
              padding: '0.6rem 0.75rem',
              borderRadius: '0.75rem',
              border: '1px solid var(--color-border)',
              background: 'var(--layer-raised)',
              color: 'var(--text-primary)',
            }}
          />
          <p id={aliasHelpId} className="muted" style={{ margin: 0 }}>
            未入力の場合は「{fallbackAlias}」として公開されます。
          </p>
          <label htmlFor="comment-body">コメント本文</label>
          <textarea
            id="comment-body"
            name="body"
            required
            rows={5}
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
            }}
            style={{
              padding: '0.75rem',
              borderRadius: '0.75rem',
              border: '1px solid var(--color-border)',
              background: 'var(--layer-raised)',
              color: 'var(--text-primary)',
            }}
          ></textarea>
          <input
            type="text"
            name="trip"
            aria-hidden="true"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(event) => setHoneypot(event.target.value)}
            style={{ display: 'none' }}
          />
          {requiresCaptcha && (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <p className="muted" style={{ margin: 0 }}>
                スパム対策のためセキュリティチェックを実施します。
              </p>
              {captchaProvider === 'turnstile' ? (
                <div
                  ref={captchaContainerRef}
                  className="captcha-frame"
                  aria-live="polite"
                  aria-busy={!captchaReady}
                  style={{
                    minHeight: '70px',
                    display: 'grid',
                    placeItems: 'center',
                    padding: '0.5rem',
                    borderRadius: '0.75rem',
                    background: 'var(--layer-sunken)',
                  }}
                ></div>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  送信時に自動で reCAPTCHA が検証されます。
                </p>
              )}
              {captchaError && (
                <p role="alert" className="muted" style={{ margin: 0, color: 'tomato' }}>
                  {captchaError}
                </p>
              )}
            </div>
          )}
          {parentId && (
            <p className="muted">
              返信先 ID: {parentId}{' '}
              <button type="button" onClick={() => setParentId(null)}>返信を解除</button>
            </p>
          )}
          <button
            type="submit"
            className="tag-chip"
            style={{ width: 'fit-content', opacity: requiresCaptcha && !captchaReady ? 0.6 : 1 }}
            disabled={requiresCaptcha && !captchaReady}
          >
            送信する
          </button>
        </form>
        {notification && (
          <div
            role="status"
            aria-live="polite"
            ref={liveRef}
            className="muted"
            style={{ color: notification.type === 'success' ? 'var(--color-accent)' : 'tomato' }}
          >
            {notification.message}
          </div>
        )}
      </div>

      <div style={{ marginTop: '2rem', display: 'grid', gap: '1.5rem' }}>
        {loading && <p>読み込み中...</p>}
        {error && <p role="alert">{error}</p>}
        {!loading && comments.length === 0 && <p>最初のコメントを書きませんか？</p>}
        {comments.map((comment) => (
          <CommentThread
            key={comment.id}
            comment={comment}
            onReply={(id) => setParentId(id)}
            onDelete={handleDelete}
            onStartReport={startReport}
            onSubmitReport={submitReport}
            onCancelReport={cancelReport}
            onSelectReportReason={(reason) => setReportReason(reason)}
            reportTargetId={reportTargetId}
            reportReason={reportReason}
            reportSubmitting={reportSubmitting}
          />
        ))}
        {nextCursor && (
          <button type="button" className="tag-chip" onClick={() => loadComments(nextCursor)}>
            もっと読む
          </button>
        )}
      </div>
    </section>
  );
};

type ThreadProps = {
  comment: CommentNode;
  onReply: (id: number) => void;
  onDelete: (id: number) => void;
  onStartReport: (id: number) => void;
  onSubmitReport: (id: number) => void;
  onCancelReport: () => void;
  onSelectReportReason: (reason: ReportReason) => void;
  reportTargetId: number | null;
  reportReason: ReportReason;
  reportSubmitting: boolean;
};

const CommentThread = ({
  comment,
  onReply,
  onDelete,
  onStartReport,
  onSubmitReport,
  onCancelReport,
  onSelectReportReason,
  reportTargetId,
  reportReason,
  reportSubmitting,
}: ThreadProps) => {
  const isPending = comment.status !== 'published';
  const aliasColor = comment.meta?.aliasColor || (comment.isModerator ? 'var(--accent-strong)' : undefined);
  const aliasLabel = comment.meta?.aliasLabel || (comment.isModerator ? 'モデレーター' : undefined);
  const aliasClass = comment.isModerator ? 'comment-alias comment-alias--moderator' : 'comment-alias';
  const isReporting = reportTargetId === comment.id;
  const moderationReasons = describeModerationReasons(comment.meta?.flaggedReasons);
  const reportCount = typeof comment.meta?.reportCount === 'number' ? comment.meta.reportCount : 0;
  const moderationMessages: string[] = [];
  if (comment.meta?.requiresReview) {
    moderationMessages.push(`自動判定により審査中${moderationReasons ? `（${moderationReasons}）` : ''}`);
  }
  if (comment.meta?.moderatorFlagged) {
    moderationMessages.push('運営による確認中');
  }
  if (reportCount > 0) {
    moderationMessages.push(`通報: ${reportCount}件`);
  }
  const moderationNote = moderationMessages.join(' / ');
  return (
    <article className="card comment-thread" style={{ gap: '0.75rem' }}>
      <header className="comment-thread__header">
        <div className="comment-thread__identity">
          <span className={aliasClass} style={aliasColor ? { color: aliasColor } : undefined}>
            {comment.alias}
          </span>
          {aliasLabel && (
            <span className="comment-badge" aria-label={aliasLabel}>
              {aliasLabel}
            </span>
          )}
          {comment.meta?.moderatorFlagged && (
            <span className="comment-badge comment-badge--warning" aria-label="運営確認中">
              運営確認中
            </span>
          )}
        </div>
        <time dateTime={comment.createdAt} className="muted">
          {formatDateTime(comment.createdAt)}（{relative(comment.createdAt)}）
        </time>
      </header>
      <p style={{ margin: 0, opacity: isPending ? 0.6 : 1 }}>{comment.body}</p>
      {isPending && <p className="muted" style={{ margin: 0 }}>審査中のため非公開です</p>}
      {moderationNote && (
        <p className="muted" style={{ margin: 0 }}>{moderationNote}</p>
      )}
      <div className="comment-thread__actions">
        <button type="button" className="tag-chip" onClick={() => onReply(comment.id)}>
          返信
        </button>
        <button type="button" className="tag-chip" onClick={() => onStartReport(comment.id)}>
          {isReporting ? '通報を閉じる' : '通報'}
        </button>
        <button type="button" className="tag-chip" onClick={() => onDelete(comment.id)}>
          自分の投稿を非表示
        </button>
      </div>
      {isReporting && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitReport(comment.id);
          }}
          className="comment-report"
          style={{ display: 'grid', gap: '0.75rem', background: 'var(--layer-sunken)', padding: '0.75rem', borderRadius: '0.75rem' }}
        >
          <fieldset style={{ border: 'none', margin: 0, padding: 0 }} disabled={reportSubmitting}>
            <legend className="muted" style={{ marginBottom: '0.5rem' }}>
              通報する理由を選んでください
            </legend>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {REPORT_OPTIONS.map((option) => (
                <label key={option.value} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <input
                    type="radio"
                    name={`report-${comment.id}`}
                    value={option.value}
                    checked={reportReason === option.value}
                    onChange={() => onSelectReportReason(option.value)}
                  />
                  <span>
                    <strong style={{ display: 'block' }}>{option.label}</strong>
                    <span className="muted" style={{ display: 'block', fontSize: '0.85rem' }}>
                      {option.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="submit" className="tag-chip" disabled={reportSubmitting}>
              {reportSubmitting ? '送信中…' : '通報を送信'}
            </button>
            <button type="button" className="tag-chip" onClick={onCancelReport} disabled={reportSubmitting}>
              キャンセル
            </button>
          </div>
        </form>
      )}
      {comment.children?.length > 0 && (
        <div className="comment-thread__children">
          {comment.children.map((child) => (
            <CommentThread
              key={child.id}
              comment={child}
              onReply={onReply}
              onDelete={onDelete}
              onStartReport={onStartReport}
              onSubmitReport={onSubmitReport}
              onCancelReport={onCancelReport}
              onSelectReportReason={onSelectReportReason}
              reportTargetId={reportTargetId}
              reportReason={reportReason}
              reportSubmitting={reportSubmitting}
            />
          ))}
        </div>
      )}
    </article>
  );
};

export default CommentIsland;
