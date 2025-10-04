import rss from '@astrojs/rss';
import { getLatestPosts } from '@lib/strapi';
import { SITE_TITLE, SITE_DESCRIPTION, SITE_URL } from '@config/site';

export async function GET() {
  const posts = await getLatestPosts(50);
  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: SITE_URL,
    items: posts.map((post) => ({
      title: post.title,
      link: `/posts/${post.slug}/`,
      description: post.summary,
      pubDate: new Date(post.publishedAt),
    })),
  });
}
