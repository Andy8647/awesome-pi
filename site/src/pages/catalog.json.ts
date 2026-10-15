import englishReadme from '../../../README.en.md?raw';
import chineseReadme from '../../../README.md?raw';
import { buildPublicCatalog, catalogResponse } from '../lib/public-catalog';
import { emptySnapshot, parseSnapshot } from '../lib/stats';

const statsRaw = Object.values(import.meta.glob('../data/stats.json', { query: '?raw', import: 'default', eager: true }))[0] as string | undefined;

export function GET(): Response {
  return catalogResponse(buildPublicCatalog({
    markdown: { en: englishReadme, zh: chineseReadme },
    stats: statsRaw ? parseSnapshot(statsRaw) : emptySnapshot(),
  }));
}
