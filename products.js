/* =====================================================================
   404 APPAREL — product catalog
   Tees for coders, gamers & pop-culture nerds.
   Each "print" is rendered from data so the whole site stays image-free
   and deploys as pure static files (perfect for Vercel).
   To add a new shirt: copy a block in PRODUCTS and tweak it.
   ===================================================================== */

const PRODUCTS = [
  {
    id: "sleep",
    name: "SELECT * FROM sleep",
    category: "SQL",
    price: 28,
    badge: "BESTSELLER",
    blurb: "For everyone whose sleep schedule threw an exception.",
    gallery: [
      { src: "images/products/sleep/black.png", alt: "Front flat lay" },
      { src: "images/products/sleep/back.png", alt: "Back flat lay" },
      { src: "images/products/sleep/man-front-transparent-shopify.png", alt: "Men's front mockup" },
      { src: "images/products/sleep/women-front-transparent-shopify.png", alt: "Women's front mockup" },
      { src: "images/products/sleep/couple-transparent-shopify.png", alt: "Couple lifestyle" },
      { src: "images/products/sleep/back-couple-transparent-shopify.png", alt: "Couple back lifestyle" }
    ],
    print: {
      style: "window", title: "query.sql",
      lines: [
        '<span class="k">SELECT</span> <span class="o">*</span> <span class="k">FROM</span> sleep',
        '<span class="k">WHERE</span> hours <span class="o">&gt;=</span> <span class="n">8</span>;',
        '<span class="c">-- 0 rows returned --</span>'
      ]
    }
  },
  {
    id: "motivation",
    name: "404: Motivation Not Found",
    category: "Glitch",
    price: 30,
    badge: "FLAGSHIP",
    blurb: "The shirt the whole brand is named after.",
    print: { style: "glitch", big: "404", sub: "MOTIVATION NOT FOUND" }
  },
  {
    id: "rmrf",
    name: "rm -rf /regrets",
    category: "Terminal",
    price: 28,
    badge: "NEW",
    blurb: "Delete recursively. No confirmation. No regrets.",
    print: {
      style: "window", title: "bash", term: true,
      lines: [
        '<span class="m">$</span> sudo rm -rf /regrets',
        '<span class="m">Password:</span> &bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;',
        '<span class="g">&#10003; 4096 regrets deleted</span>'
      ]
    }
  },
  {
    id: "coffee",
    name: "while (awake)",
    category: "Coder",
    price: 28,
    badge: null,
    blurb: "The only loop that never breaks.",
    print: {
      style: "window", title: "life.js",
      lines: [
        '<span class="b">while</span> (awake) {',
        '&nbsp;&nbsp;coffee<span class="o">++</span>;',
        '&nbsp;&nbsp;bugs<span class="o">--</span>;',
        '}'
      ]
    }
  },
  {
    id: "localhost",
    name: "127.0.0.1",
    category: "Coder",
    price: 28,
    badge: null,
    blurb: "There's no place like home.",
    print: { style: "mono", top: "there's no place like", big: "127.0.0.1", note: "// home sweet home" }
  },
  {
    id: "respawn",
    name: "while (!dead) respawn()",
    category: "Gamer",
    price: 28,
    badge: "NEW",
    blurb: "Death is just a slow reload.",
    print: {
      style: "window", title: "game.cpp",
      lines: [
        '<span class="b">while</span> (<span class="o">!</span>dead) {',
        '&nbsp;&nbsp;respawn();',
        '&nbsp;&nbsp;<span class="c">// gg ez</span>',
        '}'
      ]
    }
  },
  {
    id: "helloworld",
    name: "Hello, World!",
    category: "Classic",
    price: 26,
    badge: null,
    blurb: "Where every one of us began.",
    print: {
      style: "window", title: "hello.py",
      lines: [
        '<span class="b">print</span>(<span class="s">"Hello, World!"</span>)',
        '<span class="c"># where it all began</span>'
      ]
    }
  },
  {
    id: "commit",
    name: "final_FINAL_v3",
    category: "Coder",
    price: 28,
    badge: null,
    blurb: "The commit message that haunts us all.",
    print: {
      style: "window", title: "git", term: true,
      lines: [
        '<span class="m">$</span> git commit -m',
        '<span class="s">"final_FINAL_v3"</span>',
        '<span class="c"># it is never final</span>'
      ]
    }
  },
  {
    id: "semicolon",
    name: "Missing Semicolon",
    category: "Minimal",
    price: 26,
    badge: null,
    blurb: "Three hours of debugging in one character.",
    print: { style: "mono", top: "expected", big: ";", note: "// you forgot something" }
  }
];

/* ---------- drops (a brand is a config; each drop is a set) ---------- */
const CURRENT_DROP = "archi";
const DROPS = [
  { id: "archi", number: "001", name: "Archi", status: "current",
    tagline: "The first drop off the line \u2014 terminal humor, printed to order.", period: "2026" }
];
PRODUCTS.forEach((p) => { if (!p.drop) p.drop = "archi"; });

/* ---------- tee mockup renderer (image-free, pure SVG + CSS) ---------- */
let __teeUID = 0;

function teePrintHTML(print) {
  if (print.style === "glitch") {
    return '<div class="print print--glitch">' +
        '<span class="glitch-big" data-text="' + print.big + '">' + print.big + '</span>' +
        '<span class="glitch-sub">' + print.sub + '</span>' +
      '</div>';
  }
  if (print.style === "mono") {
    return '<div class="print print--mono">' +
        (print.top ? '<span class="mono-top">' + print.top + '</span>' : "") +
        '<span class="mono-big">' + print.big + '</span>' +
        (print.note ? '<span class="mono-note">' + print.note + '</span>' : "") +
      '</div>';
  }
  var lines = print.lines.map(function (l) { return '<span class="code-line">' + l + '</span>'; }).join("");
  return '<div class="print print--window ' + (print.term ? "is-term" : "") + '">' +
      '<span class="win-bar"><i></i><i></i><i></i><em>' + (print.title || "") + '</em></span>' +
      '<span class="win-body">' + lines + '</span>' +
    '</div>';
}

function teeMockHTML(product, colorway) {
  var uid = ++__teeUID;
  var cw = colorway || "black";
  return '<div class="tee-mock tee--' + cw + '">' +
    '<svg class="tee-svg" viewBox="0 0 300 340" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<defs><linearGradient id="teeG' + uid + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop class="stop-a" offset="0"/><stop class="stop-b" offset="1"/>' +
      '</linearGradient></defs>' +
      '<path class="tee-body" fill="url(#teeG' + uid + ')" stroke="rgba(255,255,255,.06)" stroke-width="1" ' +
        'd="M99,26 C120,66 180,66 201,26 L246,48 L289,92 L262,132 L232,110 L232,316 L68,316 L68,110 L38,132 L11,92 L54,48 Z"/>' +
      '<path class="tee-collar" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="2" ' +
        'd="M99,26 C120,64 180,64 201,26"/>' +
    '</svg>' +
    teePrintHTML(product.print) +
  '</div>';
}


/* PNG product image (real mockups in /images) */
function teeImg(product, colorway) {
  var cw = colorway || "black";
  return '<img class="tee-img" src="images/products/' + product.id + '/' + cw + '.png" alt="' +
    product.name + ' — 404 Apparel tee" loading="lazy" decoding="async" />';
}

function galleryImageSrc(product, index) {
  if (!product.gallery || !product.gallery[index]) return null;
  return product.gallery[index].src;
}

function galleryImageAlt(product, index) {
  if (!product.gallery || !product.gallery[index]) return product.name + ' — 404 Apparel tee';
  return product.name + ' — ' + product.gallery[index].alt;
}

if (typeof module !== "undefined") module.exports = { PRODUCTS, DROPS, CURRENT_DROP, galleryImageSrc, galleryImageAlt };
