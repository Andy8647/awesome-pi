import type { Locale } from './catalog';
import { CANONICAL_REPOSITORY, ids, MAINTAINER_GITHUB, MAINTAINER_X, SITE } from './identity';
import { text } from './i18n';

export type JsonLdNode = Record<string, unknown>;
export type JsonLdGraph = { '@context': 'https://schema.org'; '@graph': JsonLdNode[] };
export type ListEntry = { name: string; url: string };

const language = (locale: Locale) => (locale === 'zh' ? 'zh-CN' : 'en');

function node(value: Record<string, unknown>): JsonLdNode {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

export function pageHeadline(title: string): string {
  return title.replace(/\s*\|\s*Pi Index$/, '').trim();
}

export function versionFromRevision(revision: string): string | undefined {
  return revision.match(/v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?/)?.[0];
}

/** Repository owner of the package itself. Guide authorship stays on the maintainer node. */
export function repositoryAuthor(repositoryUrl: string): JsonLdNode | undefined {
  let parsed: URL;
  try { parsed = new URL(repositoryUrl); } catch { return undefined; }
  const host = parsed.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'www.github.com') return undefined;
  const owner = parsed.pathname.split('/').filter(Boolean)[0];
  if (!owner) return undefined;
  return { '@type': 'Person', name: owner, url: `https://github.com/${owner}` };
}

export function serializeJsonLd(data: JsonLdGraph): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function organization(): JsonLdNode {
  return {
    '@type': 'Organization',
    '@id': ids.organization,
    name: 'Pi Index',
    url: `${SITE}/`,
    logo: {
      '@type': 'ImageObject',
      '@id': ids.logo,
      url: `${SITE}/favicon.svg`,
      width: 64,
      height: 64,
    },
    sameAs: [CANONICAL_REPOSITORY],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'editorial',
      url: `${CANONICAL_REPOSITORY}/issues`,
    },
  };
}

function person(): JsonLdNode {
  return {
    '@type': 'Person',
    '@id': ids.person,
    name: 'Kieran',
    url: `${SITE}/about/`,
    sameAs: [MAINTAINER_GITHUB, MAINTAINER_X],
  };
}

function website(): JsonLdNode {
  return {
    '@type': 'WebSite',
    '@id': ids.website,
    url: `${SITE}/`,
    name: 'Pi Index',
    description: text.en.description,
    inLanguage: ['en', 'zh-CN'],
    publisher: { '@id': ids.organization },
    // The directory applies `?q=` on load. See readFilters / initializeDirectory.
    potentialAction: {
      '@type': 'SearchAction',
      '@id': ids.search,
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE}/?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

function siteGraph(nodes: JsonLdNode[]): JsonLdGraph {
  return { '@context': 'https://schema.org', '@graph': [organization(), person(), website(), ...nodes] };
}

export function breadcrumbList(url: string, items: ListEntry[]): JsonLdNode {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function itemList(url: string, items: ListEntry[]): JsonLdNode {
  return {
    '@type': 'ItemList',
    '@id': `${url}#itemlist`,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: item.url,
    })),
  };
}

function sortedDates(dates: string[]): string[] {
  return dates.filter(date => /^\d{4}-\d{2}-\d{2}/.test(date)).sort();
}

export function directoryGraph(input: {
  locale: Locale;
  url: string;
  name: string;
  description: string;
  dateModified?: string;
  items: ListEntry[];
}): JsonLdGraph {
  const list = itemList(input.url, input.items);
  const crumb = breadcrumbList(input.url, [{ name: 'Pi Index', url: input.url }]);
  return siteGraph([
    crumb,
    list,
    node({
      '@type': 'CollectionPage',
      '@id': `${input.url}#webpage`,
      url: input.url,
      name: input.name,
      description: input.description,
      inLanguage: language(input.locale),
      isPartOf: { '@id': ids.website },
      publisher: { '@id': ids.organization },
      dateModified: input.dateModified || undefined,
      breadcrumb: { '@id': crumb['@id'] },
      mainEntity: { '@id': list['@id'] },
      about: {
        '@type': 'SoftwareApplication',
        name: 'Pi',
        applicationCategory: 'DeveloperApplication',
      },
    }),
  ]);
}

export function editorialGraph(input: {
  kind: 'packages' | 'categories' | 'topics';
  locale: Locale;
  url: string;
  homeUrl: string;
  title: string;
  description: string;
  image: string;
  dates: string[];
  items: ListEntry[];
  software?: { name: string; codeRepository: string; revision: string };
}): JsonLdGraph {
  const headline = pageHeadline(input.title);
  const dates = sortedDates(input.dates);
  const dateModified = dates.at(-1);
  const datePublished = dates[0];
  const crumb = breadcrumbList(input.url, [
    { name: 'Pi Index', url: input.homeUrl },
    { name: headline, url: input.url },
  ]);
  if (input.kind === 'packages' && input.software) {
    const software = node({
      '@type': 'SoftwareSourceCode',
      '@id': `${input.url}#software`,
      name: input.software.name,
      codeRepository: input.software.codeRepository,
      version: versionFromRevision(input.software.revision),
      author: repositoryAuthor(input.software.codeRepository),
    });
    return siteGraph([
      crumb,
      software,
      node({
        '@type': 'TechArticle',
        '@id': `${input.url}#webpage`,
        url: input.url,
        headline,
        name: headline,
        description: input.description,
        image: input.image,
        inLanguage: language(input.locale),
        datePublished,
        dateModified,
        author: { '@id': ids.person },
        publisher: { '@id': ids.organization },
        isPartOf: { '@id': ids.website },
        mainEntityOfPage: input.url,
        about: { '@id': software['@id'] },
      }),
    ]);
  }
  const list = itemList(input.url, input.items);
  return siteGraph([
    crumb,
    list,
    node({
      '@type': 'CollectionPage',
      '@id': `${input.url}#webpage`,
      url: input.url,
      name: headline,
      description: input.description,
      inLanguage: language(input.locale),
      isPartOf: { '@id': ids.website },
      publisher: { '@id': ids.organization },
      author: { '@id': ids.person },
      dateModified,
      breadcrumb: { '@id': crumb['@id'] },
      mainEntity: { '@id': list['@id'] },
    }),
  ]);
}

export function talksIndexGraph(input: {
  locale: Locale;
  url: string;
  homeUrl: string;
  name: string;
  description: string;
  items: (ListEntry & { uploadedAt?: string })[];
}): JsonLdGraph {
  const list = itemList(input.url, input.items);
  const crumb = breadcrumbList(input.url, [
    { name: 'Pi Index', url: input.homeUrl },
    { name: input.name, url: input.url },
  ]);
  const dateModified = input.items.map(item => item.uploadedAt).filter((date): date is string => Boolean(date)).sort().at(-1);
  return siteGraph([
    crumb,
    list,
    node({
      '@type': 'CollectionPage',
      '@id': `${input.url}#webpage`,
      url: input.url,
      name: input.name,
      description: input.description,
      inLanguage: language(input.locale),
      isPartOf: { '@id': ids.website },
      publisher: { '@id': ids.organization },
      dateModified,
      breadcrumb: { '@id': crumb['@id'] },
      mainEntity: { '@id': list['@id'] },
    }),
  ]);
}

export function talkGraph(input: {
  locale: Locale;
  url: string;
  homeUrl: string;
  indexUrl: string;
  indexName: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  uploadDate?: string;
  durationSeconds?: number;
  contentUrl?: string;
  embedUrl?: string;
  sourceUrl?: string;
}): JsonLdGraph {
  const headline = pageHeadline(input.title);
  const videoId = `${input.url}#video`;
  const crumb = breadcrumbList(input.url, [
    { name: 'Pi Index', url: input.homeUrl },
    { name: input.indexName, url: input.indexUrl },
    { name: headline, url: input.url },
  ]);
  return siteGraph([
    crumb,
    node({
      '@type': 'VideoObject',
      '@id': videoId,
      name: headline,
      description: input.description,
      thumbnailUrl: input.thumbnailUrl,
      uploadDate: input.uploadDate,
      duration: input.durationSeconds && input.durationSeconds > 0 ? `PT${Math.floor(input.durationSeconds)}S` : undefined,
      contentUrl: input.contentUrl,
      embedUrl: input.embedUrl,
      url: input.url,
      inLanguage: 'en',
      isBasedOn: input.sourceUrl,
    }),
    node({
      '@type': 'WebPage',
      '@id': `${input.url}#webpage`,
      url: input.url,
      name: headline,
      description: input.description,
      inLanguage: language(input.locale),
      isPartOf: { '@id': ids.website },
      publisher: { '@id': ids.organization },
      mainEntity: { '@id': videoId },
      breadcrumb: { '@id': crumb['@id'] },
      dateModified: input.uploadDate,
    }),
  ]);
}

export function infoGraph(input: {
  page: 'about' | 'methodology';
  locale: Locale;
  url: string;
  homeUrl: string;
  name: string;
  description: string;
}): JsonLdGraph {
  const crumb = breadcrumbList(input.url, [
    { name: 'Pi Index', url: input.homeUrl },
    { name: input.name, url: input.url },
  ]);
  return siteGraph([
    crumb,
    node({
      '@type': input.page === 'about' ? 'AboutPage' : 'WebPage',
      '@id': `${input.url}#webpage`,
      url: input.url,
      name: input.name,
      description: input.description,
      inLanguage: language(input.locale),
      isPartOf: { '@id': ids.website },
      publisher: { '@id': ids.organization },
      about: input.page === 'about' ? [{ '@id': ids.organization }, { '@id': ids.person }] : { '@id': ids.organization },
      mainEntity: input.page === 'about' ? { '@id': ids.person } : undefined,
      breadcrumb: { '@id': crumb['@id'] },
    }),
  ]);
}
