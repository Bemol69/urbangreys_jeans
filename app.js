// ===== CONFIGURACIÓN =====
// WhatsApp y empresas de envío se editan en /admin → Ajustes (data/ajustes.json); los inserta scripts/build.mjs
const TIENDA = %%TIENDA_JSON%%;
const WHATSAPP_NUMBER = TIENDA.whatsapp;
const DIRECCION = 'Paseo Independencia 634, local 34, Rancagua';

// Buscadores oficiales de sucursales (ninguna de las 3 empresas tiene una API pública sin contrato)
const COURIERS = {
  Starken: 'https://www.starken.cl/sucursales',
  Chilexpress: 'https://centrodeayuda.chilexpress.cl/sucursales',
  'Blue Express': 'https://www.blue.cl/lockers-puntos/encuentra-tu-punto',
};
const EMPRESAS = (TIENDA.empresas_envio || []).filter((e) => COURIERS[e]);
const PAGOS = {
  transferencia: '🏦 *Pago:* Transferencia',
  efectivo: '💵 *Pago:* Efectivo en tienda',
  tarjeta: '💳 *Pago:* Débito o crédito',
};

// Productos, categorías y códigos de descuento se editan desde el panel /admin
// y se publican juntos en data/catalogo.json (lo genera scripts/build.mjs)
let PRODUCTS = [];
let FILTERS = [['todos', 'Todos']];
let REGIONES = [];
let CUPONES = [];

const SORTS = {
  destacados: null,
  'precio-asc': (a, b) => a.price - b.price,
  'precio-desc': (a, b) => b.price - a.price,
};
const MAX_QTY = 10;

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

// Bloquea el scroll de la página mientras haya una ventana abierta
function lockScroll() {
  const open = ['#productModal', '#bag', '#promoModal'].some((s) => { const el = $(s); return el && el.classList.contains('is-open'); });
  document.body.style.overflow = open ? 'hidden' : '';
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
        ${p.gallery.length > 1 ? `<span class="card__more">+${p.gallery.length - 1} ${p.gallery.length === 2 ? 'foto' : 'fotos'}</span>` : ''}
        <img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy" decoding="async">
        ${p.gallery[1] ? `<img class="alt" src="${esc(p.gallery[1])}" alt="" loading="lazy" decoding="async">` : ''}
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
let photo = 0;
let pick = { size: '', qty: 1 };

function showPhoto(i) {
  const g = current.gallery;
  photo = (i + g.length) % g.length;
  $('#pmImg').src = g[photo];
  $('#pmThumbs').querySelectorAll('button').forEach((b, k) => b.classList.toggle('is-active', k === photo));
}

function openProduct(id) {
  const p = findProduct(id);
  if (!p) return;
  current = p;
  pick = { size: p.sizes.length === 1 ? p.sizes[0] : '', qty: 1 };

  $('#pmImg').alt = p.name;
  $('#pmThumbs').innerHTML = p.gallery.length > 1
    ? p.gallery.map((src, i) => `<button type="button" data-photo="${i}" aria-label="Foto ${i + 1}"><img src="${esc(src)}" alt=""></button>`).join('')
    : '';
  pModal.classList.toggle('has-gallery', p.gallery.length > 1);
  showPhoto(0);
  p.gallery.slice(1).forEach((src) => { new Image().src = src; }); // precarga el resto de la galería
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
  lockScroll();
}

function renderSizes() {
  $('#pmSizes').innerHTML = current.sizes
    .map((t) => `<button type="button" role="radio" aria-checked="${t === pick.size}" data-size="${esc(t)}">${esc(t)}</button>`)
    .join('');
}

function closeProduct() {
  pModal.classList.remove('is-open');
  pModal.setAttribute('aria-hidden', 'true');
  lockScroll();
}

$('#pmSizes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-size]');
  if (!b) return;
  pick.size = b.dataset.size;
  $('#pmError').hidden = true;
  renderSizes();
});
pModal.addEventListener('click', (e) => {
  const t = e.target;
  if (t.closest('[data-close]')) { closeProduct(); return; }
  const thumb = t.closest('[data-photo]');
  if (thumb) showPhoto(Number(thumb.dataset.photo));
  const step = t.closest('[data-step-photo]');
  if (step) showPhoto(photo + Number(step.dataset.stepPhoto));
  const q = t.closest('[data-qty]');
  if (q) {
    pick.qty = Math.min(MAX_QTY, Math.max(1, pick.qty + Number(q.dataset.qty)));
    $('#pmQty').textContent = pick.qty;
  }
});

// Deslizar la foto con el dedo en el celular
let touchX = null;
$('#pmImg').addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
$('#pmImg').addEventListener('touchend', (e) => {
  if (touchX === null || current.gallery.length < 2) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 40) showPhoto(photo + (dx < 0 ? 1 : -1));
  touchX = null;
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
  if (line) line.qty = Math.min(MAX_QTY, line.qty + qty);
  else BAG.push({ id, size, qty });
  saveBag();
  renderBag(true);
}

// Productos borrados o agotados desde el panel se descartan solos
const bagLines = () => BAG.map((l) => ({ ...l, p: findProduct(l.id) })).filter((l) => l.p && !l.p.agotado);
const bagTotal = () => bagLines().reduce((s, l) => s + l.p.price * l.qty, 0);

// ===== CÓDIGOS DE DESCUENTO =====
// Se crean en /admin → Códigos de descuento. El catálogo trae solo su huella SHA-256 (no el código en texto):
// aquí se calcula la huella de lo que escribe la clienta y se compara. CUPON_SAL debe coincidir con scripts/build.mjs.
const CUPON_SAL = 'urban-greys:';
const CUPON_KEY = 'ugCupon';
let CUPON = null; // { codigo, c } del código aplicado
const normCodigo = (c) => String(c || '').toUpperCase().replace(/\s+/g, '');
const hoyChile = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
const fechaCL = (iso) => iso.split('-').reverse().join('-');

async function huella(codigo) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(CUPON_SAL + normCodigo(codigo)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const cuponTexto = (c) => (c.tipo === 'monto' ? `${clp(c.valor)} de descuento` : `${c.valor}% de descuento`);
const aplicaA = (c, id) => !c.productos || c.productos.includes(id);

// Descuento del código aplicado sobre la bolsa actual
function descuento() {
  if (!CUPON) return null;
  const c = CUPON.c;
  const base = bagLines().filter((l) => aplicaA(c, l.id)).reduce((s, l) => s + l.p.price * l.qty, 0);
  if (!base) return { c, monto: 0, motivo: 'no-aplica' };
  if (c.minimo && base < c.minimo) return { c, monto: 0, motivo: 'minimo', falta: c.minimo - base };
  const monto = c.tipo === 'monto' ? Math.min(c.valor, base) : Math.round((base * c.valor) / 100);
  return { c, monto, base };
}
const totalFinal = () => bagTotal() - ((descuento() || {}).monto || 0);

async function aplicarCupon(codigo, silencioso) {
  const code = normCodigo(codigo);
  if (!code) return;
  let c = null;
  try {
    const h = await huella(code);
    c = CUPONES.find((x) => x.h === h && !(x.vence && x.vence < hoyChile())) || null;
  } catch (e) {
    console.error(e); // crypto.subtle solo existe en https o localhost
  }
  CUPON = c ? { codigo: code, c } : null;
  try { c ? localStorage.setItem(CUPON_KEY, code) : localStorage.removeItem(CUPON_KEY); } catch (e) {}
  if (!c && !silencioso) {
    const st = $('#cuponStatus');
    st.hidden = false;
    st.className = 'coupon__status is-bad';
    st.innerHTML = '<strong>Código no válido</strong><small>No existe o ya no está vigente. Revisa que esté bien escrito.</small>';
    return;
  }
  if (c && !silencioso) $('#fCupon').value = '';
  renderBag();
}

function quitarCupon() {
  CUPON = null;
  try { localStorage.removeItem(CUPON_KEY); } catch (e) {}
  $('#cuponStatus').hidden = true;
  renderBag();
}

function renderCupon() {
  const st = $('#cuponStatus');
  const d = descuento();
  $('#cuponForm').hidden = !!CUPON;
  if (!d) { if (!st.classList.contains('is-bad')) st.hidden = true; return; }
  const c = d.c;
  const detalle = [cuponTexto(c), c.aplica !== 'Toda la tienda' ? `en ${c.aplica}` : 'en toda la tienda', c.minimo ? `compra mínima ${clp(c.minimo)}` : '', c.vence ? `válido hasta el ${fechaCL(c.vence)}` : '']
    .filter(Boolean).join(' · ');
  const aviso = d.motivo === 'no-aplica'
    ? '<em>Este código no aplica a los productos de tu bolsa.</em>'
    : d.motivo === 'minimo' ? `<em>Te faltan ${clp(d.falta)} en productos de esta promo para usarlo.</em>` : '';
  st.hidden = false;
  st.className = `coupon__status ${d.monto ? 'is-ok' : 'is-warn'}`;
  st.innerHTML = `
    <span class="coupon__badge"><svg class="ic"><use href="#i-check"/></svg>Código válido</span>
    <strong>${esc(CUPON.codigo)} · ${esc(c.titulo)}</strong>
    <small>${esc(detalle)}</small>
    ${aviso}
    <button type="button" class="coupon__rm" data-quitar-cupon>Quitar código</button>`;
}

function renderBag(bump) {
  const lines = bagLines();
  const units = lines.reduce((s, l) => s + l.qty, 0);
  const n = $('#bagCount');
  n.hidden = !units;
  n.textContent = units;
  if (bump) { n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump'); }
  const fab = $('.fab');
  fab.hidden = !units;
  $('#fabLabel').textContent = `Mi bolsa · ${clp(totalFinal())}`;

  $('#bagList').innerHTML = lines.map((l, i) => `
    <li class="bag-item">
      <img src="${esc(l.p.img)}" alt="">
      <div>
        <h4>${esc(l.p.name)}</h4>
        <small>${l.size ? `Talla ${esc(l.size)} · ` : ''}${clp(l.p.price)}</small>
        ${CUPON && aplicaA(CUPON.c, l.id) ? `<span class="tag-off">Código ${esc(CUPON.codigo)}</span>` : ''}
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
  $('#couponBox').hidden = !lines.length || !CUPONES.length;
  renderCupon();
  updateOrder();
}

$('#bagList').addEventListener('click', (e) => {
  const lines = bagLines();
  const step = e.target.closest('[data-step]');
  const rm = e.target.closest('[data-remove]');
  const line = step ? lines[step.dataset.line] : rm ? lines[rm.dataset.remove] : null;
  if (!line) return;
  const idx = BAG.findIndex((l) => l.id === line.id && l.size === line.size);
  if (rm || (BAG[idx].qty + Number(step.dataset.step)) < 1) BAG.splice(idx, 1);
  else BAG[idx].qty = Math.min(MAX_QTY, BAG[idx].qty + Number(step.dataset.step));
  saveBag();
  renderBag();
});

function openBag(encargo) {
  closeProduct();
  renderBag();
  if (encargo) $('#encargoBox').open = true;
  bagEl.classList.add('is-open');
  bagEl.setAttribute('aria-hidden', 'false');
  lockScroll();
  if (encargo) $('#fEncargo').focus();
}
function closeBag() {
  bagEl.classList.remove('is-open');
  bagEl.setAttribute('aria-hidden', 'true');
  lockScroll();
}

// ===== PEDIDO =====
const form = $('#orderForm');
const fRegion = $('#fRegion');
const fComuna = $('#fComuna');
const radio = (name) => (form.querySelector(`input[name="${name}"]:checked`) || {}).value || '';

// Empresas de envío (las elige la dueña en /admin → Ajustes)
$('#fCourier').innerHTML = EMPRESAS
  .map((e, i) => `<label><input type="radio" name="courier" value="${esc(e)}"${i ? '' : ' checked'}><span>${esc(e)}</span></label>`)
  .join('');
$('#fCourier').style.setProperty('--n', Math.max(1, EMPRESAS.length));

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
    encargo: $('#fEncargo').value.trim(),
  };
}

// Código corto para identificar el pedido en el chat (ej: UG-4K7Q)
const orderCode = () => 'UG-' + Date.now().toString(36).slice(-4).toUpperCase();
let CODE = orderCode();

// *texto* = negrita y _texto_ = cursiva en WhatsApp
function buildMessage(o) {
  const lines = bagLines();
  const d = descuento();
  const L = [`👖✨ *PEDIDO URBAN GREYS JEANS · ${CODE}* ✨👖`, '━━━━━━━━━━━━━━━'];
  lines.forEach((l, i) => {
    const off = d && d.monto && aplicaA(d.c, l.id) ? ' 🏷️' : '';
    L.push(`${i + 1}. *${l.p.name}*${l.size ? ` · Talla ${l.size}` : ''} · x${l.qty} — ${clp(l.p.price * l.qty)}${off}`);
  });
  if (o.encargo) L.push(`📝 *Encargo:* _${o.encargo}_`);
  L.push('━━━━━━━━━━━━━━━');
  L.push(`🙋 *Nombre:* ${o.nombre || '_(por completar)_'}`);
  if (o.envio) {
    L.push(`🚚 *Entrega:* Envío por ${o.courier || '_(por definir)_'} · ${o.modo === 'domicilio' ? 'a domicilio' : 'retiro en sucursal'}`);
    L.push(`📍 *Destino:* ${o.comuna ? `${o.comuna}, ${o.region}` : '_(por completar)_'}`);
    if (o.modo === 'domicilio') L.push(`🏠 *Dirección:* ${o.direccion || '_(por completar)_'}`);
    else L.push(`🏢 *Sucursal:* ${o.sucursal || '_(por completar)_'}`);
  } else {
    L.push('🏬 *Entrega:* Retiro en tienda');
  }
  L.push(PAGOS[o.pago] || PAGOS.transferencia);
  if (o.nota) L.push(`💬 *Comentario:* _${o.nota}_`);
  L.push('━━━━━━━━━━━━━━━');
  if (lines.length) {
    if (d && d.monto) {
      L.push(`🧾 *Subtotal:* ${clp(bagTotal())}`);
      L.push(`🎟️ *Código ${CUPON.codigo}* _(${d.c.titulo} · ${d.c.tipo === 'monto' ? clp(d.c.valor) : d.c.valor + '%'})_: −${clp(d.monto)}`);
    }
    L.push(`💰 *TOTAL PRODUCTOS: ${clp(totalFinal())}*`);
    if (o.envio) L.push('_(+ envío a coordinar)_');
    L.push('');
    L.push('¡Hola! Quiero confirmar stock de este pedido 💖');
  } else {
    L.push('¡Hola! Quiero cotizar este encargo 💖');
  }
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
  // el efectivo es solo en la tienda; la tarjeta en envíos solo si la dueña lo activa en /admin → Ajustes
  const tarjeta = form.querySelector('input[name="pago"][value="tarjeta"]');
  tarjeta.closest('label').hidden = o.envio && !TIENDA.tarjeta_envios;
  const pagos = tarjeta.closest('.seg');
  pagos.style.setProperty('--n', pagos.querySelectorAll('label:not([hidden])').length);
  if (o.envio && (o.pago === 'efectivo' || (o.pago === 'tarjeta' && !TIENDA.tarjeta_envios))) {
    form.querySelector('input[name="pago"][value="transferencia"]').checked = true;
    o.pago = 'transferencia';
  }

  const loc = $('#fLocator');
  loc.hidden = o.modo !== 'sucursal' || !COURIERS[o.courier];
  if (COURIERS[o.courier]) {
    loc.href = COURIERS[o.courier];
    loc.innerHTML = `<svg class="ic"><use href="#i-ext"/></svg> Ver sucursales de ${esc(o.courier)}${o.comuna ? ` en ${esc(o.comuna)}` : ''}`;
  }

  const lines = bagLines();
  const d = descuento();
  $('#bagSums').hidden = !(d && d.monto);
  if (d && d.monto) {
    $('#bagSums').innerHTML = `<span>Subtotal</span><span>${clp(bagTotal())}</span><span>Código ${esc(CUPON.codigo)}</span><span class="off">−${clp(d.monto)}</span>`;
  }
  $('#bagTotal').textContent = lines.length ? clp(totalFinal()) : '—';
  $('#bagHint').textContent = o.envio
    ? '📦 El costo del envío se cotiza por WhatsApp según tu comuna y la empresa que elijas.'
    : `🏬 Retira en ${DIRECCION}.`;
  $('#msgPreview').innerHTML = formatPreview(buildMessage(o));
}
form.addEventListener('input', updateOrder);
form.addEventListener('change', updateOrder);

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const o = readOrder();
  const missing = [];
  if (!bagLines().length && !o.encargo) missing.push('agrega un producto o escribe tu encargo');
  if (!o.nombre) missing.push('tu nombre');
  if (o.envio) {
    if (!o.comuna) missing.push('región y comuna');
    if (!o.courier) missing.push('la empresa de envío');
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

$('#cuponBtn').addEventListener('click', () => aplicarCupon($('#fCupon').value));
$('#fCupon').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); aplicarCupon($('#fCupon').value); } });
$('#fCupon').addEventListener('input', () => { const st = $('#cuponStatus'); if (st.classList.contains('is-bad')) st.hidden = true; });
$('#couponBox').addEventListener('click', (e) => { if (e.target.closest('[data-quitar-cupon]')) quitarCupon(); });

// ===== EVENTOS GENERALES =====
document.addEventListener('click', (e) => {
  const view = e.target.closest('[data-view]');
  if (view) { openProduct(view.dataset.view); return; }
  if (e.target.closest('[data-encargo]')) { e.preventDefault(); openBag(true); return; }
  if (e.target.closest('[data-open-bag]')) { openBag(); return; }
  if (e.target.closest('[data-close-bag]')) closeBag();
});
document.addEventListener('keydown', (e) => {
  if (pModal.classList.contains('is-open') && current && current.gallery.length > 1) {
    if (e.key === 'ArrowLeft') showPhoto(photo - 1);
    if (e.key === 'ArrowRight') showPhoto(photo + 1);
  }
  if (e.key !== 'Escape') return;
  if (pModal.classList.contains('is-open')) closeProduct();
  else closeBag();
});

// ===== FLYER EN VENTANA EMERGENTE (una vez por visita) =====
const promo = $('#promoModal');
if (promo) {
  const key = 'flyer-visto:' + promo.dataset.flyer; // un flyer nuevo se vuelve a mostrar
  const seen = () => { try { return sessionStorage.getItem(key); } catch { return null; } };
  const closePromo = () => {
    promo.classList.remove('is-open');
    promo.setAttribute('aria-hidden', 'true');
    lockScroll();
  };
  promo.addEventListener('click', (e) => { if (e.target.closest('[data-promo-close]')) closePromo(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && promo.classList.contains('is-open')) closePromo(); });
  if (!seen()) {
    setTimeout(() => {
      if (pModal.classList.contains('is-open') || bagEl.classList.contains('is-open')) return; // no interrumpir una compra en curso
      try { sessionStorage.setItem(key, '1'); } catch {}
      promo.classList.add('is-open');
      promo.setAttribute('aria-hidden', 'false');
      lockScroll();
    }, 1500);
  }
}

// ===== VIDEOS DE ENTREGAS: se descargan al acercarse a la sección y solo se reproducen en pantalla =====
const reelVideos = document.querySelectorAll('.reel video');
const loadVideo = (v) => { if (v.dataset.src) { v.src = v.dataset.src; delete v.dataset.src; } };
if (reelVideos.length && 'IntersectionObserver' in window) {
  const near = new IntersectionObserver((entries) => entries.forEach(({ target, isIntersecting }) => {
    if (isIntersecting) { loadVideo(target); near.unobserve(target); }
  }), { rootMargin: '600px 0px' });
  const io = new IntersectionObserver((entries) => entries.forEach(({ target, isIntersecting }) => {
    if (isIntersecting) { loadVideo(target); target.play().catch(() => {}); } else target.pause();
  }), { threshold: 0.25 });
  reelVideos.forEach((v) => { near.observe(v); io.observe(v); });
} else {
  reelVideos.forEach((v) => { loadVideo(v); v.autoplay = true; v.play().catch(() => {}); });
}

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
    CUPONES = Array.isArray(data.cupones) ? data.cupones : [];
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
    return; // conserva el HTML que ya escribió el build
  }
  renderFilters('todos');
  renderProducts('todos');
  renderBag();
  // vuelve a validar el código que quedó guardado (pudo vencer o apagarse en /admin)
  let guardado = '';
  try { guardado = localStorage.getItem(CUPON_KEY) || ''; } catch (e) {}
  if (guardado && CUPONES.length) aplicarCupon(guardado, true);
}

updateOrder();
loadProducts();
