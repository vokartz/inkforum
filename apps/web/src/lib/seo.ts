import { plainExcerpt, type BoardPage, type Breadcrumb, type SeoMeta, type TopicPage } from '@forum/shared';
import type { PublicProfile } from '$lib/types';

/** Sayfa yükleyicileri için arama motoru / paylaşım verisi üreticileri (bkz. SeoHead.svelte). */

const iso = (ms: number) => new Date(ms).toISOString();

export function breadcrumbLd(items: Breadcrumb[], origin: string, last?: { label: string; href: string }) {
  const all = [...items, ...(last ? [last] : [])];
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: all.map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: b.label, item: `${origin}${b.href}` })),
  };
}

export function topicSeo(t: TopicPage, origin: string, settings: Record<string, unknown>): SeoMeta {
  const topic = t.topic;
  const first = t.posts.items.find((p) => p.isFirst);
  const description = first ? plainExcerpt(first.html, 180) : `${t.board.name} bölümünde ${topic.replyCount} yanıtlı konu.`;
  const url = `${origin}/t/${topic.id}/${topic.slug}`;
  const author = topic.author?.displayName ?? topic.authorName;
  const ogOn = settings['seo.ogImages'] !== false;
  return {
    title: topic.title,
    description,
    type: 'article',
    canonical: `/t/${topic.id}/${topic.slug}`,
    image: ogOn ? `/api/og/t/${topic.id}.png` : undefined,
    imageAlt: topic.title,
    largeImage: true,
    publishedTime: topic.createdAt,
    author,
    section: t.board.name,
    noindex: topic.isDeleted || !topic.isApproved,
    oembed: true,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'DiscussionForumPosting',
        headline: topic.title,
        url,
        mainEntityOfPage: url,
        datePublished: iso(topic.createdAt),
        ...(first?.editedAt ? { dateModified: iso(first.editedAt) } : {}),
        text: first ? plainExcerpt(first.html, 500) : description,
        author: { '@type': 'Person', name: author, ...(topic.author ? { url: `${origin}/u/${topic.author.id}/${topic.author.slug}` } : {}) },
        articleSection: t.board.name,
        ...(t.tags.length ? { keywords: t.tags.map((x) => x.name).join(', ') } : {}),
        interactionStatistic: [
          { '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: topic.replyCount },
          { '@type': 'InteractionCounter', interactionType: 'https://schema.org/ViewAction', userInteractionCount: topic.viewCount },
        ],
        comment: t.posts.items
          .filter((p) => !p.isFirst && !p.isDeleted)
          .slice(0, 10)
          .map((p) => ({
            '@type': 'Comment',
            text: plainExcerpt(p.html, 300),
            datePublished: iso(p.createdAt),
            author: { '@type': 'Person', name: p.author?.displayName ?? p.authorName },
            url: `${origin}/p/${p.id}`,
          })),
      },
      breadcrumbLd(t.breadcrumbs, origin, { label: topic.title, href: `/t/${topic.id}/${topic.slug}` }),
    ],
  };
}

export function boardSeo(b: BoardPage, origin: string): SeoMeta {
  const board = b.board;
  return {
    title: board.name,
    description: board.description || plainExcerpt(board.aboutHtml, 180) || `${board.name}: ${board.topicCount} konu, ${board.postCount} mesaj.`,
    canonical: `/f/${board.id}/${board.slug}`,
    image: board.cover ?? undefined,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: board.name,
        url: `${origin}/f/${board.id}/${board.slug}`,
        ...(board.description ? { description: board.description } : {}),
      },
      breadcrumbLd(b.breadcrumbs, origin),
    ],
  };
}

export function profileSeo(p: PublicProfile, origin: string, settings: Record<string, unknown>): SeoMeta {
  const u = p.user;
  const bio = plainExcerpt(p.bioHtml, 160);
  return {
    title: `${u.displayName} (@${u.username})`,
    description: bio || `${u.displayName}: ${p.postCount} mesaj${p.groups[0] ? ` · ${p.groups[0].name}` : ''}.`,
    type: 'profile',
    canonical: `/u/${u.id}/${u.slug}`,
    image: u.avatarUrl ?? undefined,
    largeImage: false,
    noindex: settings['seo.indexProfiles'] !== true,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      dateCreated: iso(p.registeredAt),
      mainEntity: {
        '@type': 'Person',
        name: u.displayName,
        alternateName: u.username,
        url: `${origin}/u/${u.id}/${u.slug}`,
        ...(u.avatarUrl ? { image: `${origin}${u.avatarUrl}` } : {}),
        interactionStatistic: { '@type': 'InteractionCounter', interactionType: 'https://schema.org/WriteAction', userInteractionCount: p.postCount },
      },
    },
  };
}

export function articleSeo(opts: { title: string; description: string; path: string; origin: string; updatedAt?: number; section?: string; noindex?: boolean }): SeoMeta {
  return {
    title: opts.title,
    description: opts.description,
    type: 'article',
    canonical: opts.path,
    modifiedTime: opts.updatedAt,
    section: opts.section,
    noindex: opts.noindex,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: opts.title,
      url: `${opts.origin}${opts.path}`,
      ...(opts.description ? { description: opts.description } : {}),
      ...(opts.updatedAt ? { dateModified: iso(opts.updatedAt) } : {}),
    },
  };
}
