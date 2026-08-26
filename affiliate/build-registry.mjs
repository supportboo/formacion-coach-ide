/* Brandooers · afiliación — construye resources.json (registro de recursos externos)
   escaneando los .html del sitio. Ejecutar: node affiliate/build-registry.mjs
   Salida: affiliate/resources.json  { id: {url, domain, label, courses:[...]} } */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractResources, domainOf } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..');

const files = (await readdir(SITE)).filter(f => f.endsWith('.html'));
const reg = {};
const domains = {};
for (const f of files) {
  const html = await readFile(join(SITE, f), 'utf8');
  for (const r of extractResources(html)) {
    if (!reg[r.id]) reg[r.id] = { url: r.url, domain: r.domain, label: r.label, courses: [] };
    if (!reg[r.id].courses.includes(f)) reg[r.id].courses.push(f);
    domains[r.domain] = (domains[r.domain] || 0) + 1;
  }
}
await writeFile(join(HERE, 'resources.json'), JSON.stringify(reg, null, 0), 'utf8');
// dominios únicos ordenados por nº de recursos
const domList = Object.entries(domains).sort((a, b) => b[1] - a[1]);
await writeFile(join(HERE, 'domains.json'), JSON.stringify(Object.fromEntries(domList), null, 0), 'utf8');
console.log('registry:', Object.keys(reg).length, 'recursos ·', domList.length, 'dominios únicos');
console.log('top dominios:', domList.slice(0, 12).map(([d, n]) => `${d}(${n})`).join(', '));
