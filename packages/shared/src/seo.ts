export interface SeoMeta {
  title?: string;
  description?: string;
  image?: string | null;
  imageAlt?: string;
  largeImage?: boolean;
  type?: 'website' | 'article' | 'profile';
  canonical?: string;
  noindex?: boolean;
  publishedTime?: number;
  modifiedTime?: number;
  author?: string;
  section?: string;
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
  oembed?: boolean;
}

export function plainExcerpt(input: string, max = 200): string {
  const text = input
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[(\/?)[a-z*]+[1-6]?(?:=[^\]]*)?\]/gi, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?-]+$/, '')}…`;
}

export interface TopicEmbed {
  id: number;
  title: string;
  url: string;
  excerpt: string;
  board: { name: string; url: string };
  author: { name: string; avatarUrl: string | null; url: string | null };
  replyCount: number;
  viewCount: number;
  createdAt: number;
  lastPostAt: number;
  forum: { name: string; url: string; icon: string | null; accent: string };
}
