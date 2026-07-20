/* =====================================================================
   404 APPAREL — app.js
   Storefront logic + traffic / interest tracking.

   >>> TRAFFIC TRACKING (this is the whole point) <<<
   The site reports to FOUR places so you can measure interest:
     1. Vercel Web Analytics  — page views & visitors. Turn it on in the
        Vercel dashboard (Project > Analytics > Enable). The script tag is
        already in index.html. Nothing else to do.
     2. Google Analytics 4    — full funnel + which SHIRTS get clicked.
        Paste your Measurement ID below (GA_ID). Get one free at
        analytics.google.com. Leave as-is to disable.
     3. Meta Pixel            — retarget your Instagram visitors with ads later.
        Paste META_PIXEL_ID below (Meta Events Manager). Empty = off.
     4. Browser console       — every event is logged so you can see
        tracking work locally before you deploy (F12 > Console).
   ===================================================================== */

const CONFIG = {
  GA_ID: "G-XXXXXXXXXX",           // <-- paste your GA4 id, e.g. "G-ABC123XYZ"
  META_PIXEL_ID: "",               // <-- paste your Meta (FB/IG) Pixel ID from Events Manager. Empty = off
  FORMSPREE_ENDPOINT: "",          // <-- optional: paste a Formspree URL to collect waitlist emails
  LIVE_INSIGHTS_ENDPOINT: "/api/track",
  CHECKOUT_ENDPOINT: "/api/checkout",
  SUBSCRIBE_ENDPOINT: "/api/subscribe",
  STRIPE_PAYMENT_LINK: "",         // optional: paste a Stripe Payment Link URL instead of using STRIPE_SECRET_KEY
  FREE_SHIP_OVER: 50,
  CURRENCY: "$"
};

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const COLORWAYS = [
  { id: "black", label: "Black" },
  { id: "charcoal", label: "Charcoal" },
  { id: "navy", label: "Midnight Navy" }
];

/* ------------------------- analytics plumbing ------------------------- */
// Vercel Analytics queue stub (works once deployed on Vercel)
window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };

// Google Analytics 4 (only loads if you set a real GA_ID)
(function initGA() {
  if (!CONFIG.GA_ID || CONFIG.GA_ID === "G-XXXXXXXXXX") return;
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + CONFIG.GA_ID;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", CONFIG.GA_ID);
})();

// Meta Pixel — retarget Instagram visitors. Only loads if META_PIXEL_ID is set.
(function initMetaPixel() {
  if (!CONFIG.META_PIXEL_ID) return;
  !(function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
    t = b.createElement(e); t.async = !0; t.src = v;
    s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  window.fbq("init", CONFIG.META_PIXEL_ID);
  window.fbq("track", "PageView");
})();

// one helper -> fans out to every tracker
function track(event, params) {
  params = params || {};
  try { window.va("event", { name: event, data: params }); } catch (e) {}
  try { if (typeof window.gtag === "function") window.gtag("event", event, params); } catch (e) {}
  try {
    if (typeof window.fbq === "function") {
      var METAMAP = { view_item: "ViewContent", add_to_cart: "AddToCart", begin_checkout: "InitiateCheckout", join_waitlist: "Lead" };
      var std = METAMAP[event];
      if (std) {
        var mp = { currency: "USD" };
        if (params.item_id) { mp.content_ids = [params.item_id]; mp.content_type = "product"; }
        if (params.item_name) mp.content_name = params.item_name;
        if (typeof params.price !== "undefined") mp.value = params.price;
        if (typeof params.value !== "undefined") mp.value = params.value;
        window.fbq("track", std, mp);
      } else {
        window.fbq("trackCustom", event, params);
      }
    }
  } catch (e) {}
  sendLiveInsight(event, params);
  console.log("%c[track] " + event, "color:#3ddc84;font-weight:bold", params);
}

/* ------------------------------ state -------------------------------- */
let cart = loadCart();
let activeFilter = "All";
let activeDrop = (new URLSearchParams(location.search).get("drop")) || (typeof CURRENT_DROP !== "undefined" ? CURRENT_DROP : "archi");
let modalState = { product: null, size: "M", color: "black", imageIndex: 0 };

function loadCart() {
  try { return JSON.parse(localStorage.getItem("cart404") || "[]"); }
  catch (e) { return []; }
}
function saveCart() { try { localStorage.setItem("cart404", JSON.stringify(cart)); } catch (e) {} }

/* ------------------------------ helpers ------------------------------ */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const money = (n) => CONFIG.CURRENCY + n.toFixed(0);
const productById = (id) => PRODUCTS.find((p) => p.id === id);

function visitorId() {
  try {
    var key = "visitor404";
    var existing = localStorage.getItem(key);
    if (existing) return existing;
    var created = "v_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem(key, created);
    return created;
  } catch (e) {
    return "anon";
  }
}

function sendLiveInsight(event, params) {
  if (!CONFIG.LIVE_INSIGHTS_ENDPOINT) return;
  var payload = {
    event: event,
    params: params || {},
    path: location.pathname,
    referrer: document.referrer || "direct",
    visitorId: visitorId(),
    timestamp: new Date().toISOString()
  };
  try {
    var body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(CONFIG.LIVE_INSIGHTS_ENDPOINT, new Blob([body], { type: "application/json" }));
      return;
    }
    fetch(CONFIG.LIVE_INSIGHTS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body,
      keepalive: true
    }).catch(function () {});
  } catch (e) {}
}

function analyticsLabel(node) {
  var raw = node.getAttribute("aria-label") || node.textContent || node.id || node.className || node.tagName;
  return raw.replace(/\s+/g, " ").trim().slice(0, 80);
}

function analyticsZone(node) {
  var parent = node.closest("header, main, footer, .modal, .drawer, .waitlist, .hero, .section");
  if (!parent) return "unknown";
  if (parent.id) return parent.id;
  if (parent.className && typeof parent.className === "string") return parent.className.split(" ")[0];
  return parent.tagName.toLowerCase();
}

function activeModalImageHTML() {
  const p = modalState.product;
  const gallerySrc = galleryImageSrc(p, modalState.imageIndex);
  if (gallerySrc) {
    return '<img class="tee-img" src="' + gallerySrc + '" alt="' + galleryImageAlt(p, modalState.imageIndex) + '" loading="lazy" decoding="async" />';
  }
  return teeImg(p, modalState.color);
}

function modalGalleryHTML(product) {
  if (!product.gallery || !product.gallery.length) return "";
  return '<div class="modal-gallery">' + product.gallery.map((image, index) =>
    '<button class="modal-thumb ' + (index === modalState.imageIndex ? 'active' : '') + '" data-image-index="' + index + '" aria-label="View ' + image.alt + '">' +
      '<img src="' + image.src + '" alt="' + product.name + ' — ' + image.alt + '" loading="lazy" decoding="async" />' +
    '</button>'
  ).join("") + '</div>';
}

function toast(msg) {
  const t = $("#toast");
  t.innerHTML = msg;
  t.classList.add("show");
  clearTimeout(window.__toastT);
  window.__toastT = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ------------------------------ filters ------------------------------ */
function renderFilters() {
  const cats = ["All", ...Array.from(new Set(PRODUCTS.filter((p) => p.drop === activeDrop).map((p) => p.category)))];
  $("#filters").innerHTML = cats
    .map((c) => `<button class="chip ${c === activeFilter ? "active" : ""}" data-cat="${c}">${c === "All" ? "// all" : c}</button>`)
    .join("");
  $$("#filters .chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      activeFilter = chip.dataset.cat;
      track("filter_category", { category: activeFilter });
      renderFilters();
      renderGrid();
    })
  );
}

/* ------------------------------- grid -------------------------------- */
function renderGrid() {
  const inDrop = PRODUCTS.filter((p) => p.drop === activeDrop);
  const list = activeFilter === "All" ? inDrop : inDrop.filter((p) => p.category === activeFilter);
  $("#itemCount").textContent = "// " + list.length + " design" + (list.length === 1 ? "" : "s");
  $("#grid").innerHTML = list
    .map(
      (p) => `
    <article class="card" data-id="${p.id}">
      <div class="card-media">
        ${p.badge ? `<span class="badge ${p.badge}">${p.badge}</span>` : ""}
        ${teeImg(p, "black")}
        <span class="quick">&gt;_ quick view</span>
      </div>
      <div class="card-body">
        <div class="card-cat mono">${p.category}</div>
        <div class="card-name">${p.name}</div>
        <div class="card-foot">
          <span class="price mono">${money(p.price)}</span>
          <span class="stars">&#9733;&#9733;&#9733;&#9733;&#9733;<small>(${20 + (p.name.length % 30)})</small></span>
        </div>
      </div>
    </article>`
    )
    .join("");
  $$("#grid .card").forEach((card) =>
    card.addEventListener("click", () => openModal(productById(card.dataset.id)))
  );
}

/* ------------------------------- modal ------------------------------- */
function openModal(product) {
  modalState = { product, size: "M", color: "black", imageIndex: 0 };
  paintModal();
  $("#modalWrap").classList.add("open");
  document.body.style.overflow = "hidden";
  track("view_item", { item_id: product.id, item_name: product.name, price: product.price, category: product.category });
}
function closeModal() {
  $("#modalWrap").classList.remove("open");
  document.body.style.overflow = "";
}
function paintModal() {
  const p = modalState.product;
  $("#modal").innerHTML = `
    <button class="x" id="closeModal" aria-label="Close">&times;</button>
    <div class="modal-media">
      ${activeModalImageHTML()}
      ${modalGalleryHTML(p)}
    </div>
    <div class="modal-info">
      <div class="cat mono">${p.category} &middot; unisex fit</div>
      <h3>${p.name}</h3>
      <p class="blurb">${p.blurb}</p>
      <div class="mprice mono">${money(p.price)}</div>

      <div class="opt-label">Colorway</div>
      <div class="opt-row" id="colorRow">
        ${COLORWAYS.map((c) => `<button class="swatch ${c.id} ${c.id === modalState.color ? "active" : ""}" data-color="${c.id}" title="${c.label}"></button>`).join("")}
      </div>

      <div class="opt-label">Size</div>
      <div class="opt-row" id="sizeRow">
        ${SIZES.map((s) => `<button class="opt ${s === modalState.size ? "active" : ""}" data-size="${s}">${s}</button>`).join("")}
      </div>

      <button class="btn btn-primary add" id="addToCart">Add to cart &middot; ${money(p.price)}</button>
      <p class="ships mono">// ships in 3-5 days &middot; free over ${money(CONFIG.FREE_SHIP_OVER)}</p>
    </div>`;

  $("#closeModal").addEventListener("click", closeModal);
  $$(".modal-thumb").forEach((button) =>
    button.addEventListener("click", () => {
      modalState.imageIndex = Number(button.dataset.imageIndex);
      track("view_gallery_image", {
        item_id: p.id,
        image_index: modalState.imageIndex,
        image_alt: (p.gallery && p.gallery[modalState.imageIndex] ? p.gallery[modalState.imageIndex].alt : "")
      });
      paintModal();
    })
  );
  $$("#colorRow .swatch").forEach((b) =>
    b.addEventListener("click", () => {
      modalState.color = b.dataset.color;
      track("select_color", { item_id: p.id, color: modalState.color });
      paintModal();
    })
  );
  $$("#sizeRow .opt").forEach((b) =>
    b.addEventListener("click", () => {
      modalState.size = b.dataset.size;
      $$("#sizeRow .opt").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
    })
  );
  $("#addToCart").addEventListener("click", () => {
    addToCart(p, modalState.size, modalState.color);
    closeModal();
  });
}

/* ------------------------------- cart -------------------------------- */
function addToCart(product, size, color) {
  const key = product.id + "|" + size + "|" + color;
  const existing = cart.find((i) => i.key === key);
  if (existing) existing.qty += 1;
  else cart.push({ key, id: product.id, name: product.name, price: product.price, size, color, qty: 1 });
  saveCart();
  renderCart();
  updateCount();
  toast("Added <b>" + product.name + "</b> (" + size + ")");
  track("add_to_cart", { item_id: product.id, item_name: product.name, price: product.price, size, color });
  openCart();
}
function changeQty(key, delta) {
  const item = cart.find((i) => i.key === key);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter((i) => i.key !== key);
  saveCart();
  renderCart();
  updateCount();
}
function removeItem(key) {
  cart = cart.filter((i) => i.key !== key);
  saveCart();
  renderCart();
  updateCount();
  track("remove_from_cart", { key });
}
function cartTotal() { return cart.reduce((s, i) => s + i.price * i.qty, 0); }
function updateCount() {
  const n = cart.reduce((s, i) => s + i.qty, 0);
  $("#cartCount").textContent = n;
}
function renderCart() {
  const body = $("#cartBody");
  const foot = $("#cartFoot");
  if (!cart.length) {
    body.innerHTML = `<div class="cart-empty">// your cart is empty<br/>404: shirts not found</div>`;
    foot.hidden = true;
    return;
  }
  body.innerHTML = cart
    .map((i) => {
      const p = productById(i.id);
      return `
      <div class="cart-line">
        <div class="cart-thumb">${teeImg(p, i.color)}</div>
        <div class="cart-info">
          <h5>${i.name}</h5>
          <div class="meta">${i.size} &middot; ${i.color} &middot; ${money(i.price)}</div>
          <div class="qty">
            <button data-dec="${i.key}">&minus;</button>
            <span>${i.qty}</span>
            <button data-inc="${i.key}">+</button>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
          <span class="cart-price mono">${money(i.price * i.qty)}</span>
          <button class="rm" data-rm="${i.key}">remove</button>
        </div>
      </div>`;
    })
    .join("");
  const total = cartTotal();
  $("#subtotal").textContent = money(total);
  $("#shipping").textContent = total >= CONFIG.FREE_SHIP_OVER ? "FREE" : money(6);
  $("#total").textContent = money(total >= CONFIG.FREE_SHIP_OVER ? total : total + 6);
  foot.hidden = false;

  $$("#cartBody [data-inc]").forEach((b) => b.addEventListener("click", () => changeQty(b.dataset.inc, 1)));
  $$("#cartBody [data-dec]").forEach((b) => b.addEventListener("click", () => changeQty(b.dataset.dec, -1)));
  $$("#cartBody [data-rm]").forEach((b) => b.addEventListener("click", () => removeItem(b.dataset.rm)));
}
function openCart() {
  $("#drawer").classList.add("open");
  $("#overlay").classList.add("open");
  track("open_cart", { items: cart.reduce((s, i) => s + i.qty, 0), value: cartTotal() });
}
function closeCart() {
  $("#drawer").classList.remove("open");
  $("#overlay").classList.remove("open");
}

/* ------------------------------ waitlist ----------------------------- */
function initWaitlist() {
  $("#waitlistForm").addEventListener("submit", function (e) {
    e.preventDefault();
    const email = $("#waitlistEmail").value.trim();
    if (!email) return;
    track("join_waitlist", { email_domain: (email.split("@")[1] || "") });
    subscribe(email, "waitlist");
    if (CONFIG.FORMSPREE_ENDPOINT) {
      fetch(CONFIG.FORMSPREE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email })
      }).catch(() => {});
    }
    this.reset();
    toast("You're on the list &#9989; check your inbox");
  });
}

/* ------------------------------- checkout ---------------------------- */
function initCheckout() {
  $("#checkoutBtn").addEventListener("click", openCheckout);
}

function initAutoTracking() {
  document.addEventListener("click", function (e) {
    var node = e.target.closest("a, button");
    if (!node || node.dataset.analyticsSkip === "true") return;
    track("ui_click", {
      target_type: node.tagName.toLowerCase(),
      target_id: node.id || "",
      target_label: analyticsLabel(node),
      href: node.tagName === "A" ? (node.getAttribute("href") || "") : "",
      zone: analyticsZone(node)
    });
  });
}

/* ------------------------------- wiring ------------------------------ */
function init() {
  renderFilters();
  renderGrid();
  renderCart();
  updateCount();
  initWaitlist();
  initCheckout();
  initAutoTracking();

  $("#openCart").addEventListener("click", openCart);
  $("#closeCart").addEventListener("click", closeCart);
  $("#overlay").addEventListener("click", closeCart);
  $("#modalBackdrop").addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeModal(); closeCart(); closeCheckout(); closeInfo(); }
  });

  // footer category shortcuts
  $$("[data-filter]").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      activeFilter = a.dataset.filter;
      renderFilters();
      renderGrid();
      document.getElementById("shop").scrollIntoView({ behavior: "smooth" });
    })
  );

  // track outbound instagram clicks
  $$('a[href*="instagram.com"]').forEach((a) =>
    a.addEventListener("click", () => track("click_instagram", { location: "nav_or_footer" }))
  );

  $("#checkoutBackdrop").addEventListener("click", closeCheckout);
  $("#infoBackdrop").addEventListener("click", closeInfo);
  $$("[data-info]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); openInfo(a.dataset.info); }));
  handleCheckoutReturn();

  $("#year").textContent = new Date().getFullYear();
  var __drop = (typeof DROPS !== "undefined") ? DROPS.find(function (d) { return d.id === activeDrop; }) : null;
  var __dt = $("#dropTitle");
  if (__drop && __dt) __dt.innerHTML = '<span class="prompt">&gt;_</span> Drop ' + __drop.number + ' &middot; ' + __drop.name;
  track("view_home", { path: location.pathname, drop: activeDrop });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

/* ============================================================
   Checkout (Stripe-redirect) + info pages + email capture
   ============================================================ */
function openCheckout() {
  if (!cart.length) { toast("// cart is empty"); return; }
  track("begin_checkout", { value: cartTotal(), items: cart.reduce((s, i) => s + i.qty, 0) });
  paintCheckout();
  $("#checkoutWrap").classList.add("open");
  document.body.style.overflow = "hidden";
}
function closeCheckout() {
  var w = $("#checkoutWrap"); if (w) w.classList.remove("open");
  document.body.style.overflow = "";
}
function paintCheckout() {
  var total = cartTotal();
  var ship = total >= CONFIG.FREE_SHIP_OVER ? 0 : 6;
  var rows = cart.map(function (i) {
    return '<div class="co-line"><span>' + i.qty + '&times; ' + i.name +
      ' <em class="mono">' + i.size + '/' + i.color + '</em></span>' +
      '<span class="mono">' + money(i.price * i.qty) + '</span></div>';
  }).join("");
  $("#checkoutSheet").innerHTML =
    '<button class="x" id="closeCheckout" aria-label="Close">&times;</button>' +
    '<h3>&gt;_ checkout</h3>' +
    '<div class="co-summary">' + rows +
      '<div class="co-line muted"><span>shipping</span><span>' + (ship ? money(ship) : "FREE") + '</span></div>' +
      '<div class="co-line co-total"><span>total</span><span class="mono">' + money(total + ship) + '</span></div></div>' +
    '<label class="co-label">Email for your receipt &amp; order updates</label>' +
    '<input type="email" id="coEmail" class="co-input" placeholder="you@localhost" autocomplete="email" />' +
    '<button class="btn btn-primary co-pay" id="coPay">Continue to secure payment &rarr;</button>' +
    '<p class="co-note mono">// you finish on Stripe secure checkout. we never see your card.</p>' +
    '<div class="co-status" id="coStatus"></div>';
  $("#closeCheckout").addEventListener("click", closeCheckout);
  $("#coPay").addEventListener("click", submitCheckout);
}
function submitCheckout() {
  var emailEl = $("#coEmail");
  var email = emailEl ? emailEl.value.trim() : "";
  var btn = $("#coPay"), status = $("#coStatus");
  btn.disabled = true; btn.textContent = "Starting secure checkout...";
  if (email) subscribe(email, "checkout");
  var payload = {
    items: cart.map(function (i) { return { id: i.id, name: i.name, price: i.price, qty: i.qty, size: i.size, color: i.color }; }),
    email: email, visitorId: visitorId()
  };
  fetch(CONFIG.CHECKOUT_ENDPOINT, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  }).then(function (r) { return r.json(); }).then(function (data) {
    if (data && data.url) { window.location.href = data.url; return; }
    if (CONFIG.STRIPE_PAYMENT_LINK) { window.location.href = CONFIG.STRIPE_PAYMENT_LINK; return; }
    track("order_captured", { orderId: data && data.orderId, value: cartTotal() });
    status.innerHTML = '<span class="ok">&#10003; Order saved (#' + ((data && data.orderId) || "-") +
      '). Payment is not switched on yet - we will email you when it is.</span>';
    btn.disabled = false; btn.textContent = "Continue to secure payment →";
  }).catch(function () {
    if (CONFIG.STRIPE_PAYMENT_LINK) { window.location.href = CONFIG.STRIPE_PAYMENT_LINK; return; }
    status.innerHTML = '<span class="err">Something went wrong. Please try again.</span>';
    btn.disabled = false; btn.textContent = "Continue to secure payment →";
  });
}

var INFO = {
  sizing: { title: "Sizing", html:
    "<p>Our tees are unisex with a relaxed drop-shoulder fit on premium ringspun cotton (Bella+Canvas 3001 style).</p>" +
    "<table class='info-table mono'><tr><th>Size</th><th>Chest (in)</th><th>Length (in)</th></tr>" +
    "<tr><td>XS</td><td>34-36</td><td>27</td></tr><tr><td>S</td><td>36-38</td><td>28</td></tr>" +
    "<tr><td>M</td><td>38-40</td><td>29</td></tr><tr><td>L</td><td>41-43</td><td>30</td></tr>" +
    "<tr><td>XL</td><td>44-46</td><td>31</td></tr><tr><td>XXL</td><td>47-49</td><td>32</td></tr></table>" +
    "<p class='muted'>Between sizes? Size up for a roomier drop-shoulder look.</p>" },
  shipping: { title: "Shipping", html:
    "<p>Every tee is printed to order in small batches.</p>" +
    "<ul><li><b>Processing:</b> 2-4 business days.</li>" +
    "<li><b>US delivery:</b> 3-5 business days after processing.</li>" +
    "<li><b>International:</b> 7-14 business days.</li>" +
    "<li><b>Free shipping</b> on orders over $50.</li></ul>" +
    "<p class='muted'>You get a tracking link by email once it ships.</p>" },
  returns: { title: "Returns", html:
    "<p>We want you to love it.</p>" +
    "<ul><li>30-day returns or exchanges on unworn, unwashed tees.</li>" +
    "<li>Wrong item or a print defect? We replace it free.</li>" +
    "<li>Start a return by emailing us with your order number.</li></ul>" },
  contact: { title: "Contact", html:
    "<p>Questions, wholesale, or a joke we have to print?</p>" +
    "<p>Email <a href='mailto:hello@4o4apparel.com' class='accent'>hello@4o4apparel.com</a> or DM us on " +
    "<a href='https://www.instagram.com/apparel_404/' target='_blank' rel='noopener' class='accent'>Instagram</a>.</p>" +
    "<p class='muted'>We reply within one business day.</p>" }
};
function openInfo(topic) {
  var info = INFO[topic]; if (!info) return;
  $("#infoSheet").innerHTML =
    '<button class="x" id="closeInfo" aria-label="Close">&times;</button>' +
    '<h3>' + info.title + '</h3><div class="info-body">' + info.html + '</div>';
  $("#infoWrap").classList.add("open");
  document.body.style.overflow = "hidden";
  $("#closeInfo").addEventListener("click", closeInfo);
  track("view_info", { topic: topic });
}
function closeInfo() {
  var w = $("#infoWrap"); if (w) w.classList.remove("open");
  document.body.style.overflow = "";
}

function subscribe(email, source) {
  if (!email || !CONFIG.SUBSCRIBE_ENDPOINT) return;
  try {
    fetch(CONFIG.SUBSCRIBE_ENDPOINT, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, source: source || "waitlist" }), keepalive: true
    }).catch(function () {});
  } catch (e) {}
}

function handleCheckoutReturn() {
  var params = new URLSearchParams(location.search);
  var c = params.get("checkout");
  if (c === "success") {
    cart = []; saveCart(); renderCart(); updateCount();
    track("purchase_success", {});
    toast("&#10003; Order confirmed - thank you!");
  } else if (c === "cancel") {
    toast("// checkout canceled - your cart is saved");
  }
  if (c) history.replaceState({}, "", location.pathname);
}
