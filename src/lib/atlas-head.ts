export function atlasHead(title: string, description: string) {
  return { meta: [{ title: `${title} · Atlas KAM` }, { name: 'description', content: description }, { property: 'og:title', content: `${title} · Atlas KAM` }, { property: 'og:description', content: description }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] };
}
