import { writeFileSync } from 'node:fs';
import { buildPublicCatalog } from '../src/lib/public-catalog';

const destination = new URL('../../mcp/catalog.snapshot.json', import.meta.url);
writeFileSync(destination, `${JSON.stringify(buildPublicCatalog(), null, 2)}\n`);
console.log(`Wrote ${destination.pathname}`);
