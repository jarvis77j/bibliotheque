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

  const BASE = JSON.parse(JSON.stringify(THEMES));
  /* Déco de chaque meuble : ce qui est affiché par défaut */
  const decoOf = (th) => ({ plantes: true, bougies: true, cadres: true, piles: true, fauteuil: true, lampe: true,
    lianes: th.jungle ? 2 : 0, grandes: !!th.jungle, guirlande: !!th.lights,
    suspensions: !!th.jungle, mousse: !!th.jungle, champignons: !!th.jungle, lanterne: !!th.jungle, lapin: false, fleurs: false, ...(th.deco || {}) });
  function applyThemes(over) {
    for (const k in BASE) {
      THEMES[k] = { ...BASE[k], ...((over || {})[k] || {}) };
      if (over && over[k] && over[k].wall && !over[k].wall2) THEMES[k].wall2 = shade(over[k].wall, -0.07);
    }
  }

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
    // murs en briques : la photo telle quelle, ou peinte de la couleur du mur
    if (th.pattern === "briques" && PHOTOS.briques) return canvasTex(512, 512, (g, w, h) => g.drawImage(PHOTOS.briques, 0, 0, w, h), [4.6, 2.2]);
    if (th.pattern === "briques-peintes" && PHOTOS["briques-gris"]) return canvasTex(512, 512, (g, w, h) => tinted(g, PHOTOS["briques-gris"], th.wall, w, h), [4.6, 2.2]);
    return canvasTex(256, 256, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, th.wall); grad.addColorStop(1, th.wall2);
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      // grain d'enduit, pour que le mur ne soit pas parfaitement lisse
      for (let i = 0; i < 1400; i++) { g.fillStyle = i % 2 ? "rgba(255,255,255,.035)" : "rgba(0,0,0,.04)"; g.fillRect((i * 73.13) % w, (i * 151.7) % h, 1 + (i % 3), 1 + (i % 2)); }
      g.globalAlpha = 0.18;
      if (th.pattern === "stripes") { g.fillStyle = "#fff"; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 3, h); g.fillStyle = "#000"; g.globalAlpha = 0.06; for (let x = 16; x < w; x += 32) g.fillRect(x, 0, 2, h); }
      if (th.pattern === "dots") { g.fillStyle = "#fff"; for (let y = 16; y < h; y += 32) for (let x = (y / 32) % 2 ? 0 : 16; x < w; x += 32) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); } }
      if (th.pattern === "panel") { g.strokeStyle = "#fff"; g.lineWidth = 3; g.strokeRect(20, 150, 216, 90); g.globalAlpha = 0.1; g.fillStyle = "#000"; g.fillRect(0, 140, w, 2); }
      if (th.pattern === "leaves") {
        g.globalAlpha = 0.16;
        for (let i = 0; i < 26; i++) {
          const x = (i * 97) % w, y = (i * 61) % h, a = (i * 1.7) % 6.3;
          g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = i % 2 ? "#9fc48a" : "#6d9a5c";
          g.beginPath(); g.moveTo(0, -18); g.bezierCurveTo(16, -14, 14, 10, 0, 18); g.bezierCurveTo(-14, 10, -16, -14, 0, -18); g.fill(); g.restore();
        }
      }
      if (th.pattern === "damask") { g.fillStyle = "#ffd9a0"; g.globalAlpha = 0.12; for (let y = 32; y < h; y += 64) for (let x = (y / 64) % 2 ? 0 : 32; x < w + 1; x += 64) { g.beginPath(); g.ellipse(x, y, 10, 18, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(x, y, 18, 6, 0, 0, 7); g.fill(); } }
    }, [6, 3]);
  }
  /* ---------- Photos de matières libres de droits (dossier textures/) ----------
     Bois et parquet viennent des exemples de three.js (licence MIT), en niveaux de gris :
     on les teinte avec la couleur choisie, donc une seule photo sert pour tous les bois. */
  const PHOTO_DIR = ((document.currentScript && document.currentScript.src) || "").replace(/[^/]*$/, "") + "textures/";
  const PHOTOS = {}, photoWaiters = [];
  const woodCache = new Map();
  ["bois", "parquet", "briques", "briques-gris"].forEach((n) => {
    const im = new Image();
    im.onload = () => { PHOTOS[n] = im; woodCache.clear(); photoWaiters.forEach((f) => f(n)); };
    im.src = PHOTO_DIR + n + ".jpg";
  });
  // la photo grise (moyenne à 50 %) mélangée en « incrustation » garde la couleur et ajoute le grain
  function tinted(g, img, base, w, h) {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "overlay"; g.drawImage(img, 0, 0, w, h);
    g.globalCompositeOperation = "source-over";
  }
  /* Bois : photo de planche teintée, ou à défaut veines dessinées */
  function woodTexture(base, rep) {
    const key = base + (rep || [1, 1]).join("x");
    if (woodCache.has(key)) return woodCache.get(key);
    let seed = parseInt(base.slice(1), 16) % 997;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const t = canvasTex(512, 512, (g, w, h) => {
      if (PHOTOS.bois) {
        // une seule planche de la photo, répétée en miroir et décalée : plus de joints sombres au milieu d'un chant
        g.fillStyle = base; g.fillRect(0, 0, w, h);
        g.globalCompositeOperation = "overlay"; g.globalAlpha = 0.85;
        const bh = h / 4, sx = PHOTOS.bois.width, sy = PHOTOS.bois.height / 4;
        for (let k = 0; k < 4; k++) {
          const off = (k * 0.37 % 1) * w;
          g.save(); g.translate(0, k * bh + (k % 2 ? bh : 0)); g.scale(1, k % 2 ? -1 : 1);
          g.drawImage(PHOTOS.bois, 0, 3, sx, sy - 6, -off, 0, w, bh); g.drawImage(PHOTOS.bois, 0, 3, sx, sy - 6, w - off, 0, w, bh);
          g.restore();
        }
        g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
        return;
      }
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 6; i++) { g.fillStyle = rnd() > 0.5 ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.05)"; g.fillRect(0, rnd() * h, w, 20 + rnd() * 60); }
      for (let i = 0; i < 170; i++) {
        const y = rnd() * h, a = 2 + rnd() * 6, f = 1 + rnd() * 3, ph = rnd() * 6;
        g.strokeStyle = rnd() > 0.3 ? `rgba(0,0,0,${0.04 + rnd() * 0.09})` : `rgba(255,255,255,${0.03 + rnd() * 0.05})`;
        g.lineWidth = 0.6 + rnd() * 1.8; g.beginPath();
        for (let x = 0; x <= w; x += 8) { const yy = y + Math.sin(x / w * Math.PI * f + ph) * a; x ? g.lineTo(x, yy) : g.moveTo(x, yy); }
        g.stroke();
      }
      for (let k = 0; k < 2; k++) {
        const x = rnd() * w, y = rnd() * h;
        for (let r = 14; r > 2; r -= 3) { g.strokeStyle = `rgba(0,0,0,${0.12 - r / 200})`; g.lineWidth = 1.2; g.beginPath(); g.ellipse(x, y, r * 2.2, r * 0.7, 0, 0, 7); g.stroke(); }
      }
    }, rep || [1, 1]);
    woodCache.set(key, t);
    return t;
  }
  /* Fond du meuble en lames verticales : bois teinté tourné d'un quart, rainure sombre entre deux lames */
  const plankCache = new Map();
  function plankTexture(base) {
    const key = base + !!PHOTOS.bois;
    if (plankCache.has(key)) return plankCache.get(key);
    const t = canvasTex(512, 512, (g, w, h) => {
      g.save(); g.translate(w, 0); g.rotate(Math.PI / 2); g.drawImage(woodTexture(base).image, 0, 0, h, w); g.restore();
      const n = 5, lw = w / n;
      for (let i = 0; i < n; i++) {
        const x = i * lw;
        g.fillStyle = (i * 0.61) % 1 > 0.5 ? `rgba(255,235,210,${0.03 + (i % 2) * 0.03})` : `rgba(0,0,0,${0.05 + (i % 3) * 0.04})`; g.fillRect(x, 0, lw, h);
        const gr = g.createLinearGradient(x, 0, x + 7, 0); gr.addColorStop(0, "rgba(0,0,0,.6)"); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr; g.fillRect(x, 0, 7, h);
        g.fillStyle = "rgba(255,240,220,.1)"; g.fillRect(x + lw - 2, 0, 2, h);
      }
    }, [1, 1]);
    plankCache.set(key, t);
    return t;
  }
  /* Fusionne plusieurs géométries en une : toute la structure d'un meuble se dessine en un seul appel */
  function mergeGeos(list) {
    const out = new T.BufferGeometry(), parts = { position: [], normal: [], uv: [] };
    list.forEach((g0) => {
      const g1 = g0.index ? g0.toNonIndexed() : g0;
      for (const k in parts) parts[k].push(g1.attributes[k].array);
      if (g1 !== g0) g1.dispose(); g0.dispose();
    });
    for (const k in parts) {
      const arr = new Float32Array(parts[k].reduce((s, a) => s + a.length, 0)); let o = 0;
      parts[k].forEach((a) => { arr.set(a, o); o += a.length; });
      out.setAttribute(k, new T.BufferAttribute(arr, k === "uv" ? 2 : 3));
    }
    return out;
  }
  // rectangle aux coins arrondis (rayons dans l'ordre : a0b0, a1b0, a1b1, a0b1)
  function roundRect(a0, b0, a1, b1, r) {
    const s = new T.Shape(), [r0, r1, r2, r3] = r;
    s.moveTo(a0 + r0, b0);
    s.lineTo(a1 - r1, b0); if (r1) s.quadraticCurveTo(a1, b0, a1, b0 + r1);
    s.lineTo(a1, b1 - r2); if (r2) s.quadraticCurveTo(a1, b1, a1 - r2, b1);
    s.lineTo(a0 + r3, b1); if (r3) s.quadraticCurveTo(a0, b1, a0, b1 - r3);
    s.lineTo(a0, b0 + r0); if (r0) s.quadraticCurveTo(a0, b0, a0 + r0, b0);
    return s;
  }
  /* Profilé : une section tirée sur une longueur, le fil du bois dans la longueur.
     "x" : pièce horizontale, section en (z, y) ; "y" : pièce verticale, section en (x, z). */
  function rail(shape, len, axis, x, y, z, segs) {
    const geo = new T.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, curveSegments: segs || 3 });
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, (1 - v) / 0.9 + x * 0.37 + y * 0.53, u / 0.45); }
    if (axis === "y") geo.rotateX(Math.PI / 2).translate(x, y + len, z);
    else geo.rotateY(-Math.PI / 2).translate(x + len / 2, y, z);
    return geo;
  }
  const floorTex = (base) => PHOTOS.parquet ? canvasTex(1024, 512, (g, w, h) => {
    tinted(g, PHOTOS.parquet, base || "#9a6840", w, h);
  }, [4, 8]) : canvasTex(512, 512, (g, w, h) => {
    const plank = 64;
    for (let y = 0; y < h; y += plank) {
      const off = (y / plank) % 2 ? 160 : 0;
      for (let x = -off; x < w; x += 320) {
        const tone = (base ? [base, shade(base, -0.03), shade(base, 0.03), shade(base, -0.05)] : ["#93603a", "#8a5833", "#9c6840", "#85532f"])[((x + y) / 64 & 3) >>> 0];
        g.fillStyle = tone; g.fillRect(x, y, 320, plank);
        // veines du parquet
        for (let k = 0; k < 14; k++) {
          const yy = y + 3 + ((k * 37 + x * 7 + y) % (plank - 6)), amp = 1 + (k % 3), ph = (x + k * 13) / 40;
          g.strokeStyle = k % 4 ? "rgba(0,0,0,.07)" : "rgba(255,255,255,.06)"; g.lineWidth = 0.8 + (k % 2);
          g.beginPath(); for (let xx = 0; xx <= 320; xx += 10) { const py = yy + Math.sin(xx / 60 + ph) * amp; xx ? g.lineTo(x + xx, py) : g.moveTo(x, py); } g.stroke();
        }
        g.fillStyle = "rgba(0,0,0,.3)"; g.fillRect(x, y, 2, plank);
      }
      g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(0, y, w, 2);
    }
  }, [4, 4]);
  /* Tapis kilim : motifs en escalier tissés point par point (couleurs un peu passées, bandes d'« abrash »), trame visible */
  const rugTex = () => canvasTex(1040, 800, (g, w, h) => {
    let s = 9; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const C = 8, NX = w / C, NY = h / C;
    const col = { red: [160, 82, 62], rose: [184, 112, 88], ink: [68, 76, 94], ochre: [196, 150, 88], cream: [226, 210, 180], brown: [86, 58, 44], green: [110, 120, 88] };
    // bordure : rangée de losanges sur fond indigo, encadrée de filets
    const border = (t, d) => {
      if (d < 2) return "brown";
      if (d < 3) return "cream";
      if (d < 4) return "ochre";
      if (d < 16) { const a = ((t % 14) + 14) % 14 - 7, b = d - 9.5, m = Math.abs(a) + Math.abs(b) * 1.1; return m < 2 ? "red" : m < 4 ? "ochre" : m < 5.2 ? "cream" : "ink"; }
      if (d < 17) return "cream";
      if (d < 18) return "red";
      if (d < 19) return "cream";
      return null;
    };
    const cx0 = NX / 2, cy0 = NY / 2;
    for (let j = 0; j < NY; j++) {
      const abrash = 1 + (Math.sin(j * 0.21) * 0.04 + Math.sin(j * 0.057 + 1) * 0.05);
      for (let i = 0; i < NX; i++) {
        const d = Math.min(i, j, NX - 1 - i, NY - 1 - j);
        let c = border(d === i || d === NX - 1 - i ? j : i, d);
        if (!c) {
          // champ rouge : trois médaillons en losange à gradins, petites croix semées autour
          const fx = i - cx0, fy = j - cy0;
          let near = 9;
          c = "red";
          [-30, 0, 30].forEach((ox, k) => {
            const m = Math.abs(fx - ox) / 12 + Math.abs(fy) / 26;
            near = Math.min(near, m);
            if (m < 1) { const ring = Math.floor(m * 6); c = k === 1 ? ["cream", "ink", "ochre", "cream", "ink", "cream"][ring] : ["ochre", "cream", "green", "cream", "rose", "cream"][ring]; }
          });
          const px = (i + 5) % 10, py = (j + 4) % 10;
          if (near > 1.12 && ((px === 5 && py > 2 && py < 8) || (py === 5 && px > 2 && px < 8))) c = (i + j) % 20 < 10 ? "cream" : "ochre";
        }
        const [r, gg, b] = col[c], f = abrash * (0.95 + rnd() * 0.08);
        g.fillStyle = `rgb(${r * f | 0},${gg * f | 0},${b * f | 0})`; g.fillRect(i * C, j * C, C, C);
      }
    }
    // trame : chaque point est un petit grain de laine
    for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += C) { g.fillStyle = "rgba(255,255,255,.08)"; g.fillRect(x + 1, y, C - 2, 2); g.fillStyle = "rgba(0,0,0,.12)"; g.fillRect(x, y + 3, C, 1); }
    // laine usée par endroits
    for (let i = 0; i < 26; i++) { const x = rnd() * w, y = rnd() * h, r = 30 + rnd() * 90, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, "rgba(225,205,175,.07)"); gr.addColorStop(1, "rgba(240,225,200,0)"); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  });

  /* Tranche d'un livre : dos arrondi, grain, usure, nervures ou filets dorés selon le genre de reliure, titre à la verticale.
     Quatre reliures tirées au sort d'après l'identifiant : broché, relié à nervures, relié moderne, étiquette. */
  const spineCache = new Map();
  const goldFill = (g, x0, x1) => { const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, "#8a6526"); gr.addColorStop(0.45, "#f2d78c"); gr.addColorStop(0.6, "#d6b260"); gr.addColorStop(1, "#7d5a20"); return gr; };
  function spineTexture(b, color, ink) {
    const key = b.id + "|" + color + "|" + b.title + "|" + (b.tome || "") + "|" + !!b.fav;
    if (spineCache.has(key)) return spineCache.get(key);
    const hb = hash(b.id || b.title), kind = hb % 4;
    // titre doré seulement sur une couverture bien sombre, sinon il resterait illisible
    const n = parseInt(color.slice(1), 16), lum = (0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255;
    const light = ink !== "#1d1410" && lum < 0.33;
    const tex = canvasTex(96, 576, (g, w, h) => {
      g.fillStyle = color; g.fillRect(0, 0, w, h);
      // grain de la toile ou du papier
      for (let i = 0; i < 900; i++) { g.fillStyle = i % 2 ? "rgba(255,255,255,.045)" : "rgba(0,0,0,.055)"; g.fillRect((i * 37.7 + (hb % 13)) % w, (i * 97.3) % h, 1, 1 + (i % 4)); }
      if (kind !== 0) for (let y = 0; y < h; y += 3) { g.fillStyle = "rgba(0,0,0,.035)"; g.fillRect(0, y, w, 1); } // trame de la toile
      const gold = kind === 1 || kind === 2 || (kind === 3 && light);
      const filet = (y, t) => { g.fillStyle = gold ? goldFill(g, 0, w) : ink; g.globalAlpha = gold ? 0.9 : 0.45; g.fillRect(4, y, w - 8, t); g.globalAlpha = 1; };
      let top = 40, bot = h - 40;
      if (kind === 1) {
        // nervures : bourrelets en relief, éclairés par le haut
        [58, 118, h - 150, h - 90].forEach((y) => {
          const n = g.createLinearGradient(0, y - 8, 0, y + 10);
          n.addColorStop(0, "rgba(0,0,0,.35)"); n.addColorStop(0.3, "rgba(255,255,255,.22)"); n.addColorStop(0.6, "rgba(0,0,0,0)"); n.addColorStop(1, "rgba(0,0,0,.42)");
          g.fillStyle = n; g.fillRect(0, y - 8, w, 18);
          filet(y - 10, 2); filet(y + 11, 2);
        });
        top = 132; bot = h - 162;
      } else if (kind === 2) {
        // bandes plus sombres en tête et en queue, bordées d'un filet doré
        g.fillStyle = "rgba(0,0,0,.28)"; g.fillRect(0, 0, w, 64); g.fillRect(0, h - 64, w, 64);
        filet(64, 3); filet(70, 1); filet(h - 67, 3); filet(h - 71, 1);
        top = 86; bot = h - 86;
      } else if (kind === 3) {
        // étiquette de titre, plus claire ou plus sombre que la couverture, cernée d'un filet
        g.fillStyle = light ? "rgba(0,0,0,.3)" : "rgba(255,250,235,.35)"; g.fillRect(10, 60, w - 20, h - 150);
        g.strokeStyle = gold ? goldFill(g, 0, w) : ink; g.globalAlpha = 0.6; g.lineWidth = 2; g.strokeRect(14, 64, w - 28, h - 158); g.globalAlpha = 1;
        top = 80; bot = h - 100;
      } else { filet(30, 3); filet(h - 34, 3); top = 48; bot = h - 54; }
      // dos arrondi : ombre sur les bords, reflet un peu décalé vers la gauche
      const sh = g.createLinearGradient(0, 0, w, 0);
      sh.addColorStop(0, "rgba(0,0,0,.5)"); sh.addColorStop(0.1, "rgba(0,0,0,.12)"); sh.addColorStop(0.32, "rgba(255,255,255,.16)"); sh.addColorStop(0.45, "rgba(255,255,255,.1)");
      sh.addColorStop(0.75, "rgba(0,0,0,.04)"); sh.addColorStop(0.92, "rgba(0,0,0,.22)"); sh.addColorStop(1, "rgba(0,0,0,.5)");
      g.fillStyle = sh; g.fillRect(0, 0, w, h);
      // usure : coiffes frottées en tête et en queue, quelques éraflures claires
      const wear = g.createLinearGradient(0, 0, 0, h);
      wear.addColorStop(0, "rgba(0,0,0,.35)"); wear.addColorStop(0.012, "rgba(255,255,255,.12)"); wear.addColorStop(0.03, "rgba(0,0,0,0)");
      wear.addColorStop(0.97, "rgba(0,0,0,0)"); wear.addColorStop(0.988, "rgba(255,255,255,.1)"); wear.addColorStop(1, "rgba(0,0,0,.4)");
      g.fillStyle = wear; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 6; i++) { const r = rr(hb + i); g.fillStyle = `rgba(255,255,255,${0.04 + r * 0.06})`; g.fillRect(r * w, rr(hb * 3 + i) * h, 1, 6 + r * 30); }
      // titre et auteur à la verticale, légèrement frappés dans la couverture
      g.save(); g.translate(w / 2, top); g.rotate(Math.PI / 2);
      const title = b.title.length > 42 ? b.title.slice(0, 40) + "…" : b.title;
      const author = b.authors && b.authors[0] ? b.authors[0] : "";
      const room = bot - top - (b.tome ? 40 : 0) - (b.fav ? 30 : 0);
      let size = 40;
      const face = kind === 0 ? "Helvetica, Arial, sans-serif" : "Georgia, serif";
      g.font = `bold ${size}px ${face}`;
      while (size > 18 && g.measureText(title).width + (author ? 150 : 0) > room) { size -= 2; g.font = `bold ${size}px ${face}`; }
      if (gold && light) { const gr = g.createLinearGradient(0, -size / 2, 0, size / 2); gr.addColorStop(0, "#f6dd94"); gr.addColorStop(0.5, "#d4ad58"); gr.addColorStop(1, "#9a7330"); g.fillStyle = gr; } else g.fillStyle = ink;
      const txt = g.fillStyle;
      g.textBaseline = "middle";
      g.fillStyle = ink !== "#1d1410" ? "rgba(0,0,0,.45)" : "rgba(255,255,255,.25)"; g.fillText(title, 1, 1.5);
      g.fillStyle = txt; g.fillText(title, 0, 0);
      if (author) {
        const tw = g.measureText(title).width;
        g.font = `${Math.max(16, size - 12)}px ${face}`; g.globalAlpha = 0.85;
        let a = author; while (a.length > 3 && g.measureText(a).width > room - tw - 22) a = a.slice(0, -2);
        g.fillText(a === author ? a : a + "…", tw + 20, 0);
      }
      g.restore();
      g.textAlign = "center"; g.textBaseline = "middle";
      if (b.fav) { g.fillStyle = "#e8c04a"; g.font = "30px serif"; g.fillText("♥", w / 2, bot - 14); }
      if (b.tome) { g.fillStyle = gold && light ? goldFill(g, 20, w - 20) : ink; g.font = "bold 30px Georgia, serif"; g.fillText(String(b.tome), w / 2, bot - (b.fav ? 50 : 18)); }
    });
    spineCache.set(key, tex);
    return tex;
  }

  /* ---------- Matériaux partagés ---------- */
  const woodMat = (c) => new T.MeshStandardMaterial({ map: woodTexture(c, [1, 1]), roughness: 0.6 });
  const matCache = new Map();
  function mat(color, opts) {
    const key = color + JSON.stringify(opts || {});
    if (!matCache.has(key)) matCache.set(key, new T.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...(opts || {}) }));
    return matCache.get(key);
  }
  // tranche des pages : fines lignes, un peu jaunies
  // feuillets fins d'épaisseur irrégulière, papier plus jauni et plus sombre près des couvertures
  const pagesTex = canvasTex(128, 128, (g, w, h) => {
    const rr = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
    g.fillStyle = "#efe5cf"; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) { const r = rr(y * 7.1); g.fillStyle = r > 0.55 ? `rgba(110,80,45,${0.05 + r * 0.1})` : `rgba(255,252,240,${r * 0.25})`; g.fillRect(0, y, w, 1); }
    for (let i = 0; i < 40; i++) { const r = rr(i * 3.3 + 1); g.fillStyle = "rgba(110,80,45,.06)"; g.fillRect(r * w, rr(i + 9) * h, 6 + r * 30, 1); }
    const e = g.createLinearGradient(0, 0, 0, h);
    e.addColorStop(0, "rgba(90,60,30,.35)"); e.addColorStop(0.08, "rgba(150,110,60,.08)"); e.addColorStop(0.5, "rgba(0,0,0,0)"); e.addColorStop(0.92, "rgba(150,110,60,.08)"); e.addColorStop(1, "rgba(90,60,30,.35)");
    g.fillStyle = e; g.fillRect(0, 0, w, h);
    const s2 = g.createLinearGradient(0, 0, w, 0); s2.addColorStop(0, "rgba(120,85,40,.12)"); s2.addColorStop(0.15, "rgba(0,0,0,0)"); s2.addColorStop(0.85, "rgba(0,0,0,0)"); s2.addColorStop(1, "rgba(120,85,40,.12)");
    g.fillStyle = s2; g.fillRect(0, 0, w, h);
  });
  const pagesMat = new T.MeshStandardMaterial({ map: pagesTex, roughness: 0.92, envMapIntensity: 0.6 });
  const box = (w, h, d, m, x, y, z, parent) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x, y, z); parent.add(o); return o; };
  const cyl = (rt, rb, h, m, x, y, z, parent, seg) => { const o = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg || 20), m); o.position.set(x, y, z); parent.add(o); return o; };
  const ball = (r, m, x, y, z, parent) => { const o = new T.Mesh(new T.SphereGeometry(r, 16, 12), m); o.position.set(x, y, z); parent.add(o); return o; };

  /* ---------- Petits objets ---------- */
  /* Feuilles dessinées (cœur de pothos, lame de sansevieria, feuille de monstera) posées sur des plans transparents */
  function monsteraTexture(c1, c2) {
    return canvasTex(256, 256, (g, w, h) => {
      const cx = 128;
      g.beginPath(); g.moveTo(cx, 250);
      g.bezierCurveTo(30, 240, 0, 140, 22, 70); g.bezierCurveTo(40, 22, 100, 6, cx, 30);
      g.bezierCurveTo(156, 6, 216, 22, 234, 70); g.bezierCurveTo(256, 140, 226, 240, cx, 250); g.closePath();
      const grad = g.createLinearGradient(0, 0, w, h); grad.addColorStop(0, c1); grad.addColorStop(1, c2);
      g.fillStyle = grad; g.fill();
      g.save(); g.clip();
      const rg = g.createRadialGradient(cx, 150, 10, cx, 140, 140); rg.addColorStop(0, "rgba(255,255,220,.16)"); rg.addColorStop(1, "rgba(0,0,0,.32)");
      g.fillStyle = rg; g.fillRect(0, 0, w, h);
      g.restore();
      // découpes : fentes depuis le bord vers la nervure, et petits trous ovales près du centre
      g.globalCompositeOperation = "destination-out";
      for (let i = 0; i < 6; i++) {
        const yy = 70 + i * 28, k = 1 - i * 0.08;
        [-1, 1].forEach((sd) => {
          g.lineWidth = 7 - i * 0.4; g.beginPath(); g.moveTo(cx + sd * 34, yy + 8); g.quadraticCurveTo(cx + sd * 70, yy - 4, cx + sd * 130 * k, yy - 22); g.stroke();
          if (i > 0 && i < 5) { g.beginPath(); g.ellipse(cx + sd * 26, yy - 4, 4, 9, sd * 0.6, 0, 7); g.fill(); }
        });
      }
      g.globalCompositeOperation = "source-over";
      g.strokeStyle = "rgba(220,240,180,.45)"; g.lineWidth = 4; g.beginPath(); g.moveTo(cx, 248); g.quadraticCurveTo(cx - 4, 140, cx, 34); g.stroke();
      g.lineWidth = 1.5; g.strokeStyle = "rgba(220,240,180,.2)";
      for (let i = 0; i < 6; i++) { const yy = 84 + i * 28; [-1, 1].forEach((sd) => { g.beginPath(); g.moveTo(cx, yy + 8); g.quadraticCurveTo(cx + sd * 50, yy, cx + sd * 100, yy - 12); g.stroke(); }); }
    });
  }
  function leafTexture(kind, c1, c2) {
    return canvasTex(128, 128, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, w, h); grad.addColorStop(0, c1); grad.addColorStop(1, c2);
      g.fillStyle = grad; g.beginPath();
      if (kind === "heart") { g.moveTo(64, 124); g.bezierCurveTo(10, 86, 4, 30, 34, 14); g.bezierCurveTo(50, 6, 60, 14, 64, 26); g.bezierCurveTo(68, 14, 78, 6, 94, 14); g.bezierCurveTo(124, 30, 118, 86, 64, 124); }
      else if (kind === "blade") { g.moveTo(64, 126); g.bezierCurveTo(40, 90, 46, 30, 64, 2); g.bezierCurveTo(82, 30, 88, 90, 64, 126); }
      else { g.ellipse(64, 66, 58, 56, 0, 0, 7); }
      g.fill();
      if (kind === "heart") {
        // plus clair le long de la nervure, bords plus sombres, quelques stries claires comme un vrai pothos
        g.save(); g.clip();
        const rg = g.createRadialGradient(60, 60, 6, 64, 70, 70); rg.addColorStop(0, "rgba(255,255,220,.22)"); rg.addColorStop(0.6, "rgba(0,0,0,0)"); rg.addColorStop(1, "rgba(0,0,0,.35)");
        g.fillStyle = rg; g.fillRect(0, 0, w, h);
        if (c1 === "#8fae5a" || c1 === "#5f8f45") for (let i = 0; i < 7; i++) { g.strokeStyle = "rgba(235,225,150,.28)"; g.lineWidth = 2 + (i % 3); g.beginPath(); g.moveTo(64 + (i - 3) * 4, 118); g.quadraticCurveTo(64 + (i - 3) * 14, 70, 64 + (i - 3) * 9, 20); g.stroke(); }
        g.restore();
        g.strokeStyle = "rgba(225,245,190,.4)"; g.lineWidth = 2; g.beginPath(); g.moveTo(64, 120); g.quadraticCurveTo(62, 70, 64, 26); g.stroke();
        g.lineWidth = 1.1; g.strokeStyle = "rgba(225,245,190,.22)";
        for (let i = 1; i < 5; i++) { const y = 40 + i * 17; [-1, 1].forEach((k) => { g.beginPath(); g.moveTo(64, y); g.quadraticCurveTo(64 + k * 22, y - 4, 64 + k * 38, y - 18); g.stroke(); }); }
        return;
      }
      if (kind === "monstera") { g.globalCompositeOperation = "destination-out"; for (let i = 0; i < 5; i++) { const a = -0.9 + i * 0.45; g.lineWidth = 7; g.beginPath(); g.moveTo(64 + Math.cos(a) * 30, 66 + Math.sin(a) * 30); g.lineTo(64 + Math.cos(a) * 64, 66 + Math.sin(a) * 64); g.stroke(); g.beginPath(); g.moveTo(64 - Math.cos(a) * 30, 66 + Math.sin(a) * 30); g.lineTo(64 - Math.cos(a) * 64, 66 + Math.sin(a) * 64); g.stroke(); } g.globalCompositeOperation = "source-over"; }
      g.strokeStyle = "rgba(230,255,200,.35)"; g.lineWidth = 2; g.beginPath(); g.moveTo(64, kind === "blade" ? 120 : 118); g.lineTo(64, kind === "blade" ? 10 : 24); g.stroke();
      if (kind === "blade") { g.strokeStyle = "rgba(220,240,180,.25)"; for (let y = 20; y < 120; y += 14) { g.beginPath(); g.moveTo(52, y); g.lineTo(76, y + 6); g.stroke(); } }
      else { g.lineWidth = 1.2; for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(64, 30 + i * 18); g.lineTo(30, 20 + i * 18); g.moveTo(64, 30 + i * 18); g.lineTo(98, 20 + i * 18); g.stroke(); } }
    });
  }
  const leafMat = (kind, c1, c2) => new T.MeshStandardMaterial({ map: leafTexture(kind, c1, c2), alphaTest: 0.5, side: T.DoubleSide, roughness: 0.6 });
  const LEAVES = {
    heart: [leafMat("heart", "#4f7f3a", "#2c5424"), leafMat("heart", "#8fae5a", "#4c7a34"), leafMat("heart", "#3b6a30", "#1f421b"), leafMat("heart", "#5f8f45", "#335e28")],
    blade: [leafMat("blade", "#4c7a3c", "#2a4d24"), leafMat("blade", "#6f9a4a", "#3d6a2e")],
    monstera: [["#3f6f34", "#1d4219"], ["#4f8040", "#264f20"], ["#35602c", "#183a15"]].map(([a, b]) => new T.MeshStandardMaterial({ map: monsteraTexture(a, b), alphaTest: 0.5, side: T.DoubleSide, roughness: 0.45 })),
  };
  /* Ombre douce dans chaque case (occlusion simulée), deux moitiés :
     à gauche le fond de la case (sombre sous le rayon du dessus et dans les coins), à droite le dessus d'un rayon (sombre vers le fond) */
  const aoMat = new T.MeshBasicMaterial({ map: canvasTex(256, 128, (g, w, h) => {
    const k = (a) => `rgba(28,14,6,${a})`, half = w / 2;
    const grad = (x0, y0, x1, y1, stops) => { const gr = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, a]) => gr.addColorStop(o, k(a))); return gr; };
    g.fillStyle = grad(0, 0, 0, h, [[0, 0.7], [0.12, 0.38], [0.4, 0.12], [0.8, 0.06], [0.94, 0.18], [1, 0.42]]); g.fillRect(0, 0, half, h);
    g.fillStyle = grad(half, 0, half, h, [[0, 0.62], [0.18, 0.3], [0.5, 0.08], [1, 0]]); g.fillRect(half, 0, half, h);
    [0, half].forEach((x0) => { g.fillStyle = grad(x0, 0, x0 + half, 0, [[0, 0.42], [0.035, 0.08], [0.07, 0], [0.93, 0], [0.965, 0.08], [1, 0.42]]); g.fillRect(x0, 0, half, h); });
  }), transparent: true, depthWrite: false });
  const leafPlane = new T.PlaneGeometry(0.1, 0.1); leafPlane.translate(0, 0.05, 0);
  const pots = ["#b5653f", "#d9d2c4", "#2f2f2f", "#c9a07a", "#7d8f7a"];
  function plant(parent, x, y, z, s, kind) {
    const g = new T.Group(); g.position.set(x, y, z); g.scale.setScalar(s || 1); parent.add(g);
    const seed = Math.round(Math.abs(x * 97 + y * 31 + z * 13) * 10);
    const potC = pots[seed % pots.length];
    cyl(0.075, 0.06, 0.13, mat(potC, { roughness: 0.6 }), 0, 0.065, 0, g, 24);
    cyl(0.068, 0.068, 0.01, mat("#3a2a1c"), 0, 0.125, 0, g, 20);
    if (kind !== "pothos" && seed % 2) { // sansevieria : longues lames dressées
      for (let i = 0; i < 9; i++) {
        const l = new T.Mesh(leafPlane, LEAVES.blade[i % 2]); const a = i * 2.4;
        l.position.set(Math.cos(a) * 0.03, 0.12, Math.sin(a) * 0.03); l.scale.set(0.55, 2.2 + (i % 3) * 0.5, 1);
        l.rotation.set(Math.sin(a) * 0.18, a, Math.cos(a) * 0.18); g.add(l);
      }
    } else { // pothos en boule, quelques feuilles qui retombent
      for (let i = 0; i < 26; i++) {
        const l = new T.Mesh(leafPlane, LEAVES.heart[i % 4]); const a = i * 2.39, r = 0.015 + (i % 5) * 0.016;
        l.position.set(Math.cos(a) * r, 0.125 + (i % 4) * 0.022, Math.sin(a) * r); l.scale.setScalar(0.85 + (i % 3) * 0.2);
        l.rotation.set(-0.9 + (i % 4) * 0.35, -a + Math.PI / 2, 0, "YXZ"); g.add(l);
      }
    }
    return g;
  }
  /* Jungle : lianes de pothos (feuilles en cœur) */
  const leafGeo = leafPlane;
  const leafMats = LEAVES.heart;
  /* Une liane qui tombe : des feuilles le long d'une courbe, regroupées pour rester léger sur un vieux téléphone */
  const rr = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
  const stemMat = new T.MeshStandardMaterial({ color: "#56703a", roughness: 0.8 });
  function vines(parent, list) {
    const per = leafMats.map(() => []);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), sc = new T.Vector3();
    const tg = new T.Vector3();
    list.forEach((spec, vi) => {
      let pts, seed, big, yaw = 0;
      if (Array.isArray(spec[0])) { [pts, seed, big, yaw] = spec; pts = pts.map((p) => new T.Vector3(p[0], p[1], p[2])); }
      else { // ancienne forme : liane qui tombe tout droit d'un point
        const [x, y, z, len] = spec; seed = spec[4]; big = spec[5];
        const N = Math.max(3, Math.round(len / 0.1)); pts = [];
        for (let i = 0; i <= N; i++) { const t = i / N; pts.push(new T.Vector3(x + Math.sin(t * 3.2 + seed) * 0.045, y - t * len, z + Math.sin(t * 2.1 + seed * 1.7) * 0.02 + t * 0.025)); }
      }
      big = big || 1; yaw = yaw || 0;
      const curve = new T.CatmullRomCurve3(pts), len = curve.getLength();
      parent.add(new T.Mesh(new T.TubeGeometry(curve, Math.max(8, Math.round(len * 40)), 0.0022 * big, 3, false), stemMat));
      // feuilles alternées, espacées irrégulièrement, de plus en plus petites vers le bout
      let t = 0.02, i = 0;
      while (t < 0.99) {
        const r = rr(seed * 97 + i), side = i % 2 ? 1 : -1, p = curve.getPointAt(t);
        curve.getTangentAt(t, tg);
        const k = (1.1 - t * 0.45) * (0.8 + r * 0.6) * big;
        if (tg.y < -0.55) { // partie qui pend : la feuille pend sous son pétiole, tournée vers l'extérieur
          v.set(p.x + side * 0.01 * k * Math.cos(yaw), p.y + 0.004, p.z + 0.004 - side * 0.01 * k * Math.sin(yaw));
          e.set(Math.PI + 0.35 + r * 0.6, yaw + side * (0.35 + r * 0.7), side * (0.25 + rr(i + seed) * 0.5), "YXZ");
        } else { // partie posée sur le meuble : feuilles couchées
          v.set(p.x, p.y + 0.006, p.z);
          e.set(-Math.PI / 2 + 0.25 + r * 0.3, Math.atan2(tg.x, tg.z) + side * (0.9 + r * 0.6), 0, "YXZ");
        }
        m4.compose(v, q.setFromEuler(e), sc.set(k, k * (0.9 + r * 0.2), k));
        per[Math.floor(rr(seed + i * 3.1) * leafMats.length)].push(m4.clone());
        t += ((0.036 + r * 0.04) * big) / len; i++;
      }
    });
    per.forEach((ms, i) => {
      if (!ms.length) return;
      const im = new T.InstancedMesh(leafGeo, leafMats[i], ms.length);
      ms.forEach((m, j) => im.setMatrixAt(j, m));
      parent.add(im);
    });
  }
  /* Grande plante posée au sol, à côté du meuble */
  function bigPlant(parent, x, z, s) {
    const g = new T.Group(); g.position.set(x, 0, z); g.scale.setScalar(s || 1); parent.add(g);
    cyl(0.17, 0.13, 0.32, mat("#b5653f", { roughness: 0.8 }), 0, 0.16, 0, g, 28);
    cyl(0.18, 0.18, 0.04, mat("#a85b38", { roughness: 0.8 }), 0, 0.31, 0, g, 28);
    cyl(0.16, 0.16, 0.02, mat("#3a2a1c", { roughness: 1 }), 0, 0.32, 0, g, 24);
    const stem = new T.MeshStandardMaterial({ color: "#4d6b34", roughness: 0.7 });
    for (let i = 0; i < 13; i++) {
      const a = i * 2.39 + 0.3, h = 0.45 + rr(i + 3) * 0.55, out = 0.12 + rr(i + 7) * 0.32;
      // tige qui monte puis s'incline vers l'extérieur
      const p0 = new T.Vector3(Math.cos(a) * 0.03, 0.32, Math.sin(a) * 0.03);
      const p1 = new T.Vector3(Math.cos(a) * out * 0.3, 0.32 + h * 0.6, Math.sin(a) * out * 0.3);
      const p2 = new T.Vector3(Math.cos(a) * out, 0.32 + h, Math.sin(a) * out);
      const c = new T.QuadraticBezierCurve3(p0, p1, p2);
      g.add(new T.Mesh(new T.TubeGeometry(c, 10, 0.007, 5, false), stem));
      const lf = new T.Mesh(leafPlane, LEAVES.monstera[i % 3]);
      lf.position.copy(p2);
      lf.scale.setScalar(2.4 + rr(i + 11) * 1.4);
      // la feuille part du bout de la tige, penchée vers l'extérieur et un peu vers le bas
      lf.rotation.set(-0.5 - rr(i + 5) * 0.7, -a + Math.PI / 2, (rr(i) - 0.5) * 0.4, "YXZ");
      g.add(lf);
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
  /* Fauteuil rembourré : pieds fuselés, accoudoirs ronds, coussins bombés avec passepoil, coussin et plaid tricoté */
  function armchair(parent, color, x, z, ry, plaid) {
    const g = new T.Group(); g.name = "fauteuil"; g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g);
    const m = fabricMat(color), dark = fabricMat(shade(color, -0.06)), pipe = fabricMat(shade(color, -0.12));
    const add = (geo, mm, px, py, pz, rx) => { const o = new T.Mesh(geo, mm); o.position.set(px, py, pz); if (rx) o.rotation.x = rx; g.add(o); return o; };
    // pieds en bois, un peu écartés
    const legGeo = cachedGeo("pied-fauteuil", () => uvAlong(new T.LatheGeometry([[0, 0], [0.012, 0], [0.015, 0.006], [0.02, 0.1], [0.025, 0.165], [0, 0.17]].map(([a, b]) => new T.Vector2(a, b)), 10)));
    [[-0.34, -0.29], [0.34, -0.29], [-0.34, 0.3], [0.34, 0.3]].forEach(([lx, lz]) => { const l = add(legGeo, legMat(), lx, 0, lz); l.rotation.set(Math.sign(lz) * 0.1, 0, -Math.sign(lx) * 0.1); });
    add(softBox(0.56, 0.22, 0.72, 0.035), dark, 0, 0.28, 0.0);                        // assise (caisse)
    add(softBox(0.8, 0.62, 0.17, 0.075, [0.012, 0.03, 0.02]), m, 0, 0.615, -0.295, -0.12); // dossier
    const arm = softBox(0.14, 0.52, 0.76, 0.066, [0.012, 0.006, 0.006]);
    add(arm, m, -0.33, 0.43, 0); add(arm, m, 0.33, 0.43, 0);                           // accoudoirs
    // coussin d'assise et coussin de dossier, bombés, avec passepoil
    add(softBox(0.52, 0.13, 0.62, 0.045, [0, 0.024, 0.006]), m, 0, 0.455, 0.06);
    add(piping("assise", 0.26, 0.31, 0.045, 0.052), pipe, 0, 0.455, 0.06);
    const back = new T.Group(); back.position.set(0, 0.735, -0.165); back.rotation.x = -0.16; g.add(back);
    back.add(new T.Mesh(softBox(0.52, 0.42, 0.14, 0.05, [0.006, 0.006, 0.03]), m));
    const bp = new T.Mesh(piping("dossier", 0.26, 0.21, 0.05, 0.057), pipe); bp.rotation.x = Math.PI / 2; back.add(bp);
    // petit coussin à rayures posé contre le dossier
    const pil = add(softBox(0.36, 0.34, 0.03, 0.012, [0, 0, 0.055]), pillowMat(color), -0.1, 0.66, -0.04);
    pil.rotation.set(-0.3, 0.32, 0.16);
    // plaid tricoté jeté sur l'accoudoir droit (à carreaux si le thème le demande)
    add(cachedGeo("plaid", drapeGeo), knitMat(!!plaid), 0.33, 0, 0.03);
    return g;
  }

  /* ---------- Outils du mobilier ---------- */
  const geoCache = new Map();
  const cachedGeo = (k, make) => { if (!geoCache.has(k)) geoCache.set(k, make()); return geoCache.get(k); };
  // pour les pièces tournées : le fil du bois suit la hauteur
  function uvAlong(geo, ru) {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v, u * (ru || 0.25)); }
    return geo;
  }
  /* Bloc rembourré : boîte aux arêtes arrondies (même principe que RoundedBoxGeometry des exemples three.js r160)
     avec un léger bombé au milieu de chaque face. UV à l'échelle réelle : la trame du tissu garde partout la même taille. */
  function softBox(w, h, d, r, puff) {
    const key = ["sb", w, h, d, r, puff].join("|");
    if (geoCache.has(key)) return geoCache.get(key);
    const H = [w / 2, h / 2, d / 2], P = puff || [0, 0, 0];
    r = Math.min(r, H[0], H[1], H[2]);
    // positions le long d'un axe : serrées dans l'arrondi, régulières sur le plat
    const samples = (hh) => {
      const s = [], inner = hh - r, band = [3, 2, 1].map((j) => r * Math.tan((j / 3) * Math.PI / 4));
      band.forEach((b) => s.push(-(inner + b)));
      for (let i = 0; i <= 4; i++) s.push(-inner + (2 * inner * i) / 4);
      band.reverse().forEach((b) => s.push(inner + b));
      return s;
    };
    const pos = [], nor = [], uv = [], idx = [], n = new T.Vector3(), TILE = 1 / 0.15;
    for (let ax = 0; ax < 3; ax++) for (const sg of [1, -1]) {
      const a = (ax + 1) % 3, b = (ax + 2) % 3, sa = samples(H[a]), sb = samples(H[b]), nb = sb.length, base = pos.length / 3;
      for (let i = 0; i < sa.length; i++) for (let j = 0; j < nb; j++) {
        const p = [0, 0, 0]; p[ax] = sg * H[ax]; p[a] = sa[i]; p[b] = sb[j];
        const c = p.map((v, k) => Math.max(-(H[k] - r), Math.min(H[k] - r, v)));
        n.set(p[0] - c[0], p[1] - c[1], p[2] - c[2]).normalize();
        const q = [n.x, n.y, n.z], o = c.map((v, k) => v + q[k] * r), nn = q.slice();
        const u = p.map((v, k) => Math.min(1, Math.abs(v) / H[k]));
        for (let k = 0; k < 3; k++) {
          if (!P[k]) continue;
          const k1 = (k + 1) % 3, k2 = (k + 2) % 3, f1 = 1 - u[k1] * u[k1], f2 = 1 - u[k2] * u[k2], wq = Math.abs(q[k]);
          o[k] += q[k] * P[k] * f1 * f2;
          nn[k1] += wq * P[k] * (2 * p[k1] / (H[k1] * H[k1])) * f2;
          nn[k2] += wq * P[k] * (2 * p[k2] / (H[k2] * H[k2])) * f1;
        }
        n.set(nn[0], nn[1], nn[2]).normalize();
        pos.push(o[0], o[1], o[2]); nor.push(n.x, n.y, n.z); uv.push(o[a] * TILE, o[b] * TILE);
      }
      for (let i = 0; i < sa.length - 1; i++) for (let j = 0; j < nb - 1; j++) {
        const v00 = base + i * nb + j, v10 = v00 + nb, v01 = v00 + 1, v11 = v10 + 1;
        if (sg > 0) idx.push(v00, v10, v11, v00, v11, v01); else idx.push(v00, v11, v10, v00, v01, v11);
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
    geo.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geoCache.set(key, geo);
    return geo;
  }
  // passepoil : petit boudin le long des deux arêtes d'un coussin (rectangle arrondi, demi-côtés hw × hd, à ±y)
  function piping(name, hw, hd, rc, y) {
    return cachedGeo("passepoil-" + name, () => {
      const one = (yy) => {
        const pts = [], a = hw - rc * 0.3, b = hd - rc * 0.3, rr = rc * 0.75;
        for (let k = 0; k < 4; k++) {
          const cx = (k === 0 || k === 3 ? 1 : -1) * (a - rr), cz = (k < 2 ? 1 : -1) * (b - rr);
          for (let s = 0; s <= 4; s++) { const t = (k + s / 4) * Math.PI / 2; pts.push(new T.Vector3(cx + Math.cos(t) * rr, yy, cz + Math.sin(t) * rr)); }
        }
        return new T.TubeGeometry(new T.CatmullRomCurve3(pts, true), 72, 0.0055, 5, true);
      };
      return mergeGeos([one(y), one(-y)]);
    });
  }
  // assemble des géométries indexées en une seule (un seul appel de dessin)
  function mergeGeos(list) {
    const out = new T.BufferGeometry(), names = ["position", "normal", "uv"], data = { position: [], normal: [], uv: [] }, idx = [];
    let off = 0;
    list.forEach((geo) => {
      names.forEach((nm) => data[nm].push(...geo.attributes[nm].array));
      geo.index.array.forEach((i) => idx.push(i + off));
      off += geo.attributes.position.count; geo.dispose();
    });
    out.setAttribute("position", new T.Float32BufferAttribute(data.position, 3));
    out.setAttribute("normal", new T.Float32BufferAttribute(data.normal, 3));
    out.setAttribute("uv", new T.Float32BufferAttribute(data.uv, 2));
    out.setIndex(idx);
    return out;
  }
  /* Plaid : il part de l'assise, passe par-dessus l'accoudoir et retombe à l'extérieur en faisant des plis */
  function drapeGeo() {
    const path = new T.SplineCurve([[-0.15, 0.53], [-0.09, 0.54], [-0.073, 0.6], ...[150, 120, 90, 60, 30].map((d) => [Math.cos(d * Math.PI / 180) * 0.07, 0.625 + Math.sin(d * Math.PI / 180) * 0.07]), [0.073, 0.6], [0.076, 0.42], [0.08, 0.26], [0.095, 0.13]].map(([a, b]) => new T.Vector2(a, b)));
    const NS = 34, NZ = 18, Z0 = -0.24, Z1 = 0.26, pts = path.getSpacedPoints(NS), len = path.getLength();
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= NS; i++) {
      const p = pts[i], q = pts[Math.min(NS, i + 1)], o = pts[Math.max(0, i - 1)];
      let tx = q.x - o.x, ty = q.y - o.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const s = i / NS, drop = Math.max(0, (s - 0.55) / 0.45), inner = Math.max(0, (0.25 - s) / 0.25);
      for (let j = 0; j <= NZ; j++) {
        const t = j / NZ, zz = Z0 + (Z1 - Z0) * t;
        // plis : plus marqués là où le plaid pend ; bas un peu irrégulier
        const amp = 0.003 + drop * drop * 0.018 + inner * 0.008;
        const off = 0.013 + amp * (0.6 + 0.4 * Math.sin(zz * 41 + 1.3)) * Math.sin(zz * 23 + s * 2.2);
        const hem = drop * drop * 0.025 * Math.sin(zz * 17 + 0.4);
        pos.push(p.x - ty * off, p.y + tx * off + hem, zz + drop * 0.02 * Math.sin(zz * 9));
        uv.push(t * (Z1 - Z0) * 3, s * len * 3);
      }
    }
    for (let i = 0; i < NS; i++) for (let j = 0; j < NZ; j++) { const a = i * (NZ + 1) + j, b = a + NZ + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  }

  /* ---------- Tissus et matières du mobilier ---------- */
  const texCache = new Map();
  const cachedTex = (k, make) => { if (!texCache.has(k)) texCache.set(k, make()); return texCache.get(k); };
  const seeded = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // trame de lin un peu bouclée, presque blanche : la couleur vient du matériau
  const linenTex = () => cachedTex("lin", () => canvasTex(256, 256, (g, w, h) => {
    const rnd = seeded(11);
    g.fillStyle = "#ededed"; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(255,255,255,${0.12 + rnd() * 0.2})`; g.fillRect(0, y, w, 1); g.fillStyle = `rgba(0,0,0,${0.04 + rnd() * 0.06})`; g.fillRect(0, y + 1, w, 1); }
    for (let x = 0; x < w; x += 2) { g.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.07})`; g.fillRect(x, 0, 1, h); }
    // fils plus épais du lin (flammes)
    for (let i = 0; i < 120; i++) { const x = rnd() * w, y = (rnd() * h) | 0, l = 8 + rnd() * 40; g.fillStyle = rnd() > 0.5 ? "rgba(255,255,255,.28)" : "rgba(0,0,0,.1)"; g.fillRect(x, y, l, 1); if (x + l > w) g.fillRect(x - w, y, l, 1); }
    // bouclettes
    for (let i = 0; i < 900; i++) { const x = rnd() * w, y = rnd() * h; g.fillStyle = `rgba(${rnd() > 0.5 ? "255,255,255" : "0,0,0"},${0.05 + rnd() * 0.08})`; g.beginPath(); g.arc(x, y, 0.7 + rnd() * 1.3, 0, 7); g.fill(); }
  }, [1, 1]));
  const furnMats = new Map();
  const furnMat = (k, make) => { if (!furnMats.has(k)) furnMats.set(k, make()); return furnMats.get(k); };
  const fabricMat = (color) => furnMat("tissu" + color, () => new T.MeshStandardMaterial({ color: shade(color, 0.03), map: linenTex(), bumpMap: linenTex(), bumpScale: 1.2, roughness: 0.96 }));
  // bois des pieds : la photo de bois teintée (elle peut arriver après coup, d'où la vérification)
  function legMat() {
    const t = woodTexture("#4e2f1a");
    return furnMat("bois-pied" + t.uuid, () => new T.MeshStandardMaterial({ map: t, roughness: 0.55 }));
  }
  // coussin : lin crème tissé de rayures de la couleur du fauteuil
  const pillowMat = (color) => furnMat("coussin" + color, () => {
    const map = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = "#e6dcc8"; g.fillRect(0, 0, w, h);
      const ink = shade(color, -0.14);
      [[20, 10], [36, 3], [84, 10], [100, 3]].forEach(([y, hh]) => { g.fillStyle = ink; g.fillRect(0, y, w, hh); });
      for (let x = 0; x < w; x += 6) { g.fillStyle = "rgba(230,220,200,.45)"; g.fillRect(x, 20, 2, 10); g.fillRect(x + 3, 84, 2, 10); }
      g.globalAlpha = 0.35; g.drawImage(linenTex().image, 0, 0, w, h); g.globalAlpha = 1;
    }, [1, 1]);
    return new T.MeshStandardMaterial({ map, bumpMap: linenTex(), bumpScale: 1, roughness: 0.95 });
  });
  // maille tricotée : colonnes de petits « V » en relief ; à carreaux rouille si demandé
  const knitMat = (check) => furnMat("plaid" + check, () => {
    const draw = (mono) => (g, w, h) => {
      g.fillStyle = mono ? "#303030" : "#a39279"; g.fillRect(0, 0, w, h);
      const SW = 16, SH = 12;
      for (let y = -SH; y < h + SH; y += SH) for (let x = 0; x < w; x += SW) {
        const col = (x / SW) | 0, row = ((y + SH) / SH) | 0;
        const stripe = check && (col % 8 === 3 || row % 10 === 4);
        const base = mono ? "#d8d8d8" : stripe ? "#b0603f" : "#ebe1cf";
        [-1, 1].forEach((sd) => {
          g.save(); g.translate(x + SW / 2 + sd * 3.6, y + SH / 2); g.rotate(sd * -0.6);
          const gr = g.createLinearGradient(-4, 0, 4, 0);
          gr.addColorStop(0, shade(base, -0.16)); gr.addColorStop(0.45, shade(base, 0.03)); gr.addColorStop(1, shade(base, -0.2));
          g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, 4.6, 7.8, 0, 0, 7); g.fill(); g.restore();
        });
      }
    };
    const map = canvasTex(128, 120, draw(false), [1, 1]), bump = canvasTex(128, 120, draw(true), [1, 1]);
    return new T.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 3, roughness: 1, side: T.DoubleSide });
  });

  /* Guéridon en bois tourné, lampe à pied en céramique et abat-jour en lin, tasse de thé */
  function sideTable(parent, x, z, lampColor) {
    const g = new T.Group(); g.name = "gueridon"; g.position.set(x, 0, z); parent.add(g);
    const t = woodTexture("#6b4126");
    const wood = furnMat("bois-gueridon" + t.uuid, () => new T.MeshStandardMaterial({ map: t, roughness: 0.5 }));
    const add = (geo, m, py, px, pz) => { const o = new T.Mesh(geo, m); o.position.set(px || 0, py, pz || 0); g.add(o); return o; };
    const V = (list) => list.map(([a, b]) => new T.Vector2(a, b));
    // plateau rond au chant arrondi
    add(cachedGeo("plateau", () => new T.CylinderGeometry(0.232, 0.232, 0.036, 40)), wood, 0.56);
    add(cachedGeo("chant", () => new T.TorusGeometry(0.232, 0.018, 8, 48)), wood, 0.56).rotation.x = Math.PI / 2;
    // pied tourné : socle rond, colonne avec bagues
    add(cachedGeo("pied-gueridon", () => uvAlong(new T.LatheGeometry(V([[0, 0], [0.15, 0], [0.163, 0.006], [0.165, 0.02], [0.152, 0.032], [0.1, 0.045], [0.06, 0.065], [0.038, 0.095], [0.046, 0.115], [0.046, 0.13], [0.032, 0.148], [0.025, 0.3], [0.029, 0.37], [0.042, 0.392], [0.042, 0.41], [0.03, 0.428], [0.025, 0.47], [0.034, 0.505], [0.058, 0.53], [0.085, 0.542], [0, 0.542]]), 24), 0.5)), wood, 0);
    // lampe : pied en grès émaillé tourné, douille en laiton, abat-jour en lin qui laisse passer la lumière
    const glaze = furnMat("gres", () => new T.MeshStandardMaterial({ map: glazeTex(), roughness: 0.3, metalness: 0 }));
    add(cachedGeo("pied-lampe", () => new T.LatheGeometry(V([[0, 0], [0.048, 0], [0.056, 0.006], [0.07, 0.03], [0.084, 0.07], [0.087, 0.1], [0.079, 0.14], [0.06, 0.168], [0.036, 0.188], [0.022, 0.198], [0.024, 0.212], [0, 0.214]]), 28)), glaze, 0.578, -0.05);
    const brass = mat("#c9a227", { metalness: 0.7, roughness: 0.3 });
    cyl(0.007, 0.007, 0.1, brass, -0.05, 0.84, 0, g, 8);
    cyl(0.016, 0.014, 0.04, brass, -0.05, 0.895, 0, g, 12);
    add(cachedGeo("ampoule", () => new T.SphereGeometry(0.03, 12, 8)), furnMat("ampoule", () => new T.MeshBasicMaterial({ color: "#fff0cc" })), 0.94, -0.05);
    const lin = linenTex();
    const shadeOut = furnMat("abat-jour" + (lampColor || ""), () => new T.MeshStandardMaterial({ color: lampColor || "#f3e2c2", map: lin, emissive: "#ffc477", emissiveMap: lin, emissiveIntensity: 0.95, roughness: 1 }));
    const shadeIn = furnMat("abat-jour-dedans", () => new T.MeshStandardMaterial({ color: "#fff3dc", emissive: "#ffcf8a", emissiveIntensity: 1.1, roughness: 1, side: T.BackSide }));
    const sg = cachedGeo("abat-jour", () => { const c = new T.CylinderGeometry(0.1, 0.17, 0.21, 36, 1, true), uv = c.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 1.4); return c; });
    add(sg, shadeOut, 0.96, -0.05); add(sg, shadeIn, 0.96, -0.05);
    const trim = furnMat("galon", () => new T.MeshStandardMaterial({ color: "#efe2c8", roughness: 0.9 }));
    add(cachedGeo("galon-bas", () => new T.TorusGeometry(0.17, 0.0045, 4, 36)), trim, 0.855, -0.05).rotation.x = Math.PI / 2;
    add(cachedGeo("galon-haut", () => new T.TorusGeometry(0.1, 0.004, 4, 30)), trim, 1.065, -0.05).rotation.x = Math.PI / 2;
    const light = new T.PointLight("#ffc27a", 2.2, 5, 1.6); light.position.set(-0.05, 0.92, 0); g.add(light);
    // tasse en céramique avec son anse, thé dedans
    const cup = new T.Group(); cup.position.set(0.13, 0.578, 0.07); cup.rotation.y = -0.6; g.add(cup);
    const cupMat = furnMat("tasse", () => new T.MeshStandardMaterial({ color: "#f3ece0", roughness: 0.25, side: T.DoubleSide }));
    cup.add(new T.Mesh(cachedGeo("tasse", () => new T.LatheGeometry(V([[0, 0.001], [0.03, 0.001], [0.035, 0.006], [0.038, 0.08], [0.034, 0.08], [0.031, 0.012], [0, 0.012]]), 24)), cupMat));
    const tea = new T.Mesh(cachedGeo("the", () => new T.CircleGeometry(0.033, 20)), furnMat("the", () => new T.MeshStandardMaterial({ color: "#6b3a17", roughness: 0.15 })));
    tea.rotation.x = -Math.PI / 2; tea.position.y = 0.062; cup.add(tea);
    const handle = new T.Mesh(cachedGeo("anse", () => new T.TorusGeometry(0.02, 0.005, 6, 14, Math.PI)), cupMat);
    handle.position.set(0.037, 0.042, 0); handle.rotation.z = -Math.PI / 2; cup.add(handle);
    return g;
  }
  // émail de grès : ocre qui coule sur un fond plus clair, petits points
  const glazeTex = () => cachedTex("email", () => canvasTex(256, 128, (g, w, h) => {
    const rnd = seeded(5);
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#c98a52"); gr.addColorStop(0.55, "#b5683e"); gr.addColorStop(1, "#d9c4a4");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 22; i++) { const x = rnd() * w, l = h * (0.45 + rnd() * 0.35); g.fillStyle = `rgba(120,50,20,${0.06 + rnd() * 0.1})`; g.fillRect(x, 0, 2 + rnd() * 5, l); g.beginPath(); g.arc(x + 2, l, 3, 0, 7); g.fill(); }
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(60,30,15,${0.2 + rnd() * 0.3})`; g.fillRect(rnd() * w, rnd() * h, 1, 1); }
  }));

  /* Tapis tissé à plat (kilim) : un peu épais, avec ses franges aux deux bouts */
  function makeRug(scene) {
    const RW = 2.6, RD = 2.0, top = rugTex();
    const side = new T.MeshStandardMaterial({ color: "#7c3b2b", roughness: 1 });
    const rug = new T.Mesh(new T.BoxGeometry(RW, 0.012, RD), [side, side, new T.MeshStandardMaterial({ map: top, bumpMap: top, bumpScale: 1.5, roughness: 1 }), side, side, side]);
    rug.position.y = 0.006; rug.receiveShadow = true; scene.add(rug);
    const fr = canvasTex(64, 512, (g, w, h) => {
      const rnd = seeded(3);
      for (let y = 2; y < h; y += 4) {
        const l = w * (0.78 + rnd() * 0.2), k = (y / 16) | 0;
        g.strokeStyle = `rgb(${226 - rnd() * 25},${210 - rnd() * 25},${180 - rnd() * 25})`; g.lineWidth = 2.4;
        g.beginPath(); g.moveTo(0, y); g.quadraticCurveTo(w * 0.5, y + (rnd() - 0.5) * 3, l, y + (k % 2 ? 1.5 : -1.5)); g.stroke();
        if (y % 16 === 2) { g.fillStyle = "#cdbb98"; g.fillRect(6, y - 1, 6, 14); }
      }
    });
    const fm = new T.MeshStandardMaterial({ map: fr, alphaTest: 0.5, roughness: 1, side: T.DoubleSide });
    const fg = new T.PlaneGeometry(0.1, RD - 0.04);
    [-1, 1].forEach((s) => {
      const f = new T.Mesh(fg, fm); f.rotation.set(-Math.PI / 2, 0, s > 0 ? 0 : Math.PI);
      f.position.set(s * (RW / 2 + 0.048), 0.003, 0); f.receiveShadow = true; scene.add(f);
    });
    return rug;
  }

  /* Suspension en rotin tressé au plafond, avec son cordon en tissu et son ampoule */
  function pendantLamp(scene) {
    const g = new T.Group(); g.position.set(0, 2.8, 0); scene.add(g);
    const weaveTex = canvasTex(128, 128, (c, w, h) => {
      // tressage : brins clairs qui passent dessus/dessous, jours entre eux
      c.clearRect(0, 0, w, h);
      const strand = (x, y, ww, hh, dir) => {
        const gr = dir ? c.createLinearGradient(x, 0, x + ww, 0) : c.createLinearGradient(0, y, 0, y + hh);
        gr.addColorStop(0, "#9c6a35"); gr.addColorStop(0.5, "#e2b678"); gr.addColorStop(1, "#9c6a35");
        c.fillStyle = gr; c.fillRect(x, y, ww, hh);
      };
      const S = 32;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const x = i * S, y = j * S;
        if ((i + j) % 2) { strand(x + 2, y, 12, S, true); strand(x + 18, y, 12, S, true); }
        else { strand(x, y + 2, S, 12, false); strand(x, y + 18, S, 12, false); }
      }
    }, [14, 4]);
    const rattan = new T.MeshStandardMaterial({ map: weaveTex, alphaTest: 0.5, side: T.DoubleSide, roughness: 0.85, emissive: "#ffb066", emissiveMap: weaveTex, emissiveIntensity: 0.35 });
    const prof = [];
    for (let i = 0; i <= 14; i++) { const a = (i / 14) * Math.PI / 2; prof.push(new T.Vector2(0.03 + Math.cos(a) * 0.29, Math.sin(a) * 0.3)); }
    g.add(new T.Mesh(new T.LatheGeometry(prof, 44), rattan));
    const cane = mat("#b88a52", { roughness: 0.8 });
    const rim = new T.Mesh(new T.TorusGeometry(0.32, 0.009, 6, 48), cane); rim.rotation.x = Math.PI / 2; g.add(rim);
    cyl(0.04, 0.05, 0.04, cane, 0, 0.3, 0, g, 16);
    ball(0.045, new T.MeshBasicMaterial({ color: "#fff1c8" }), 0, 0.08, 0, g);
    cyl(0.006, 0.006, 0.48, mat("#3b2a1e"), 0, 0.56, 0, g, 6);       // cordon
    cyl(0.06, 0.06, 0.02, mat("#efe2cc"), 0, 0.79, 0, g, 20);        // cache-piton
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

  /* ---------- Déco des photos de Julie : suspensions, fleurs séchées, champignons, lapin, lanterne, mousse ---------- */
  function rod(a, b, r, m, parent) {
    const d = new T.Vector3().subVectors(b, a), len = d.length();
    const o = new T.Mesh(new T.CylinderGeometry(r, r, len, 5), m);
    o.position.copy(a).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); parent.add(o); return o;
  }
  const weave = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = "#b8925e"; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) for (let x = (y / 8) % 2 ? 0 : 8; x < w; x += 16) { g.fillStyle = "rgba(255,240,200,.25)"; g.fillRect(x, y + 1, 8, 6); g.fillStyle = "rgba(60,35,10,.3)"; g.fillRect(x + 8, y, 1, 8); }
  }, [4, 2]);
  function leafBall(g, y, n, r0) {
    for (let i = 0; i < n; i++) {
      const l = new T.Mesh(leafPlane, LEAVES.heart[i % 4]); const a = i * 2.39, r = r0 + (i % 5) * 0.018;
      l.position.set(Math.cos(a) * r, y + (i % 4) * 0.02, Math.sin(a) * r); l.scale.setScalar(0.9 + (i % 3) * 0.2);
      l.rotation.set(-0.9 + (i % 4) * 0.35, -a + Math.PI / 2, 0, "YXZ"); g.add(l);
    }
  }
  /* Suspension en macramé avec un pothos qui retombe, accrochée au plafond */
  function hangingBasket(parent, x, y, z) {
    const g = new T.Group(); g.position.set(x, y, z); parent.add(g);
    const bowl = new T.Mesh(new T.SphereGeometry(0.13, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new T.MeshStandardMaterial({ map: weave, roughness: 1, side: T.DoubleSide }));
    g.add(bowl);
    const rim = new T.Mesh(new T.TorusGeometry(0.13, 0.012, 6, 24), mat("#a07a48", { roughness: 1 })); rim.rotation.x = Math.PI / 2; g.add(rim);
    cyl(0.12, 0.12, 0.01, mat("#3a2a1c"), 0, -0.01, 0, g, 18);
    const rope = mat("#e6d6b8", { roughness: 1 }), knot = new T.Vector3(0, 0.55, 0);
    for (let i = 0; i < 4; i++) { const a = i * QUARTER + 0.4; rod(new T.Vector3(Math.cos(a) * 0.13, -0.02, Math.sin(a) * 0.13), knot, 0.004, rope, g); }
    rod(knot, new T.Vector3(0, 3.6 - y, 0), 0.005, rope, g);
    ball(0.018, rope, 0, 0.55, 0, g);
    leafBall(g, 0.01, 24, 0.02);
    vines(g, [[-0.09, 0.02, 0.06, 0.55, 1], [0.08, 0.02, 0.02, 0.8, 2], [0.0, 0.02, 0.1, 0.4, 3], [-0.03, 0.02, -0.08, 0.6, 4]]);
    return g;
  }
  /* Cadre avec des fleurs séchées pressées */
  const FLOWER_COLORS = ["#c98f8a", "#d6b36a", "#9c8ab8", "#e3d2b5", "#b06d5a", "#8fa07a"];
  function driedTex(seed) {
    return canvasTex(128, 160, (g, w, h) => {
      g.fillStyle = "#f2eadb"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 300; i++) { g.fillStyle = "rgba(120,90,50,.04)"; g.fillRect((i * 37.3) % w, (i * 71.1) % h, 2, 2); }
      const n = 3 + (seed % 2);
      for (let k = 0; k < n; k++) {
        const bx = w / 2 + (k - (n - 1) / 2) * 16, top = 30 + ((k * 23 + seed * 7) % 30), c = FLOWER_COLORS[(k + seed) % FLOWER_COLORS.length];
        g.strokeStyle = "#7d8460"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(w / 2, h - 24); g.quadraticCurveTo(bx, h - 70, bx + (k - 1) * 6, top); g.stroke();
        for (let j = 0; j < 9; j++) { g.fillStyle = c; g.globalAlpha = 0.85; g.beginPath(); g.ellipse(bx + (k - 1) * 6 + Math.sin(j * 2.1) * 7, top + j * 4 - 6, 3.2, 2.2, j, 0, 7); g.fill(); }
        g.globalAlpha = 1; g.fillStyle = "#8a9468";
        for (let j = 0; j < 3; j++) { g.beginPath(); g.ellipse(bx + (j % 2 ? 6 : -6), h - 60 - j * 14, 5, 2, j % 2 ? -0.6 : 0.6, 0, 7); g.fill(); }
      }
      g.strokeStyle = "#c9b48c"; g.lineWidth = 2; g.beginPath(); g.moveTo(w / 2 - 8, h - 26); g.lineTo(w / 2 + 8, h - 22); g.stroke();
    });
  }
  function driedFrame(parent, x, y, z, seed) {
    const g = new T.Group(); g.position.set(x, y, z); parent.add(g);
    const fr = woodMat("#b88a58");
    box(0.26, 0.025, 0.025, fr, 0, 0.155, 0, g); box(0.26, 0.025, 0.025, fr, 0, -0.155, 0, g);
    box(0.025, 0.335, 0.025, fr, -0.1175, 0, 0, g); box(0.025, 0.335, 0.025, fr, 0.1175, 0, 0, g);
    box(0.21, 0.285, 0.004, new T.MeshStandardMaterial({ map: driedTex(seed), roughness: 0.9 }), 0, 0, -0.004, g);
    return g;
  }
  /* Champignons (amanites rouges à pois blancs et petits bruns) */
  const capRed = new T.MeshStandardMaterial({ roughness: 0.5, map: canvasTex(64, 32, (g, w, h) => {
    g.fillStyle = "#b8322a"; g.fillRect(0, 0, w, h); g.fillStyle = "#f6efe0";
    for (let i = 0; i < 14; i++) { g.beginPath(); g.arc((i * 23) % w, 4 + ((i * 7) % 20), 1.6 + (i % 3) * 0.6, 0, 7); g.fill(); }
  }) });
  const capGeo = new T.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  function mushrooms(parent, x, y, z, s) {
    const g = new T.Group(); g.position.set(x, y, z); g.scale.setScalar(s || 1); parent.add(g);
    const stem = mat("#efe6d4", { roughness: 0.6 }), brown = mat("#8a5a3a", { roughness: 0.6 });
    [[0, 0, 0.07, 0.03, capRed], [0.045, 0.02, 0.045, 0.022, brown], [-0.04, 0.015, 0.035, 0.018, capRed]].forEach(([dx, dz, h, r, m]) => {
      cyl(r * 0.35, r * 0.45, h, stem, dx, h / 2, dz, g, 10);
      const c = new T.Mesh(capGeo, m); c.scale.set(r, r * 0.7, r); c.position.set(dx, h - 0.002, dz); g.add(c);
    });
    // un peu de mousse au pied
    const ms = mat("#5d7a34", { roughness: 1 });
    for (let i = 0; i < 4; i++) { const b = ball(0.03, ms, Math.cos(i * 1.7) * 0.04, 0, Math.sin(i * 1.7) * 0.03, g); b.scale.set(1, 0.3, 1); }
    return g;
  }
  /* Petit lapin en céramique */
  function rabbit(parent, x, y, z, s) {
    const g = new T.Group(); g.position.set(x, y, z); g.scale.setScalar(s || 1); g.rotation.y = -0.5; parent.add(g);
    const m = mat("#f1ece3", { roughness: 0.35 }), pink = mat("#e8b4b0", { roughness: 0.5 }), eye = mat("#2a201c", { roughness: 0.3 });
    ball(0.05, m, 0, 0.045, -0.01, g).scale.set(1, 0.9, 1.25);
    ball(0.034, m, 0, 0.1, 0.045, g);
    ball(0.016, m, 0, 0.05, -0.075, g);
    [-1, 1].forEach((k) => {
      const ear = ball(0.012, m, k * 0.014, 0.15, 0.035, g); ear.scale.set(1, 3.6, 0.6); ear.rotation.z = -k * 0.18;
      const inner = ball(0.007, pink, k * 0.014, 0.15, 0.042, g); inner.scale.set(1, 3.6, 0.4); inner.rotation.z = -k * 0.18;
      ball(0.005, eye, k * 0.016, 0.108, 0.073, g);
      ball(0.014, m, k * 0.03, 0.012, 0.035, g).scale.set(1, 0.6, 1.6);
    });
    ball(0.005, pink, 0, 0.098, 0.079, g);
    return g;
  }
  /* Lanterne en métal noir avec une bougie */
  function lantern(parent, x, y, z, s) {
    const g = new T.Group(); g.position.set(x, y, z); g.scale.setScalar(s || 1); parent.add(g);
    const metal = mat("#2a2622", { metalness: 0.6, roughness: 0.5 });
    box(0.13, 0.015, 0.13, metal, 0, 0.0075, 0, g);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => box(0.01, 0.19, 0.01, metal, a * 0.058, 0.11, b * 0.058, g));
    box(0.13, 0.012, 0.13, metal, 0, 0.21, 0, g);
    const roof = new T.Mesh(new T.ConeGeometry(0.095, 0.07, 4), metal); roof.rotation.y = Math.PI / 4; roof.position.y = 0.25; g.add(roof);
    const ring = new T.Mesh(new T.TorusGeometry(0.02, 0.004, 6, 16), metal); ring.position.y = 0.3; g.add(ring);
    box(0.11, 0.18, 0.11, new T.MeshStandardMaterial({ color: "#fff6e0", transparent: true, opacity: 0.16, roughness: 0.1, depthWrite: false }), 0, 0.11, 0, g);
    candle(g, 0, 0.015, 0, 0.75);
    return g;
  }
  /* Mousse posée sur le dessus du meuble, qui déborde un peu */
  const mossMats = ["#6b8f2e", "#82a83a", "#55762a"].map((c) => new T.MeshStandardMaterial({ color: c, roughness: 1, map: canvasTex(32, 32, (g, w, h) => { g.fillStyle = "#c8c8c8"; g.fillRect(0, 0, w, h); for (let i = 0; i < 160; i++) { g.fillStyle = i % 2 ? "#fff" : "#777"; g.fillRect((i * 13.7) % w, (i * 7.3) % h, 1, 1); } }) }));
  const mossGeo = new T.SphereGeometry(1, 10, 6);
  function moss(parent, W, y, z) {
    for (let x = -W / 2 + 0.02, i = 0; x < W / 2; x += 0.045, i++) for (let k = 0; k < 2; k++) {
      const b = new T.Mesh(mossGeo, mossMats[(i + k) % 3]); const r = 0.05 + ((i + k) % 3) * 0.015;
      b.scale.set(r * 1.2, r * 0.55, r); b.position.set(x + k * 0.02, y + 0.008, z + (k ? 0.09 : -0.04) + ((i * 7) % 5) * 0.012); parent.add(b);
    }
    for (let x = -W / 2 + 0.1, i = 0; x < W / 2; x += 0.23, i++) { // petits bouts qui pendent devant
      const b = new T.Mesh(mossGeo, mossMats[i % 3]); b.scale.set(0.03, 0.04, 0.012); b.position.set(x, y - 0.02, z + DEPTH / 2 + 0.03); parent.add(b);
    }
  }

  /* ---------- Couverture d'un livre posé de face : vraie image si le site la prête, sinon dessinée ---------- */
  const coverCache = new Map();
  function coverMaterial(b, color, ink, onReady) {
    let c = coverCache.get(b.id);
    if (!c) {
      const drawn = canvasTex(160, 240, (g, w, h) => {
        g.fillStyle = color; g.fillRect(0, 0, w, h);
        g.fillStyle = ink; g.globalAlpha = 0.5; g.fillRect(12, 14, w - 24, 2); g.fillRect(12, h - 16, w - 24, 2); g.globalAlpha = 1;
        g.textAlign = "center"; g.fillStyle = ink;
        const words = b.title.split(/\s+/), lines = [""];
        g.font = "bold 20px Georgia, serif";
        for (const wd of words) { const t = (lines[lines.length - 1] + " " + wd).trim(); if (g.measureText(t).width > w - 26 && lines[lines.length - 1]) lines.push(wd); else lines[lines.length - 1] = t; }
        lines.slice(0, 5).forEach((l, i) => g.fillText(l, w / 2, 70 + i * 24));
        if (b.authors && b.authors[0]) { g.font = "14px Georgia, serif"; g.globalAlpha = 0.85; g.fillText(b.authors[0].slice(0, 24), w / 2, h - 34); }
      });
      c = { mat: new T.MeshStandardMaterial({ map: drawn, roughness: 0.5 }), waiting: new Set() };
      coverCache.set(b.id, c);
      let url = b.cover || "";
      if (/books\.google/.test(url)) url = url.replace(/&zoom=\d/, "") + "&fife=w400";
      const urls = [url, b.isbn ? "https://covers.openlibrary.org/b/isbn/" + b.isbn + "-L.jpg?default=false" : ""].filter(Boolean);
      const tryNext = (i) => {
        if (i >= urls.length) return;
        const im = new Image(); im.crossOrigin = "anonymous";
        im.onload = () => {
          if (im.naturalWidth < 40) return tryNext(i + 1);
          const t = new T.Texture(im); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true;
          c.mat.map = t; c.mat.needsUpdate = true; c.ready = true;
          c.waiting.forEach((f) => f()); c.waiting.clear();
        };
        im.onerror = () => tryNext(i + 1);
        im.src = urls[i];
      };
      tryNext(0);
    }
    if (!c.ready && onReady) c.waiting.add(onReady);
    return c.mat;
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
      for (let y = 0; y < h; y += 3) { g.fillStyle = "rgba(0,0,0,.04)"; g.fillRect(0, y, w, 1); }
      // dessus du coffret un peu bombé, filets dorés, titre frappé
      const sh = g.createLinearGradient(0, 0, 0, h); sh.addColorStop(0, "rgba(0,0,0,.3)"); sh.addColorStop(0.35, "rgba(255,255,255,.1)"); sh.addColorStop(1, "rgba(0,0,0,.35)");
      g.fillStyle = sh; g.fillRect(0, 0, w, h);
      const gold = g.createLinearGradient(0, 0, w, 0); gold.addColorStop(0, "#8a6526"); gold.addColorStop(0.5, "#f2d78c"); gold.addColorStop(1, "#8a6526");
      g.fillStyle = gold; g.globalAlpha = 0.85; g.fillRect(6, 5, w - 12, 2); g.fillRect(6, h - 7, w - 12, 2); g.globalAlpha = 1;
      let size = 30; g.font = `bold ${size}px Georgia, serif`;
      while (size > 12 && g.measureText(text).width > w - 30) { size -= 2; g.font = `bold ${size}px Georgia, serif`; }
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillStyle = ink === "#1d1410" ? "rgba(255,255,255,.25)" : "rgba(0,0,0,.45)"; g.fillText(text, w / 2 + 1, h / 2 + 2);
      g.fillStyle = ink === "#1d1410" ? ink : "#efd28a"; g.fillText(text, w / 2, h / 2 + 1);
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
    // bois vernis satiné : un léger vernis brillant par-dessus le bois mat
    const wood = new T.MeshPhysicalMaterial({ map: woodTexture(th.wood, [1, 1]), roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.4, envMapIntensity: 0.8 });
    const backM = new T.MeshStandardMaterial({ map: plankTexture(th.back), roughness: 0.85, envMapIntensity: 0.5 });
    const deco = decoOf(th), style = th.style || (th.gold ? "elegant" : "classique");
    const gold = mat("#c9a227", { metalness: 0.7, roughness: 0.3 });
    const trim = style === "elegant" ? gold : wood;
    /* Structure : chaque pièce est profilée (chants arrondis, corniche moulurée), puis tout est fusionné par matière */
    const parts = new Map(), put = (m, geo) => { if (!parts.has(m)) parts.set(m, []); parts.get(m).push(geo); };
    const bx = (w, h, d, x, y, z) => new T.BoxGeometry(w, h, d).translate(x, y, z);
    const f = DEPTH / 2;
    [-1, 1].forEach((sx) => put(wood, rail(roundRect(-0.025, -f, 0.025, f, [0, 0, 0.01, 0.01]), H, "y", sx * (W / 2 + 0.025), 0, 0)));  // montants
    if (style === "moderne") {
      put(wood, rail(roundRect(-f, 0, f, 0.04, [0, 0.006, 0.006, 0]), W + 0.1, "x", 0, H, 0));   // dessus tout simple
      put(wood, bx(W + 0.1, base, DEPTH - 0.04, 0, base / 2, -0.02));
    } else {
      // corniche : petit tore, gorge qui s'évase, listel au bord arrondi (le dessus reste à H + 0.08)
      const c = new T.Shape(), zb = -f - 0.02;
      c.moveTo(zb, 0); c.lineTo(f + 0.004, 0);
      c.quadraticCurveTo(f + 0.014, 0, f + 0.014, 0.008); c.quadraticCurveTo(f + 0.014, 0.016, f + 0.008, 0.016);
      c.quadraticCurveTo(f + 0.012, 0.05, f + 0.044, 0.052); c.lineTo(f + 0.044, 0.058); c.lineTo(f + 0.048, 0.06);
      c.quadraticCurveTo(f + 0.054, 0.06, f + 0.054, 0.068); c.lineTo(f + 0.054, 0.072); c.quadraticCurveTo(f + 0.054, 0.08, f + 0.046, 0.08);
      c.lineTo(zb, 0.08); c.closePath();
      put(wood, rail(c, W + 0.22, "x", 0, H, 0, 5));
      if (style === "elegant") put(trim, rail(roundRect(f + 0.04, 0.057, f + 0.057, 0.071, [0, 0.004, 0.004, 0]), W + 0.226, "x", 0, H, 0));
      // socle : retrait au ras du sol, plinthe surmontée d'un quart-de-rond
      const s = new T.Shape();
      s.moveTo(-f, 0); s.lineTo(f - 0.006, 0); s.lineTo(f - 0.006, 0.012); s.lineTo(f + 0.006, 0.014); s.lineTo(f + 0.006, 0.078);
      s.quadraticCurveTo(f + 0.017, 0.079, f + 0.017, 0.089); s.quadraticCurveTo(f + 0.017, 0.098, f + 0.008, 0.099);
      s.lineTo(f + 0.002, 0.106); s.lineTo(f, base); s.lineTo(-f, base); s.closePath();
      put(wood, rail(s, W + 0.1, "x", 0, 0, 0, 4));
      put(wood, rail(roundRect(f - 0.02, -0.04, f, 0, [0, 0, 0.004, 0]), W, "x", 0, H, 0));   // bandeau sous le dessus
    }
    // fond en lames : la texture se répète selon la taille du fond
    const back = bx(W, H - base, 0.02, 0, base + (H - base) / 2, -f + 0.01), buv = back.attributes.uv;
    for (let i = 0; i < buv.count; i++) buv.setXY(i, buv.getX(i) * W / 0.62, buv.getY(i) * (H - base) / 1.1);
    put(backM, back);
    // tablettes : chant avant plus épais et arrondi, comme une vraie planche
    const d2 = (DEPTH - 0.02) / 2, sh = new T.Shape();
    sh.moveTo(-d2, -0.012); sh.lineTo(d2 - 0.022, -0.012); sh.lineTo(d2 - 0.02, -0.022); sh.lineTo(d2 - 0.004, -0.022);
    sh.quadraticCurveTo(d2, -0.022, d2, -0.017); sh.lineTo(d2, 0.008); sh.quadraticCurveTo(d2, 0.014, d2 - 0.006, 0.014); sh.lineTo(-d2, 0.014); sh.closePath();
    for (let r = 0; r <= rows.length; r++) put(wood, rail(sh, W, "x", 0, base + r * SHELF_H, 0));
    if (style === "elegant") for (let r = 1; r <= rows.length; r++) put(trim, bx(W, 0.005, 0.004, 0, base + r * SHELF_H - 0.006, d2 + 0.001));
    if (key === "alire") for (let i = 0; i < 3; i++) put(gold, rail(roundRect(-0.01, -0.008, 0.01, 0.008, [0.004, 0.004, 0.004, 0.004]), 0.12, "x", -W / 3 + (i * W) / 3, base / 2, f + 0.012));
    parts.forEach((list, m) => g.add(new T.Mesh(mergeGeos(list), m)));
    /* Ombre douce au fond de chaque case, sur le rayon et sous le rayon du dessus : un seul maillage */
    const ao = [], q = (w, h, x, y, z, rx, u0) => {
      const p = new T.PlaneGeometry(w, h), uv = p.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + 0.01 + uv.getX(i) * 0.48, rx > 0 ? 1 - uv.getY(i) : uv.getY(i));
      if (rx) p.rotateX(rx);
      ao.push(p.translate(x, y, z));
    };
    for (let r = 0; r < rows.length; r++) {
      const y = base + r * SHELF_H;
      q(W, SHELF_H - 0.034, 0, y + SHELF_H / 2 - 0.004, -f + 0.0205, 0, 0);                         // fond de la case
      q(W, DEPTH - 0.045, 0, y + 0.0145, -0.012, -Math.PI / 2, 0.5);                                 // sur le rayon
      q(W, DEPTH - 0.06, 0, y + SHELF_H - 0.0125, -0.02, Math.PI / 2, 0.5);                           // sous le rayon du dessus
    }
    const aoMesh = new T.Mesh(mergeGeos(ao), aoMat); aoMesh.renderOrder = 1; g.add(aoMesh);

    // livres
    const decorKinds = (th.jungle ? ["plant", "mushroom", "plant", "candle", "rabbit", "plant", "stack"] : ["plant", "candle", "rabbit", "frame", "mushroom", "stack"])
      .filter((k) => deco[{ plant: "plantes", candle: "bougies", frame: "cadres", stack: "piles", mushroom: "champignons", rabbit: "lapin" }[k]]);
    let faces = 0;
    const lianes = deco.lianes === true ? 2 : +deco.lianes || 0;
    let shelfTrail = 0; const shelfVines = [];
    // rayons vides : on y pose de face un ou deux livres pris dans le rayon le plus rempli
    const onEmpty = new Map();
    rows.forEach((row, r) => {
      if (row.length || onEmpty.size >= 2) return;
      const full = rows.reduce((a, b) => (b.filter((u) => !u.box).length > a.filter((u) => !u.box).length ? b : a), []);
      const cands = full.filter((u) => !u.box);
      if (cands.length < 2) return;
      const u = cands.find((x) => x.books[0].fav && x.books[0].cover) || cands.find((x) => x.books[0].cover) || cands[cands.length - 1];
      full.splice(full.indexOf(u), 1); onEmpty.set(r, u);
    });
    const faceOut = (b, cx, y0) => {
      const t = thickness(b), fw = 0.17, fh = 0.25;
      const color = helpers.colorOf(b), ink = helpers.textOn(color), side = mat(color);
      const fg = new T.Group(); fg.position.set(cx, y0, -DEPTH / 2 + 0.09); fg.rotation.set(-0.13, (hash(b.id) % 2 ? 0.06 : -0.06), 0); g.add(fg);
      const m = box(fw, fh, t, [side, pagesMat, pagesMat, pagesMat, coverMaterial(b, color, ink, helpers.onTex), side], 0, fh / 2, 0, fg);
      m.userData.id = b.id; helpers.pick.push(m);
      animate(fg, b.id);
    };
    const animate = (obj, id) => {
      const t0 = helpers.animIn && helpers.animIn.get(id);
      if (t0 === undefined) return;
      helpers.anims.push({ obj, to: obj.position.clone(), t0 });
    };
    rows.forEach((row, r) => {
      const y0 = base + (rows.length - 1 - r) * SHELF_H + 0.014; // on range depuis le rayon du haut
      let x = -W / 2 + 0.04, right = W / 2 - 0.04;
      // un livre posé de face au bout du rayon, s'il reste de la place : un coup de cœur de préférence
      const used = row.reduce((s, u) => s + u.w, 0);
      if (onEmpty.has(r)) { faceOut(onEmpty.get(r).books[0], x + 0.12, y0); x += 0.3; faces++; }
      else if (faces < 2 && W - 0.08 - used > 0.3 && (r + key.length) % 2 === 0) {
        const cands = row.filter((u) => !u.box);
        const pickU = cands.find((u) => u.books[0].fav && u.books[0].cover) || cands.find((u) => u.books[0].cover) || cands[cands.length - 1];
        if (pickU) {
          row = row.filter((u) => u !== pickU); faces++;
          faceOut(pickU.books[0], right - 0.095, y0);
          right -= 0.21;
        }
      }
      const placeBook = (b, boxH) => {
        const t = thickness(b);
        const h = boxH || 0.25 + (hash(b.id) % 50) / 1000;
        const color = helpers.colorOf(b), ink = helpers.textOn(color);
        const side = mat(color), spine = new T.MeshStandardMaterial({ map: spineTexture(b, color, ink), roughness: 0.75 });
        const m = box(t, h, BOOK_D, [side, side, pagesMat, pagesMat, spine, side], x + t / 2, y0 + h / 2, DEPTH / 2 - BOOK_D / 2 - 0.012, g);
        m.userData.id = b.id;
        helpers.pick.push(m);
        animate(m, b.id);
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
      const free = right - x;
      const kind = decorKinds.length ? decorKinds[(r + key.length) % decorKinds.length] : "";
      const z = 0.02;
      if (free > 0.3) {
        const dx = right - 0.14;
        if (kind === "plant") {
          const trail = lianes >= 2 || (lianes === 1 && !shelfTrail++);
          plant(g, dx, y0, z, 0.9, trail ? "pothos" : undefined);
          if (trail) shelfVines.push([dx, y0, r]);
        }
        if (kind === "candle") candle(g, dx, y0, z, 1.1);
        if (kind === "frame") frame(g, dx, y0, z);
        if (kind === "stack") bookStack(g, dx - 0.02, y0, z);
        if (kind === "mushroom") mushrooms(g, dx, y0, z + 0.03, 1.1);
        if (kind === "rabbit") rabbit(g, dx, y0, z + 0.03, 1.2);
        if (!row.length && !onEmpty.has(r) && free > 0.9 && kind) { (r % 2 && deco.bougies ? candle : deco.plantes ? plant : candle)(g, -W / 2 + 0.3, y0, z, 1); }
      }
    });
    // dessus du meuble
    const topY = style === "moderne" ? H + 0.04 : H + 0.08;
    const zEdge = style === "moderne" ? DEPTH / 2 + 0.005 : DEPTH / 2 + 0.045;
    const potL = -W / 2 + 0.22, potM = 0.1, potR = W / 2 - 0.42;
    if (deco.plantes || lianes) plant(g, potL, topY, 0, 1.1, lianes ? "pothos" : undefined);
    if (deco.bougies) candle(g, W / 2 - 0.2, topY, 0.02, 1.2);
    if ((deco.plantes && deco.grandes) || lianes >= 2) plant(g, potM, topY, 0, 1.25, lianes ? "pothos" : undefined);
    if (lianes >= 2) plant(g, potR, topY, 0, 1.05, "pothos");
    if (lianes) {
      const y1 = topY + 0.1, list = [];
      // liane qui sort du pot, rampe sur le dessus, passe le bord puis tombe devant le meuble
      const front = (px, drift, len, seed, big) => {
        const p = [[px, y1, 0.01], [px + drift * 0.25, topY + 0.02, zEdge - 0.06], [px + drift * 0.45, topY + 0.008, zEdge], [px + drift * 0.55, topY - 0.05, zEdge + 0.02]];
        const n = Math.max(2, Math.round(len / 0.12));
        for (let k = 1; k <= n; k++) p.push([px + drift * (0.55 + 0.5 * k / n) + Math.sin(k * 1.7 + seed) * 0.02, topY - 0.05 - len * k / n, zEdge + 0.02 + Math.sin(k + seed) * 0.008]);
        list.push([p, seed, big || 1]);
      };
      // liane qui passe par le coin et descend le long du côté du meuble
      const side = (sx, px, len, seed) => {
        const xo = sx * (W / 2 + (style === "moderne" ? 0.06 : 0.1)), xs = sx * (W / 2 + 0.065);
        const p = [[px, y1, 0], [sx * (W / 2 - 0.03), topY + 0.015, 0.04], [xo, topY - 0.03, 0.06], [xs, topY - 0.1, 0.07]];
        const n = Math.max(2, Math.round(len / 0.14));
        for (let k = 1; k <= n; k++) p.push([xs + sx * Math.abs(Math.sin(k * 1.3 + seed)) * 0.015, topY - 0.1 - len * k / n, 0.07 + Math.sin(k * 0.9 + seed) * 0.08]);
        list.push([p, seed, 1.1, sx * Math.PI / 2]);
      };
      front(potL, 0.25, H * (lianes >= 2 ? 0.75 : 0.5), 1);
      front(potL, -0.1, H * (lianes >= 2 ? 0.4 : 0.28), 2);
      if (lianes >= 2) {
        front(potM, 0.15, H * 0.22, 5);
        front(potR, 0.2, H * 0.85, 3); front(potR, -0.15, H * 0.35, 4);
        side(1, potR, H * 0.9, 20); side(1, potR, H * 0.6, 21);
        side(-1, potL, H * 0.65, 30);
      }
      // lianes des pots posés sur les rayons : elles passent le bord du rayon et tombent sur celui du dessous
      shelfVines.forEach(([px, y0, r], j) => {
        const len = Math.min(SHELF_H * 1.15, y0 - 0.05);
        const p = [[px, y0 + 0.11, 0.03], [px + 0.04, y0 + 0.02, DEPTH / 2 - 0.03], [px + 0.06, y0 + 0.004, DEPTH / 2], [px + 0.07, y0 - 0.04, DEPTH / 2 + 0.02]];
        for (let k = 1; k <= 3; k++) p.push([px + 0.07 + Math.sin(k + j) * 0.02, y0 - 0.04 - len * k / 3, DEPTH / 2 + 0.022]);
        list.push([p, 50 + j, 0.95]);
      });
      vines(g, list);
    }
    if (deco.grandes) { bigPlant(g, W / 2 + 0.45, 0.25, 1.1); bigPlant(g, -W / 2 - 0.28, 0.2, 0.8); }
    if (deco.guirlande) fairyLights(g, W + 0.3, H + 0.55, DEPTH / 2 + 0.05);
    if (deco.mousse) moss(g, W + 0.12, topY - 0.01, 0);
    if (deco.champignons) mushrooms(g, W / 2 - 0.5, topY, 0.03, 1.3);
    if (deco.lapin) rabbit(g, -W / 2 + 0.52, topY, 0.03, 1.4);
    if (deco.lanterne) lantern(g, -W / 2 - 0.1, 0, DEPTH / 2 + 0.42, 1.7);
    if (deco.suspensions) {
      const hy = Math.min(2.75, Math.max(1.3, H * 0.72));
      hangingBasket(g, -W / 2 - 0.12, hy, DEPTH / 2 + 0.32);
      hangingBasket(g, W / 2 + 0.14, hy + 0.2, DEPTH / 2 + 0.4);
    }
    if (deco.fleurs) {
      const wz = -(ROOM - R) + DEPTH / 2 + 0.015;
      driedFrame(g, -W / 2 - 0.42, 1.62, wz, 1); driedFrame(g, -W / 2 - 0.42, 1.22, wz, 2); driedFrame(g, W / 2 + 0.44, 1.5, wz, 3);
    }
    // mobilier à côté du meuble
    if (deco.fauteuil) armchair(g, th.chair, -W / 2 - 0.85, 0.95, 0.55, th.plaid);
    if (deco.lampe) sideTable(g, W / 2 + 0.55, 0.55);
    return { group: g, W, H };
  }

  /* ---------- La pièce ---------- */
  window.createRoom3D = function (container, opts) {
    // ambiance choisie dans les réglages : couleurs des murs et des meubles
    applyThemes(opts.themes);
    const night = !!opts.night;
    let renderer;
    try {
      renderer = new T.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
    } catch (e) { console.warn("3D indisponible", e); return null; }
    if (!renderer.getContext()) return null;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // ombres douces, calculées une fois quand la pièce change (pas à chaque image)
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
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

    /* Reflets doux : une petite pièce lumineuse (d'après RoomEnvironment des exemples three.js r160, licence MIT),
       teintée chaud, transformée en carte d'environnement. Une par moment de la journée, calculée à la demande. */
    const pmrem = new T.PMREMGenerator(renderer);
    const envCache = new Map();
    function roomEnv(day, lamp, sky) {
      const key = day + "|" + lamp + "|" + sky;
      if (envCache.has(key)) return envCache.get(key);
      const es = new T.Scene(), geo = new T.BoxGeometry();
      const wallM = new T.MeshStandardMaterial({ color: "#c9a17a", side: T.BackSide, roughness: 1 });
      const furn = new T.MeshStandardMaterial({ color: "#6b4a30", roughness: 1 });
      const glow = (c, k) => new T.MeshBasicMaterial({ color: new T.Color(c).multiplyScalar(k) });
      const add = (m, p, sc, ry) => { const o = new T.Mesh(geo, m); o.position.set(p[0], p[1], p[2]); o.scale.set(sc[0], sc[1], sc[2]); o.rotation.y = ry || 0; es.add(o); };
      const main = new T.PointLight("#ffd2a0", 900 * lamp, 28, 2); main.position.set(0.418, 16.199, 0.3); es.add(main);
      add(wallM, [-0.757, 13.219, 0.717], [31.713, 28.305, 28.591]);
      [[[-10.906, 2.009, 1.846], [2.328, 7.905, 4.651], -0.195], [[-5.607, -0.754, -0.758], [1.97, 1.534, 3.955], 0.994], [[6.167, 0.857, 7.803], [3.927, 6.285, 3.448], 0.561],
        [[-2.017, 0.018, 6.124], [2.002, 4.566, 2.064], 0.333], [[2.291, -0.756, -2.621], [1.546, 1.552, 1.496], -0.286], [[-2.193, -0.369, -5.547], [3.875, 3.487, 2.986], 0.516]]
        .forEach(([p, sc, ry]) => add(furn, p, sc, ry));
      // fenêtres (lumière du jour) et lampe au plafond
      add(glow(sky, 50 * day), [-16.116, 14.37, 8.208], [0.1, 2.428, 2.739]);
      add(glow(sky, 50 * day), [-16.109, 18.021, -8.207], [0.1, 2.425, 2.751]);
      add(glow(sky, 17 * day), [14.904, 12.198, -1.832], [0.15, 4.265, 6.331]);
      add(glow("#ffe0b8", 43 * (day * 0.7 + lamp * 0.3)), [-0.462, 8.89, 14.52], [4.38, 5.441, 0.088]);
      add(glow("#ffd6a8", 20 * (day * 0.6 + lamp * 0.4)), [3.235, 11.486, -12.541], [2.5, 2, 0.1]);
      add(glow("#ffc78a", 100 * lamp), [0, 20, 0], [1, 0.1, 1]);
      const tex = pmrem.fromScene(es, 0.04).texture;
      geo.dispose(); es.traverse((o) => o.material && o.material.dispose());
      envCache.set(key, tex);
      return tex;
    }

    const ambient = new T.AmbientLight("#ffe2c4", 0.3); scene.add(ambient);
    const hemi = new T.HemisphereLight("#fff1dc", "#5a3a24", 0.3); scene.add(hemi);
    const ceilingLight = new T.PointLight("#ffd3a0", 8, 12, 1.6); ceilingLight.position.set(0, 2.75, 0); scene.add(ceilingLight);
    // lumière du jour qui entre de biais (plus chaude le matin et le soir, absente la nuit)
    const sun = new T.DirectionalLight("#fff4e6", 0); sun.position.set(3, 3.2, 2); scene.add(sun);
    /* La lumière suit l'heure : matin doré, journée claire, soirée chaude, nuit tamisée.
       Les deux dernières colonnes règlent les reflets : part du jour et part de la lampe. */
    const LIGHT_KEYS = [ // heure, ambiante, intensité, ciel, intensité, plafond, soleil, intensité, exposition, jour, lampe
      [0, "#b9bde6", 0.18, "#c9c8ec", 0.16, 11, "#8090c0", 0, 0.95, 0.04, 0.22],
      [6, "#c9c4e0", 0.22, "#d8d4f0", 0.2, 10.5, "#ffb070", 0, 0.98, 0.1, 0.2],
      [8, "#ffe6c8", 0.3, "#fff0dc", 0.32, 7.5, "#ffc98a", 1.1, 1.02, 0.3, 0.1],
      [12, "#fff3e6", 0.36, "#fffaf0", 0.4, 6.5, "#fff4e6", 1.4, 1.05, 0.38, 0.06],
      [16, "#ffeedd", 0.34, "#fff4e4", 0.38, 7, "#ffe2b8", 1.2, 1.04, 0.34, 0.08],
      [19, "#ffd0a4", 0.25, "#ffe0bc", 0.24, 10.5, "#ff9a5a", 0.5, 1.0, 0.14, 0.18],
      [22, "#c4bfe4", 0.2, "#d0cceb", 0.18, 11, "#8090c0", 0, 0.96, 0.05, 0.22],
      [24, "#b9bde6", 0.18, "#c9c8ec", 0.16, 11, "#8090c0", 0, 0.95, 0.04, 0.22],
    ];
    const ca = new T.Color(), cb = new T.Color();
    function setHour(h) {
      if (night) h = 23; // ambiance « Soirée » : toujours le soir
      let i = 0; while (i < LIGHT_KEYS.length - 2 && LIGHT_KEYS[i + 1][0] <= h) i++;
      const A = LIGHT_KEYS[i], B = LIGHT_KEYS[i + 1], t = Math.max(0, Math.min(1, (h - A[0]) / (B[0] - A[0])));
      const lerp = (k) => A[k] + (B[k] - A[k]) * t, col = (k) => ca.set(A[k]).lerp(cb.set(B[k]), t);
      ambient.color.copy(col(1)); ambient.intensity = lerp(2);
      hemi.color.copy(col(3)); hemi.intensity = lerp(4);
      ceilingLight.intensity = lerp(5);
      sun.color.copy(col(6)); sun.intensity = lerp(7);
      renderer.toneMappingExposure = lerp(8);
      // reflets : valeurs arrondies pour ne recalculer la carte que rarement
      const r2 = (v) => Math.round(v * 50) / 50;
      scene.environment = roomEnv(r2(lerp(9)), r2(lerp(10)), (t < 0.5 ? A : B)[3]);
      kick();
    }
    const nowHour = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; };
    let fixedHour = opts.hour;
    setInterval(() => { if (fixedHour === undefined) setHour(nowHour()); }, 5 * 60 * 1000);
    ceilingLight.castShadow = true;
    ceilingLight.shadow.mapSize.set(512, 512);
    ceilingLight.shadow.radius = 3; ceilingLight.shadow.bias = -0.0015; ceilingLight.shadow.normalBias = 0.006;
    ceilingLight.shadow.camera.near = 0.2; ceilingLight.shadow.camera.far = 8;

    // sol, plafond, tapis
    const floor = new T.Mesh(new T.PlaneGeometry(ROOM * 2, ROOM * 2), new T.MeshStandardMaterial({ map: floorTex(opts.floor), roughness: 0.8 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const ceil = new T.Mesh(new T.PlaneGeometry(ROOM * 2, ROOM * 2), mat("#f1e4cf")); ceil.rotation.x = Math.PI / 2; ceil.position.y = 3.6; scene.add(ceil);
    makeRug(scene);
    // suspension au plafond
    pendantLamp(scene);

    // murs : un par étagère, chacun à ses couleurs
    const dir = (a) => new T.Vector3(Math.sin(a), 0, -Math.cos(a));
    const walls = {};
    KEYS.forEach((k, i) => {
      const a = i * QUARTER;
      const wall = new T.Mesh(new T.PlaneGeometry(ROOM * 2, 3.6), new T.MeshStandardMaterial({ map: wallTexture(THEMES[k]), roughness: 0.95 }));
      walls[k] = wall; wall.receiveShadow = true;
      wall.position.copy(dir(a).multiplyScalar(ROOM)); wall.position.y = 1.8; wall.rotation.y = -a; scene.add(wall);
      const skirting = new T.Mesh(new T.BoxGeometry(ROOM * 2, 0.12, 0.03), mat("#f3e7d6"));
      skirting.position.copy(dir(a).multiplyScalar(ROOM - 0.015)); skirting.position.y = 0.06; skirting.rotation.y = -a; scene.add(skirting);
    });

    let cases = {};       // clé → { group, W, H }
    let pick = [];
    let yaw = 0, targetYaw = 0, zoom = 1, targetZoom = 1, panX = 0, panY = 0, targetPanX = 0, targetPanY = 0;
    let width = 1, height = 1, needs = true, raf = 0;

    let lastMap = {}, curOver = opts.themes, curFloor = opts.floor;
    /* Changer la déco sans recharger : murs repeints, meubles reconstruits */
    function setFloor(c) { curFloor = c; const m = floor.material; if (m.map) m.map.dispose(); m.map = floorTex(c); m.needsUpdate = true; kick(); }
    function setThemes(over) {
      curOver = over;
      applyThemes(over);
      KEYS.forEach((k) => { const m = walls[k].material; if (m.map) m.map.dispose(); m.map = wallTexture(THEMES[k]); m.needsUpdate = true; });
      setBooks(lastMap);
    }
    // les photos de matières arrivent après le premier dessin : on repeint quand elles sont là
    let photoTimer = 0;
    photoWaiters.push(() => { clearTimeout(photoTimer); photoTimer = setTimeout(() => { setFloor(curFloor); setThemes(curOver); }, 60); });
    /* Livre qu'on vient de ranger : il glisse à sa place */
    const animIn = new Map(); let anims = [];
    const ANIM_MS = 1100;
    function shelve(id) { animIn.set(id, performance.now() + 120); setTimeout(() => animIn.delete(id), ANIM_MS + 400); }
    function setBooks(map) {
      lastMap = map; anims = [];
      Object.values(cases).forEach((c) => {
        scene.remove(c.group);
        c.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      });
      cases = {}; pick = [];
      KEYS.forEach((k, i) => {
        const c = buildCase(k, map[k] || [], { pick, colorOf: opts.colorOf, textOn: opts.textOn, narrow: width / height < 0.8, animIn, anims, onTex: () => { renderer.shadowMap.needsUpdate = true; kick(); } });
        const a = i * QUARTER;
        c.group.position.copy(dir(a).multiplyScalar(R + DEPTH / 2));
        c.group.rotation.y = -a;
        c.group.traverse((o) => { if (o.isMesh && !(o.material && o.material.isMeshBasicMaterial)) { o.castShadow = !o.isInstancedMesh; o.receiveShadow = true; } });
        scene.add(c.group);
        cases[k] = c;
      });
      anims.forEach(stepAnim);
      renderer.shadowMap.needsUpdate = true;
      kick();
    }
    // départ : un peu devant et au-dessus, puis le livre recule doucement dans le rayon
    function stepAnim(a) {
      const p = Math.max(0, Math.min(1, (performance.now() - a.t0) / ANIM_MS)), e = 1 - Math.pow(1 - p, 3);
      a.obj.position.set(a.to.x, a.to.y + Math.sin(Math.PI * Math.min(1, e * 1.1)) * 0.08 + (1 - e) * 0.05, a.to.z + (1 - e) * 0.7);
      return p < 1;
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
      let animating = false;
      if (anims.length) { anims = anims.filter((a) => { const on = stepAnim(a); animating = animating || on; return on; }); if (!anims.length) renderer.shadowMap.needsUpdate = true; }
      const moving = animating || Math.abs(targetYaw - yaw) > 0.0005 || Math.abs(targetZoom - zoom) > 0.0005 || Math.abs(targetPanX - panX) > 0.0005 || Math.abs(targetPanY - panY) > 0.0005;
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
      else if (!hit && opts.onTapEmpty) opts.onTapEmpty();
    }

    resize();
    setHour(fixedHour !== undefined ? fixedHour : nowHour());
    /* Pour les tests : position à l'écran d'un livre et état de la caméra */
    function debug(i) {
      const m = pick[i]; if (!m) return { yaw, targetYaw };
      const v = new T.Vector3(); m.getWorldPosition(v); v.project(camera);
      return { yaw, targetYaw, x: (v.x + 1) / 2 * width, y: (1 - v.y) / 2 * height, id: m.userData.id };
    }
    // pour les tests : coût du dessin (appels et triangles de la dernière image)
    const stats = () => ({ appels: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries });
    return { stats, setBooks, setThemes, setFloor, face, step, resize, currentKey, canvas, debug, shelve, setHour: (h) => { fixedHour = h; setHour(h); } };
  };
})();
