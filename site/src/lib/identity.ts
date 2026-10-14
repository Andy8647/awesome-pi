/** Stable ids for the Pi Index publisher and maintainer. */
export const SITE = 'https://piindex.dev';
export const CANONICAL_REPOSITORY = 'https://github.com/bubbleptr/awesome-pi';
export const MAINTAINER_GITHUB = 'https://github.com/bubbleptr';
export const MAINTAINER_X = 'https://x.com/ninthbit_ai';

export const ids = {
  organization: `${SITE}/#organization`,
  person: `${SITE}/#kieran`,
  website: `${SITE}/#website`,
  logo: `${SITE}/#logo`,
  search: `${SITE}/#search`,
} as const;

export function pageUrl(path: string): string {
  return new URL(path, SITE).href;
}
