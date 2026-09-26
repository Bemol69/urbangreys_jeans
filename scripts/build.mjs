// Arma la web para publicar. Vercel lo ejecuta en cada cambio (ver vercel.json).
//  1. Junta data/productos/*.json y data/categorias/*.json en data/catalogo.json
//  2. Copia el sitio a dist/ y escribe los productos dentro del HTML (para Google),
//     junto con canonical, Open Graph, datos estructurados, robots.txt y sitemap.xml
// Uso local: node scripts/build.mjs   (con eso ya se puede servir la carpeta raíz)
import { readdirSync, readFileSync, writeFileSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA = join(ROOT, 'data');
const DIST = join(ROOT, 'dist');

// En Vercel se usa el dominio de producción (sirve igual cuando conecten un dominio propio)
const SITE = (process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : 'https://urbangreys-jeans.vercel.app').replace(/\/$/, '');

// ---------- 1. Catálogo ----------
function readFolder(folder) {
  const dir = join(DATA, folder);
  let files = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { return []; }
  const items = [];
  for (const file of files) {
    try {
      items.push({ id: basename(file, '.json'), ...JSON.parse(readFileSync(join(dir, file), 'utf8')) });
    } catch (e) {
      // Un archivo dañado no debe botar todo el catálogo: se omite y se avisa en el log
      console.warn(`⚠️  Se omitió ${folder}/${file}: ${e.message}`);
    }
  }
  return items;
}

const num = (v, def) => (v !== '' && v !== null && Number.isFinite(Number(v)) ? Number(v) : def);
const byOrder = (a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es');

const productos = readFolder('productos')
  .filter((p) => p.visible !== false && typeof p.nombre === 'string' && p.nombre.trim())
  .map((p) => ({
    id: p.id,
    nombre: p.nombre.trim(),
    precio: Math.max(0, Math.round(num(p.precio, 0))),
    foto: typeof p.foto === 'string' && p.foto ? p.foto.replace(/^\//, '') : 'img/logo.jpg',
    descripcion: typeof p.descripcion === 'string' ? p.descripcion.trim() : '',
    fotos: Array.isArray(p.fotos) ? p.fotos.filter((f) => typeof f === 'string' && f).map((f) => f.replace(/^\//, '')) : [],
    tallas: Array.isArray(p.tallas) ? p.tallas.map((t) => String(t).trim()).filter(Boolean) : [],
    etiqueta: typeof p.etiqueta === 'string' ? p.etiqueta.trim() : '',
    agotado: p.agotado === true,
    orden: num(p.orden, 1000),
  }))
  .sort(byOrder)
  .map(({ orden, ...p }) => p);

const ids = new Set(productos.map((p) => p.id));

const categorias = readFolder('categorias')
  .filter((c) => c.visible !== false && typeof c.nombre === 'string' && c.nombre.trim())
  .map((c) => ({
    id: c.id,
    nombre: c.nombre.trim(),
    orden: num(c.orden, 1000),
    // se descartan productos borrados u ocultos, y repetidos
    productos: [...new Set(Array.isArray(c.productos) ? c.productos : [])].filter((id) => ids.has(id)),
  }))
  .sort(byOrder)
  .map(({ orden, ...c }) => c);

writeFileSync(join(DATA, 'catalogo.json'), JSON.stringify({
  _aviso: 'Archivo generado por scripts/build.mjs. No editar a mano.',
  categorias,
  productos,
}, null, 2) + '\n');
console.log(`✅ catálogo: ${productos.length} productos, ${categorias.length} categorías`);

// ---------- 2. Sitio en dist/ ----------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clp = (n) => '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const abs = (path) => `${SITE}/${String(path).replace(/^\//, '')}`;
const appJs = readFileSync(join(ROOT, 'app.js'), 'utf8');
const WHATSAPP = (appJs.match(/WHATSAPP_NUMBER = '(\d+)'/) || [])[1] || '';
const waUrl = (text) => `https://api.whatsapp.com/send?phone=${WHATSAPP}&text=${encodeURIComponent(text)}`;

// Misma tarjeta que dibuja card() en app.js (el JS la vuelve a dibujar al cargar)
const card = (p) => `
    <article class="card${p.agotado ? ' is-soldout' : ''}">
      <button class="card__img" data-view="${esc(p.id)}" aria-label="Ver ${esc(p.nombre)}">
        ${p.agotado ? '<span class="badge badge--soldout">Agotado</span>' : p.etiqueta ? `<span class="badge">${esc(p.etiqueta)}</span>` : ''}
        <img src="${esc(p.foto)}" alt="${esc(p.nombre)}" loading="lazy">
        ${p.fotos[0] ? `<img class="alt" src="${esc(p.fotos[0])}" alt="" loading="lazy">` : ''}
      </button>
      <div class="card__body">
        <h3>${esc(p.nombre)}</h3>
        ${p.descripcion ? `<p class="card__desc">${esc(p.descripcion)}</p>` : ''}
        ${p.tallas.length ? `<ul class="card__sizes" aria-label="Tallas">${p.tallas.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
        <div class="card__foot">
          <span class="price">${clp(p.precio)}</span>
          ${p.agotado
            ? `<a class="btn btn--ghost btn--sm" target="_blank" rel="noopener" href="${esc(waUrl(`Hola! ¿Tienen stock de ${p.nombre}? 👖`))}">Consultar stock</a>`
            : `<button class="btn btn--gold btn--sm" data-view="${esc(p.id)}">${p.tallas.length ? 'Elegir talla' : 'Agregar'}</button>`}
        </div>
      </div>
    </article>`;

const TITLE = 'Jeans push up en Rancagua | Urban Greys Jeans';
const DESC = 'Jeans push up de tiro alto que realzan tu figura: skinny, cargo, flare y con faja, tallas 36 a 46. Tienda en Paseo Independencia 634, Rancagua, con envíos a todo Chile. Pide por WhatsApp.';
const OG_IMAGE = abs('img/productos/skinny-brillos-1.jpg');
const precios = productos.map((p) => p.precio).filter((n) => n > 0);

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'ClothingStore',
      '@id': `${SITE}/#tienda`,
      name: 'Urban Greys Jeans',
      description: DESC,
      url: `${SITE}/`,
      logo: abs('img/logo.jpg'),
      image: [OG_IMAGE, abs('img/logo.jpg')],
      telephone: '+56985492735',
      priceRange: precios.length ? `${clp(Math.min(...precios))} – ${clp(Math.max(...precios))}` : undefined,
      currenciesAccepted: 'CLP',
            address: {
        '@type': 'PostalAddress',
        streetAddress: 'Paseo Independencia 634, local 34',
        addressLocality: 'Rancagua',
        addressRegion: "Región del Libertador General Bernardo O'Higgins",
        addressCountry: 'CL',
      },
      areaServed: { '@type': 'Country', name: 'Chile' },
      sameAs: ['https://www.instagram.com/urbangreys_jeans/'],
    },
    {
      '@type': 'ItemList',
      name: 'Catálogo de jeans y accesorios',
      itemListElement: productos.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'Product',
          name: p.nombre,
          image: abs(p.foto),
          description: p.descripcion || p.nombre,
          offers: {
            '@type': 'Offer',
            price: p.precio,
            priceCurrency: 'CLP',
            availability: `https://schema.org/${p.agotado ? 'OutOfStock' : 'InStock'}`,
            seller: { '@id': `${SITE}/#tienda` },
          },
        },
      })),
    },
  ],
};

const head = `<link rel="canonical" href="${SITE}/">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Urban Greys Jeans">
  <meta property="og:locale" content="es_CL">
  <meta property="og:url" content="${SITE}/">
  <meta property="og:title" content="${esc(TITLE)}">
  <meta property="og:description" content="${esc(DESC)}">
  <meta property="og:image" content="${OG_IMAGE}">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`;

let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
for (const marker of ['<!-- SEO:HEAD', '<!-- SEO:PRODUCTOS -->']) {
  if (!html.includes(marker)) throw new Error(`Falta el marcador ${marker} en index.html`);
}
html = html
  .replace(/<!-- SEO:HEAD[^>]*-->/, head)
  .replace('<!-- SEO:PRODUCTOS -->', productos.map(card).join(''));

rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, 'data'), { recursive: true });
for (const item of ['app.js', 'styles.css', 'img', 'admin']) cpSync(join(ROOT, item), join(DIST, item), { recursive: true });
cpSync(join(DATA, 'catalogo.json'), join(DIST, 'data', 'catalogo.json'));
writeFileSync(join(DIST, 'index.html'), html);

writeFileSync(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${SITE}/sitemap.xml\n`);
writeFileSync(join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod></url>
</urlset>
`);

console.log(`✅ sitio listo en dist/ para ${SITE}`);
