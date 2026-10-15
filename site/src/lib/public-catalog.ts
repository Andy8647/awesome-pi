import { categoryLabel, kindOrder, text } from './i18n';
import { CANONICAL_REPOSITORY, SITE } from './identity';
import { pageHeadline } from './structured-data';
import { getEditorial } from './editorial';
import type { Category, Locale, Resource, ResourceKind } from './catalog';
import { writeFilters } from './filter';
import { githubRepo, loadStats, npmPackage, statsFor, type StatsSnapshot } from './stats';
import { createPublishedCatalog, loadPublishedCatalog, packagePath, publishedRoutes, routePath, type RouteKind } from './published-routes';

/** Document served at /catalog.json and bundled as the MCP server's offline fallback. */
export const CATALOG_SCHEMA_VERSION = 1;

export type GuideKind = 'topic' | 'category' | 'package';
export type GuideLink = { kind: GuideKind; slug: string; title: string; piindexUrl: string };
export type PublicGuide = GuideLink & {
  titleZh: string; description: string; descriptionZh: string; packages: string[];
};
export type PublicCategory = {
  id: string; name: string; nameZh: string; kind: ResourceKind; count: number;
  piindexUrl: string; guideUrl: string | null;
};
export type PublicKind = { id: ResourceKind; name: string; nameZh: string; count: number; piindexUrl: string };
export type PublicPackage = {
  id: string; name: string; kind: ResourceKind; kindName: string; kindNameZh: string;
  descriptions: { en: string[]; zh: string[] }; categories: string[]; searchText: string;
  projectUrl: string; repoUrl: string | null; npmPackage: string | null; npmUrl: string | null;
  install: string | null; stars: number | null; weeklyDownloads: number | null; weeklyTrendPercent: number | null;
  piindexUrl: string; directoryUrl: string; guideUrl: string | null; guides: GuideLink[];
};
export type PublicCatalog = {
  schemaVersion: typeof CATALOG_SCHEMA_VERSION; site: typeof SITE; source: string; statsGeneratedAt: string;
  kinds: PublicKind[]; categories: PublicCategory[]; guides: PublicGuide[]; packages: PublicPackage[];
};

const guideRoute: Record<GuideKind, RouteKind> = { topic: 'topics', category: 'categories', package: 'packages' };

/** Same shareable directory URL the site writes for `?q=` and `?category=`. */
export function directoryLink(q = '', category = 'all'): string {
  const query = writeFilters({ q, category });
  return query ? `${SITE}/${query}` : `${SITE}/`;
}

export function absolute(path: string): string {
  return new URL(path, `${SITE}/`).href;
}

/** Haystack copied onto each directory card (`data-search` in Directory.astro). */
export function directorySearchText(resource: Resource, categories: Category[]): string {
  const names = new Map(categories.map(category => [category.id, category.name]));
  return `${resource.searchText} ${resource.categories.map(id => categoryLabel(names.get(id) ?? id, 'zh')).join(' ')}`;
}

function publishedGuides(kind: GuideKind): PublicGuide[] {
  const routeKind = guideRoute[kind];
  return Object.entries(publishedRoutes[routeKind]).flatMap(([slug, route]) => {
    if (route.status !== 'active') return [];
    const page = getEditorial(routeKind, slug);
    return [{
      kind, slug,
      title: pageHeadline(page.title.en),
      titleZh: pageHeadline(page.title.zh),
      description: page.description.en,
      descriptionZh: page.description.zh,
      piindexUrl: absolute(routePath(routeKind, slug, 'en')),
      packages: page.resources.map(resource => resource.name),
    }];
  });
}

export function catalogResponse(catalog: PublicCatalog = buildPublicCatalog()): Response {
  return new Response(JSON.stringify(catalog), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** Pass markdown and stats when this runs inside the Astro bundle, where `import.meta.url` is no longer the source file. */
export function buildPublicCatalog(options: { markdown?: Record<Locale, string>; stats?: StatsSnapshot } = {}): PublicCatalog {
  const stats = options.stats ?? loadStats();
  const catalog = options.markdown ? createPublishedCatalog(options.markdown) : loadPublishedCatalog();
  const guides = [...publishedGuides('topic'), ...publishedGuides('category'), ...publishedGuides('package')];
  const categoryGuide = new Map(guides.filter(guide => guide.kind === 'category').map(guide => [guide.slug, guide.piindexUrl]));
  const categories: PublicCategory[] = catalog.categories.map(category => ({
    id: category.id,
    name: category.name,
    nameZh: categoryLabel(category.name, 'zh'),
    kind: category.kind,
    count: category.count,
    piindexUrl: directoryLink('', category.id),
    guideUrl: categoryGuide.get(category.id) ?? null,
  }));
  const kinds: PublicKind[] = kindOrder.map(kind => ({
    id: kind,
    name: text.en.kinds[kind],
    nameZh: text.zh.kinds[kind],
    count: catalog.resources.filter(resource => resource.kind === kind).length,
    piindexUrl: directoryLink('', kind),
  }));
  const packages: PublicPackage[] = catalog.resources.map(resource => {
    const metrics = statsFor(resource, stats);
    const repo = githubRepo(resource.url) ?? metrics.repo;
    const npmName = npmPackage(resource.install);
    const guidePath = packagePath(resource, 'en');
    const guideUrl = guidePath ? absolute(guidePath) : null;
    const mentioned = guides.flatMap(guide => guide.packages.includes(resource.name)
      ? [{ kind: guide.kind, slug: guide.slug, title: guide.title, piindexUrl: guide.piindexUrl }]
      : []);
    return {
      id: resource.id,
      name: resource.name,
      kind: resource.kind,
      kindName: text.en.kinds[resource.kind],
      kindNameZh: text.zh.kinds[resource.kind],
      descriptions: { en: resource.descriptions.en, zh: resource.descriptions.zh },
      categories: resource.categories,
      searchText: directorySearchText(resource, catalog.categories),
      projectUrl: resource.url,
      repoUrl: repo ? `https://github.com/${repo}` : null,
      npmPackage: npmName,
      npmUrl: npmName ? `https://www.npmjs.com/package/${npmName}` : null,
      install: resource.install,
      stars: metrics.stars,
      weeklyDownloads: metrics.weekly,
      weeklyTrendPercent: metrics.trend,
      piindexUrl: guideUrl ?? directoryLink(resource.name),
      directoryUrl: directoryLink(resource.name),
      guideUrl,
      guides: mentioned,
    };
  });
  return { schemaVersion: CATALOG_SCHEMA_VERSION, site: SITE, source: CANONICAL_REPOSITORY, statsGeneratedAt: stats.generatedAt, kinds, categories, guides, packages };
}
