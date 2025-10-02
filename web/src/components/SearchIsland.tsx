import { useMemo, useState } from 'react';
import lunr from 'lunr';
import type { Post } from '@lib/strapi';
import { formatDateTime, relative } from '@lib/format';

type TagFacet = {
  slug: string;
  name: string;
  count: number;
};

type Props = {
  posts: Post[];
};

const SearchIsland = ({ posts }: Props) => {
  const [query, setQuery] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);

  const index = useMemo(() => {
    return lunr(function () {
      this.ref('slug');
      this.field('title');
      this.field('summary');
      posts.forEach((post) => {
        this.add({ slug: post.slug, title: post.title, summary: post.summary });
      });
    });
  }, [posts]);

  const tagFacets = useMemo<TagFacet[]>(() => {
    const map = new Map<string, TagFacet>();
    posts.forEach((post) => {
      post.tags.forEach((tag) => {
        const current = map.get(tag.slug);
        if (current) {
          current.count += 1;
        } else {
          map.set(tag.slug, { slug: tag.slug, name: tag.name, count: 1 });
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ja'));
  }, [posts]);

  const searched = useMemo(() => {
    if (!query.trim()) {
      return posts;
    }
    try {
      const hits = index.search(query);
      return hits
        .map((hit) => posts.find((post) => post.slug === hit.ref))
        .filter((post): post is Post => Boolean(post));
    } catch (error) {
      return [];
    }
  }, [index, posts, query]);

  const results = useMemo(() => {
    if (activeTags.length === 0) {
      return searched;
    }
    return searched.filter((post) => post.tags.some((tag) => activeTags.includes(tag.slug)));
  }, [activeTags, searched]);

  const toggleTag = (slug: string) => {
    setActiveTags((prev) => {
      if (prev.includes(slug)) {
        return prev.filter((item) => item !== slug);
      }
      return [...prev, slug];
    });
  };

  const clearTags = () => setActiveTags([]);

  return (
    <section className="search-panel" aria-label="検索パネル">
      <div className="search-panel__control">
        <label className="search-panel__label" htmlFor="search-input">
          記事検索
        </label>
        <div className="search-panel__input">
          <input
            id="search-input"
            type="search"
            placeholder="キーワードを入力"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              className="ghost-button ghost-button--small"
              onClick={() => setQuery('')}
              aria-label="検索語をクリア"
            >
              クリア
            </button>
          )}
        </div>
      </div>
      {tagFacets.length > 0 && (
        <div className="search-panel__filters" aria-live="polite">
          <div className="search-panel__filters-header">
            <span className="muted">タグで絞り込み</span>
            {activeTags.length > 0 && (
              <button type="button" className="ghost-button ghost-button--small" onClick={clearTags}>
                タグをクリア
              </button>
            )}
          </div>
          <div className="tag-filter" role="list">
            {tagFacets.map((tag) => {
              const isActive = activeTags.includes(tag.slug);
              return (
                <button
                  key={tag.slug}
                  type="button"
                  className={`tag-chip${isActive ? ' is-active' : ''}`}
                  onClick={() => toggleTag(tag.slug)}
                  aria-pressed={isActive}
                  role="listitem"
                >
                  <span>{tag.name}</span>
                  <span className="tag-chip__count" aria-hidden="true">
                    {tag.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <p className="muted search-panel__result-count" aria-live="polite">
        検索結果: {results.length} 件
      </p>
      <div className="search-panel__grid" role="list">
        {results.length === 0 ? (
          <p className="muted" role="status">
            条件に一致する記事が見つかりませんでした。キーワードやタグを変更してください。
          </p>
        ) : (
          results.map((post) => (
            <article key={post.slug} className="search-panel__card card" role="listitem">
              <header className="search-panel__card-header">
                <time dateTime={post.publishedAt}>{formatDateTime(post.publishedAt)}</time>
                <span className="muted">{relative(post.publishedAt)}</span>
              </header>
              <h3 className="search-panel__card-title">
                <a href={`/posts/${post.slug}/`}>{post.title}</a>
              </h3>
              <p className="muted search-panel__card-summary">{post.summary}</p>
              {post.tags.length > 0 && (
                <div className="search-panel__card-tags">
                  {post.tags.slice(0, 4).map((tag) => (
                    <a key={tag.slug} className="tag-chip" href={`/tags/${tag.slug}/`}>
                      {tag.name}
                    </a>
                  ))}
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
};

export default SearchIsland;
