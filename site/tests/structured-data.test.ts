import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { createPublishedCatalog, getPublishedSlugs, resolvePublishedResource, routePath } from '../src/lib/published-routes';
import { getEditorial } from '../src/lib/editorial';
import { ids } from '../src/lib/identity';
import { loadStats } from '../src/lib/stats';
import type { Talk } from '../src/lib/talks';
import {
  directoryGraph, editorialGraph, infoGraph, pageHeadline, repositoryAuthor, serializeJsonLd,
  talkGraph, talksIndexGraph, versionFromRevision, type JsonLdGraph, type JsonLdNode,
} from '../src/lib/structured-data';

const readme = {
  en: readFileSync(new URL('../../README.en.md', import.meta.url), 'utf8'),
  zh: readFileSync(new URL('../../README.md', import.meta.url), 'utf8'),
};
const catalog = createPublishedCatalog(readme);
const talks = readdirSync(new URL('../src/data/talks/', import.meta.url))
  .filter(file => file.endsWith('.json'))
  .map(file => JSON.parse(readFileSync(new URL(`../src/data/talks/${file}`, import.meta.url), 'utf8')) as Talk);

const forbidden = ['aggregateRating', 'reviewCount', 'ratingValue', 'offers', 'price', 'priceCurrency'];

function byType(graph: JsonLdGraph, type: string): JsonLdNode {
  const found = graph['@graph'].find(item => item['@type'] === type);
  expect(found, type).toBeDefined();
  return found!;
}

function idsOf(graph: JsonLdGraph): string[] {
  return graph['@graph'].map(item => item['@id']).filter((id): id is string => typeof id === 'string');
}

describe('structured data graph', () => {
  test('shared entities keep stable ids and a working search action', () => {
    const home = directoryGraph({
      locale: 'en', url: 'https://piindex.dev/', name: 'Pi Index — directory', description: 'Directory',
      dateModified: loadStats().generatedAt,
      items: catalog.resources.map(resource => ({ name: resource.name, url: `https://piindex.dev/#${resource.id}` })),
    });
    expect(serializeJsonLd(home)).not.toContain('<');
    expect(JSON.parse(serializeJsonLd(home))).toEqual(home);
    for (const term of forbidden) expect(JSON.stringify(home)).not.toContain(term);
    expect(idsOf(home)).toContain(ids.organization);
    expect(idsOf(home)).toContain(ids.person);
    expect(idsOf(home)).toContain(ids.website);
    const website = byType(home, 'WebSite');
    expect(website.publisher).toEqual({ '@id': ids.organization });
    expect(website.potentialAction).toMatchObject({
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: 'https://piindex.dev/?q={search_term_string}' },
      'query-input': 'required name=search_term_string',
    });
    const organization = byType(home, 'Organization');
    expect(organization.sameAs).toEqual(['https://github.com/bubbleptr/awesome-pi']);
    expect(organization.contactPoint).toMatchObject({ url: 'https://github.com/bubbleptr/awesome-pi/issues' });
    expect(organization.logo).toMatchObject({ url: 'https://piindex.dev/favicon.svg' });
    const person = byType(home, 'Person');
    expect(person.name).toBe('Kieran');
    expect(person.sameAs).toEqual(['https://github.com/bubbleptr', 'https://x.com/ninthbit_ai']);
    const page = byType(home, 'CollectionPage');
    expect(page.dateModified).toBe(loadStats().generatedAt);
    expect(page.mainEntity).toEqual({ '@id': 'https://piindex.dev/#itemlist' });
    const list = byType(home, 'ItemList');
    expect(list.numberOfItems).toBe(catalog.resources.length);
    expect(list.itemListElement).toHaveLength(catalog.resources.length);
    const breadcrumb = byType(home, 'BreadcrumbList');
    expect(breadcrumb.itemListElement).toHaveLength(1);
    expect(new Set(idsOf(home)).size).toBe(idsOf(home).length);
  });

  test('package guides are tech articles about the upstream package, not the maintainer', () => {
    for (const slug of getPublishedSlugs('packages')) for (const locale of ['en', 'zh'] as const) {
      const editorial = getEditorial('packages', slug);
      const resource = resolvePublishedResource(slug, catalog);
      const url = `https://piindex.dev${routePath('packages', slug, locale)}`;
      const codeRepository = resource?.url;
      expect(codeRepository).toStartWith('https://github.com/');
      const graph = editorialGraph({
        kind: 'packages', locale, url, homeUrl: locale === 'zh' ? 'https://piindex.dev/zh/' : 'https://piindex.dev/',
        title: editorial.title[locale], description: editorial.description[locale], image: 'https://piindex.dev/og-image-v4.png',
        dates: editorial.resources.map(review => review.verification.date),
        items: editorial.resources.map(review => ({ name: review.name, url: `${url}#${review.name}` })),
        software: { name: editorial.resources[0].name, codeRepository: codeRepository!, revision: editorial.resources[0].verification.revision },
      });
      expect(JSON.parse(serializeJsonLd(graph))).toEqual(graph);
      for (const term of forbidden) expect(JSON.stringify(graph)).not.toContain(term);
      const article = byType(graph, 'TechArticle');
      expect(article.headline).toBe(pageHeadline(editorial.title[locale]));
      expect(String(article.headline)).not.toContain('| Pi Index');
      expect(article.author).toEqual({ '@id': ids.person });
      expect(article.publisher).toEqual({ '@id': ids.organization });
      expect(article.datePublished).toBe(editorial.resources[0].verification.date);
      expect(article.dateModified).toBe(editorial.resources[0].verification.date);
      expect(article.image).toBe('https://piindex.dev/og-image-v4.png');
      const software = byType(graph, 'SoftwareSourceCode');
      expect(article.about).toEqual({ '@id': software['@id'] });
      expect(software.codeRepository).toBe(codeRepository);
      expect(software.version).toBe(versionFromRevision(editorial.resources[0].verification.revision));
      expect(software.author).toEqual(repositoryAuthor(codeRepository!));
      expect(JSON.stringify(software.author)).not.toContain('Kieran');
      expect(graph['@graph'].some(item => item['@type'] === 'BreadcrumbList')).toBe(true);
    }
    const web = getEditorial('packages', 'pi-web-access');
    expect(web.resources[0].verification.date).toBe('2026-09-21');
    expect(versionFromRevision(web.resources[0].verification.revision)).toBe('v0.30.0');
    expect(repositoryAuthor('https://github.com/nicobailon/pi-web-access')).toEqual({ '@type': 'Person', name: 'nicobailon', url: 'https://github.com/nicobailon' });
  });

  test('category and topic pages list the resources on the page and use their review dates', () => {
    const expectations = [
      ['categories', 'subagents', '2026-09-21'],
      ['categories', 'web-access-search', '2026-09-21'],
      ['topics', 'jev', '2026-09-22'],
      ['topics', 'pi-durable', '2026-10-07'],
    ] as const;
    for (const [kind, slug, date] of expectations) for (const locale of ['en', 'zh'] as const) {
      const editorial = getEditorial(kind, slug);
      const url = `https://piindex.dev${routePath(kind, slug, locale)}`;
      const items = editorial.resources.map(review => ({ name: review.name, url: `${url}#${review.name}` }));
      const graph = editorialGraph({
        kind, locale, url, homeUrl: 'https://piindex.dev/', title: editorial.title[locale],
        description: editorial.description[locale], image: 'https://piindex.dev/og-image-v4.png',
        dates: editorial.resources.map(review => review.verification.date), items,
      });
      const page = byType(graph, 'CollectionPage');
      expect(String(page.name)).not.toContain('| Pi Index');
      expect(page.dateModified).toBe(date);
      expect(page.author).toEqual({ '@id': ids.person });
      const list = byType(graph, 'ItemList');
      expect(list.numberOfItems).toBe(editorial.resources.length);
      expect(list.itemListElement).toEqual(items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, url: item.url })));
      const crumbs = byType(graph, 'BreadcrumbList').itemListElement as { position: number; name: string }[];
      expect(crumbs.map(crumb => crumb.position)).toEqual([1, 2]);
      expect(crumbs[0].name).toBe('Pi Index');
      expect(crumbs[1].name).toBe(String(page.name));
    }
  });

  test('talk pages carry an item list and video objects with the fields the data has', () => {
    const index = talksIndexGraph({
      locale: 'en', url: 'https://piindex.dev/talks/', homeUrl: 'https://piindex.dev/', name: 'Conversations', description: 'Talks',
      items: talks.map(talk => ({ name: talk.title.en, url: `https://piindex.dev/talks/${talk.slug}/`, uploadedAt: talk.uploadedAt })),
    });
    expect(byType(index, 'ItemList').numberOfItems).toBe(talks.length);
    expect(byType(index, 'CollectionPage').dateModified).toBe([...talks].map(talk => talk.uploadedAt).sort().at(-1));
    for (const talk of talks) {
      const graph = talkGraph({
        locale: 'zh', url: `https://piindex.dev/zh/talks/${talk.slug}/`, homeUrl: 'https://piindex.dev/zh/',
        indexUrl: 'https://piindex.dev/zh/talks/', indexName: '播客', title: `${talk.title.zh} | Pi Index`,
        description: 'A conversation', thumbnailUrl: `https://piindex.dev${talk.poster}`, uploadDate: talk.uploadedAt,
        durationSeconds: talk.duration, contentUrl: talk.video,
        embedUrl: talk.youtube ? `https://www.youtube.com/embed/${talk.youtube}` : undefined, sourceUrl: talk.source,
      });
      const video = byType(graph, 'VideoObject');
      expect(video.name).toBe(talk.title.zh);
      expect(String(video.name)).not.toContain('| Pi Index');
      expect(video.description).toBe('A conversation');
      expect(video.thumbnailUrl).toBe(`https://piindex.dev${talk.poster}`);
      expect(video.uploadDate).toBe(talk.uploadedAt);
      expect(video.duration).toBe(`PT${Math.floor(talk.duration)}S`);
      expect(video.contentUrl).toBe(talk.video);
      if (talk.youtube) expect(video.embedUrl).toBe(`https://www.youtube.com/embed/${talk.youtube}`);
      else expect(video.embedUrl).toBeUndefined();
      expect(byType(graph, 'WebPage').publisher).toEqual({ '@id': ids.organization });
    }
  });

  test('about and methodology pages point at the publisher', () => {
    for (const page of ['about', 'methodology'] as const) for (const locale of ['en', 'zh'] as const) {
      const url = `https://piindex.dev${locale === 'zh' ? '/zh' : ''}/${page}/`;
      const graph = infoGraph({ page, locale, url, homeUrl: 'https://piindex.dev/', name: page, description: 'Info' });
      const node = byType(graph, page === 'about' ? 'AboutPage' : 'WebPage');
      expect(node.publisher).toEqual({ '@id': ids.organization });
      expect(node.url).toBe(url);
      if (page === 'about') expect(node.mainEntity).toEqual({ '@id': ids.person });
    }
  });
});
