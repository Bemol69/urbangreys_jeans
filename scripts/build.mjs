// Arma la web para publicar. Vercel lo ejecuta en cada cambio (ver vercel.json).
//  1. Lee lo que el cliente edita en /admin: data/ajustes.json (WhatsApp, Instagram, empresas de envío),
//     data/flyer.json, data/franjas.json y data/entregas.json
//  2. Junta data/productos, data/categorias y data/cupones en data/catalogo.json
//  3. Copia el sitio a dist/ reemplazando los %%MARCADORES%%, escribe los productos dentro del HTML
//     (para Google) y genera canonical, Open Graph, datos estructurados, robots.txt y sitemap.xml
// Uso local: node scripts/build.mjs  →  servir la carpeta dist/
import { readdirSync, readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA = join(ROOT, 'data');
const DIST = join(ROOT, 'dist');

// En Vercel se usa el dominio de producción (sirve igual cuando conecten un dominio propio)
const SITE = (process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : 'https://urbangreys-jeans.vercel.app').replace(/\/$/, '');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const readData = (file) => (existsSync(join(DATA, file)) ? readJson(join(DATA, file)) : {});
const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
const rel = (path) => str(path).replace(/^\//, '');

// ---------- 1. Ajustes, flyer, franjas y entregas ----------
const ajustes = readData('ajustes.json');
const COURIERS = ['Starken', 'Chilexpress', 'Blue Express'];
const T = {
  whatsapp: str(ajustes.whatsapp).replace(/\D/g, ''),
  instagram: str(ajustes.instagram).replace(/^@/, ''),
  empresas_envio: (Array.isArray(ajustes.empresas_envio) ? ajustes.empresas_envio : COURIERS).map(str).filter((e) => COURIERS.includes(e)),
  tarjeta_envios: ajustes.tarjeta_envios !== false,
};
if (!/^569\d{8}$/.test(T.whatsapp)) {
  throw new Error(`WhatsApp inválido "${T.whatsapp}" en data/ajustes.json: usa 11 dígitos, ej 56912345678`);
}
if (!T.empresas_envio.length) T.empresas_envio = COURIERS;
// 56985492735 -> +56 9 8549 2735
const WA_VISIBLE = `+${T.whatsapp.slice(0, 2)} ${T.whatsapp.slice(2, 3)} ${T.whatsapp.slice(3, 7)} ${T.whatsapp.slice(7)}`;
const waLink = (text) => `https://api.whatsapp.com/send?phone=${T.whatsapp}&text=${encodeURIComponent(text)}`;

// Flyer de ofertas: sin imagen no se muestra nada
const flyer = readData('flyer.json');
const F = {
  imagen: flyer.mostrar !== false ? rel(flyer.imagen) : '',
  titulo: str(flyer.titulo) || 'Ofertas',
  descripcion: str(flyer.descripcion),
  mensaje: str(flyer.mensaje_whatsapp) || 'Hola! Quiero la oferta 👖✨',
};
if (F.imagen && !existsSync(join(ROOT, F.imagen))) {
  console.warn(`⚠️  No existe la imagen del flyer ${F.imagen}: se oculta el flyer`);
  F.imagen = '';
}
F.popup = F.imagen && flyer.popup !== false ? F.imagen : '';

// Entregas reales: de 0 a 3 fotos o videos (sin ninguna, la sección no aparece)
const entregas = (Array.isArray(readData('entregas.json').entregas) ? readData('entregas.json').entregas : [])
  .map((e) => ({ ...e, archivo: rel(e && e.archivo) }))
  .filter((e) => e.archivo)
  .slice(0, 3)
  .map((e) => ({
    archivo: e.archivo,
    video: /\.(mp4|webm|m4v|mov)$/i.test(e.archivo),
    titulo: str(e.titulo),
    texto: str(e.texto),
    descripcion: str(e.descripcion) || str(e.titulo) || 'Entrega de un pedido Urban Greys Jeans',
  }));

// Franjas de texto en movimiento
const franjasData = readData('franjas.json');
const FRANJAS_BASE = {
  franja1: ['📦 Envíos a todo Chile', '🍑 Full push up', '📍 Paseo Independencia 634, local 34 · Rancagua', '👖 Tallas 36 a 46'],
  franja2: ['Tiro alto', 'Full push up', 'Muy elasticado', 'Calce perfecto'],
};
const VELOCIDAD = { lenta: 1.6, normal: 1, rapida: 0.6 };
function franja(key, porFrase) {
  const f = franjasData[key] || {};
  const frases = (Array.isArray(f.frases) ? f.frases : []).map(str).filter(Boolean);
  const lista = frases.length ? frases : FRANJAS_BASE[key];
  // se repite hasta tener ~8 frases por mitad, para que el loop no deje huecos en pantallas anchas
  const vuelta = [];
  while (vuelta.length < 8) vuelta.push(...lista);
  return { mostrar: f.mostrar !== false, items: vuelta, segundos: Math.round(vuelta.length * porFrase * (VELOCIDAD[f.velocidad] || 1)) };
}
const F1 = franja('franja1', 8);
const F2 = franja('franja2', 3.3);

// ---------- 2. Catálogo ----------
function readFolder(folder) {
  const dir = join(DATA, folder);
  let files = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { return []; }
  const items = [];
  for (const file of files) {
    try {
      items.push({ id: basename(file, '.json'), ...readJson(join(dir, file)) });
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
    tallas: [...new Set((Array.isArray(p.tallas) ? p.tallas : []).map((t) => str(t)).filter(Boolean))],
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

// ---------- Códigos de descuento (data/cupones, editables en /admin) ----------
// Se publican como huella SHA-256 y no como texto: la web puede comprobar un código que le escriben,
// pero nadie puede sacar la lista de códigos mirando el archivo. La sal debe coincidir con CUPON_SAL en app.js.
const CUPON_SAL = 'urban-greys:';
const normCodigo = (c) => str(c).toUpperCase().replace(/\s+/g, '');
const huella = (c) => createHash('sha256').update(CUPON_SAL + normCodigo(c)).digest('hex');
const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }); // AAAA-MM-DD
const productosDe = Object.fromEntries(categorias.map((c) => [c.id, c.productos]));
const vistos = new Set();
const cupones = readFolder('cupones')
  .filter((c) => c.activo !== false && normCodigo(c.codigo))
  .map((c) => {
    const tipo = c.tipo === 'monto' ? 'monto' : 'porcentaje';
    const valor = Math.max(0, Math.round(num(c.valor, 0)));
    const vence = /^\d{4}-\d{2}-\d{2}/.test(str(c.vence)) ? str(c.vence).slice(0, 10) : '';
    // sin productos ni categorías elegidos = aplica a toda la tienda
    const cats = Array.isArray(c.categorias) ? c.categorias : [];
    const prods = Array.isArray(c.productos) ? c.productos : [];
    const todos = !cats.length && !prods.length;
    return {
      codigo: normCodigo(c.codigo),
      h: huella(c.codigo),
      titulo: str(c.titulo) || normCodigo(c.codigo),
      tipo,
      valor: tipo === 'porcentaje' ? Math.min(100, valor) : valor,
      minimo: Math.max(0, Math.round(num(c.minimo, 0))),
      vence,
      productos: todos ? null : [...new Set([...cats.flatMap((id) => productosDe[id] || []), ...prods])].filter((id) => ids.has(id)),
      aplica: todos ? 'Toda la tienda' : [...categorias.filter((x) => cats.includes(x.id)).map((x) => x.nombre), ...(prods.length ? ['productos seleccionados'] : [])].join(', '),
    };
  })
  .filter((c) => {
    if (!c.valor) return console.warn(`⚠️  Cupón «${c.titulo}» sin valor de descuento: se omitió`), false;
    if (c.vence && c.vence < hoy) return console.warn(`ℹ️  Cupón «${c.titulo}» vencido el ${c.vence}: se omitió`), false;
    if (c.productos && !c.productos.length) return console.warn(`⚠️  Cupón «${c.titulo}» no tiene productos visibles: se omitió`), false;
    if (vistos.has(c.codigo)) return console.warn(`⚠️  Código ${c.codigo} repetido: se usa solo el primero`), false;
    vistos.add(c.codigo);
    return true;
  })
  .map(({ codigo, ...c }) => c);

writeFileSync(join(DATA, 'catalogo.json'), JSON.stringify({
  _aviso: 'Archivo generado por scripts/build.mjs. No editar a mano.',
  categorias,
  productos,
  cupones,
}, null, 2) + '\n');
console.log(`✅ catálogo: ${productos.length} productos, ${categorias.length} categorías, ${cupones.length} códigos de descuento activos`);

// ---------- 3. Marcadores %%CLAVE%% ----------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clp = (n) => '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const abs = (path) => `${SITE}/${String(path).replace(/^\//, '')}`;

const VARS = {
  WHATSAPP_VISIBLE: WA_VISIBLE,
  INSTAGRAM: T.instagram,
  FLYER: F.imagen, FLYER_POPUP: F.popup, FLYER_TITULO: F.titulo, FLYER_TEXTO: F.descripcion,
  FLYER_ALT: F.descripcion || F.titulo,
  FLYER_WA: waLink(F.mensaje),
  FRANJA2: F2.mostrar ? '1' : '',
  FRANJA1_SEG: String(F1.segundos), FRANJA2_SEG: String(F2.segundos),
  ENTREGAS: entregas.length ? '1' : '',
  // Solo lo que necesita el navegador (app.js)
  TIENDA_JSON: JSON.stringify({ whatsapp: T.whatsapp, empresas_envio: T.empresas_envio, tarjeta_envios: T.tarjeta_envios }),
};

// Bloques opcionales: <!-- SI:CLAVE --> ... <!-- /SI:CLAVE --> se eliminan si CLAVE está vacía
function render(text, file, escape) {
  let out = text;
  for (let prev; prev !== out;) { // se repite para resolver bloques anidados
    prev = out;
    out = out.replace(/<!-- SI:([A-Z0-9_]+) -->([\s\S]*?)<!-- \/SI:\1 -->/g, (m, key, body) => (str(VARS[key]) ? body : ''));
  }
  const missing = new Set();
  out = out.replace(/%%([A-Z0-9_]+)%%/g, (m, key) => {
    const v = VARS[key];
    if (v === undefined || v === null) { missing.add(key); return m; }
    return escape && key !== 'TIENDA_JSON' ? esc(v) : String(v);
  });
  if (missing.size) throw new Error(`${file}: faltan valores para ${[...missing].join(', ')}`);
  return out;
}

// ---------- 4. SEO ----------
// Misma tarjeta que dibuja card() en app.js (el JS la vuelve a dibujar al cargar)
const card = (p) => `
    <article class="card${p.agotado ? ' is-soldout' : ''}">
      <button class="card__img" data-view="${esc(p.id)}" aria-label="Ver ${esc(p.nombre)}">
        ${p.agotado ? '<span class="badge badge--soldout">Agotado</span>' : p.etiqueta ? `<span class="badge">${esc(p.etiqueta)}</span>` : ''}
        ${p.fotos.length ? `<span class="card__more">+${p.fotos.length} ${p.fotos.length === 1 ? 'foto' : 'fotos'}</span>` : ''}
        <img src="${esc(p.foto)}" alt="${esc(p.nombre)}" loading="lazy" decoding="async">
        ${p.fotos[0] ? `<img class="alt" src="${esc(p.fotos[0])}" alt="" loading="lazy" decoding="async">` : ''}
      </button>
      <div class="card__body">
        <h3>${esc(p.nombre)}</h3>
        ${p.descripcion ? `<p class="card__desc">${esc(p.descripcion)}</p>` : ''}
        ${p.tallas.length ? `<ul class="card__sizes" aria-label="Tallas">${p.tallas.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
        <div class="card__foot">
          <span class="price">${clp(p.precio)}</span>
          ${p.agotado
            ? `<a class="btn btn--ghost btn--sm" target="_blank" rel="noopener" href="${esc(waLink(`Hola! ¿Tienen stock de ${p.nombre}? 👖`))}">Consultar stock</a>`
            : `<button class="btn btn--gold btn--sm" data-view="${esc(p.id)}">${p.tallas.length ? 'Elegir talla' : 'Agregar'}</button>`}
        </div>
      </div>
    </article>`;

const entregaHtml = (e) => `
          <figure class="reel">
            ${e.video
              ? `<video data-src="${esc(e.archivo)}#t=0.1" muted loop playsinline preload="none" aria-label="${esc(e.descripcion)}"></video>`
              : `<img src="${esc(e.archivo)}" alt="${esc(e.descripcion)}" loading="lazy">`}
            ${e.titulo || e.texto ? `<figcaption>${e.titulo ? `<strong>${esc(e.titulo)}</strong>` : ''}${e.texto ? `<span>${esc(e.texto)}</span>` : ''}</figcaption>` : ''}
          </figure>`;

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
      telephone: `+${T.whatsapp}`,
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
      sameAs: T.instagram ? [`https://www.instagram.com/${T.instagram}/`] : undefined,
    },
    {
      '@type': 'ItemList',
      name: 'Catálogo de jeans y accesorios',
      itemListElement: productos.filter((p) => p.precio > 0).map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'Product',
          name: p.nombre,
          image: [p.foto, ...p.fotos].map(abs),
          description: p.descripcion || p.nombre,
          offers: {
            '@type': 'Offer',
            url: `${SITE}/#catalogo`,
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

// ---------- 5. dist/ ----------
let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
for (const marker of ['<!-- SEO:HEAD', '<!-- SEO:PRODUCTOS -->', '<!-- FRANJA1 -->', '<!-- FRANJA2 -->']) {
  if (!html.includes(marker)) throw new Error(`Falta el marcador ${marker} en index.html`);
}
// cada franja lleva sus frases 2 veces seguidas: la animación corre la mitad y vuelve a empezar sin salto
const cinta = (items, html) => [...items.map((t) => html(t, false)), ...items.map((t) => html(t, true))].join('');
html = render(html, 'index.html', true)
  .replace(/<!-- SEO:HEAD[^>]*-->/, head)
  .replace('<!-- SEO:PRODUCTOS -->', productos.map(card).join(''))
  .replace(/<!-- ENTREGAS:LISTA[^>]*-->/, entregas.map(entregaHtml).join(''))
  .replace('<!-- FRANJA1 -->', cinta(F1.items, (t, copia) => `<span${copia ? ' aria-hidden="true"' : ''}>${esc(t)}</span>`))
  .replace('<!-- FRANJA2 -->', cinta(F2.items, (t) => `<span>${esc(t)}</span><i>✦</i>`));

rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, 'data'), { recursive: true });
for (const item of ['img', 'admin']) cpSync(join(ROOT, item), join(DIST, item), { recursive: true });
for (const f of ['catalogo.json', 'regiones.json']) cpSync(join(DATA, f), join(DIST, 'data', f));
// styles.css y app.js llevan ?v=hash: se guardan en caché y cada cambio publicado se descarga de nuevo
const css = readFileSync(join(ROOT, 'styles.css'), 'utf8');
const js = render(readFileSync(join(ROOT, 'app.js'), 'utf8'), 'app.js', false);
const version = (text) => createHash('sha1').update(text).digest('hex').slice(0, 10);
html = html
  .replace('href="styles.css"', `href="styles.css?v=${version(css)}"`)
  .replace('src="app.js"', `src="app.js?v=${version(js)}"`);
writeFileSync(join(DIST, 'index.html'), html);
writeFileSync(join(DIST, 'styles.css'), css);
writeFileSync(join(DIST, 'app.js'), js);

writeFileSync(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${SITE}/sitemap.xml\n`);
writeFileSync(join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod></url>
</urlset>
`);

console.log(`✅ sitio listo en dist/ para ${SITE}`);
