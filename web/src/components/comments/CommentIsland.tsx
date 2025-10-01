import { FormEvent, useEffect, useRef, useState } from 'react';
import type { CommentNode } from '@lib/strapi';
import { fetchComments } from '@lib/strapi';
import { deleteOwnComment, reportComment, submitComment } from '@lib/comments';
import { formatDateTime, relative } from '@lib/format';

type Props = {
  postSlug: string;
};

type Notification = {
  message: string;
  type: 'success' | 'error';
};

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

const CommentIsland = ({ postSlug }: Props) => {
  const [comments, setComments] = useState<CommentNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [parentId, setParentId] = useState<number | null>(null);
  const [editKeys, setEditKeys] = useState<Record<number, string>>({});
  const [notification, setNotification] = useState<Notification | null>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const [honeypot, setHoneypot] = useState('');

  const announce = (note: Notification) => {
    setNotification(note);
    setTimeout(() => setNotification(null), 4000);
  };

  const loadComments = async (cursor?: string | null) => {
    try {
      setLoading(true);
      const res = await fetchComments(postSlug, cursor ?? undefined);
      if (cursor) {
        setComments((prev) => [...prev, ...res.data]);
      } else {
        setComments(res.data);
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
    loadComments();
  }, [postSlug]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!body.trim()) {
      announce({ message: 'コメントを入力してください', type: 'error' });
      return;
    }
    try {
      const res = await submitComment({
        postSlug,
        parentId: parentId ?? undefined,
        body,
        honeypot,
        sentAt: Date.now(),
      });
      const { comment, editKey } = res.data;
      const normalized: CommentNode = { ...comment, children: comment.children ?? [] };
      setEditKeys((prev) => ({ ...prev, [comment.id]: editKey }));
      if (parentId) {
        setComments((prev) => appendReply(prev, parentId, normalized));
      } else {
        setComments((prev) => [normalized, ...prev]);
      }
      setBody('');
      setParentId(null);
      announce({ message: 'コメントを受け付けました。モデレーションをお待ちください。', type: 'success' });
    } catch (err: any) {
      announce({ message: err.message ?? '投稿に失敗しました', type: 'error' });
    }
  };

  const handleReport = async (id: number) => {
    try {
      await reportComment(id, 'abuse');
      announce({ message: '通報を受け付けました', type: 'success' });
    } catch (err: any) {
      announce({ message: err.message ?? '通報に失敗しました', type: 'error' });
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
          <label htmlFor="comment-body">コメント本文</label>
          <textarea
            id="comment-body"
            name="body"
            required
            rows={5}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            style={{ padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)' }}
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
          {parentId && (
            <p className="muted">
              返信先 ID: {parentId}{' '}
              <button type="button" onClick={() => setParentId(null)}>返信を解除</button>
            </p>
          )}
          <button type="submit" className="tag-chip" style={{ width: 'fit-content' }}>
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
            onReport={handleReport}
            onDelete={handleDelete}
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
  onReport: (id: number) => void;
  onDelete: (id: number) => void;
};

const CommentThread = ({ comment, onReply, onReport, onDelete }: ThreadProps) => {
  const isPending = comment.status !== 'published';
  return (
    <article className="card" style={{ gap: '0.75rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong>{comment.alias}</strong>
        <time dateTime={comment.createdAt} className="muted">
          {formatDateTime(comment.createdAt)}（{relative(comment.createdAt)}）
        </time>
      </header>
      <p style={{ margin: 0, opacity: isPending ? 0.6 : 1 }}>{comment.body}</p>
      {isPending && <p className="muted" style={{ margin: 0 }}>審査中のため非公開です</p>}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" className="tag-chip" onClick={() => onReply(comment.id)}>
          返信
        </button>
        <button type="button" className="tag-chip" onClick={() => onReport(comment.id)}>
          通報
        </button>
        <button type="button" className="tag-chip" onClick={() => onDelete(comment.id)}>
          自分の投稿を非表示
        </button>
      </div>
      {comment.children?.length > 0 && (
        <div style={{ borderLeft: '2px solid var(--color-border)', paddingLeft: '1rem', display: 'grid', gap: '1rem' }}>
          {comment.children.map((child) => (
            <CommentThread
              key={child.id}
              comment={child}
              onReply={onReply}
              onReport={onReport}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </article>
  );
};

export default CommentIsland;
