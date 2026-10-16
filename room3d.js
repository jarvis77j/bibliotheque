/* Bibliothèque en 3D : une pièce avec un meuble par étagère (Lus, En cours, À lire, Coups de cœur).
   On glisse le doigt pour se tourner vers le meuble voisin, on pince pour zoomer, on touche un livre pour l'ouvrir.
   Utilise three.js (fichier three.min.js à côté). Si la 3D n'est pas disponible, l'app garde l'étagère 2D. */
(function () {
  if (!window.THREE) return;
  const T = window.THREE;
  const KEYS = ["lu", "encours", "alire", "fav"];
  const QUARTER = Math.PI / 2;
  const R = 3.4;          // distance du centre de la pièce à la façade des meubles
  const ROOM = R + 0.42;  // distance du centre aux murs
  const SHELF_H = 0.42;   // hauteur d'un rayon
  const DEPTH = 0.34;     // profondeur du meuble
  const BOOK_D = 0.2;     // profondeur d'un livre

  const THEMES = {
    lu:      { wall: "#d8b38a", wall2: "#c79b70", pattern: "stripes", wood: "#7a4a2a", back: "#3a2213", chair: "#b5553a", rows: 4 },
    encours: { wall: "#b4c1a0", wall2: "#98a884", pattern: "panel",   wood: "#c9a26f", back: "#6f5233", chair: "#c9962e", rows: 3, plaid: true },
    alire:   { wall: "#e7c2b4", wall2: "#d3a596", pattern: "dots",    wood: "#efe8dc", back: "#d9ccb6", chair: "#8fa58a", rows: 4 },
    fav:     { wall: "#7a3a3c", wall2: "#5a2628", pattern: "damask",  wood: "#26342b", back: "#141e18", chair: "#2f6b55", rows: 3, gold: true, lights: true },
  };

  /* ---------- Textures dessinées sur canvas ---------- */
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
    return "#" + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  function wallTexture(th) {
    return canvasTex(256, 256, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, th.wall); grad.addColorStop(1, th.wall2);
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      g.globalAlpha = 0.18;
      if (th.pattern === "stripes") { g.fillStyle = "#fff"; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 3, h); g.fillStyle = "#000"; g.globalAlpha = 0.06; for (let x = 16; x < w; x += 32) g.fillRect(x, 0, 2, h); }
      if (th.pattern === "dots") { g.fillStyle = "#fff"; for (let y = 16; y < h; y += 32) for (let x = (y / 32) % 2 ? 0 : 16; x < w; x += 32) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); } }
      if (th.pattern === "panel") { g.strokeStyle = "#fff"; g.lineWidth = 3; g.strokeRect(20, 150, 216, 90); g.globalAlpha = 0.1; g.fillStyle = "#000"; g.fillRect(0, 140, w, 2); }
      if (th.pattern === "damask") { g.fillStyle = "#ffd9a0"; g.globalAlpha = 0.12; for (let y = 32; y < h; y += 64) for (let x = (y / 64) % 2 ? 0 : 32; x < w + 1; x += 64) { g.beginPath(); g.ellipse(x, y, 10, 18, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(x, y, 18, 6, 0, 0, 7); g.fill(); } }
    }, [6, 3]);
  }
  function woodTexture(base, rep) {
    return canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) {
        g.strokeStyle = i % 3 ? "rgba(0,0,0,.07)" : "rgba(255,255,255,.06)"; g.lineWidth = 1 + (i % 4);
        const y = (i * 37) % h; g.beginPath(); g.moveTo(0, y);
        g.bezierCurveTo(w * 0.3, y + 6, w * 0.6, y - 6, w, y + 2); g.stroke();
      }
    }, rep || [1, 1]);
  }
  const floorTex = () => canvasTex(512, 512, (g, w, h) => {
    const plank = 64;
    for (let y = 0; y < h; y += plank) {
      const off = (y / plank) % 2 ? 160 : 0;
      for (let x = -off; x < w; x += 320) {
        const tone = ["#93603a", "#8a5833", "#9c6840", "#85532f"][((x + y) / 64 & 3) >>> 0];
        g.fillStyle = tone; g.fillRect(x, y, 320, plank);
        g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(x, y, 2, plank);
        for (let k = 0; k < 6; k++) { g.fillStyle = "rgba(0,0,0,.05)"; g.fillRect(x, y + 6 + k * 10, 320, 1); }
      }
      g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(0, y, w, 2);
    }
  }, [4, 4]);
  const rugTex = () => canvasTex(512, 512, (g, w, h) => {
    const c = w / 2;
    [["#8a3626", 256], ["#e9c99a", 236], ["#b4553d", 222], ["#e9c99a", 160], ["#9a3f2c", 148], ["#e9c99a", 70], ["#b4553d", 60]].forEach(([col, r]) => { g.fillStyle = col; g.beginPath(); g.arc(c, c, r, 0, 7); g.fill(); });
    g.strokeStyle = "rgba(233,201,154,.7)"; g.lineWidth = 4;
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; g.beginPath(); g.moveTo(c + Math.cos(a) * 75, c + Math.sin(a) * 75); g.lineTo(c + Math.cos(a) * 145, c + Math.sin(a) * 145); g.stroke(); }
  });

  /* Tranche d'un livre : sa couleur, deux filets et le titre à la verticale */
  const spineCache = new Map();
  function spineTexture(b, color, ink) {
    const key = b.id + "|" + color + "|" + b.title + "|" + (b.tome || "") + "|" + !!b.fav;
    if (spineCache.has(key)) return spineCache.get(key);
    const tex = canvasTex(80, 480, (g, w, h) => {
      g.fillStyle = color; g.fillRect(0, 0, w, h);
      const sh = g.createLinearGradient(0, 0, w, 0);
      sh.addColorStop(0, "rgba(255,255,255,.18)"); sh.addColorStop(0.25, "rgba(255,255,255,0)"); sh.addColorStop(0.8, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,0,.28)");
      g.fillStyle = sh; g.fillRect(0, 0, w, h);
      g.fillStyle = ink; g.globalAlpha = 0.45; g.fillRect(0, 26, w, 3); g.fillRect(0, h - 30, w, 3); g.globalAlpha = 1;
      g.save(); g.translate(w / 2, 44); g.rotate(Math.PI / 2);
      const title = b.title.length > 42 ? b.title.slice(0, 40) + "…" : b.title;
      let size = 34;
      g.font = `bold ${size}px Georgia, serif`;
      const author = b.authors && b.authors[0] ? b.authors[0] : "";
      const room = h - 96;
      while (size > 16 && g.measureText(title).width + (author ? 140 : 0) > room) { size -= 2; g.font = `bold ${size}px Georgia, serif`; }
      g.fillStyle = ink; g.textBaseline = "middle";
      g.fillText(title, 0, 0);
      if (author) {
        const tw = g.measureText(title).width;
        g.font = `${Math.max(14, size - 10)}px Georgia, serif`; g.globalAlpha = 0.8;
        let a = author; while (a.length > 3 && g.measureText(a).width > room - tw - 20) a = a.slice(0, -2);
        g.fillText(a === author ? a : a + "…", tw + 18, 0);
      }
      g.restore();
      if (b.fav) { g.fillStyle = "#e8c04a"; g.font = "28px serif"; g.textAlign = "center"; g.fillText("♥", w / 2, h - 52); }
      if (b.tome) { g.fillStyle = ink; g.font = "bold 26px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(b.tome), w / 2, h - 92); }
    });
    spineCache.set(key, tex);
    return tex;
  }

  /* ---------- Matériaux partagés ---------- */
  const matCache = new Map();
  function mat(color, opts) {
    const key = color + JSON.stringify(opts || {});
    if (!matCache.has(key)) matCache.set(key, new T.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...(opts || {}) }));
    return matCache.get(key);
  }
  const pagesMat = new T.MeshStandardMaterial({ color: "#efe6d2", roughness: 0.95 });
  const box = (w, h, d, m, x, y, z, parent) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x, y, z); parent.add(o); return o; };
  const cyl = (rt, rb, h, m, x, y, z, parent, seg) => { const o = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg || 20), m); o.position.set(x, y, z); parent.add(o); return o; };
  const ball = (r, m, x, y, z, parent) => { const o = new T.Mesh(new T.SphereGeometry(r, 16, 12), m); o.position.set(x, y, z); parent.add(o); return o; };

  /* ---------- Petits objets ---------- */
  function plant(parent, x, y, z, s) {
    const g = new T.Group(); g.position.set(x, y, z); g.scale.setScalar(s || 1); parent.add(g);
    cyl(0.075, 0.06, 0.13, mat("#b5653f"), 0, 0.065, 0, g);
    const leaf = mat("#4f7a43"), leaf2 = mat("#6a9a5a");
    for (let i = 0; i < 7; i++) {
      const l = ball(0.06, i % 2 ? leaf : leaf2, Math.cos(i) * 0.05, 0.2 + (i % 3) * 0.045, Math.sin(i * 2) * 0.04, g);
      l.scale.set(0.6, 1.6, 0.6); l.rotation.z = Math.cos(i * 1.7) * 0.6; l.rotation.x = Math.sin(i * 1.3) * 0.4;
    }
    return g;
  }
  function candle(parent, x, y, z, s) {
    const g = new T.Group(); g.position.set(x, y, z); g.scale.setScalar(s || 1); parent.add(g);
    cyl(0.06, 0.06, 0.012, mat("#b08d57", { metalness: 0.6, roughness: 0.4 }), 0, 0.006, 0, g);
    cyl(0.035, 0.035, 0.16, mat("#f3e6cf"), 0, 0.09, 0, g);
    const f = ball(0.016, new T.MeshBasicMaterial({ color: "#ffcf6a" }), 0, 0.19, 0, g); f.scale.set(1, 1.8, 1);
    const halo = new T.Mesh(new T.SphereGeometry(0.06, 12, 8), new T.MeshBasicMaterial({ color: "#ffb84a", transparent: true, opacity: 0.18, depthWrite: false }));
    halo.position.set(0, 0.19, 0); g.add(halo);
    return g;
  }
  function frame(parent, x, y, z) {
    const g = new T.Group(); g.position.set(x, y, z); parent.add(g);
    box(0.2, 0.26, 0.02, mat("#c9a227", { metalness: 0.5, roughness: 0.4 }), 0, 0.13, 0, g);
    const pic = canvasTex(64, 84, (c, w, h) => { c.fillStyle = "#9fc3d6"; c.fillRect(0, 0, w, h); c.fillStyle = "#ffe6a0"; c.beginPath(); c.arc(44, 20, 7, 0, 7); c.fill(); c.fillStyle = "#5f8a5a"; c.beginPath(); c.moveTo(0, h); c.lineTo(22, 46); c.lineTo(36, 62); c.lineTo(46, 52); c.lineTo(64, h); c.fill(); });
    box(0.16, 0.22, 0.004, new T.MeshStandardMaterial({ map: pic, roughness: 0.6 }), 0, 0.13, 0.012, g);
    g.rotation.x = -0.12;
    return g;
  }
  function bookStack(parent, x, y, z) {
    const g = new T.Group(); g.position.set(x, y, z); parent.add(g);
    [["#7b2d26", 0.26], ["#1f3a5f", 0.23], ["#c9a227", 0.25]].forEach(([c, w], i) => {
      const m = box(w, 0.045, 0.17, [mat(c), mat(c), mat(c), mat(c), pagesMat, mat(c)], (i - 1) * 0.01, 0.0225 + i * 0.045, 0, g);
      m.rotation.y = (i - 1) * 0.12;
    });
    return g;
  }
  function armchair(parent, color, x, z, ry, plaid) {
    const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g);
    const m = mat(color, { roughness: 1 }), dark = mat(shade(color, -0.12), { roughness: 1 }), leg = mat("#4a2c18");
    box(0.8, 0.16, 0.72, dark, 0, 0.26, 0, g);                 // base
    const seat = box(0.62, 0.12, 0.62, m, 0, 0.4, 0.04, g);     // coussin
    seat.geometry.translate(0, 0, 0);
    box(0.8, 0.62, 0.16, m, 0, 0.62, -0.3, g).rotation.x = -0.12; // dossier
    box(0.15, 0.36, 0.72, m, -0.36, 0.48, 0, g);                // accoudoirs
    box(0.15, 0.36, 0.72, m, 0.36, 0.48, 0, g);
    box(0.32, 0.22, 0.1, dark, 0.04, 0.56, -0.15, g).rotation.set(-0.3, 0, 0.12); // petit coussin
    [[-0.34, -0.3], [0.34, -0.3], [-0.34, 0.3], [0.34, 0.3]].forEach(([lx, lz]) => cyl(0.025, 0.018, 0.18, leg, lx, 0.09, lz, g, 8));
    if (plaid) {
      const tex = canvasTex(128, 128, (c, w, h) => { c.fillStyle = "#d9c9a8"; c.fillRect(0, 0, w, h); c.fillStyle = "rgba(163,74,53,.7)"; for (let i = 8; i < w; i += 32) { c.fillRect(i, 0, 8, h); c.fillRect(0, i, w, 8); } });
      const p = box(0.2, 0.5, 0.6, new T.MeshStandardMaterial({ map: tex, roughness: 1 }), 0.42, 0.5, 0.02, g); p.rotation.z = -0.15;
    }
    return g;
  }
  function sideTable(parent, x, z, lampColor) {
    const g = new T.Group(); g.position.set(x, 0, z); parent.add(g);
    const wood = mat("#6b4126");
    cyl(0.24, 0.24, 0.035, wood, 0, 0.56, 0, g, 28);
    [0, 2.1, 4.2].forEach((a) => { const l = cyl(0.018, 0.018, 0.56, wood, Math.cos(a) * 0.16, 0.28, Math.sin(a) * 0.16, g, 8); l.rotation.z = Math.cos(a) * 0.1; l.rotation.x = -Math.sin(a) * 0.1; });
    cyl(0.07, 0.09, 0.03, mat("#c9a227", { metalness: 0.6, roughness: 0.35 }), -0.05, 0.59, 0, g);
    cyl(0.012, 0.012, 0.32, mat("#c9a227", { metalness: 0.6, roughness: 0.35 }), -0.05, 0.75, 0, g, 8);
    const shadeMat = new T.MeshStandardMaterial({ color: lampColor || "#f4dfb2", emissive: "#ffb85c", emissiveIntensity: 0.55, side: T.DoubleSide, roughness: 1 });
    cyl(0.09, 0.17, 0.2, shadeMat, -0.05, 0.96, 0, g, 24).geometry = new T.CylinderGeometry(0.09, 0.17, 0.2, 24, 1, true);
    const light = new T.PointLight("#ffc27a", 2.2, 5, 1.6); light.position.set(-0.05, 0.92, 0); g.add(light);
    // tasse
    cyl(0.04, 0.035, 0.08, mat("#f6efe2"), 0.12, 0.62, 0.06, g);
    return g;
  }
  function fairyLights(parent, w, y, z) {
    const g = new T.Group(); parent.add(g);
    const bulb = new T.MeshBasicMaterial({ color: "#ffd27a" });
    const halo = new T.MeshBasicMaterial({ color: "#ffb84a", transparent: true, opacity: 0.25, depthWrite: false });
    const n = 15;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = -w / 2 + t * w, yy = y - Math.sin(t * Math.PI * 3) ** 2 * 0.12;
      ball(0.018, bulb, x, yy, z, g); ball(0.04, halo, x, yy, z, g);
    }
    const l = new T.PointLight("#ffbf70", 1.2, 3, 1.5); l.position.set(0, y - 0.1, z + 0.2); g.add(l);
    return g;
  }

  /* ---------- Rangement des livres ---------- */
  const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const thickness = (b) => Math.max(0.03, Math.min(0.08, (b.pages || 250) / 8000 + 0.014));
  /* Les tomes d'une même série qui se suivent forment un coffret, jamais coupé entre deux rayons */
  function units(books) {
    const out = [];
    for (const b of books) {
      const last = out[out.length - 1];
      if (b.series && last && last.series === b.series) last.books.push(b);
      else out.push({ series: b.series || "", books: [b] });
    }
    for (const u of out) {
      u.box = u.series && u.books.length > 1;
      u.w = u.books.reduce((s, b) => s + thickness(b) + 0.004, 0) + (u.box ? 0.03 : 0);
    }
    return out;
  }
  function pack(books, inner) {
    const rows = [[]]; let used = 0;
    for (const u of units(books)) {
      if (used + u.w > inner && rows[rows.length - 1].length) { rows.push([]); used = 0; }
      rows[rows.length - 1].push(u); used += u.w;
    }
    return rows;
  }
  const coffretLabels = new Map();
  function labelTexture(text, color, ink) {
    const key = text + "|" + color;
    if (coffretLabels.has(key)) return coffretLabels.get(key);
    const tex = canvasTex(512, 48, (g, w, h) => {
      g.fillStyle = color; g.fillRect(0, 0, w, h);
      g.fillStyle = ink; g.globalAlpha = 0.5; g.fillRect(0, 4, w, 2); g.fillRect(0, h - 6, w, 2); g.globalAlpha = 1;
      let size = 30; g.font = `bold ${size}px Georgia, serif`;
      while (size > 12 && g.measureText(text).width > w - 30) { size -= 2; g.font = `bold ${size}px Georgia, serif`; }
      g.fillStyle = ink; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, w / 2, h / 2 + 1);
    });
    coffretLabels.set(key, tex);
    return tex;
  }
  /* Sur un téléphone en hauteur, un meuble plus étroit et plus haut pour garder des livres lisibles */
  function layout(books, minRows, narrow) {
    const widths = narrow ? [1.0, 1.3, 1.6, 2.0, 2.6, 3.2, 3.8, 4.6] : [1.5, 2.0, 2.6, 3.2, 3.8, 4.6];
    const maxRows = narrow ? 6 : 5;
    let W = widths[0], rows = pack(books, W - 0.12);
    for (const w of widths) { W = w; rows = pack(books, W - 0.12); if (rows.length <= maxRows) break; }
    while (rows.length < minRows) rows.push([]);
    return { W, rows };
  }

  /* ---------- Un meuble complet avec ses livres et sa déco ---------- */
  function buildCase(key, books, helpers) {
    const th = THEMES[key];
    const g = new T.Group();
    const { W, rows } = layout(books, th.rows, helpers.narrow);
    const base = 0.12;
    const H = base + rows.length * SHELF_H + 0.04;
    const wood = new T.MeshStandardMaterial({ map: woodTexture(th.wood, [1, 2]), roughness: 0.7 });
    const backM = new T.MeshStandardMaterial({ map: woodTexture(th.back, [2, 2]), roughness: 0.9 });
    const trim = th.gold ? mat("#c9a227", { metalness: 0.7, roughness: 0.3 }) : wood;
    box(0.05, H, DEPTH, wood, -W / 2 - 0.025, H / 2, 0, g);           // montants
    box(0.05, H, DEPTH, wood, W / 2 + 0.025, H / 2, 0, g);
    box(W + 0.18, 0.06, DEPTH + 0.06, wood, 0, H + 0.03, 0.01, g);       // dessus
    box(W + 0.22, 0.02, DEPTH + 0.08, trim, 0, H + 0.07, 0.01, g);
    box(W + 0.1, base, DEPTH, wood, 0, base / 2, 0, g);                   // socle
    box(W, H - base, 0.02, backM, 0, base + (H - base) / 2, -DEPTH / 2 + 0.01, g); // fond
    for (let r = 0; r <= rows.length; r++) box(W, 0.028, DEPTH - 0.02, wood, 0, base + r * SHELF_H, 0, g);
    if (th.gold) for (let r = 1; r <= rows.length; r++) box(W, 0.006, 0.004, trim, 0, base + r * SHELF_H - 0.012, DEPTH / 2, g);
    if (key === "alire") for (let i = 0; i < 3; i++) box(0.12, 0.016, 0.02, mat("#c9a227", { metalness: 0.7, roughness: 0.3 }), -W / 3 + (i * W) / 3, base / 2, DEPTH / 2 + 0.01, g);

    // livres
    const decorKinds = ["plant", "candle", "frame", "stack"];
    rows.forEach((row, r) => {
      const y0 = base + (rows.length - 1 - r) * SHELF_H + 0.014; // on range depuis le rayon du haut
      let x = -W / 2 + 0.04;
      const placeBook = (b, boxH) => {
        const t = thickness(b);
        const h = boxH || 0.25 + (hash(b.id) % 50) / 1000;
        const color = helpers.colorOf(b), ink = helpers.textOn(color);
        const side = mat(color), spine = new T.MeshStandardMaterial({ map: spineTexture(b, color, ink), roughness: 0.75 });
        const m = box(t, h, BOOK_D, [side, side, pagesMat, pagesMat, spine, side], x + t / 2, y0 + h / 2, DEPTH / 2 - BOOK_D / 2 - 0.012, g);
        m.userData.id = b.id;
        helpers.pick.push(m);
        if (b.status === "encours") box(0.012, 0.06, 0.002, mat("#a8432f"), x + t / 2, y0 + h + 0.02, DEPTH / 2 - 0.02, g); // marque-page
        x += t + 0.004;
      };
      row.forEach((u) => {
        if (!u.box) { placeBook(u.books[0]); return; }
        // coffret : deux flancs, un dessus avec le nom de la série, un fond, un socle
        const color = shade(helpers.colorOf(u.books[0]), -0.18), ink = helpers.textOn(color);
        const cm = mat(color, { roughness: 0.6 }), inner = u.w - 0.03, bh = 0.262, z = DEPTH / 2 - BOOK_D / 2 - 0.012;
        const x0 = x;
        box(0.012, bh + 0.02, BOOK_D + 0.01, cm, x0 + 0.006, y0 + (bh + 0.02) / 2, z, g);
        box(0.012, bh + 0.02, BOOK_D + 0.01, cm, x0 + u.w - 0.006 - 0.004, y0 + (bh + 0.02) / 2, z, g);
        box(u.w - 0.004, 0.006, BOOK_D + 0.01, cm, x0 + (u.w - 0.004) / 2, y0 + 0.003, z, g);
        box(u.w - 0.004, bh + 0.02, 0.008, cm, x0 + (u.w - 0.004) / 2, y0 + (bh + 0.02) / 2, z - BOOK_D / 2 - 0.001, g);
        const lid = new T.MeshStandardMaterial({ map: labelTexture(u.series, color, ink), roughness: 0.6 });
        const top = box(u.w - 0.004, 0.034, BOOK_D + 0.01, [cm, cm, cm, cm, lid, cm], x0 + (u.w - 0.004) / 2, y0 + bh + 0.006 + 0.017, z, g);
        top.userData.id = u.books[0].id; helpers.pick.push(top);
        x = x0 + 0.015;
        u.books.forEach((b) => placeBook(b, bh - 0.004));
        x = x0 + u.w;
      });
      const free = W / 2 - 0.04 - x;
      const kind = decorKinds[(r + key.length) % decorKinds.length];
      const z = 0.02;
      if (free > 0.3) {
        const dx = W / 2 - 0.18;
        if (kind === "plant") plant(g, dx, y0, z, 0.9);
        if (kind === "candle") candle(g, dx, y0, z, 1.1);
        if (kind === "frame") frame(g, dx, y0, z);
        if (kind === "stack") bookStack(g, dx - 0.02, y0, z);
        if (!row.length && free > 0.9) { (r % 2 ? candle : plant)(g, -W / 2 + 0.3, y0, z, 1); }
      }
    });
    // dessus du meuble
    plant(g, -W / 2 + 0.22, H + 0.08, 0, 1.1);
    candle(g, W / 2 - 0.2, H + 0.08, 0.02, 1.2);
    if (th.lights) fairyLights(g, W + 0.3, H + 0.55, DEPTH / 2 + 0.05);
    // mobilier à côté du meuble
    armchair(g, th.chair, -W / 2 - 0.85, 0.95, 0.55, th.plaid);
    sideTable(g, W / 2 + 0.55, 0.55);
    return { group: g, W, H };
  }

  /* ---------- La pièce ---------- */
  window.createRoom3D = function (container, opts) {
    // ambiance choisie dans les réglages : couleurs des murs et des meubles
    if (opts.themes) for (const k in opts.themes) Object.assign(THEMES[k], opts.themes[k]);
    const night = !!opts.night;
    let renderer;
    try {
      renderer = new T.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
    } catch (e) { console.warn("3D indisponible", e); return null; }
    if (!renderer.getContext()) return null;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);
    const canvas = renderer.domElement;
    canvas.style.touchAction = "none";

    const scene = new T.Scene();
    const sceneColor = opts.sceneColor || "#2a1a10";
    scene.background = new T.Color(sceneColor);
    scene.fog = new T.Fog(sceneColor, 9, 16);
    const camera = new T.PerspectiveCamera(50, 1, 0.05, 40);

    scene.add(new T.AmbientLight(night ? "#c9c4e8" : "#ffe2c4", night ? 0.75 : 1.1));
    scene.add(new T.HemisphereLight(night ? "#d8d4f0" : "#fff1dc", "#5a3a24", night ? 0.6 : 0.9));
    const ceilingLight = new T.PointLight("#ffd9a8", night ? 7.5 : 6, 12, 1.4); ceilingLight.position.set(0, 3.2, 0); scene.add(ceilingLight);

    // sol, plafond, tapis
    const floor = new T.Mesh(new T.PlaneGeometry(ROOM * 2, ROOM * 2), new T.MeshStandardMaterial({ map: floorTex(), roughness: 0.8 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    const ceil = new T.Mesh(new T.PlaneGeometry(ROOM * 2, ROOM * 2), mat("#f1e4cf")); ceil.rotation.x = Math.PI / 2; ceil.position.y = 3.6; scene.add(ceil);
    const rug = new T.Mesh(new T.CircleGeometry(1.5, 48), new T.MeshStandardMaterial({ map: rugTex(), roughness: 1 }));
    rug.rotation.x = -Math.PI / 2; rug.position.y = 0.004; scene.add(rug);
    // suspension au plafond
    cyl(0.005, 0.005, 0.6, mat("#3b2a1e"), 0, 3.3, 0, scene, 6);
    const lampShade = new T.Mesh(new T.CylinderGeometry(0.16, 0.32, 0.26, 28, 1, true), new T.MeshStandardMaterial({ color: "#f6d79a", emissive: "#ffb85c", emissiveIntensity: 0.7, side: T.DoubleSide }));
    lampShade.position.set(0, 2.9, 0); scene.add(lampShade);

    // murs : un par étagère, chacun à ses couleurs
    const dir = (a) => new T.Vector3(Math.sin(a), 0, -Math.cos(a));
    KEYS.forEach((k, i) => {
      const a = i * QUARTER;
      const wall = new T.Mesh(new T.PlaneGeometry(ROOM * 2, 3.6), new T.MeshStandardMaterial({ map: wallTexture(THEMES[k]), roughness: 0.95 }));
      wall.position.copy(dir(a).multiplyScalar(ROOM)); wall.position.y = 1.8; wall.rotation.y = -a; scene.add(wall);
      const skirting = new T.Mesh(new T.BoxGeometry(ROOM * 2, 0.12, 0.03), mat("#f3e7d6"));
      skirting.position.copy(dir(a).multiplyScalar(ROOM - 0.015)); skirting.position.y = 0.06; skirting.rotation.y = -a; scene.add(skirting);
    });

    let cases = {};       // clé → { group, W, H }
    let pick = [];
    let yaw = 0, targetYaw = 0, zoom = 1, targetZoom = 1, panX = 0, panY = 0, targetPanX = 0, targetPanY = 0;
    let width = 1, height = 1, needs = true, raf = 0;

    function setBooks(map) {
      Object.values(cases).forEach((c) => {
        scene.remove(c.group);
        c.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      });
      cases = {}; pick = [];
      KEYS.forEach((k, i) => {
        const c = buildCase(k, map[k] || [], { pick, colorOf: opts.colorOf, textOn: opts.textOn, narrow: width / height < 0.8 });
        const a = i * QUARTER;
        c.group.position.copy(dir(a).multiplyScalar(R + DEPTH / 2));
        c.group.rotation.y = -a;
        scene.add(c.group);
        cases[k] = c;
      });
      kick();
    }
    function fitDistance(c) {
      const vf = (camera.fov * Math.PI) / 180;
      const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
      return Math.max((c.W / 2 + 0.25) / Math.tan(hf / 2), (c.H / 2 + 0.2) / Math.tan(vf / 2)) + DEPTH / 2;
    }
    const mod = (n, m) => ((n % m) + m) % m;
    function placeCamera() {
      const idx = yaw / QUARTER, i0 = Math.floor(idx), t = idx - i0;
      const c0 = cases[KEYS[mod(i0, 4)]], c1 = cases[KEYS[mod(i0 + 1, 4)]];
      if (!c0 || !c1) return;
      const D = (fitDistance(c0) * (1 - t) + fitDistance(c1) * t) * zoom;
      const off = Math.max(-(R - 0.4), R - D - 0.9 * Math.sin(Math.PI * t));
      const cy = (c0.H * (1 - t) + c1.H * t) / 2 + 0.05;
      const d = dir(yaw), right = new T.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
      const pos = d.clone().multiplyScalar(off).add(right.multiplyScalar(panX));
      pos.y = cy + panY;
      camera.position.copy(pos);
      camera.lookAt(pos.clone().add(dir(yaw)));
    }
    function frameLoop() {
      raf = 0;
      const now = performance.now(), dt = Math.min(200, now - (frameT || now - 16)); frameT = now;
      const ease = 1 - Math.pow(0.002, dt / 450);
      yaw += (targetYaw - yaw) * ease;
      zoom += (targetZoom - zoom) * ease;
      panX += (targetPanX - panX) * ease; panY += (targetPanY - panY) * ease;
      const moving = Math.abs(targetYaw - yaw) > 0.0005 || Math.abs(targetZoom - zoom) > 0.0005 || Math.abs(targetPanX - panX) > 0.0005 || Math.abs(targetPanY - panY) > 0.0005;
      if (!moving) { yaw = targetYaw; zoom = targetZoom; panX = targetPanX; panY = targetPanY; }
      placeCamera();
      renderer.render(scene, camera);
      if (moving || dragging) raf = requestAnimationFrame(frameLoop); else frameT = 0;
    }
    let frameT = 0;
    function kick() { if (!raf) raf = requestAnimationFrame(frameLoop); }
    function resize() {
      width = container.clientWidth || 1; height = container.clientHeight || 1;
      renderer.setSize(width, height, false);
      canvas.style.width = width + "px"; canvas.style.height = height + "px";
      camera.aspect = width / height; camera.updateProjectionMatrix();
      kick();
    }
    const ro = "ResizeObserver" in window ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(container); else window.addEventListener("resize", resize);

    const currentIndex = () => Math.round(targetYaw / QUARTER);
    const currentKey = () => KEYS[mod(currentIndex(), 4)];
    function face(key, instant) {
      const i = KEYS.indexOf(key);
      if (i < 0) return;
      const cur = currentIndex();
      let delta = mod(i - mod(cur, 4), 4); if (delta === 3) delta = -1;
      targetYaw = (cur + delta) * QUARTER;
      targetZoom = 1; targetPanX = 0; targetPanY = 0;
      if (instant) { yaw = targetYaw; zoom = 1; panX = panY = 0; }
      kick();
    }
    function step(n) {
      targetYaw = (currentIndex() + n) * QUARTER;
      targetZoom = 1; targetPanX = targetPanY = 0;
      kick();
      opts.onFace && opts.onFace(currentKey());
    }

    /* ---------- Gestes : glisser, pincer, toucher ---------- */
    const pointers = new Map();
    let dragging = false, moved = false, startX = 0, startY = 0, startYaw = 0, lastX = 0, lastT = 0, vel = 0, pinch0 = 0, zoom0 = 1, startPan = [0, 0];
    const zoomed = () => targetZoom < 0.93;
    function clampPan() {
      const c = cases[currentKey()]; if (!c) return;
      const lim = Math.max(0, (1 - targetZoom)) ;
      targetPanX = Math.max(-c.W / 2 * lim * 1.2, Math.min(c.W / 2 * lim * 1.2, targetPanX));
      targetPanY = Math.max(-c.H / 2 * lim * 1.2, Math.min(c.H / 2 * lim * 1.2, targetPanY));
    }
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); zoom0 = targetZoom; moved = true; return; }
      dragging = true; moved = false; startX = lastX = e.clientX; startY = e.clientY; startYaw = targetYaw; lastT = performance.now(); vel = 0;
      startPan = [targetPanX, targetPanY];
      opts.onInteract && opts.onInteract();
      kick();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        targetZoom = Math.max(0.4, Math.min(1, zoom0 * (pinch0 / d)));
        clampPan(); kick(); return;
      }
      if (!dragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
      if (zoomed()) {
        const k = (2 * Math.tan((camera.fov * Math.PI) / 360) * fitDistance(cases[currentKey()]) * targetZoom) / height;
        targetPanX = startPan[0] - dx * k; targetPanY = startPan[1] + dy * k; clampPan();
      } else {
        targetYaw = startYaw - (dx / Math.max(width, 320)) * QUARTER * 1.4;
        yaw = targetYaw;
        const now = performance.now(); vel = (e.clientX - lastX) / Math.max(1, now - lastT); lastX = e.clientX; lastT = now;
      }
      kick();
    });
    function end(e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size > 0) return;
      const wasDragging = dragging; dragging = false;
      if (!wasDragging) return;
      if (!moved) { tap(e); return; }
      if (!zoomed()) {
        const startIdx = Math.round(startYaw / QUARTER);
        let idx = Math.round(targetYaw / QUARTER);
        if (idx === startIdx && Math.abs(vel) > 0.4) idx = startIdx + (vel < 0 ? 1 : -1);
        idx = Math.max(startIdx - 1, Math.min(startIdx + 1, idx));
        targetYaw = idx * QUARTER;
        if (idx !== startIdx) { targetZoom = 1; targetPanX = targetPanY = 0; opts.onFace && opts.onFace(currentKey()); }
      }
      kick();
    }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      targetZoom = Math.max(0.4, Math.min(1, targetZoom * (1 + e.deltaY * 0.0015)));
      clampPan(); kick();
    }, { passive: false });
    const ray = new T.Raycaster();
    function tap(e) {
      const r = canvas.getBoundingClientRect();
      const p = new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(p, camera);
      const hit = ray.intersectObjects(pick, false)[0];
      if (hit && opts.onTap) opts.onTap(hit.object.userData.id);
    }

    resize();
    /* Pour les tests : position à l'écran d'un livre et état de la caméra */
    function debug(i) {
      const m = pick[i]; if (!m) return { yaw, targetYaw };
      const v = new T.Vector3(); m.getWorldPosition(v); v.project(camera);
      return { yaw, targetYaw, x: (v.x + 1) / 2 * width, y: (1 - v.y) / 2 * height, id: m.userData.id };
    }
    return { setBooks, face, step, resize, currentKey, canvas, debug };
  };
})();
