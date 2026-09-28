// ===== CONFIGURACIÓN =====
// Número de WhatsApp en formato internacional, solo dígitos (Chile: 56 + 9 + 8 dígitos)
const WHATSAPP_NUMBER = '56985492735';
const TIENDA = 'Paseo Independencia 634, local 34, Rancagua';

// Empresas de envío y su buscador de sucursales
const COURIERS = {
  Starken: 'https://www.starken.cl/sucursales',
  Chilexpress: 'https://centrodeayuda.chilexpress.cl/sucursales',
  'Blue Express': 'https://www.blue.cl/lockers-puntos/encuentra-tu-punto',
};
const PAGOS = {
  transferencia: '🏦 *Pago:* Transferencia',
  efectivo: '💵 *Pago:* Efectivo en tienda',
  tarjeta: '💳 *Pago:* Débito o crédito',
};

// Productos y categorías se editan desde el panel /admin (data/productos, data/categorias)
// y se publican juntos en data/catalogo.json (lo genera scripts/build.mjs)
let PRODUCTS = [];
let FILTERS = [['todos', 'Todos']];

const SORTS = {
  destacados: null,
  'precio-asc': (a, b) => a.price - b.price,
  'precio-desc': (a, b) => b.price - a.price,
};

// ===== UTILIDADES =====
const clp = (n) => '$' + n.toLocaleString('es-CL');
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const findProduct = (id) => PRODUCTS.find((p) => p.id === id);
// Se usa api.whatsapp.com y no wa.me: la redirección de wa.me rompe los emojis (llegan como �)
const waUrl = (text) =>
  `https://api.whatsapp.com/send?phone=${WHATSAPP_NUMBER}${text ? '&text=' + encodeURIComponent(text) : ''}`;

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('is-on');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('is-on'), 2200);
}

// Links de WhatsApp con mensaje propio (data-wa="texto")
document.querySelectorAll('[data-wa]').forEach((a) => { a.href = waUrl(a.dataset.wa); });

// ===== CATÁLOGO =====
const grid = $('#productGrid');
const filters = $('#filters');
let currentCat = 'todos';

function renderFilters(active) {
  const count = (k) => (k === 'todos' ? PRODUCTS.length : PRODUCTS.filter((p) => p.tags.includes(k)).length);
  filters.innerHTML = FILTERS
    .filter(([k]) => count(k) > 0) // oculta categorías vacías
    .map(([k, label]) => `<button class="tab ${k === active ? 'is-active' : ''}" role="tab" aria-selected="${k === active}" data-cat="${esc(k)}">${esc(label)}<span class="tab__n">${count(k)}</span></button>`)
    .join('');
}

// Misma tarjeta que escribe scripts/build.mjs en el HTML (para Google)
const card = (p) => `
    <article class="card${p.agotado ? ' is-soldout' : ''}">
      <button class="card__img" data-view="${esc(p.id)}" aria-label="Ver ${esc(p.name)}">
        ${p.agotado ? '<span class="badge badge--soldout">Agotado</span>' : p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}
        <img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy">
        ${p.gallery[1] ? `<img class="alt" src="${esc(p.gallery[1])}" alt="" loading="lazy">` : ''}
      </button>
      <div class="card__body">
        <h3>${esc(p.name)}</h3>
        ${p.desc ? `<p class="card__desc">${esc(p.desc)}</p>` : ''}
        ${p.sizes.length ? `<ul class="card__sizes" aria-label="Tallas">${p.sizes.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
        <div class="card__foot">
          <span class="price">${clp(p.price)}</span>
          ${p.agotado
            ? `<a class="btn btn--ghost btn--sm" target="_blank" rel="noopener" href="${esc(waUrl(`Hola! ¿Tienen stock de ${p.name}? 👖`))}">Consultar stock</a>`
            : `<button class="btn btn--gold btn--sm" data-view="${esc(p.id)}">${p.sizes.length ? 'Elegir talla' : 'Agregar'}</button>`}
        </div>
      </div>
    </article>`;

// Catálogo paginado: 12 productos por página (3 filas de 4) para que la página no se haga eterna
const POR_PAGINA = 12;
let page = 1;

// Números de página con "…" cuando son muchas: 1 … 4 5 6 … 12
function pageList(total, cur) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const keep = new Set([1, total, cur - 1, cur, cur + 1]);
  const out = [];
  for (let n = 1; n <= total; n++) {
    if (keep.has(n)) out.push(n);
    else if (out[out.length - 1] !== '…') out.push('…');
  }
  return out;
}

function renderPager(total) {
  const pager = $('#pager');
  pager.hidden = total < 2;
  if (total < 2) { pager.innerHTML = ''; return; }
  pager.innerHTML = `
    <button type="button" class="pager__btn pager__nav" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''} aria-label="Página anterior">‹</button>
    ${pageList(total, page).map((n) => (n === '…'
      ? '<span class="pager__gap">…</span>'
      : `<button type="button" class="pager__btn${n === page ? ' is-active' : ''}" data-page="${n}" ${n === page ? 'aria-current="page"' : ''} aria-label="Página ${n}">${n}</button>`)).join('')}
    <button type="button" class="pager__btn pager__nav" data-page="${page + 1}" ${page === total ? 'disabled' : ''} aria-label="Página siguiente">›</button>`;
}

function renderProducts(cat = currentCat, pagina = 1) {
  currentCat = cat;
  let list = cat === 'todos' ? PRODUCTS : PRODUCTS.filter((p) => p.tags.includes(cat));
  const sort = SORTS[$('#sort').value];
  if (sort) list = [...list].sort(sort);
  const total = Math.max(1, Math.ceil(list.length / POR_PAGINA));
  page = Math.min(Math.max(1, pagina), total);
  const desde = (page - 1) * POR_PAGINA;
  const visibles = list.slice(desde, desde + POR_PAGINA);
  $('#count').innerHTML = list.length > POR_PAGINA
    ? `Mostrando <strong>${desde + 1}–${desde + visibles.length}</strong> de <strong>${list.length}</strong> productos`
    : `Mostrando <strong>${list.length}</strong> ${list.length === 1 ? 'producto' : 'productos'}`;
  grid.innerHTML = visibles.map(card).join('');
  renderPager(total);
}

filters.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-cat]');
  if (!btn) return;
  renderFilters(btn.dataset.cat);
  renderProducts(btn.dataset.cat);
});
$('#sort').addEventListener('change', () => renderProducts());
$('#pager').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-page]');
  if (!btn || btn.disabled) return;
  renderProducts(currentCat, Number(btn.dataset.page));
  // vuelve al inicio del catálogo (bajo el menú fijo) para ver la página nueva desde arriba
  const top = filters.getBoundingClientRect().top + window.scrollY - 100;
  window.scrollTo({ top, behavior: 'smooth' });
});

// ===== FICHA DE PRODUCTO =====
const pModal = $('#productModal');
let current = null;
let pick = { size: '', qty: 1 };

function showImage(src) {
  $('#pmImg').src = src;
  $('#pmThumbs').querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b.dataset.src === src));
}

function openProduct(id) {
  const p = findProduct(id);
  if (!p) return;
  current = p;
  pick = { size: p.sizes.length === 1 ? p.sizes[0] : '', qty: 1 };

  $('#pmImg').alt = p.name;
  $('#pmThumbs').innerHTML = p.gallery.length > 1
    ? p.gallery.map((src, i) => `<button type="button" data-src="${esc(src)}" aria-label="Foto ${i + 1}"><img src="${esc(src)}" alt=""></button>`).join('')
    : '';
  showImage(p.gallery[0]);
  $('#pmCat').textContent = FILTERS.filter(([k]) => p.tags.includes(k)).map(([, l]) => l).join(' · ');
  $('#pmName').textContent = p.name;
  $('#pmPrice').textContent = clp(p.price);
  $('#pmDesc').textContent = p.desc;
  $('#pmSizesWrap').hidden = !p.sizes.length;
  $('#pmSizeHint').textContent = p.sizes.length === 1 ? '(única disponible)' : '';
  renderSizes();
  $('#pmQty').textContent = '1';
  $('#pmError').hidden = true;
  $('#pmAdd').hidden = p.agotado;
  $('#pmAsk').href = waUrl(`Hola! Quiero consultar por ${p.name} 👖`);

  pModal.classList.add('is-open');
  pModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function renderSizes() {
  $('#pmSizes').innerHTML = current.sizes
    .map((t) => `<button type="button" role="radio" aria-checked="${t === pick.size}" data-size="${esc(t)}">${esc(t)}</button>`)
    .join('');
}

function closeProduct() {
  pModal.classList.remove('is-open');
  pModal.setAttribute('aria-hidden', 'true');
  if (!bagEl.classList.contains('is-open')) document.body.style.overflow = '';
}

$('#pmThumbs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-src]');
  if (b) showImage(b.dataset.src);
});
$('#pmSizes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-size]');
  if (!b) return;
  pick.size = b.dataset.size;
  $('#pmError').hidden = true;
  renderSizes();
});
pModal.addEventListener('click', (e) => {
  const q = e.target.closest('[data-qty]');
  if (q) {
    pick.qty = Math.min(10, Math.max(1, pick.qty + Number(q.dataset.qty)));
    $('#pmQty').textContent = pick.qty;
  }
  if (e.target.closest('[data-close]')) closeProduct();
});
$('#pmAdd').addEventListener('click', () => {
  if (current.sizes.length && !pick.size) {
    $('#pmError').textContent = 'Elige tu talla para agregarlo a la bolsa.';
    $('#pmError').hidden = false;
    return;
  }
  addToBag(current.id, pick.size, pick.qty);
  closeProduct();
  toast(`✨ ${current.name}${pick.size ? ` (talla ${pick.size})` : ''} agregado a tu bolsa`);
});

// ===== BOLSA =====
// La bolsa se guarda en este navegador para no perderla al recargar
const bagEl = $('#bag');
let BAG = [];
try { BAG = JSON.parse(localStorage.getItem('ugBag') || '[]'); } catch (e) { BAG = []; }
if (!Array.isArray(BAG)) BAG = [];

function saveBag() {
  try { localStorage.setItem('ugBag', JSON.stringify(BAG)); } catch (e) {}
}

function addToBag(id, size, qty) {
  const line = BAG.find((l) => l.id === id && l.size === size);
  if (line) line.qty = Math.min(10, line.qty + qty);
  else BAG.push({ id, size, qty });
  saveBag();
  renderBag(true);
}

const bagLines = () => BAG.map((l) => ({ ...l, p: findProduct(l.id) })).filter((l) => l.p && !l.p.agotado);
const bagTotal = () => bagLines().reduce((s, l) => s + l.p.price * l.qty, 0);

function renderBag(bump) {
  const lines = bagLines();
  const units = lines.reduce((s, l) => s + l.qty, 0);
  const n = $('#bagCount');
  n.hidden = !units;
  n.textContent = units;
  if (bump) { n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump'); }
  const fab = $('.fab');
  fab.hidden = !units;
  $('#fabLabel').textContent = `Mi bolsa · ${clp(bagTotal())}`;

  $('#bagList').innerHTML = lines.map((l, i) => `
    <li class="bag-item">
      <img src="${esc(l.p.img)}" alt="">
      <div>
        <h4>${esc(l.p.name)}</h4>
        <small>${l.size ? `Talla ${esc(l.size)} · ` : ''}${clp(l.p.price)}</small>
        <div class="qty">
          <button type="button" data-line="${i}" data-step="-1" aria-label="Menos">−</button>
          <span>${l.qty}</span>
          <button type="button" data-line="${i}" data-step="1" aria-label="Más">+</button>
        </div>
      </div>
      <div class="bag-item__side">
        <strong>${clp(l.p.price * l.qty)}</strong>
        <button type="button" class="bag-item__rm" data-remove="${i}" aria-label="Quitar"><svg class="ic"><use href="#i-trash"/></svg></button>
      </div>
    </li>`).join('');
  $('#bagEmpty').hidden = !!lines.length;
  $('#orderForm').hidden = !lines.length;
  $('#bagFoot').hidden = !lines.length;
  $('#bagTotal').textContent = clp(bagTotal());
  if (lines.length) updateOrder();
}

$('#bagList').addEventListener('click', (e) => {
  const lines = bagLines();
  const step = e.target.closest('[data-step]');
  const rm = e.target.closest('[data-remove]');
  const line = step ? lines[step.dataset.line] : rm ? lines[rm.dataset.remove] : null;
  if (!line) return;
  const idx = BAG.findIndex((l) => l.id === line.id && l.size === line.size);
  if (rm || (BAG[idx].qty + Number(step.dataset.step)) < 1) BAG.splice(idx, 1);
  else BAG[idx].qty = Math.min(10, BAG[idx].qty + Number(step.dataset.step));
  saveBag();
  renderBag();
});

function openBag() {
  closeProduct();
  renderBag();
  bagEl.classList.add('is-open');
  bagEl.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}
function closeBag() {
  bagEl.classList.remove('is-open');
  bagEl.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

// ===== PEDIDO =====
const form = $('#orderForm');
const fRegion = $('#fRegion');
const fComuna = $('#fComuna');
let REGIONES = [];
const radio = (name) => (form.querySelector(`input[name="${name}"]:checked`) || {}).value || '';

$('#fCourier').innerHTML = Object.keys(COURIERS)
  .map((e, i) => `<label><input type="radio" name="courier" value="${esc(e)}"${i ? '' : ' checked'}><span>${esc(e)}</span></label>`)
  .join('');
$('#fCourier').style.setProperty('--n', Object.keys(COURIERS).length);

function fillRegiones() {
  fRegion.innerHTML = '<option value="">Elige tu región</option>' +
    REGIONES.map((r, i) => `<option value="${i}">${esc(r.region)}</option>`).join('');
}
fRegion.addEventListener('change', () => {
  const r = REGIONES[fRegion.value];
  fComuna.disabled = !r;
  fComuna.innerHTML = r
    ? '<option value="">Elige tu comuna</option>' + r.comunas.map((c) => `<option>${esc(c)}</option>`).join('')
    : '<option value="">Primero la región</option>';
});

function readOrder() {
  const r = REGIONES[fRegion.value];
  return {
    envio: radio('entrega') === 'envio',
    nombre: $('#fNombre').value.trim(),
    region: r ? r.region : '',
    comuna: fComuna.value,
    courier: radio('courier'),
    modo: radio('modo'),
    sucursal: $('#fSucursal').value.trim(),
    direccion: $('#fDireccion').value.trim(),
    pago: radio('pago'),
    nota: $('#fNota').value.trim(),
  };
}

// Código corto para identificar el pedido en el chat (ej: UG-4K7Q)
const orderCode = () => 'UG-' + Date.now().toString(36).slice(-4).toUpperCase();
let CODE = orderCode();

// *texto* = negrita y _texto_ = cursiva en WhatsApp
function buildMessage(o) {
  const L = [`👖✨ *PEDIDO URBAN GREYS JEANS · ${CODE}* ✨👖`, '━━━━━━━━━━━━━━━'];
  bagLines().forEach((l, i) => {
    L.push(`${i + 1}. *${l.p.name}*${l.size ? ` · Talla ${l.size}` : ''} · x${l.qty} — ${clp(l.p.price * l.qty)}`);
  });
  L.push('━━━━━━━━━━━━━━━');
  L.push(`🙋 *Nombre:* ${o.nombre || '_(por completar)_'}`);
  if (o.envio) {
    L.push(`🚚 *Entrega:* Envío por ${o.courier} · ${o.modo === 'domicilio' ? 'a domicilio' : 'retiro en sucursal'}`);
    L.push(`📍 *Destino:* ${o.comuna ? `${o.comuna}, ${o.region}` : '_(por completar)_'}`);
    if (o.modo === 'domicilio') L.push(`🏠 *Dirección:* ${o.direccion || '_(por completar)_'}`);
    else L.push(`🏢 *Sucursal:* ${o.sucursal || '_(por completar)_'}`);
  } else {
    L.push('🏬 *Entrega:* Retiro en tienda');
  }
  L.push(PAGOS[o.pago] || PAGOS.transferencia);
  if (o.nota) L.push(`💬 *Comentario:* _${o.nota}_`);
  L.push('━━━━━━━━━━━━━━━');
  L.push(`💰 *TOTAL PRODUCTOS: ${clp(bagTotal())}*`);
  if (o.envio) L.push('_(+ envío a coordinar)_');
  L.push('');
  L.push('¡Hola! Quiero confirmar stock de este pedido 💖');
  return L.join('\n');
}

// Vista previa con el formato de WhatsApp
const formatPreview = (text) => esc(text)
  .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
  .replace(/(^|\s|\(|—\s)_([^_\n]+)_/g, '$1<em>$2</em>');

function updateOrder() {
  const o = readOrder();
  document.querySelectorAll('[data-envio]').forEach((el) => { el.hidden = !o.envio; });
  document.querySelectorAll('[data-local]').forEach((el) => { el.hidden = o.envio; });
  document.querySelectorAll('[data-modo]').forEach((el) => { el.hidden = el.dataset.modo !== o.modo; });
  // el efectivo solo se puede pagando en la tienda
  if (o.envio && o.pago === 'efectivo') {
    form.querySelector('input[name="pago"][value="transferencia"]').checked = true;
    o.pago = 'transferencia';
  }

  const loc = $('#fLocator');
  loc.hidden = o.modo !== 'sucursal';
  loc.href = COURIERS[o.courier];
  loc.innerHTML = `<svg class="ic"><use href="#i-ext"/></svg> Ver sucursales de ${esc(o.courier)}${o.comuna ? ` en ${esc(o.comuna)}` : ''}`;

  $('#bagHint').textContent = o.envio
    ? '📦 El costo del envío se cotiza por WhatsApp según tu comuna y la empresa que elijas.'
    : `🏬 Retira en ${TIENDA}.`;
  $('#msgPreview').innerHTML = formatPreview(buildMessage(o));
}
form.addEventListener('input', updateOrder);
form.addEventListener('change', updateOrder);

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const o = readOrder();
  const missing = [];
  if (!o.nombre) missing.push('tu nombre');
  if (o.envio) {
    if (!o.comuna) missing.push('región y comuna');
    if (o.modo === 'domicilio' && !o.direccion) missing.push('la dirección');
    if (o.modo === 'sucursal' && !o.sucursal) missing.push('la sucursal donde retiras');
  }
  const err = $('#formError');
  if (missing.length) {
    err.textContent = 'Falta completar: ' + missing.join(', ') + '.';
    err.hidden = false;
    return;
  }
  err.hidden = true;
  window.open(waUrl(buildMessage(o)), '_blank', 'noopener');
  CODE = orderCode(); // el próximo pedido lleva otro código
  updateOrder();
});

// ===== EVENTOS GENERALES =====
document.addEventListener('click', (e) => {
  const view = e.target.closest('[data-view]');
  if (view) { openProduct(view.dataset.view); return; }
  if (e.target.closest('[data-open-bag]')) { openBag(); return; }
  if (e.target.closest('[data-close-bag]')) closeBag();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeProduct();
  closeBag();
});

// ===== CARGA DEL CATÁLOGO =====
async function loadProducts() {
  fetch('data/regiones.json')
    .then((r) => r.json())
    .then((d) => { REGIONES = Array.isArray(d.regiones) ? d.regiones : []; fillRegiones(); })
    .catch((e) => console.error(e));
  try {
    const res = await fetch('data/catalogo.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const categorias = Array.isArray(data.categorias) ? data.categorias : [];

    // producto -> categorías a las que pertenece (la categoría es la que dice qué productos tiene)
    const tagsOf = {};
    categorias.forEach((c) => (c.productos || []).forEach((id) => (tagsOf[id] = tagsOf[id] || []).push(c.id)));

    // el CMS guarda "/img/productos/x.jpg"; sin la barra inicial funciona también en GitHub Pages
    const path = (s) => String(s).replace(/^\//, '');
    FILTERS = [['todos', 'Todos'], ...categorias.map((c) => [c.id, c.nombre])];
    PRODUCTS = (data.productos || []).map((p) => {
      const img = path(p.foto || 'img/logo.jpg');
      return {
        id: p.id,
        name: p.nombre,
        price: Number(p.precio) || 0,
        img,
        gallery: [img, ...(Array.isArray(p.fotos) ? p.fotos.map(path) : [])],
        desc: p.descripcion || '',
        sizes: Array.isArray(p.tallas) ? p.tallas.map(String) : [],
        tags: tagsOf[p.id] || [],
        badge: p.etiqueta || '',
        agotado: !!p.agotado,
      };
    });
    const jeans = PRODUCTS.filter((p) => p.sizes.length && p.price > 0);
    if (jeans.length) $('#heroFrom').textContent = clp(Math.min(...jeans.map((p) => p.price)));
  } catch (e) {
    console.error(e);
    grid.innerHTML = '<p class="muted">No se pudo cargar el catálogo. Intenta recargar la página.</p>';
    return;
  }
  renderFilters('todos');
  renderProducts('todos');
  renderBag();
}

loadProducts();
