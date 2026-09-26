// ===== CONFIGURACIÓN =====
// Número de WhatsApp en formato internacional, solo dígitos (Chile: 56 + 9 + 8 dígitos)
const WHATSAPP_NUMBER = '56985492735';
const TIENDA = 'Paseo Independencia 634, local 34, Rancagua';

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

function renderProducts(cat = currentCat) {
  currentCat = cat;
  let list = cat === 'todos' ? PRODUCTS : PRODUCTS.filter((p) => p.tags.includes(cat));
  const sort = SORTS[$('#sort').value];
  if (sort) list = [...list].sort(sort);
  $('#count').innerHTML = `Mostrando <strong>${list.length}</strong> ${list.length === 1 ? 'producto' : 'productos'}`;
  grid.innerHTML = list.map(card).join('');
}

filters.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-cat]');
  if (!btn) return;
  renderFilters(btn.dataset.cat);
  renderProducts(btn.dataset.cat);
});
$('#sort').addEventListener('change', () => renderProducts());

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
  syncDelivery();
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
const entrega = () => form.querySelector('input[name="entrega"]:checked').value;

function syncDelivery() {
  const envio = entrega() === 'envio';
  document.querySelectorAll('[data-envio]').forEach((el) => { el.hidden = !envio; });
  $('#bagHint').textContent = envio
    ? '📦 El costo del envío se cotiza por WhatsApp según tu ciudad.'
    : `🏬 Retira en ${TIENDA}.`;
}
form.addEventListener('change', (e) => { if (e.target.name === 'entrega') syncDelivery(); });

// *texto* = negrita y _texto_ = cursiva en WhatsApp
function buildMessage(o) {
  const L = ['👖✨ *PEDIDO URBAN GREYS JEANS* ✨👖', '━━━━━━━━━━━━━━━'];
  bagLines().forEach((l, i) => {
    L.push(`${i + 1}. *${l.p.name}*${l.size ? ` · Talla ${l.size}` : ''} · x${l.qty} — ${clp(l.p.price * l.qty)}`);
  });
  L.push('━━━━━━━━━━━━━━━');
  L.push(`💰 *TOTAL PRODUCTOS: ${clp(bagTotal())}*`);
  L.push(o.envio ? `📦 *Entrega:* Envío a ${o.ciudad} _(envío a coordinar)_` : '🏬 *Entrega:* Retiro en tienda');
  if (o.nombre) L.push(`🙋 *Nombre:* ${o.nombre}`);
  if (o.nota) L.push(`💬 *Comentario:* _${o.nota}_`);
  L.push('');
  L.push('¡Hola! Quiero confirmar stock de este pedido 💖');
  return L.join('\n');
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const o = {
    envio: entrega() === 'envio',
    nombre: $('#fNombre').value.trim(),
    ciudad: $('#fCiudad').value.trim(),
    nota: $('#fNota').value.trim(),
  };
  const missing = [];
  if (!o.nombre) missing.push('tu nombre');
  if (o.envio && !o.ciudad) missing.push('ciudad o comuna');
  const err = $('#formError');
  if (missing.length) {
    err.textContent = 'Falta completar: ' + missing.join(' y ') + '.';
    err.hidden = false;
    return;
  }
  err.hidden = true;
  window.open(waUrl(buildMessage(o)), '_blank', 'noopener');
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
