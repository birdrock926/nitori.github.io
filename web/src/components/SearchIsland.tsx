import { useMemo, useState } from 'react';
import lunr from 'lunr';
import type { Post } from '@lib/strapi';

type Props = {
  posts: Post[];
};

type SearchResult = {
  ref: string;
  score: number;
};

const SearchIsland = ({ posts }: Props) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Post[]>(posts);

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

  const handleSearch = (value: string) => {
    setQuery(value);
    if (!value.trim()) {
      setResults(posts);
      return;
    }
    const hits = index.search(value);
    const items = hits
      .map((hit: SearchResult) => posts.find((post) => post.slug === hit.ref))
      .filter((post): post is Post => Boolean(post));
    setResults(items);
  };

  return (
    <div className="card" style={{ gap: '1rem' }}>
      <label htmlFor="search-input" style={{ fontWeight: 600 }}>
        記事検索
      </label>
      <input
        id="search-input"
        type="search"
        placeholder="キーワードを入力"
        value={query}
        onChange={(event) => handleSearch(event.target.value)}
        style={{ padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)' }}
      />
      <p className="muted">検索結果: {results.length} 件</p>
      <div className="grid posts">
        {results.map((post) => (
          <article key={post.slug} className="card" style={{ gap: '0.5rem' }}>
            <h3 style={{ margin: 0 }}><a href={`/posts/${post.slug}/`}>{post.title}</a></h3>
            <p className="muted" style={{ margin: 0 }}>{post.summary}</p>
          </article>
        ))}
      </div>
    </div>
  );
};

export default SearchIsland;
