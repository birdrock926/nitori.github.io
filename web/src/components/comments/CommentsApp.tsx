import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { CommentNode, CommentPostPayload, CommentReportReason } from '@lib/comments';
import { fetchComments, reportComment, submitComment } from '@lib/comments';

export type CommentsConfig = {
  enabled?: boolean;
  requireApproval?: boolean;
  pageSize?: number;
  maxLength?: number;
  defaultAuthorName?: string;
};

type ReportReasonOption = {
  value: string;
  label: string;
  code: CommentReportReason;
};

const REPORT_REASONS: ReportReasonOption[] = [
  { value: 'spam', label: 'スパム・宣伝', code: 'OTHER' },
  { value: 'abuse', label: '中傷・ハラスメント', code: 'BAD_LANGUAGE' },
  { value: 'discrimination', label: '差別的な表現', code: 'DISCRIMINATION' },
  { value: 'illegal', label: '違法または危険な内容', code: 'OTHER' },
  { value: 'other', label: 'その他', code: 'OTHER' },
];

const DEFAULT_REPORT_REASON = REPORT_REASONS[0]?.value ?? 'other';

const resolveReportReasonCode = (value: string): CommentReportReason => {
  const option = REPORT_REASONS.find((item) => item.value === value);
  return option?.code ?? 'OTHER';
};

const resolveReportReasonLabel = (value: string): string | undefined =>
  REPORT_REASONS.find((item) => item.value === value)?.label;

type Props = {
  headingId: string;
  documentId?: string;
  entryId?: number | string;
  slug: string;
  config?: CommentsConfig;
  defaultAuthorName?: string;
};

const AUTHOR_STORAGE_KEY = 'knn-comments-author';
const LONG_COMMENT_PREVIEW = 320;
const GLOBAL_DEFAULT_AUTHOR = '名無しのユーザーさん';
const STAFF_KEYWORD_PATTERN =
  /(moderator|モデレーター|admin|staff|管理者|editor|official|運営|運營|运营|運営チーム|公式)/;

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

const pruneHiddenComments = (nodes: CommentNode[]): CommentNode[] => {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return [];
  }

  const result: CommentNode[] = [];

  nodes.forEach((node) => {
    if (!node) {
      return;
    }

    const children = pruneHiddenComments(node.children ?? []);
    const hasChildren = children.length > 0;
    const isHidden = Boolean(node.removed || node.blocked);

    if (isHidden && !hasChildren) {
      return;
    }

    if (hasChildren) {
      result.push({ ...node, children });
      return;
    }

    const nextNode: CommentNode = { ...node };
    if (nextNode.children && nextNode.children.length === 0) {
      delete (nextNode as { children?: CommentNode[] }).children;
    }

    result.push(nextNode);
  });

  return result;
};

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

  if (/forbiddenerror/i.test(message) || /e_forbidden/i.test(message)) {
    return 'コメントへのアクセスが拒否されました。時間をおいて再度お試しください。';
  }

  if (/not allowed/i.test(message) || /permission/i.test(message)) {
    return '権限がない操作です。ログイン状態や権限を確認してください。';
  }

  if (/unauthori[sz]ed/i.test(message) || /\(401\)/.test(message)) {
    return 'コメント機能にアクセスできませんでした。ページを再読み込みしてから再度お試しください。';
  }

  return message;
};

const IMAGE_MARKDOWN = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
const IMAGE_URL = /(https?:\/\/[^\s]+?\.(?:png|jpe?g|gif|webp|bmp|svg|avif))/gi;
const IMAGE_TAG = /<img\b[^>]*>/gi;

type ContentSegment =
  | { type: 'text'; value: string }
  | { type: 'image'; src: string; alt?: string };

const toNumericString = (value: unknown): string | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return String(Math.trunc(parsed));
    }
  }
  return undefined;
};

const toIdentifierString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return undefined;
};

const buildRelationCandidates = (entryId?: number | string, documentId?: string): string[] => {
  const candidates: string[] = [];
  const documentIdentifier = toIdentifierString(documentId);
  const numericId = toNumericString(entryId);

  if (documentIdentifier) {
    candidates.push(documentIdentifier);
  }

  if (numericId && !candidates.includes(numericId)) {
    candidates.push(numericId);
  }

  return candidates;
};

const isSafeImageUrl = (value: string): string | null => {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch (error) {
    console.warn('[comments] rejected unsafe image URL', { value, error });
    return null;
  }
};

const extractAttribute = (tag: string, attribute: string): string | undefined => {
  if (typeof tag !== 'string') {
    return undefined;
  }

  const pattern = new RegExp(
    `${attribute}\\s*=\\s*(?:"([^"\\>]*)"|'([^'\\>]*)'|([^\\s"'>]+))`,
    'i',
  );
  const match = tag.match(pattern);
  if (!match) {
    return undefined;
  }

  return match[1] ?? match[2] ?? match[3];
};

const sanitizeAltText = (value?: string): string => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/[\r\n]+/g, ' ').replace(/[\[\](),]/g, ' ').replace(/\s+/g, ' ').trim();
};

const normalizeParagraphImages = (paragraph: string): string =>
  paragraph.replace(IMAGE_TAG, (raw) => {
    const src = extractAttribute(raw, 'src');
    const alt = sanitizeAltText(extractAttribute(raw, 'alt'));
    const safeSrc = src ? isSafeImageUrl(src) : null;

    if (!safeSrc) {
      return alt ? ` ${alt} ` : '';
    }

    return `![${alt}](${safeSrc})`;
  });

const splitTextByImageUrls = (value: string): ContentSegment[] => {
  const segments: ContentSegment[] = [];
  let lastIndex = 0;
  IMAGE_URL.lastIndex = 0;

  let match: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((match = IMAGE_URL.exec(value)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: value.slice(lastIndex, match.index) });
    }

    const url = isSafeImageUrl(match[0]);
    if (url) {
      segments.push({ type: 'image', src: url });
    } else {
      segments.push({ type: 'text', value: match[0] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < value.length) {
    segments.push({ type: 'text', value: value.slice(lastIndex) });
  }

  return segments;
};

const parseParagraphSegments = (paragraph: string): ContentSegment[] => {
  const normalizedParagraph = normalizeParagraphImages(paragraph);
  const segments: ContentSegment[] = [];
  let lastIndex = 0;
  IMAGE_MARKDOWN.lastIndex = 0;

  let match: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((match = IMAGE_MARKDOWN.exec(normalizedParagraph)) !== null) {
    if (match.index > lastIndex) {
      const textPortion = normalizedParagraph.slice(lastIndex, match.index);
      segments.push(...splitTextByImageUrls(textPortion));
    }

    const alt = match[1]?.trim();
    const url = isSafeImageUrl(match[2]);
    if (url) {
      segments.push({ type: 'image', src: url, alt });
    } else {
      segments.push(...splitTextByImageUrls(match[0]));
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < normalizedParagraph.length) {
    segments.push(...splitTextByImageUrls(normalizedParagraph.slice(lastIndex)));
  }

  return segments;
};

const renderTextRuns = (value: string, key: string) => {
  const lines = value.split(/\n/);
  return lines.map((line, index) => (
    <Fragment key={`${key}-line-${index}`}>
      {line}
      {index < lines.length - 1 ? <br /> : null}
    </Fragment>
  ));
};

const renderSanitizedBody = (normalized: string, options?: { collapsed?: boolean }) => {
  if (!normalized.length) {
    return <p className="comment-content">(本文がありません)</p>;
  }

  const paragraphs = normalized.split(/\n{2,}/);
  return (
    <div className={`comment-content${options?.collapsed ? ' comment-content--collapsed' : ''}`}>
      {paragraphs.map((paragraph, index) => {
        const segments = parseParagraphSegments(paragraph);
        const trimmed = paragraph.trim();
        const allImages = segments.length > 0 && segments.every((segment) => segment.type === 'image');

        if (!trimmed) {
          return <p key={`comment-paragraph-${index}`} />;
        }

        if (allImages) {
          const caption = segments
            .map((segment) => (segment.type === 'image' ? segment.alt : null))
            .filter((value): value is string => Boolean(value && value.trim().length))
            .map((value) => value.trim())
            .join(' / ');

          return (
            <figure key={`comment-paragraph-${index}`} className="comment-figure">
              {segments.map((segment, segmentIndex) => (
                <img
                  key={`comment-paragraph-${index}-image-${segmentIndex}`}
                  src={segment.type === 'image' ? segment.src : ''}
                  alt={segment.type === 'image' ? segment.alt || 'コメントに添付された画像' : ''}
                  loading="lazy"
                />
              ))}
              {caption ? <figcaption>{caption}</figcaption> : null}
            </figure>
          );
        }

        return (
          <p key={`comment-paragraph-${index}`}>
            {segments.length
              ? segments.map((segment, segmentIndex) =>
                  segment.type === 'image' ? (
                    <img
                      key={`comment-paragraph-${index}-image-${segmentIndex}`}
                      className="comment-inline-image"
                      src={segment.src}
                      alt={segment.alt || 'コメントに添付された画像'}
                      loading="lazy"
                    />
                  ) : (
                    <Fragment key={`comment-paragraph-${index}-text-${segmentIndex}`}>
                      {renderTextRuns(segment.value, `comment-paragraph-${index}-text-${segmentIndex}`)}
                    </Fragment>
                  ),
                )
              : renderTextRuns(paragraph, `comment-paragraph-${index}`)}
          </p>
        );
      })}
    </div>
  );
};

const defaultConfig: Required<CommentsConfig> = {
  enabled: true,
  requireApproval: true,
  pageSize: 50,
  maxLength: 1200,
  defaultAuthorName: GLOBAL_DEFAULT_AUTHOR,
};

const CommentsApp = ({ headingId, documentId, entryId, slug, config, defaultAuthorName }: Props) => {
  const mergedConfig = useMemo(() => {
    if (!config) {
      return defaultConfig;
    }

    const sanitized = Object.fromEntries(
      Object.entries(config).filter(([, value]) => value !== undefined)
    ) as CommentsConfig;

    return { ...defaultConfig, ...sanitized } satisfies Required<CommentsConfig>;
  }, [config]);
  const relationCandidates = useMemo(() => buildRelationCandidates(entryId, documentId), [documentId, entryId]);
  const [activeRelation, setActiveRelation] = useState<string>(() => relationCandidates[0] ?? '');

  useEffect(() => {
    setActiveRelation((current) => {
      if (current && relationCandidates.includes(current)) {
        return current;
      }
      return relationCandidates[0] ?? relationCandidates[1] ?? '';
    });
  }, [relationCandidates]);

  const baseRelation = activeRelation || relationCandidates[0] || relationCandidates[1] || '';
  const isEnabled = mergedConfig.enabled !== false && baseRelation.length > 0;
  const guidelinesId = useMemo(() => `${headingId}-guidelines`, [headingId]);
  const fallbackAuthorName = useMemo(() => {
    const candidates = [defaultAuthorName, mergedConfig.defaultAuthorName, GLOBAL_DEFAULT_AUTHOR]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value) => value.length > 0);
    return candidates[0] || GLOBAL_DEFAULT_AUTHOR;
  }, [defaultAuthorName, mergedConfig.defaultAuthorName]);

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
  const [reportTarget, setReportTarget] = useState<CommentNode | null>(null);
  const [reportReason, setReportReason] = useState(DEFAULT_REPORT_REASON);
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [expandedComments, setExpandedComments] = useState<Record<number, boolean>>({});

  const applyComments = useCallback(
    (data: CommentNode[], options?: { goToLastPage?: boolean }) => {
      const sanitized = pruneHiddenComments(data);
      setComments(sanitized);

      if (!mergedConfig.pageSize || mergedConfig.pageSize <= 0) {
        setPage(1);
        setReplyTarget(null);
        setReplyContent('');
        return;
      }

      const nextPageCount = Math.max(1, Math.ceil(sanitized.length / mergedConfig.pageSize));

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

  const fetchThread = useCallback(async () => {
    if (!relationCandidates.length) {
      return null;
    }

    let lastError: unknown = null;
    let firstSuccess: { identifier: string; data: CommentNode[] } | null = null;

    for (const candidate of relationCandidates) {
      if (!candidate) {
        continue;
      }

      try {
        const data = await fetchComments(candidate, mergedConfig.pageSize);
        const result = { identifier: candidate, data };

        if (!firstSuccess) {
          firstSuccess = result;
        }

        if (data.length > 0) {
          return result;
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (firstSuccess) {
      return firstSuccess;
    }

    if (lastError) {
      throw lastError;
    }

    return null;
  }, [mergedConfig.pageSize, relationCandidates]);

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
    if (!isEnabled || !relationCandidates.length) {
      setStatus('idle');
      setComments([]);
      setPage(1);
      setReplyTarget(null);
      setReplyContent('');
      return;
    }

    let cancelled = false;
    setStatus('loading');
    setError(null);

    fetchThread()
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (result) {
          applyComments(result.data);
          setActiveRelation(result.identifier);
        } else {
          setComments([]);
          setPage(1);
        }
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        setError(resolveErrorMessage(err, 'コメントの読み込みに失敗しました。'));
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [applyComments, fetchThread, isEnabled, relationCandidates.length, setReplyContent, setReplyTarget]);

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
      if (!relationCandidates.length) {
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
        const result = await fetchThread();
        if (result) {
          applyComments(result.data, { goToLastPage: options?.goToLastPage });
          setActiveRelation(result.identifier);
        } else {
          applyComments([], { goToLastPage: options?.goToLastPage });
          setActiveRelation(relationCandidates[0] ?? '');
        }
        setStatus('ready');
      } catch (err) {
        setError(resolveErrorMessage(err, 'コメントの読み込みに失敗しました。'));
        setStatus('error');
      }
    },
    [applyComments, fetchThread, relationCandidates, setReplyContent, setReplyTarget],
  );

  const sendComment = useCallback(
    async (body: string, threadOf: number | null) => {
      if (!isEnabled || !relationCandidates.length) {
        setError('コメント機能が無効化されています。');
        return false;
      }

      const trimmedName = author.name.trim();
      const trimmedContent = sanitizeContent(body);
      const trimmedEmail = author.email.trim();
      const resolvedName = trimmedName.length > 0 ? trimmedName : fallbackAuthorName;

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
        const payload = {
          content: trimmedContent,
          threadOf: threadOf ?? undefined,
          author: {
            id: buildAuthorId(resolvedName, trimmedEmail || undefined) || `${resolvedName}-${slug}`,
            name: resolvedName,
            email: trimmedEmail || undefined,
          },
        } satisfies CommentPostPayload;

        let usedRelation = '';
        let lastError: unknown = null;

        for (const candidate of relationCandidates) {
          if (!candidate) {
            continue;
          }
          try {
            await submitComment(candidate, payload);
            usedRelation = candidate;
            break;
          } catch (error) {
            lastError = error;
          }
        }

        if (!usedRelation) {
          throw lastError ?? new Error('コメントの送信に失敗しました。');
        }

        setActiveRelation(usedRelation);
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
      fallbackAuthorName,
      isEnabled,
      mergedConfig.requireApproval,
      mergedConfig.maxLength,
      refreshComments,
      relationCandidates,
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
  }, [mergedConfig.pageSize, baseRelation]);

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

  useEffect(() => {
    if (!reportTarget) {
      return;
    }

    const findComment = (nodes: CommentNode[]): boolean =>
      nodes.some((node) => node.id === reportTarget.id || (node.children ? findComment(node.children) : false));

    if (!findComment(comments)) {
      setReportTarget(null);
      setReportDetails('');
      setReportReason(DEFAULT_REPORT_REASON);
    }
  }, [comments, reportTarget]);

  useEffect(() => {
    const activeIds = new Set<number>();

    const collect = (nodes: CommentNode[]) => {
      nodes.forEach((node) => {
        activeIds.add(node.id);
        if (node.children) {
          collect(node.children);
        }
      });
    };

    collect(comments);

    setExpandedComments((previous) => {
      let changed = false;
      const next: Record<number, boolean> = {};

      Object.entries(previous).forEach(([key, value]) => {
        const numericId = Number(key);
        if (!Number.isFinite(numericId) || !activeIds.has(numericId)) {
          changed = true;
          return;
        }

        next[numericId] = value;
      });

      if (!changed && Object.keys(previous).length === Object.keys(next).length) {
        return previous;
      }

      return next;
    });
  }, [comments]);

  const handlePageChange = useCallback(
    (nextPage: number) => {
      const safeNext = Math.min(Math.max(1, nextPage), pageCount);
      if (safeNext === page) {
        return;
      }
      setPage(safeNext);
      setReplyTarget(null);
      setReplyContent('');
      setReportTarget(null);
      setReportDetails('');
      setReportReason(DEFAULT_REPORT_REASON);
      setSuccessMessage(null);
    },
    [page, pageCount, setReplyContent, setReplyTarget, setReportDetails, setReportReason, setReportTarget, setSuccessMessage],
  );

  const toggleCommentExpansion = useCallback((commentId: number, expand?: boolean) => {
    setExpandedComments((previous) => {
      const current = previous[commentId] ?? false;
      const nextState = typeof expand === 'boolean' ? expand : !current;

      if (nextState === current) {
        return previous;
      }

      if (!nextState) {
        const { [commentId]: _removed, ...rest } = previous;
        return rest;
      }

      return { ...previous, [commentId]: true };
    });
  }, []);

  const handleReportClick = useCallback(
    (comment: CommentNode) => {
      if (!isEnabled || baseRelation.length === 0) {
        return;
      }

      if (reportTarget?.id === comment.id) {
        setReportTarget(null);
        setReportDetails('');
        setReportReason(DEFAULT_REPORT_REASON);
        return;
      }

      setReportTarget(comment);
      setReportDetails('');
      setReportReason(DEFAULT_REPORT_REASON);
      setSuccessMessage(null);
      setError(null);
    },
    [baseRelation, isEnabled, reportTarget?.id],
  );

  const handleReportCancel = useCallback(() => {
    setReportTarget(null);
    setReportDetails('');
    setReportReason(DEFAULT_REPORT_REASON);
  }, []);

  const handleReportSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>, commentId: number) => {
      event.preventDefault();

      if (!isEnabled || !relationCandidates.length) {
        setError('コメント機能が無効化されています。');
        return;
      }

      if (!reportReason) {
        setError('通報理由を選択してください。');
        return;
      }

      setReportSubmitting(true);
      setError(null);

      try {
        const normalizedReason = resolveReportReasonCode(reportReason);
        const baseDetails = sanitizeContent(reportDetails);
        const reasonLabel = resolveReportReasonLabel(reportReason);
        const detailSegments: string[] = [];

        if (baseDetails.length > 0) {
          detailSegments.push(baseDetails);
        }

        if (reasonLabel && !baseDetails.includes(reasonLabel)) {
          detailSegments.push(`選択した理由: ${reasonLabel}`);
        }

        let usedRelation = '';
        let lastError: unknown = null;

        for (const candidate of relationCandidates) {
          if (!candidate) {
            continue;
          }
          try {
            await reportComment(candidate, commentId, {
              reason: normalizedReason,
              content: detailSegments.length > 0 ? detailSegments.join('\n\n') : undefined,
            });
            usedRelation = candidate;
            break;
          } catch (error) {
            lastError = error;
          }
        }

        if (!usedRelation) {
          throw lastError ?? new Error('通報の送信に失敗しました。');
        }

        setActiveRelation(usedRelation);
        setSuccessMessage('通報を受け付けました。モデレーターが確認します。');
        setReportTarget(null);
        setReportDetails('');
        setReportReason(DEFAULT_REPORT_REASON);
      } catch (err) {
        setError(resolveErrorMessage(err, '通報の送信に失敗しました。'));
      } finally {
        setReportSubmitting(false);
      }
    },
    [isEnabled, relationCandidates, reportDetails, reportReason],
  );

  const isModeratorComment = useCallback((comment: CommentNode) => {
    if (!comment) {
      return false;
    }

    if (comment.isStaffResponse === true) {
      return true;
    }

    const author = comment.author;
    if (!author) {
      return false;
    }

    if (author.moderator === true) {
      return true;
    }

    const candidateValues = [
      typeof author.badge === 'string' ? author.badge : undefined,
      ...(author.badges ?? []),
      author.role,
      ...(author.roles ?? []),
      author.type,
      comment.isStaffResponse ? 'staff' : undefined,
    ]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim().toLowerCase());

    if (candidateValues.some((value) => STAFF_KEYWORD_PATTERN.test(value))) {
      return true;
    }

    return false;
  }, []);

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
      const hasVisibleChildren = Boolean(comment.children && comment.children.length > 0);

      if (isHidden && !hasVisibleChildren) {
        return null;
      }

      const canReply =
        isEnabled &&
        !submitting &&
        !comment.blockedThread &&
        !isHidden &&
        baseRelation.length > 0;
      const canReport =
        isEnabled &&
        baseRelation.length > 0 &&
        !reportSubmitting &&
        isPubliclyVisible(comment);

      const isModerator = isModeratorComment(comment);
      const sanitizedContent = sanitizeContent(comment.content || '');
      const isLongComment = sanitizedContent.length > LONG_COMMENT_PREVIEW;
      const isExpanded = expandedComments[comment.id] ?? false;
      const isCollapsed = isLongComment && !isExpanded;
      const showContent = !isHidden && !isPending;
      const showReadMore = showContent && isLongComment;
      const badgeCandidates = comment.author?.badges ?? [];
      const moderatorLabel =
        [comment.author?.badge, ...badgeCandidates]
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          .map((value) => value.trim())[0] || '運営';
      const moderatorBadgeLabel = `${moderatorLabel}からの返信`;
      const displayAuthorName = comment.author?.name?.trim().length
        ? comment.author.name.trim()
        : fallbackAuthorName;

      let displayContent = sanitizedContent;
      if (isCollapsed) {
        displayContent = sanitizedContent.slice(0, LONG_COMMENT_PREVIEW).replace(/\s+$/u, '');
        if (!displayContent.endsWith('…')) {
          displayContent = `${displayContent}…`;
        }
      }

      return (
        <div
          key={comment.id}
          className={`comment-item${isModerator ? ' comment-item--moderator' : ''}`}
          data-comment-id={comment.id}
        >
          <div className="comment-header">
            <div className="comment-author">
              <span className={`comment-author__name${isModerator ? ' comment-author__name--moderator' : ''}`}>
                {displayAuthorName}
              </span>
              {isModerator ? (
                <span className="comment-moderator-badge" aria-label={moderatorBadgeLabel}>
                  <span aria-hidden="true" className="comment-moderator-badge__icon">
                    ★
                  </span>
                  <span className="comment-moderator-badge__label">{moderatorLabel}</span>
                </span>
              ) : null}
            </div>
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
            hasVisibleChildren ? (
              <p className="comment-content">このコメントは管理者によって非表示になりました。</p>
            ) : null
          ) : isPending ? (
            <p className="comment-content">このコメントは承認待ちです。</p>
          ) : (
            <>
              {renderSanitizedBody(displayContent, { collapsed: isCollapsed })}
              {showReadMore ? (
                <button
                  type="button"
                  className="comment-expand"
                  onClick={() => toggleCommentExpansion(comment.id)}
                  aria-expanded={isExpanded}
                >
                  {isExpanded ? '折りたたむ' : '…続きを読む'}
                </button>
              ) : null}
            </>
          )}
          <div className="comment-actions">
            {canReply ? (
              <button type="button" onClick={() => handleReplyClick(comment)}>
                返信する
              </button>
            ) : null}
            {canReport ? (
              <button
                type="button"
                onClick={() => handleReportClick(comment)}
                disabled={reportSubmitting}
              >
                {reportTarget?.id === comment.id ? '通報フォームを閉じる' : '通報する'}
              </button>
            ) : null}
          </div>
          {replyTarget?.id === comment.id && (
            <form
              className="comment-reply-form"
              onSubmit={(event) => handleReplySubmit(event, comment.id)}
              aria-label={`「${displayAuthorName}」への返信フォーム`}
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
                <div className="comments-hint">
                  残り {Math.max(0, mergedConfig.maxLength - replyContent.length)} 文字
                </div>
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
          {reportTarget?.id === comment.id && (
            <form
              className="comment-report-form"
              onSubmit={(event) => handleReportSubmit(event, comment.id)}
              aria-label={`「${displayAuthorName}」を通報するフォーム`}
            >
              <div className="comments-field">
                <label htmlFor={`${headingId}-report-reason-${comment.id}`}>通報理由</label>
                <select
                  id={`${headingId}-report-reason-${comment.id}`}
                  value={reportReason}
                  onChange={(event) => setReportReason(event.target.value)}
                  disabled={reportSubmitting}
                >
                  {REPORT_REASONS.map((reason) => (
                    <option key={reason.value} value={reason.value}>
                      {reason.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="comments-field">
                <label htmlFor={`${headingId}-report-details-${comment.id}`}>詳細（任意）</label>
                <textarea
                  id={`${headingId}-report-details-${comment.id}`}
                  value={reportDetails}
                  onChange={(event) => setReportDetails(event.target.value)}
                  disabled={reportSubmitting}
                  placeholder="不適切だと感じた理由や補足情報があればご記入ください。"
                />
                <span className="comments-hint">個人情報は記入しないでください。</span>
              </div>
              <div className="comments-form-actions">
                <button type="submit" className="comments-submit" disabled={reportSubmitting}>
                  {reportSubmitting ? '送信中…' : '通報を送信'}
                </button>
                <button
                  type="button"
                  className="ghost-button ghost-button--small"
                  onClick={handleReportCancel}
                  disabled={reportSubmitting}
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
    [
      baseRelation,
      expandedComments,
      fallbackAuthorName,
      handleReplyClick,
      handleReplySubmit,
      handleReportCancel,
      handleReportClick,
      handleReportSubmit,
      headingId,
      isModeratorComment,
      isEnabled,
      mergedConfig.maxLength,
      renderStatusPill,
      replyContent,
      replyTarget?.id,
      reportDetails,
      reportReason,
      reportSubmitting,
      reportTarget?.id,
      toggleCommentExpansion,
      submitting,
    ],
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
      ) : baseRelation.length === 0 ? (
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
                  placeholder={`未入力の場合は「${fallbackAuthorName}」になります`}
                />
                <span className="comments-hint">
                  空欄のまま投稿すると「{fallbackAuthorName}」として表示されます。
                </span>
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
              <div className="comments-hint">残り {Math.max(0, mergedConfig.maxLength - content.length)} 文字</div>
            </div>
            <div className="comments-form-actions">
              <button type="submit" className="comments-submit" disabled={submitting}>
                {submitting ? '送信中…' : 'コメントを投稿'}
              </button>
              <span className="comments-hint">ガイドラインに沿った丁寧なコメントを心掛けましょう。</span>
            </div>
          </form>
          <section className="comments-guidelines" aria-labelledby={guidelinesId}>
            <h3 id={guidelinesId}>コメントガイドライン</h3>
            <ul>
              <li>他の読者や執筆者を尊重し、攻撃的な言葉づかいや差別的な表現は避けてください。</li>
              <li>個人情報や他者を特定できる情報は書き込まず、プライバシーを守りましょう。</li>
              <li>事実に基づいた内容を意識し、引用や参考情報には出典を添えてください。</li>
              <li>迷惑行為や不適切な投稿を見つけた場合は通報機能を利用し、ルールづくりにご協力ください。</li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
};

export default CommentsApp;
