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
      if (PHOTOS.bois) { tinted(g, PHOTOS.bois, base, w, h); return; }
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
      // dos arrondi : clair au milieu, plus sombre sur les bords
      sh.addColorStop(0, "rgba(0,0,0,.38)"); sh.addColorStop(0.18, "rgba(255,255,255,.06)"); sh.addColorStop(0.42, "rgba(255,255,255,.16)");
      sh.addColorStop(0.7, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,0,.42)");
      g.fillStyle = sh; g.fillRect(0, 0, w, h);
      // grain du papier ou de la toile, et usure en haut et en bas
      for (let i = 0; i < 500; i++) { g.fillStyle = i % 2 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.06)"; g.fillRect((i * 37.7) % w, (i * 97.3) % h, 1, 1 + (i % 3)); }
      const wear = g.createLinearGradient(0, 0, 0, h);
      wear.addColorStop(0, "rgba(0,0,0,.25)"); wear.addColorStop(0.03, "rgba(0,0,0,0)"); wear.addColorStop(0.97, "rgba(0,0,0,0)"); wear.addColorStop(1, "rgba(0,0,0,.3)");
      g.fillStyle = wear; g.fillRect(0, 0, w, h);
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
  const woodMat = (c) => new T.MeshStandardMaterial({ map: woodTexture(c, [1, 1]), roughness: 0.6 });
  const matCache = new Map();
  function mat(color, opts) {
    const key = color + JSON.stringify(opts || {});
    if (!matCache.has(key)) matCache.set(key, new T.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...(opts || {}) }));
    return matCache.get(key);
  }
  // tranche des pages : fines lignes, un peu jaunies
  const pagesTex = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = "#efe4cc"; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { g.fillStyle = y % 6 ? "rgba(120,90,50,.08)" : "rgba(120,90,50,.16)"; g.fillRect(0, y, w, 1); }
  });
  const pagesMat = new T.MeshStandardMaterial({ map: pagesTex, roughness: 0.95 });
  const box = (w, h, d, m, x, y, z, parent) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x, y, z); parent.add(o); return o; };
  const cyl = (rt, rb, h, m, x, y, z, parent, seg) => { const o = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg || 20), m); o.position.set(x, y, z); parent.add(o); return o; };
  const ball = (r, m, x, y, z, parent) => { const o = new T.Mesh(new T.SphereGeometry(r, 16, 12), m); o.position.set(x, y, z); parent.add(o); return o; };

  /* ---------- Petits objets ---------- */
  /* Outils des petits objets : hasard fixe, grain, morceaux fusionnés en une seule géométrie, profils tournés */
  const rz = (n) => { const x = Math.sin(n * 91.345 + 47.853) * 43758.5453; return x - Math.floor(x); };
  const vnoise = (x, y) => { // bruit doux (valeurs interpolées)
    const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, h = (a, b) => rz(a * 57.13 + b * 113.71);
    const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    return (h(xi, yi) * (1 - su) + h(xi + 1, yi) * su) * (1 - sv) + (h(xi, yi + 1) * (1 - su) + h(xi + 1, yi + 1) * su) * sv;
  };
  // relief en niveaux de gris (sans correction de couleur)
  function reliefTex(w, h, draw, repeat) { const t = canvasTex(w, h, draw, repeat || [1, 1]); t.colorSpace = T.NoColorSpace; return t; }
  const grainTex = reliefTex(128, 128, (g, w, h) => {
    g.fillStyle = "#808080"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) { const v = (70 + rz(i) * 120) | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(rz(i + 0.3) * w, rz(i + 0.7) * h, 1 + rz(i + 0.9) * 2, 1 + rz(i + 0.1) * 2); }
  });
  const _q = new T.Quaternion(), _e = new T.Euler(), _up = new T.Vector3(0, 1, 0);
  // position, rotation, échelle → matrice
  const tm = (x, y, z, rx, ry, rzz, sx, sy, sz, order) => new T.Matrix4().compose(new T.Vector3(x, y, z), _q.clone().setFromEuler(_e.set(rx || 0, ry || 0, rzz || 0, order || "XYZ")), new T.Vector3(sx || 1, sy === undefined ? sx || 1 : sy, sz === undefined ? sx || 1 : sz));
  // un cylindre unité étiré du point a au point b
  function segM(a, b, r) { const d = new T.Vector3().subVectors(b, a), l = d.length(); return new T.Matrix4().compose(a.clone().addScaledVector(d, 0.5), new T.Quaternion().setFromUnitVectors(_up, d.normalize()), new T.Vector3(r, l, r)); }
  const unitCyl = new T.CylinderGeometry(1, 1, 1, 5, 1, true), unitBox = new T.BoxGeometry(1, 1, 1), unitBall = new T.SphereGeometry(1, 12, 9);
  /* Fusionne des morceaux { geo, m (matrice), c (couleur), uv [u0, v0, su, sv], vc (assombrir selon la position) } */
  const _nm = new T.Matrix3(), _p = new T.Vector3(), _c = new T.Color(), _id = new T.Matrix4();
  function bake(parts) {
    let nv = 0, ni = 0;
    for (const p of parts) { const P = p.geo.attributes.position; nv += P.count; ni += p.geo.index ? p.geo.index.count : P.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3), idx = new Uint32Array(ni);
    let o = 0, oi = 0;
    for (const p of parts) {
      const G = p.geo, P = G.attributes.position, N = G.attributes.normal, U = G.attributes.uv, m = p.m || _id, r = p.uv || [0, 0, 1, 1];
      _nm.getNormalMatrix(m); _c.set(p.c || "#ffffff");
      const cr = _c.r, cg = _c.g, cb = _c.b;
      for (let i = 0; i < P.count; i++) {
        const k = (o + i) * 3;
        _p.fromBufferAttribute(P, i).applyMatrix4(m); pos[k] = _p.x; pos[k + 1] = _p.y; pos[k + 2] = _p.z;
        const f = p.vc ? p.vc(_p) : 1;
        col[k] = cr * f; col[k + 1] = cg * f; col[k + 2] = cb * f;
        if (N) { _p.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize(); nor[k] = _p.x; nor[k + 1] = _p.y; nor[k + 2] = _p.z; }
        if (U) { uv[(o + i) * 2] = r[0] + U.getX(i) * r[2]; uv[(o + i) * 2 + 1] = r[1] + U.getY(i) * r[3]; }
      }
      if (G.index) for (let i = 0; i < G.index.count; i++) idx[oi + i] = G.index.getX(i) + o;
      else for (let i = 0; i < P.count; i++) idx[oi + i] = o + i;
      o += P.count; oi += G.index ? G.index.count : P.count;
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(pos, 3)); geo.setAttribute("normal", new T.BufferAttribute(nor, 3));
    geo.setAttribute("uv", new T.BufferAttribute(uv, 2)); geo.setAttribute("color", new T.BufferAttribute(col, 3));
    geo.setIndex(new T.BufferAttribute(idx, 1));
    return geo;
  }
  /* Profil tourné (rayon, hauteur), gardé en cache ; la texture suit la longueur du profil */
  const latheCache = new Map();
  function lathe(key, pts, seg) {
    if (latheCache.has(key)) return latheCache.get(key);
    const geo = new T.LatheGeometry(pts.map(([x, y]) => new T.Vector2(x, y)), seg || 24);
    const L = [0], np = pts.length;
    for (let j = 1; j < np; j++) L.push(L[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, L[i % np] / L[np - 1]);
    latheCache.set(key, geo);
    return geo;
  }

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
      // reflet brillant d'un côté de la nervure, petites marbrures
      const sh = g.createLinearGradient(60, 0, 150, 0); sh.addColorStop(0, "rgba(255,255,240,0)"); sh.addColorStop(0.7, "rgba(255,255,240,.12)"); sh.addColorStop(1, "rgba(255,255,240,0)");
      g.fillStyle = sh; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { g.fillStyle = i % 2 ? "rgba(255,255,220,.035)" : "rgba(0,20,0,.05)"; g.beginPath(); g.ellipse(rz(i) * w, rz(i + 0.5) * h, 2 + rz(i + 0.2) * 6, 1 + rz(i + 0.7) * 3, rz(i + 0.9) * 3, 0, 7); g.fill(); }
      g.restore();
      // découpes : fentes depuis le bord vers la nervure, et petits trous ovales près du centre
      g.globalCompositeOperation = "destination-out";
      for (let i = 0; i < 6; i++) {
        const yy = 70 + i * 28, k = 1 - i * 0.08;
        [-1, 1].forEach((sd) => {
          g.lineWidth = 7 - i * 0.4 + sd * 0.6; g.lineCap = "round"; g.beginPath(); g.moveTo(cx + sd * (36 + (i % 2) * 6), yy + 8); g.quadraticCurveTo(cx + sd * 70, yy - 4 + sd * 2, cx + sd * 130 * k, yy - 22); g.stroke();
          if (i > 0 && i < 5) { g.beginPath(); g.ellipse(cx + sd * (24 + (i % 2) * 3), yy - 4, 3.5, 8 + (i % 2) * 2, sd * 0.6, 0, 7); g.fill(); }
        });
      }
      g.globalCompositeOperation = "source-over";
      g.strokeStyle = "rgba(220,240,180,.45)"; g.lineWidth = 4; g.beginPath(); g.moveTo(cx, 248); g.quadraticCurveTo(cx - 4, 140, cx, 34); g.stroke();
      g.lineWidth = 1.5; g.strokeStyle = "rgba(220,240,180,.2)";
      for (let i = 0; i < 6; i++) { const yy = 84 + i * 28; [-1, 1].forEach((sd) => { g.beginPath(); g.moveTo(cx, yy + 8); g.quadraticCurveTo(cx + sd * 50, yy, cx + sd * 100, yy - 12); g.stroke(); }); }
    });
  }
  /* Dessine une feuille dans une case de 128 px (ox, oy) : la base (le pétiole) en bas, la pointe en haut */
  function drawLeaf(g, kind, c1, c2, ox, oy, variegated) {
    g.save(); g.translate(ox, oy);
    const P = new Path2D();
    if (kind === "round") { // pilea : presque ronde, bord un peu ondulé
      for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2, r = 56 + Math.sin(a * 5) * 1.5 + Math.sin(a * 2 + 1) * 2; P.lineTo(64 + Math.cos(a) * r, 66 + Math.sin(a) * r); }
    } else { // cœur : creux à la base, pointe un peu déjetée
      P.moveTo(64, 108);
      P.bezierCurveTo(56, 122, 24, 124, 13, 102); P.bezierCurveTo(1, 78, 9, 42, 34, 23); P.bezierCurveTo(46, 14, 58, 9, 67, 3);
      P.bezierCurveTo(74, 11, 86, 16, 97, 25); P.bezierCurveTo(121, 45, 126, 80, 115, 102); P.bezierCurveTo(105, 122, 73, 122, 64, 108);
    }
    P.closePath();
    const grad = g.createLinearGradient(20, 10, 110, 120); grad.addColorStop(0, c1); grad.addColorStop(1, c2);
    g.fillStyle = grad; g.fill(P);
    g.save(); g.clip(P);
    const bx = 64, by = kind === "round" ? 74 : 106;
    // plus clair au centre, bord plus sombre ; reflet brillant d'un côté
    const rg = g.createRadialGradient(58, 58, 4, 64, 64, 72); rg.addColorStop(0, "rgba(255,255,215,.2)"); rg.addColorStop(0.62, "rgba(0,0,0,0)"); rg.addColorStop(1, "rgba(0,15,0,.42)");
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    const sh = g.createLinearGradient(30, 0, 70, 0); sh.addColorStop(0, "rgba(255,255,240,0)"); sh.addColorStop(0.6, "rgba(255,255,240,.13)"); sh.addColorStop(1, "rgba(255,255,240,0)");
    g.fillStyle = sh; g.fillRect(0, 0, 128, 128);
    if (variegated) for (let i = 0; i < 9; i++) { // marbrures crème du pothos doré, le long des nervures
      g.strokeStyle = `rgba(240,228,150,${0.22 + rz(i) * 0.25})`; g.lineWidth = 1.5 + rz(i + 3) * 4;
      const sx = (rz(i + 7) - 0.5) * 50;
      g.beginPath(); g.moveTo(64 + sx * 0.15, 104); g.quadraticCurveTo(64 + sx * 1.2, 64, 64 + sx * 0.6, 14 + rz(i + 1) * 20); g.stroke();
    }
    for (let i = 0; i < 160; i++) { g.fillStyle = i % 2 ? "rgba(255,255,220,.05)" : "rgba(0,30,0,.06)"; g.fillRect(rz(i + 9) * 128, rz(i + 4) * 128, 1 + rz(i) * 3, 1 + rz(i + 2) * 2); }
    // nervures : principale claire, secondaires qui remontent vers la pointe
    g.lineCap = "round";
    if (kind === "round") {
      g.strokeStyle = "rgba(220,240,180,.32)"; g.lineWidth = 1.4;
      for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i - 4) * 0.62; g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx + Math.cos(a) * 26, by + Math.sin(a) * 30, bx + Math.cos(a) * 50, by + Math.sin(a) * 54 + 4); g.stroke(); }
      g.fillStyle = "rgba(230,245,200,.5)"; g.beginPath(); g.arc(bx, by, 3, 0, 7); g.fill();
    } else {
      g.strokeStyle = "rgba(225,245,190,.5)"; g.lineWidth = 2.2; g.beginPath(); g.moveTo(64, 108); g.quadraticCurveTo(62, 60, 66, 6); g.stroke();
      g.lineWidth = 1.1; g.strokeStyle = "rgba(225,245,190,.26)";
      for (let i = 0; i < 5; i++) { const y = 96 - i * 16; [-1, 1].forEach((k) => { g.beginPath(); g.moveTo(63, y); g.quadraticCurveTo(64 + k * (26 - i * 3), y - 8, 64 + k * (44 - i * 6), y - 30); g.stroke(); }); }
    }
    g.restore();
    g.strokeStyle = "rgba(10,30,5,.2)"; g.lineWidth = 1; g.stroke(P); // liseré du bord
    g.restore();
  }
  function leafTexture(kind, c1, c2) {
    return canvasTex(128, 128, (g) => drawLeaf(g, kind, c1, c2, 0, 0, c1 === "#8fae5a"));
  }
  const leafMat = (kind, c1, c2) => new T.MeshStandardMaterial({ map: leafTexture(kind, c1, c2), alphaTest: 0.5, side: T.DoubleSide, roughness: 0.6 });
  const LEAVES = {
    heart: [leafMat("heart", "#4f7f3a", "#2c5424"), leafMat("heart", "#8fae5a", "#4c7a34"), leafMat("heart", "#3b6a30", "#1f421b"), leafMat("heart", "#5f8f45", "#335e28")],
    blade: [leafMat("blade", "#4c7a3c", "#2a4d24"), leafMat("blade", "#6f9a4a", "#3d6a2e")],
    monstera: [["#3f6f34", "#1d4219"], ["#4f8040", "#264f20"], ["#35602c", "#183a15"]].map(([a, b]) => new T.MeshStandardMaterial({ map: monsteraTexture(a, b), alphaTest: 0.5, side: T.DoubleSide, roughness: 0.45 })),
  };
  /* Ombre douce au fond de chaque case (sous le rayon du dessus et dans les coins) */
  const aoMat = new T.MeshBasicMaterial({ map: canvasTex(128, 128, (g, w, h) => {
    const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, "rgba(0,0,0,.62)"); v.addColorStop(0.35, "rgba(0,0,0,.12)"); v.addColorStop(0.85, "rgba(0,0,0,.05)"); v.addColorStop(1, "rgba(0,0,0,.3)");
    g.fillStyle = v; g.fillRect(0, 0, w, h);
    const sides = g.createLinearGradient(0, 0, w, 0); sides.addColorStop(0, "rgba(0,0,0,.4)"); sides.addColorStop(0.08, "rgba(0,0,0,0)"); sides.addColorStop(0.92, "rgba(0,0,0,0)"); sides.addColorStop(1, "rgba(0,0,0,.4)");
    g.fillStyle = sides; g.fillRect(0, 0, w, h);
  }), transparent: true, depthWrite: false });
  const leafPlane = new T.PlaneGeometry(0.1, 0.1); leafPlane.translate(0, 0.05, 0);
  /* Une seule texture pour les feuilles des pots (4 cases) : toute une plante tient en un seul appel de dessin */
  const leafAtlas = canvasTex(256, 256, (g) => {
    drawLeaf(g, "heart", "#4f7f3a", "#2c5424", 0, 0); drawLeaf(g, "heart", "#8fae5a", "#4c7a34", 128, 0, true);
    drawLeaf(g, "heart", "#3b6a30", "#1f421b", 0, 128); drawLeaf(g, "round", "#6fa84c", "#3d772b", 128, 128);
  });
  const ATLAS = [[0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5], [0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5]];
  const stalkUV = (q) => [ATLAS[q][0] + 0.25, ATLAS[q][1] + 0.2, 0.002, 0.002]; // un point vert de la nervure, pour les tiges
  const plantMat = new T.MeshStandardMaterial({ map: leafAtlas, vertexColors: true, alphaTest: 0.45, alphaToCoverage: true, side: T.DoubleSide, roughness: 0.5 });
  // feuille un peu creusée le long de la nervure, pointe qui retombe
  const leafCurve = (() => {
    const p = new T.PlaneGeometry(0.1, 0.1, 3, 3); p.translate(0, 0.05, 0);
    const a = p.attributes.position;
    for (let i = 0; i < a.count; i++) { const x = a.getX(i) / 0.05, y = a.getY(i) / 0.1; a.setZ(i, x * x * 0.011 - y * y * 0.02); }
    p.computeVertexNormals(); return p;
  })();
  const discLeaf = (() => {
    const p = new T.CircleGeometry(0.05, 16); const a = p.attributes.position;
    for (let i = 0; i < a.count; i++) { const r = Math.hypot(a.getX(i), a.getY(i)) / 0.05; a.setZ(i, -r * r * 0.008); }
    p.computeVertexNormals(); return p;
  })();

  /* ---------- Pots tournés : profil avec lèvre, terre cuite, céramique émaillée, béton ---------- */
  const POT_SHAPES = {
    classic: [[0, 0], [0.052, 0], [0.058, 0.003], [0.06, 0.012], [0.068, 0.094], [0.07, 0.099], [0.078, 0.101], [0.08, 0.107], [0.08, 0.126], [0.077, 0.131], [0.072, 0.131], [0.068, 0.125], [0.066, 0.112]],
    belly: [[0, 0], [0.042, 0], [0.05, 0.005], [0.064, 0.034], [0.074, 0.074], [0.074, 0.104], [0.068, 0.123], [0.069, 0.129], [0.066, 0.132], [0.062, 0.127], [0.06, 0.112]],
    straight: [[0, 0], [0.06, 0], [0.067, 0.003], [0.07, 0.012], [0.072, 0.124], [0.071, 0.13], [0.067, 0.131], [0.065, 0.124], [0.064, 0.112]],
    big: [[0, 0], [0.125, 0], [0.132, 0.008], [0.135, 0.02], [0.163, 0.268], [0.166, 0.276], [0.181, 0.28], [0.186, 0.29], [0.186, 0.325], [0.182, 0.333], [0.172, 0.333], [0.166, 0.326], [0.163, 0.3]],
  };
  const SOIL = { classic: [0.067, 0.117], belly: [0.061, 0.115], straight: [0.065, 0.117], big: [0.164, 0.31] };
  const pots = ["terre", "creme", "noir", "beton", "sauge"];
  const POT_LOOK = { // couleurs haut/bas, rugosité, relief
    terre: ["#bf6d44", "#9c5232", 0.9, 0.9], creme: ["#ece6d8", "#d8cfbd", 0.32, 0.25], noir: ["#34312e", "#262422", 0.6, 0.3],
    beton: ["#b0aca4", "#96928a", 0.95, 1.2], sauge: ["#8ea086", "#6c8066", 0.38, 0.25],
  };
  const potMats = {};
  function potMat(kind) {
    if (potMats[kind]) return potMats[kind];
    const L = POT_LOOK[kind];
    const map = canvasTex(256, 128, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, L[0]); gr.addColorStop(1, L[1]); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 46; i++) { // taches douces
        const x = rz(i * 3.1 + kind.length) * w, y = rz(i * 5.7) * h, r = 6 + rz(i * 1.3) * 24, rg = g.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, rz(i * 7.7) > 0.5 ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.08)"); rg.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = rg;
        [0, -w, w].forEach((o) => { g.save(); g.translate(o, 0); g.fillRect(x - r, y - r, 2 * r, 2 * r); g.restore(); }); // raccord sans couture
      }
      if (kind === "terre") {
        for (let y = 0; y < h; y += 3) { g.fillStyle = `rgba(${rz(y) > 0.5 ? "255,230,200" : "60,20,0"},${0.03 + rz(y + 1) * 0.04})`; g.fillRect(0, y, w, 1); } // traces du tour
        for (let i = 0; i < 30; i++) { const x = rz(i + 40) * w, y = 4 + rz(i + 41) * 40, r = 4 + rz(i + 42) * 14; g.fillStyle = "rgba(240,232,215,.12)"; g.beginPath(); g.ellipse(x, y, r * 1.8, r * 0.6, 0, 0, 7); g.fill(); } // voile calcaire sous la lèvre
      }
      if (kind === "beton") for (let i = 0; i < 500; i++) { g.fillStyle = rz(i) > 0.3 ? "rgba(50,48,44,.28)" : "rgba(255,255,255,.2)"; g.fillRect(rz(i + 0.4) * w, rz(i + 0.8) * h, 1, 1 + (i % 2)); }
      if (kind === "creme" || kind === "sauge" || kind === "noir") {
        for (let i = 0; i < 380; i++) { g.fillStyle = kind === "noir" ? "rgba(255,240,220,.18)" : "rgba(80,50,30,.4)"; g.fillRect(rz(i + 0.4) * w, rz(i + 0.8) * h, 1, 1); } // mouchetures
        for (let i = 0; i < 26; i++) { const x = rz(i + 9) * w, l = 10 + rz(i + 3) * 40; g.fillStyle = "rgba(0,0,0,.05)"; g.fillRect(x, h * 0.25, 2 + rz(i) * 3, l); } // coulures d'émail
      }
    });
    return (potMats[kind] = new T.MeshStandardMaterial({ map, roughness: L[2], bumpMap: grainTex, bumpScale: L[3] }));
  }
  const soilGeo = (() => { const c = new T.CircleGeometry(1, 22); c.rotateX(-Math.PI / 2); c.attributes.position.setY(0, 0.006); c.computeVertexNormals(); return c; })();
  const soilMat = new T.MeshStandardMaterial({ roughness: 1, bumpMap: grainTex, bumpScale: 2, map: canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = "#33241a"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { const v = rz(i); g.fillStyle = v > 0.94 ? "rgba(235,230,220,.8)" : v > 0.6 ? "rgba(90,62,40,.7)" : "rgba(15,10,6,.6)"; g.beginPath(); g.ellipse(rz(i + 0.3) * w, rz(i + 0.6) * h, 0.6 + rz(i + 0.1) * 1.8, 0.5 + rz(i + 0.2) * 1.2, rz(i + 0.5) * 3, 0, 7); g.fill(); }
  }) });
  // pose un pot et son terreau ; renvoie la hauteur du terreau
  function potMesh(parent, kind, shape) {
    parent.add(new T.Mesh(lathe("pot-" + shape, POT_SHAPES[shape], shape === "big" ? 36 : 28), potMat(kind)));
    const [r, y] = SOIL[shape], s = new T.Mesh(soilGeo, soilMat); s.position.y = y; s.scale.set(r, 1, r); parent.add(s);
    return y + 0.004;
  }
  /* Pothos en touffe : feuilles de tailles, d'angles et de teintes variés, quelques-unes passent par-dessus le bord */
  const _rX = new T.Matrix4(), _rY = new T.Matrix4();
  function pothosParts(parts, y, n, rim, seed, quads) {
    const base = new T.Vector3(), tip = new T.Vector3();
    for (let i = 0; i < n; i++) {
      const r1 = rz(seed + i * 1.37), r2 = rz(seed * 3 + i * 2.11), r3 = rz(seed + i * 4.7), q = quads[i % quads.length];
      const a = i * 2.39996 + seed + r1 * 0.5, trail = i % 7 === 4;
      const out = trail ? rim * (1.02 + r2 * 0.1) : rim * (0.1 + 1.05 * Math.sqrt((i + 0.5) / n));
      const h = trail ? y + 0.006 : y + 0.014 + Math.max(0, 1 - out / rim) * 0.1 * (0.45 + r2 * 0.8);
      const tilt = trail ? 1.85 + r3 * 0.6 : 0.5 + (out / rim) * 0.8 + r2 * 0.35;
      const s = (0.8 + r2 * 0.6) * (trail ? 0.9 : 1.05 - 0.2 * (out / rim));
      const yaw = Math.atan2(-Math.cos(a), -Math.sin(a)) + (r1 - 0.5) * 1.2;
      tip.set(Math.cos(a) * out, h, Math.sin(a) * out);
      const young = Math.max(0, 1 - out / rim);
      // orientation : cap (vers l'extérieur), inclinaison, puis la feuille tourne un peu sur sa nervure pour montrer sa face
      const m = new T.Matrix4().makeTranslation(tip.x, tip.y, tip.z).multiply(_rY.makeRotationY(yaw)).multiply(_rX.makeRotationX(-tilt))
        .multiply(_rY.makeRotationY((r3 - 0.5) * 1.6)).multiply(_rX.makeRotationZ((r1 - 0.5) * 0.5)).multiply(_rX.makeScale(s, s * (0.92 + r1 * 0.16), s));
      parts.push({ geo: leafCurve, m,
        c: new T.Color(0.78 + r1 * 0.2 + young * 0.12, 0.82 + r2 * 0.16 + young * 0.1, 0.7 + r3 * 0.2), uv: ATLAS[q],
        vc: (p) => Math.min(1.08, 0.55 + Math.max(0, p.y - y + 0.01) * 9) });
      // pétiole : du centre du pot à la base de la feuille
      base.set(Math.cos(a) * out * 0.2, y - 0.003, Math.sin(a) * out * 0.2);
      parts.push({ geo: unitCyl, m: segM(base, tip, 0.0018), c: "#9db36a", uv: stalkUV(q) });
    }
  }
  /* Sansevieria : lames dressées, un peu creusées et torsadées, avec des bandes */
  const sansMats = [false, true].map((edge) => new T.MeshStandardMaterial({ vertexColors: true, side: T.DoubleSide, roughness: 0.42, map: canvasTex(64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, "#2c4a28"); gr.addColorStop(0.5, "#37592f"); gr.addColorStop(1, "#2c4a28");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // bandes claires irrégulières : épaisseur, écart et ondulation changent d'une bande à l'autre
    for (let y = 3, i = 0; y < h - 6; y += 6 + rz(i) * 14, i++) {
      const th = 2 + rz(i + 5) * 6, amp = 1.5 + rz(i + 8) * 3.5, fr = 0.07 + rz(i + 9) * 0.08;
      g.fillStyle = `rgba(150,178,128,${0.22 + rz(i + 2) * 0.3})`; g.beginPath();
      for (let x = 0; x <= w; x += 4) { const yy = y + Math.sin(x * fr + i * 1.7) * amp + (vnoise(x * 0.08, i * 3) - 0.5) * 5; x ? g.lineTo(x, yy) : g.moveTo(x, yy); }
      for (let x = w; x >= 0; x -= 4) { const yy = y + th * (0.4 + vnoise(x * 0.09 + 5, i)) + Math.sin(x * fr + i * 1.7) * amp; g.lineTo(x, yy); }
      g.fill();
    }
    for (let i = 0; i < 120; i++) { g.fillStyle = "rgba(20,40,15,.35)"; g.fillRect(rz(i) * w, rz(i + 0.5) * h, 2 + rz(i + 0.3) * 4, 1); }
    if (edge) { // liseré jaune (variété « laurentii »)
      [[0, 1], [w, -1]].forEach(([x0, d]) => { const eg = g.createLinearGradient(x0, 0, x0 + d * 10, 0); eg.addColorStop(0, "#d9c75e"); eg.addColorStop(0.6, "#c9c060"); eg.addColorStop(1, "rgba(201,192,96,0)"); g.fillStyle = eg; g.fillRect(Math.min(x0, x0 + d * 10), 0, 10, h); });
    }
    const bt = g.createLinearGradient(0, h - 30, 0, h); bt.addColorStop(0, "rgba(220,210,170,0)"); bt.addColorStop(1, "rgba(200,190,150,.75)"); g.fillStyle = bt; g.fillRect(0, h - 30, w, 30); // pied plus pâle
    g.fillStyle = "#8a7a4a"; g.fillRect(w / 2 - 2, 0, 4, 3); // pointe sèche
  }) }));
  function bladeGeo(L, W, twist, bend) {
    const N = 10, pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, w = W * (0.62 + 1.25 * t) * Math.pow(1 - t, 0.7) * 0.6, th = twist * t, f = w * 0.3;
      const cx = 0, cy = L * t, cz = bend * L * t * t, dx = Math.cos(th), dz = Math.sin(th);
      pos.push(cx - dx * w, cy, cz - dz * w + Math.cos(th) * f, cx, cy, cz, cx + dx * w, cy, cz + dz * w + Math.cos(th) * f);
      uv.push(0, t, 0.5, t, 1, t);
      if (i) { const a = (i - 1) * 3; idx.push(a, a + 1, a + 3, a + 1, a + 4, a + 3, a + 1, a + 2, a + 4, a + 2, a + 5, a + 4); }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new T.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    geo.computeVertexNormals(); return geo;
  }
  function plant(parent, x, y, z, s, kind) {
    const g = new T.Group(); g.position.set(x, y, z); g.scale.setScalar(s || 1); parent.add(g);
    const seed = Math.round(Math.abs(x * 97 + y * 31 + z * 13) * 10);
    const shape = ["classic", "belly", "straight", "straight", "belly"][seed % 5];
    const top = potMesh(g, pots[seed % pots.length], shape), rim = SOIL[shape][0];
    const type = kind === "pothos" ? "pothos" : ["pothos", "sans", "pilea", "sans"][seed % 4];
    const parts = [];
    if (type === "sans") { // sansevieria : longues lames dressées
      const n = 8 + (seed % 3);
      for (let i = 0; i < n; i++) {
        const r1 = rz(seed + i * 1.9), r2 = rz(seed + i * 3.3), a = i * 2.4 + seed, rr0 = 0.006 + r1 * 0.026;
        const L = (0.2 + r2 * 0.14) * (i < 3 ? 1.12 : 0.9), tilt = 0.04 + (rr0 / 0.032) * 0.28;
        parts.push({ geo: bladeGeo(L, 0.05 + r1 * 0.016, (r2 - 0.5) * 2.2, -0.12 - r1 * 0.2), m: tm(Math.cos(a) * rr0, top - 0.006, Math.sin(a) * rr0, -tilt, Math.atan2(-Math.cos(a), -Math.sin(a)) + (r2 - 0.5) * 1.4, 0, 1, 1, 1, "YXZ"),
          c: new T.Color(0.85 + r1 * 0.25, 0.9 + r2 * 0.15, 0.85 + r1 * 0.15), vc: (p) => Math.min(1, 0.6 + (p.y - top) * 4) });
      }
      g.add(new T.Mesh(bake(parts), sansMats[seed % 3 === 1 ? 1 : 0]));
      return g;
    }
    if (type === "pilea") { // pilea : feuilles rondes au bout de longs pétioles, autour d'une petite tige
      const trunk = top + 0.08;
      parts.push({ geo: unitCyl, m: segM(new T.Vector3(0, top - 0.004, 0), new T.Vector3(0.004, trunk, 0.002), 0.0045), c: "#7f9a52", uv: stalkUV(3) });
      for (let i = 0; i < 15; i++) {
        const t = i / 14, r1 = rz(seed + i * 2.3), a = i * 2.39996 + seed, hy = top + 0.012 + t * 0.065;
        const len = 0.1 - t * 0.055 + r1 * 0.02, el = 0.25 + t * 0.7 + r1 * 0.2;
        const b = new T.Vector3(0.003 * t, hy, 0.002 * t), e = new T.Vector3(Math.cos(a) * len * Math.cos(el), hy + len * Math.sin(el), Math.sin(a) * len * Math.cos(el));
        const mid = b.clone().lerp(e, 0.5); mid.y += 0.012;
        parts.push({ geo: unitCyl, m: segM(b, mid, 0.0014), c: "#a6bf72", uv: stalkUV(3) }, { geo: unitCyl, m: segM(mid, e, 0.0013), c: "#a6bf72", uv: stalkUV(3) });
        const sc = 0.7 + (1 - t) * 0.55 + r1 * 0.25, out = 0.35 + (1 - t) * 0.35;
        parts.push({ geo: discLeaf, m: tm(e.x, e.y + 0.003, e.z, -Math.PI / 2 + out, Math.atan2(Math.cos(a), Math.sin(a)) , 0, sc, sc, sc, "YXZ"),
          c: new T.Color(0.85 + r1 * 0.2 + t * 0.1, 0.9 + t * 0.12, 0.8), uv: ATLAS[3] });
      }
      g.add(new T.Mesh(bake(parts), plantMat));
      return g;
    }
    // pothos en boule, quelques feuilles qui retombent
    pothosParts(parts, top, kind === "pothos" ? 36 : 32, rim, seed, seed % 3 ? [0, 2] : [1]);
    g.add(new T.Mesh(bake(parts), plantMat));
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
    potMesh(g, x > 0 ? "terre" : "creme", "big"); // pot tourné avec sa lèvre et son terreau
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
  /* Bougie : cire un peu translucide (elle s'éclaire près de la flamme), bord fondu, coulures, mèche noire, flamme douce */
  const glowTex = canvasTex(64, 64, (g, w, h) => {
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, "rgba(255,236,190,1)"); rg.addColorStop(0.18, "rgba(255,205,130,.6)"); rg.addColorStop(0.5, "rgba(255,170,80,.16)"); rg.addColorStop(1, "rgba(255,160,60,0)");
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
  });
  const flameMat = new T.SpriteMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, map: canvasTex(64, 128, (g, w, h) => {
    const blob = (cy, ry, r, stops) => { g.save(); g.translate(32, cy); g.scale(1, ry); const rg = g.createRadialGradient(0, 0, 0, 0, 0, r); stops.forEach(([k, c]) => rg.addColorStop(k, c)); g.fillStyle = rg; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); g.restore(); };
    blob(78, 2.6, 18, [[0, "rgba(255,170,70,.9)"], [0.55, "rgba(255,120,30,.35)"], [1, "rgba(255,90,20,0)"]]);  // enveloppe orange
    blob(92, 2.3, 10, [[0, "rgba(255,252,240,1)"], [0.5, "rgba(255,226,150,.9)"], [1, "rgba(255,200,100,0)"]]); // cœur clair
    blob(116, 1, 7, [[0, "rgba(110,140,255,.55)"], [1, "rgba(110,140,255,0)"]]);                                  // pied bleuté
  }) });
  const haloMat = new T.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.55 });
  // guirlande : ampoule en goutte, douille, halo en points
  const fairyBulb = lathe("ampoule", [[0, -0.024], [0.005, -0.022], [0.0078, -0.016], [0.0072, -0.009], [0.0042, -0.004], [0.0034, 0]], 10);
  const fairyCap = (() => { const c = new T.CylinderGeometry(0.0034, 0.0036, 0.007, 8); c.translate(0, 0.0035, 0); return c; })();
  const fairyGlow = new T.PointsMaterial({ map: glowTex, size: 0.17, transparent: true, depthWrite: false, blending: T.AdditiveBlending, color: "#ffc47a" });
  let waxGeoC = null;
  function waxGeo() {
    if (waxGeoC) return waxGeoC;
    const L = lathe("wax", [[0, 0], [0.034, 0], [0.035, 0.004], [0.035, 0.13], [0.0352, 0.146], [0.0346, 0.153], [0.0322, 0.1575], [0.0292, 0.1565], [0.0255, 0.152], [0.013, 0.149], [0, 0.148]], 28).clone();
    const p = L.attributes.position;
    for (let i = 0; i < p.count; i++) { // bord fondu irrégulier
      const y = p.getY(i); if (y < 0.12) continue;
      const a = Math.atan2(p.getZ(i), p.getX(i)), k = (y - 0.12) / 0.038;
      p.setY(i, y - 0.007 * k * (0.5 + 0.5 * Math.sin(a * 2 + 1.2)) - 0.0015 * k * Math.sin(a * 5));
    }
    const parts = [{ geo: L }], drip = new T.CapsuleGeometry(0.0032, 0.016, 3, 6);
    [[0.6, 0.016], [2.3, 0.026], [4.4, 0.012]].forEach(([a, l]) => parts.push({ geo: drip, m: tm(Math.cos(a) * 0.0345, 0.148 - l * 0.6, Math.sin(a) * 0.0345, 0, 0, 0, 1, l / 0.016, 1), uv: [0, 0.8, 1, 0.1] }));
    return (waxGeoC = bake(parts));
  }
  const waxMat = new T.MeshStandardMaterial({ color: "#f4ead8", roughness: 0.5,
    map: canvasTex(64, 128, (g, w, h) => { g.fillStyle = "#fbf6ec"; g.fillRect(0, 0, w, h); for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(200,180,150,${0.04 + rz(i) * 0.06})`; g.fillRect(rz(i + 1) * w, 0, 1 + rz(i + 2) * 3, h); } }),
    emissive: "#ff9a40", emissiveIntensity: 0.55,
    emissiveMap: canvasTex(8, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#ffd29a"); gr.addColorStop(0.1, "#c8783a"); gr.addColorStop(0.32, "#3a1a08"); gr.addColorStop(0.5, "#000"); gr.addColorStop(1, "#000"); g.fillStyle = gr; g.fillRect(0, 0, w, h); }) });
  const brassMat = new T.MeshStandardMaterial({ color: "#b8955c", metalness: 0.45, roughness: 0.35, bumpMap: grainTex, bumpScale: 0.3 });
  const wickGeo = (() => { const c = new T.CylinderGeometry(0.0011, 0.0013, 0.013, 5); c.translate(0, 0.0065, 0); return c; })();
  function candle(parent, x, y, z, s) {
    const g = new T.Group(); g.position.set(x, y, z); g.scale.setScalar(s || 1); parent.add(g);
    g.add(new T.Mesh(lathe("bougeoir", [[0, 0], [0.054, 0], [0.061, 0.002], [0.064, 0.009], [0.062, 0.012], [0.057, 0.008], [0.04, 0.006], [0.036, 0.01], [0.034, 0.012], [0, 0.012]], 28), brassMat));
    const w = new T.Mesh(waxGeo(), waxMat); w.position.y = 0.011; g.add(w);
    const wick = new T.Mesh(wickGeo, mat("#16110d", { roughness: 0.9 })); wick.position.y = 0.155; wick.rotation.z = 0.2; g.add(wick);
    const f = new T.Sprite(flameMat); f.center.set(0.5, 0.06); f.position.set(0.001, 0.163, 0); f.scale.set(0.02, 0.05, 1); g.add(f);
    const halo = new T.Sprite(haloMat); halo.position.set(0, 0.185, 0); halo.scale.set(0.16, 0.16, 1); g.add(halo);
    return g;
  }
  /* Cadres : moulure profilée (contour biseauté), passe-partout, image dessinée, verre avec un reflet */
  const frameGeoCache = new Map();
  function frameGeo(w, h, b, d) {
    const key = [w, h, b, d].join();
    if (frameGeoCache.has(key)) return frameGeoCache.get(key);
    const bv = Math.min(b * 0.32, d * 0.3), W = w / 2 - bv, H = h / 2 - bv, iw = w / 2 - b + bv, ih = h / 2 - b + bv;
    const s = new T.Shape(); s.moveTo(-W, -H); s.lineTo(W, -H); s.lineTo(W, H); s.lineTo(-W, H); s.closePath();
    const hole = new T.Path(); hole.moveTo(-iw, -ih); hole.lineTo(-iw, ih); hole.lineTo(iw, ih); hole.lineTo(iw, -ih); hole.closePath(); s.holes.push(hole);
    const geo = new T.ExtrudeGeometry(s, { depth: d - 2 * bv, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelSegments: 3, curveSegments: 1 });
    geo.translate(0, 0, -d / 2 + bv);
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 3);
    frameGeoCache.set(key, geo); return geo;
  }
  const glassGlare = new T.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.5, map: canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
    [[30, 26, 0.22], [62, 10, 0.12], [86, 6, 0.08]].forEach(([x, bw, a]) => {
      const gr = g.createLinearGradient(x - bw, 0, x + bw, 0); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, `rgba(255,250,240,${a})`); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.save(); g.translate(w / 2, h / 2); g.rotate(-0.55); g.translate(-w / 2, -h / 2); g.fillStyle = gr; g.fillRect(x - bw - 60, -60, bw * 2, h + 120); g.restore();
    });
  }) });
  const FRAME_LOOKS = [ // moulure, passe-partout, image
    { m: () => mat("#b8913c", { metalness: 0.45, roughness: 0.38 }), mat: "#f2ecdf", pic: "paysage" },
    { m: () => woodMat("#3b2618"), mat: "#f7f4ee", pic: "botanique" },
    { m: () => woodMat("#b88a58"), mat: "#efe6d6", pic: "arches" },
  ];
  // image du cadre : aquarelle de montagnes, planche botanique ou arches bohèmes
  function drawPicture(g, kind, x, y, w, h) {
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y);
    if (kind === "paysage") {
      const sky = g.createLinearGradient(0, 0, 0, h * 0.6); sky.addColorStop(0, "#bcd3dc"); sky.addColorStop(1, "#f1dcc0"); g.fillStyle = sky; g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(255,240,205,.9)"; g.beginPath(); g.arc(w * 0.7, h * 0.24, w * 0.08, 0, 7); g.fill();
      [["#9fb0bb", 0.42, 0.12], ["#7f978f", 0.5, 0.1], ["#5d7a5e", 0.6, 0.08], ["#3f5d43", 0.72, 0.06]].forEach(([c, b, amp], k) => {
        g.fillStyle = c; g.beginPath(); g.moveTo(0, h);
        for (let i = 0; i <= 24; i++) { const xx = (i / 24) * w; g.lineTo(xx, h * (b - amp * Math.abs(Math.sin(i * 0.7 + k * 2.1)) - amp * 0.5 * vnoise(i * 0.8, k * 3))); }
        g.lineTo(w, h); g.fill();
      });
      g.fillStyle = "rgba(190,210,215,.85)"; g.fillRect(0, h * 0.78, w, h * 0.08); // lac
      g.fillStyle = "rgba(255,255,255,.25)"; for (let i = 0; i < 6; i++) g.fillRect(w * rz(i), h * (0.79 + rz(i + 1) * 0.06), w * 0.15, 1);
      g.fillStyle = "#4e6a3c"; g.fillRect(0, h * 0.86, w, h);
      g.fillStyle = "#233a28";
      for (let i = 0; i < 7; i++) { const tx = w * (0.05 + i * 0.07 + rz(i) * 0.03), th = h * (0.1 + rz(i + 4) * 0.08), ty = h * 0.88; g.beginPath(); g.moveTo(tx, ty - th); g.lineTo(tx + th * 0.22, ty); g.lineTo(tx - th * 0.22, ty); g.fill(); }
    } else if (kind === "botanique") {
      g.fillStyle = "#f3ecdc"; g.fillRect(0, 0, w, h);
      g.strokeStyle = "#6e7f55"; g.lineWidth = 1.3; g.beginPath(); g.moveTo(w * 0.5, h * 0.82); g.quadraticCurveTo(w * 0.42, h * 0.5, w * 0.56, h * 0.1); g.stroke();
      for (let i = 0; i < 11; i++) {
        const t = 0.15 + i * 0.065, px = w * (0.5 - 0.08 * Math.sin(t * 3) + (i % 2 ? 0.01 : -0.01)), py = h * (0.82 - t * 0.85), sd = i % 2 ? 1 : -1, L = w * (0.2 - i * 0.012);
        g.fillStyle = i % 3 ? "#7f9466" : "#6a8258"; g.save(); g.translate(px, py); g.rotate(sd * (0.9 - i * 0.03)); g.beginPath(); g.ellipse(0, -L / 2, L * 0.22, L / 2, 0, 0, 7); g.fill();
        g.strokeStyle = "rgba(240,240,220,.5)"; g.lineWidth = 0.6; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -L * 0.9); g.stroke(); g.restore();
      }
      g.fillStyle = "rgba(90,80,60,.6)"; g.fillRect(w * 0.3, h * 0.88, w * 0.4, 1.5); g.fillRect(w * 0.36, h * 0.92, w * 0.28, 1);
    } else {
      g.fillStyle = "#efe2cf"; g.fillRect(0, 0, w, h);
      [["#c47a52", 0.36], ["#e0b387", 0.28], ["#a95a3c", 0.2], ["#efe2cf", 0.12]].forEach(([c, r]) => { g.fillStyle = c; g.beginPath(); g.moveTo(w * (0.5 - r), h * 0.86); g.arc(w * 0.5, h * 0.55, w * r, Math.PI, 0); g.lineTo(w * (0.5 + r), h * 0.86); g.fill(); });
      g.fillStyle = "#d89a5a"; g.beginPath(); g.arc(w * 0.74, h * 0.2, w * 0.08, 0, 7); g.fill();
      g.fillStyle = "#7d8a66"; g.fillRect(0, h * 0.86, w, h);
    }
    for (let i = 0; i < 500; i++) { g.fillStyle = i % 2 ? "rgba(255,255,255,.06)" : "rgba(60,40,20,.05)"; g.fillRect(rz(i + 3) * w, rz(i + 8) * h, 1, 1); } // grain du papier
    g.restore();
  }
  function frame(parent, x, y, z) {
    const g = new T.Group(); g.position.set(x, y, z); parent.add(g);
    const look = FRAME_LOOKS[Math.round(Math.abs(x * 13 + y * 7 + z * 3) * 10) % FRAME_LOOKS.length];
    const fm = look.m();
    // moulure et béquille à l'arrière, en une seule géométrie
    g.add(new T.Mesh(bake([{ geo: frameGeo(0.2, 0.26, 0.026, 0.022), m: tm(0, 0.13, 0) }, { geo: unitBox, m: tm(0, 0.1, -0.045, 0.32, 0, 0, 0.03, 0.2, 0.006) }]), fm));
    const key = "cadre" + look.pic;
    if (!frameGeoCache.has(key)) frameGeoCache.set(key, canvasTex(160, 208, (c, w, h) => {
      c.fillStyle = look.mat; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 300; i++) { c.fillStyle = "rgba(120,100,70,.05)"; c.fillRect(rz(i) * w, rz(i + 1) * h, 2, 2); }
      const m = 22; drawPicture(c, look.pic, m, m, w - 2 * m, h - 2 * m - 6);
      c.strokeStyle = "rgba(255,255,255,.9)"; c.lineWidth = 2; c.strokeRect(m - 1, m - 1, w - 2 * m + 2, h - 2 * m - 4); // biseau du passe-partout
      c.strokeStyle = "rgba(0,0,0,.18)"; c.lineWidth = 1; c.strokeRect(m, m, w - 2 * m, h - 2 * m - 6);
    }));
    const pic = new T.Mesh(new T.PlaneGeometry(0.16, 0.22), new T.MeshStandardMaterial({ map: frameGeoCache.get(key), roughness: 0.85 }));
    pic.position.set(0, 0.13, 0.0); g.add(pic);
    const glass = new T.Mesh(pic.geometry, glassGlare); glass.position.set(0, 0.13, 0.004); g.add(glass);
    g.rotation.x = -0.12;
    return g;
  }
  /* Pile de livres : tranche tournée vers nous avec titre et filets, pages visibles sur les côtés, couverture toilée */
  const stackMats = new Map();
  function stackBookMats(c, i) {
    const key = c + i;
    if (stackMats.has(key)) return stackMats.get(key);
    const ink = ["#e9d9a6", "#e9d9a6", "#3a2a14"][i % 3];
    const titles = ["Herbier", "Poèmes", "Jardins"];
    const spine = canvasTex(256, 48, (g, w, h) => {
      g.fillStyle = c; g.fillRect(0, 0, w, h);
      const sh = g.createLinearGradient(0, 0, 0, h); sh.addColorStop(0, "rgba(0,0,0,.35)"); sh.addColorStop(0.3, "rgba(255,255,255,.1)"); sh.addColorStop(0.55, "rgba(255,255,255,.04)"); sh.addColorStop(1, "rgba(0,0,0,.4)");
      g.fillStyle = sh; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 400; k++) { g.fillStyle = k % 2 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.07)"; g.fillRect(rz(k + i) * w, rz(k + 2) * h, 2, 1); }
      g.fillStyle = ink; g.globalAlpha = 0.7; [18, 24, w - 26, w - 20].forEach((x) => g.fillRect(x, 4, 2, h - 8)); g.globalAlpha = 1;
      g.font = "italic bold 22px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(titles[i % 3], w / 2, h / 2 + 1);
    });
    const pages = canvasTex(128, 32, (g, w, h) => {
      g.fillStyle = "#efe4cc"; g.fillRect(0, 0, w, h);
      for (let y = 4; y < h - 4; y += 1) { g.fillStyle = `rgba(120,90,50,${0.05 + rz(y + i) * 0.1})`; g.fillRect(0, y, w, 0.6); }
      g.fillStyle = c; g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4); // les plats dépassent un peu
      g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(0, 4, w, 1); g.fillRect(0, h - 5, w, 1);
    });
    const cloth = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = c; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 2) { g.fillStyle = "rgba(255,255,255,.04)"; g.fillRect(0, y, w, 1); }
      for (let x = 0; x < w; x += 2) { g.fillStyle = "rgba(0,0,0,.05)"; g.fillRect(x, 0, 1, h); }
      g.strokeStyle = "rgba(0,0,0,.2)"; g.lineWidth = 2; g.strokeRect(10, 10, w - 20, h - 20);
    });
    const P = new T.MeshStandardMaterial({ map: pages, roughness: 0.95 }), C = new T.MeshStandardMaterial({ map: cloth, roughness: 0.8 });
    const r = [P, P, C, C, new T.MeshStandardMaterial({ map: spine, roughness: 0.7 }), P];
    stackMats.set(key, r); return r;
  }
  function bookStack(parent, x, y, z) {
    const g = new T.Group(); g.position.set(x, y, z); parent.add(g);
    [["#7b2d26", 0.26, 0.045], ["#1f3a5f", 0.23, 0.04], ["#c9a227", 0.25, 0.05]].reduce((yy, [c, w, h], i) => {
      const m = box(w, h, 0.17, stackBookMats(c, i), (i - 1) * 0.01, yy + h / 2, 0, g);
      m.rotation.y = (i - 1) * 0.12;
      return yy + h;
    }, 0);
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
    // fil souple, petites ampoules en goutte sous leur douille, halo doux (un seul appel pour tous les halos)
    const g = new T.Group(); parent.add(g);
    const n = 18, at = (t) => new T.Vector3(-w / 2 + t * w, y - Math.sin(t * Math.PI * 3) ** 2 * 0.12, z + Math.sin(t * 11) * 0.008);
    const pts = []; for (let i = 0; i <= 90; i++) pts.push(at(i / 90));
    g.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 180, 0.0017, 4), mat("#2f2b22", { roughness: 0.55 })));
    const bulbs = new T.InstancedMesh(fairyBulb, new T.MeshBasicMaterial({ color: "#ffe2a8" }), n + 1);
    const caps = new T.InstancedMesh(fairyCap, mat("#3a352a", { roughness: 0.5, metalness: 0.3 }), n + 1);
    const glow = [];
    for (let i = 0; i <= n; i++) {
      const p = at(i / n), m = tm(p.x, p.y - 0.004, p.z, (rz(i) - 0.5) * 0.5, 0, (rz(i + 1) - 0.5) * 0.6);
      bulbs.setMatrixAt(i, m); caps.setMatrixAt(i, m);
      const b = new T.Vector3(0, -0.014, 0).applyMatrix4(m); glow.push(b.x, b.y, b.z);
    }
    g.add(bulbs, caps);
    const gg = new T.BufferGeometry(); gg.setAttribute("position", new T.Float32BufferAttribute(glow, 3));
    g.add(new T.Points(gg, fairyGlow));
    const l = new T.PointLight("#ffbf70", 1.2, 3, 1.5); l.position.set(0, y - 0.1, z + 0.2); g.add(l);
    return g;
  }

  /* ---------- Déco des photos de Julie : suspensions, fleurs séchées, champignons, lapin, lanterne, mousse ---------- */
  function rod(a, b, r, m, parent) {
    const o = new T.Mesh(unitCyl, m); o.applyMatrix4(segM(a, b, r)); parent.add(o); return o;
  }
  /* Vannerie : brins horizontaux arrondis, montants qui passent devant un rang sur deux */
  const weave = canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = "#4e331a"; g.fillRect(0, 0, w, h);
    const rows = 8, rh = h / rows, cols = 8, cw = w / cols;
    for (let r = 0; r < rows; r++) {
      const tone = ["#c49a62", "#b68a53", "#cfa66e", "#ab804a"][r % 4], y = r * rh;
      const gr = g.createLinearGradient(0, y, 0, y + rh); gr.addColorStop(0, "#5a3a1c"); gr.addColorStop(0.2, tone); gr.addColorStop(0.45, shade(tone, 0.1)); gr.addColorStop(0.8, tone); gr.addColorStop(1, "#5a3a1c");
      g.fillStyle = gr; g.fillRect(0, y + 0.5, w, rh - 1);
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if ((r + c) % 2) {
      const x = c * cw + cw * 0.28, gr = g.createLinearGradient(x, 0, x + cw * 0.44, 0);
      gr.addColorStop(0, "#6e4b28"); gr.addColorStop(0.5, "#b48a55"); gr.addColorStop(1, "#6e4b28");
      g.fillStyle = gr; g.fillRect(x, r * rh - 1, cw * 0.44, rh + 2);
    }
    for (let i = 0; i < 260; i++) { g.fillStyle = i % 2 ? "rgba(255,235,190,.12)" : "rgba(50,30,10,.12)"; g.fillRect(rz(i) * w, rz(i + 0.5) * h, 3 + rz(i + 0.2) * 6, 0.7); } // fibres
  }, [7, 4]);
  const basketMat = new T.MeshStandardMaterial({ map: weave, bumpMap: weave, bumpScale: 1.5, roughness: 0.92 });
  // corde de coton torsadée (rayures en biais)
  const ropeTex = canvasTex(32, 32, (g, w, h) => {
    g.fillStyle = "#eadfc8"; g.fillRect(0, 0, w, h);
    for (let k = -2; k < 4; k++) { g.save(); g.translate(k * 16, 0); g.transform(1, 0, -0.9, 1, 0, 0);
      const gr = g.createLinearGradient(0, 0, 16, 0); gr.addColorStop(0, "rgba(120,100,70,.55)"); gr.addColorStop(0.3, "rgba(255,255,250,.25)"); gr.addColorStop(0.75, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(120,100,70,.5)");
      g.fillStyle = gr; g.fillRect(0, 0, 16, h * 2); g.restore(); }
  }, [1, 1]);
  const ropeMat = new T.MeshStandardMaterial({ map: ropeTex, bumpMap: ropeTex, bumpScale: 1, roughness: 1 });
  function leafBall(g, y, n, r0) {
    const parts = [];
    pothosParts(parts, y, n + 6, 0.11 + r0, 7 + n, [0, 2]);
    g.add(new T.Mesh(bake(parts), plantMat));
  }
  /* Suspension en macramé avec un pothos qui retombe, accrochée au plafond */
  const BASKET = [[0, -0.12], [0.05, -0.117], [0.09, -0.1], [0.118, -0.072], [0.132, -0.035], [0.137, 0], [0.137, 0.01], [0.13, 0.012], [0.127, 0.002], [0.124, -0.012]];
  function hangingBasket(parent, x, y, z) {
    const g = new T.Group(); g.position.set(x, y, z); parent.add(g);
    g.add(new T.Mesh(lathe("panier", BASKET, 36), basketMat));
    const soil = new T.Mesh(soilGeo, soilMat); soil.position.y = -0.008; soil.scale.set(0.124, 1, 0.124); g.add(soil);
    // cordes : 4 paires partent du nœud du haut, se nouent, se croisent en losange, enveloppent le panier et finissent en pompon
    const P = (a, r, yy) => new T.Vector3(Math.cos(a) * r, yy, Math.sin(a) * r);
    const parts = [], tube = (pts, r) => {
      const c = new T.CatmullRomCurve3(pts), l = c.getLength();
      parts.push({ geo: new T.TubeGeometry(c, Math.max(8, Math.round(l * 45)), r, 4), uv: [0, 0, l / 0.012, 1] });
    };
    const knot = (p, sx, sy) => parts.push({ geo: unitBall, m: tm(p.x, p.y, p.z, 0, 0, 0, sx, sy, sx), uv: [0, 0, 2, 2] });
    for (let i = 0; i < 4; i++) {
      const a = i * QUARTER + 0.4;
      knot(P(a, 0.05, 0.36), 0.0075, 0.018);
      knot(P(a + QUARTER / 2, 0.122, 0.175), 0.0072, 0.015);
      for (const sd of [-1, 1]) {
        const a2 = a + sd * QUARTER / 2, ar = a2 - sd * 0.16;
        tube([P(a + sd * 0.4, 0.008, 0.515), P(a + sd * 0.08, 0.05, 0.36), P(a2 - sd * 0.06, 0.12, 0.175), P(ar, 0.142, 0.012), P(ar, 0.137, -0.04), P(ar + sd * 0.05, 0.11, -0.09), P(ar + sd * 0.1, 0.064, -0.122), P(a, 0.012, -0.136)], 0.0026);
      }
    }
    // nœud du haut, cordon jusqu'au plafond, nœud du bas et pompon
    parts.push({ geo: unitCyl, m: segM(new T.Vector3(0, 0.5, 0), new T.Vector3(0, 0.565, 0), 0.009), uv: [0, 0, 3, 5] });
    knot(new T.Vector3(0, 0.567, 0), 0.0095, 0.006);
    parts.push({ geo: unitCyl, m: segM(new T.Vector3(0, 0.56, 0), new T.Vector3(0, 3.6 - y, 0), 0.0045), uv: [0, 0, 1, (3.6 - y) / 0.012] });
    parts.push({ geo: unitCyl, m: segM(new T.Vector3(0, -0.13, 0), new T.Vector3(0, -0.17, 0), 0.011), uv: [0, 0, 3, 4] });
    knot(new T.Vector3(0, -0.13, 0), 0.011, 0.006);
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4, l = 0.13 + rz(i + 3) * 0.05;
      parts.push({ geo: unitCyl, m: segM(P(a, 0.006, -0.165), P(a + 0.3, 0.014 + rz(i) * 0.014, -0.165 - l), 0.0019), uv: [0, 0, 1, l / 0.012] });
    }
    // tresse du bord du panier
    parts.push({ geo: new T.TorusGeometry(0.135, 0.0075, 6, 56), m: tm(0, 0.011, 0, Math.PI / 2), uv: [0, 0, 60, 1] });
    g.add(new T.Mesh(bake(parts), ropeMat));
    leafBall(g, 0.01, 24, 0.02);
    vines(g, [[-0.09, 0.02, 0.06, 0.55, 1], [0.08, 0.02, 0.02, 0.8, 2], [0.0, 0.02, 0.1, 0.4, 3], [-0.03, 0.02, -0.08, 0.6, 4]]);
    return g;
  }
  /* Cadre avec des fleurs séchées pressées : lavande, fougère ou bouquet champêtre, sur papier épais */
  function driedTex(seed) {
    return canvasTex(192, 240, (g, w, h) => {
      g.fillStyle = "#f2eadb"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) { g.fillStyle = i % 3 ? "rgba(120,90,50,.035)" : "rgba(255,255,255,.08)"; g.fillRect(rz(i + seed) * w, rz(i * 1.3 + seed) * h, 2, 2); }
      const R = (i) => rz(seed * 31 + i), tx = w / 2, ty = h * 0.8;
      const stem = (x0, y0, x1, y1, bend, lw) => { g.lineWidth = lw; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + bend, (y0 + y1) / 2, x1, y1); g.stroke(); };
      const dot = (x, y, rx, ry, a) => { g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, 7); g.fill(); };
      const art = (sh) => { // sh : ombre portée douce du brin pressé
        const C = (c) => (sh ? "rgba(60,40,20,.12)" : c);
        g.save(); if (sh) g.translate(1.5, 2);
        if (seed % 3 === 1) { // lavande en botte
          for (let k = 0; k < 7; k++) {
            const ex = tx + (k - 3) * 13 + (R(k) - 0.5) * 8, ey = h * (0.12 + R(k + 9) * 0.12);
            g.strokeStyle = C("#7d8a5c"); stem(tx + (k - 3) * 1.5, ty + 18, ex, ey, (k - 3) * 4, 1.4);
            for (let j = 0; j < 14; j++) { const t = j / 13, px = ex + (tx - ex) * t * 0.35, py = ey + (ty - ey) * t * 0.35; g.fillStyle = C(j % 2 ? "#8b75b4" : "#6d5a9a"); dot(px + (j % 2 ? 2.5 : -2.5), py, 2.6 - t, 3.4 - t, (j % 2 ? 0.5 : -0.5)); }
          }
          g.strokeStyle = C("#b8955c"); g.lineWidth = 2; stem(tx - 12, ty, tx + 12, ty + 3, 0, 2); stem(tx, ty + 1, tx - 14, ty + 14, 6, 1.2); stem(tx, ty + 1, tx + 12, ty + 16, -4, 1.2);
        } else if (seed % 3 === 2) { // fougère et petites fleurs roses
          g.strokeStyle = C("#76804e"); stem(tx + 6, h * 0.9, tx - 4, h * 0.1, -14, 1.8);
          for (let j = 0; j < 16; j++) {
            const t = 0.08 + j * 0.055, px = tx + 6 - 10 * t - 14 * Math.sin(t * Math.PI) * 0.5, py = h * (0.9 - t * 0.8), L = (1 - t) * 44 + 8;
            [-1, 1].forEach((sd) => { for (let q = 1; q < 7; q++) { g.fillStyle = C(q % 2 ? "#8a9461" : "#7b8656"); const d = (q / 7) * L; dot(px + sd * d, py - d * 0.25, 3.4 - q * 0.3, 1.8, sd * 0.3); } });
          }
          for (let k = 0; k < 4; k++) { const px = w * (0.22 + R(k) * 0.12), py = h * (0.3 + k * 0.14); g.strokeStyle = C("#8a8c60"); stem(px, py, px + 10, py + 30, 3, 1); for (let p = 0; p < 5; p++) { g.fillStyle = C("#d9a3a0"); dot(px + Math.cos(p * 1.26) * 3.5, py + Math.sin(p * 1.26) * 3.5, 3, 2, p * 1.26); } g.fillStyle = C("#c99a4a"); dot(px, py, 1.6, 1.6, 0); }
        } else { // bouquet champêtre : marguerites, graminées, gypsophile
          for (let k = 0; k < 9; k++) {
            const ex = tx + (k - 4) * 15 + (R(k) - 0.5) * 10, ey = h * (0.12 + R(k + 3) * 0.25);
            g.strokeStyle = C(k % 3 ? "#8a915e" : "#a69a62"); stem(tx + (k - 4), ty + 20, ex, ey, (k - 4) * 5, 1.2);
            if (k % 3 === 0) { for (let p = 0; p < 11; p++) { g.fillStyle = C("#fbf6ea"); dot(ex + Math.cos(p * 0.57) * 6, ey + Math.sin(p * 0.57) * 6, 4.2, 1.6, p * 0.57); } g.fillStyle = C("#d9a83a"); dot(ex, ey, 3, 3, 0); }
            else if (k % 3 === 1) { for (let j = 0; j < 9; j++) { g.fillStyle = C("#c9a868"); dot(ex + (j % 2 ? 2 : -2), ey + j * 3.5, 1.8, 3, j % 2 ? 0.5 : -0.5); } }
            else { g.fillStyle = C("#f6f1e6"); for (let j = 0; j < 14; j++) dot(ex + (R(j + k) - 0.5) * 18, ey + (R(j + k * 2) - 0.5) * 14, 1.6, 1.6, 0); }
          }
          g.strokeStyle = C("#c0a06a"); stem(tx - 14, ty + 4, tx + 14, ty + 6, 0, 2.2);
        }
        g.restore();
      };
      art(true); art(false);
      // petite étiquette écrite à la main
      g.fillStyle = "rgba(90,70,45,.55)"; g.font = "italic 11px Georgia, serif"; g.textAlign = "center";
      g.fillText(["Prairie, juin", "Lavandula", "Fougère"][seed % 3], w / 2, h * 0.95);
    });
  }
  function driedFrame(parent, x, y, z, seed) {
    const g = new T.Group(); g.position.set(x, y, z); parent.add(g);
    g.add(new T.Mesh(frameGeo(0.26, 0.335, 0.025, 0.025), woodMat("#b88a58")));
    const pic = new T.Mesh(new T.PlaneGeometry(0.22, 0.295), new T.MeshStandardMaterial({ map: driedTex(seed), roughness: 0.9 }));
    pic.position.z = -0.004; g.add(pic);
    const glass = new T.Mesh(pic.geometry, glassGlare); glass.position.z = 0.003; g.add(glass);
    return g;
  }
  /* Champignons : amanites rouges à pois blancs (lamelles dessous, anneau sur le pied) et un cèpe brun */
  const capRed = new T.MeshStandardMaterial({ roughness: 0.4, map: canvasTex(128, 64, (g, w, h) => {
    const gv = Math.round(h * 0.37), top = h - gv;
    const gr = g.createLinearGradient(0, 0, 0, top); gr.addColorStop(0, "#8a1d16"); gr.addColorStop(0.55, "#bf3327"); gr.addColorStop(1, "#dc5a2c");
    g.fillStyle = gr; g.fillRect(0, 0, w, top);
    g.fillStyle = "#efe4cc"; g.fillRect(0, top, w, gv);
    for (let x = 0; x < w; x += 2) { g.fillStyle = "rgba(140,110,70,.4)"; g.fillRect(x, top, 1, gv); } // lamelles
    const eg = g.createLinearGradient(0, top - 3, 0, top + 6); eg.addColorStop(0, "rgba(0,0,0,0)"); eg.addColorStop(0.4, "rgba(90,30,10,.35)"); eg.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = eg; g.fillRect(0, top - 3, w, 9);
    for (let i = 0; i < 30; i++) { // verrues blanches, plus larges en « u » près du sommet où le chapeau est étroit
      const yy = 2 + rz(i) * (top - 8), f = Math.max(0.22, yy / top), r = 1 + rz(i + 1) * 2.2, xx = rz(i + 2) * w;
      g.fillStyle = "#f5eedf"; [xx, xx - w, xx + w].forEach((px) => { g.beginPath(); g.ellipse(px, yy, r / f, r, 0, 0, 7); g.fill(); });
    }
  }) });
  capRed.bumpMap = capRed.map; capRed.bumpScale = 1.2;
  const capBrown = new T.MeshStandardMaterial({ roughness: 0.5, map: canvasTex(128, 64, (g, w, h) => {
    const gv = Math.round(h * 0.37), top = h - gv;
    const gr = g.createLinearGradient(0, 0, 0, top); gr.addColorStop(0, "#5e3a22"); gr.addColorStop(0.7, "#80522f"); gr.addColorStop(1, "#a07446");
    g.fillStyle = gr; g.fillRect(0, 0, w, top);
    for (let i = 0; i < 40; i++) { g.fillStyle = "rgba(255,230,190,.06)"; g.beginPath(); g.ellipse(rz(i) * w, rz(i + 1) * top, 6, 3, 0, 0, 7); g.fill(); }
    g.fillStyle = "#d6bf78"; g.fillRect(0, top, w, gv);
    for (let i = 0; i < 300; i++) { g.fillStyle = "rgba(120,100,40,.45)"; g.fillRect(rz(i + 5) * w, top + rz(i + 6) * gv, 1, 1); } // pores
  }) });
  const CAP = [[0.2, 0.1], [0.6, 0.05], [0.95, 0.02], [1.0, 0.07], [0.97, 0.25], [0.86, 0.45], [0.62, 0.6], [0.32, 0.68], [0, 0.7]];
  const mushStemMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: T.DoubleSide, map: canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = "#f4eee2"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(150,130,100,${0.06 + rz(i) * 0.1})`; g.fillRect(rz(i + 1) * w, rz(i + 2) * h, 1, 6 + rz(i + 3) * 20); }
  }) });
  let mushMoss = null;
  function mushrooms(parent, x, y, z, s) {
    const g = new T.Group(); g.position.set(x, y, z); g.scale.setScalar(s || 1); parent.add(g);
    const stems = [], red = [], brown = [];
    [[0, 0, 0.07, 0.03, 1], [0.045, 0.02, 0.045, 0.024, 0], [-0.04, 0.015, 0.035, 0.018, 1], [-0.012, 0.04, 0.02, 0.01, 1]].forEach(([dx, dz, h, r, isRed], i) => {
      const sr = r * (isRed ? 0.36 : 0.55), tx = (rz(i) - 0.5) * 0.25, tz = (rz(i + 4) - 0.5) * 0.25;
      stems.push({ geo: lathe(isRed ? "pied" : "pied-cepe", isRed ? [[0, 0], [0.9, 0], [1.15, 0.05], [1.0, 0.13], [0.76, 0.3], [0.66, 0.7], [0.62, 1], [0, 1]] : [[0, 0], [0.8, 0], [1.1, 0.12], [1.15, 0.32], [0.98, 0.62], [0.78, 0.9], [0.7, 1], [0, 1]], 12), m: tm(dx, 0, dz, tx * 0.4, 0, tz * 0.4, sr, h, sr), c: isRed ? "#ffffff" : "#e6d6b4" });
      if (isRed) stems.push({ geo: lathe("anneau", [[0.6, 0], [1.1, -0.06], [1.35, -0.12]], 12), m: tm(dx + tz * 0.3 * h, h * 0.78, dz - tx * 0.3 * h, tx * 0.4, 0, tz * 0.4, sr, h * 0.6, sr), c: "#fbf7ee" });
      (isRed ? red : brown).push({ geo: lathe("chapeau", CAP, 20), m: tm(dx + tz * h * 0.4, h - 0.06 * r, dz - tx * h * 0.4, tx, i, tz, r, isRed ? r : r * 0.8, r) });
    });
    g.add(new T.Mesh(bake(stems), mushStemMat), new T.Mesh(bake(red), capRed), new T.Mesh(bake(brown), capBrown));
    // touffe de mousse au pied
    if (!mushMoss) mushMoss = mossPatch(0.17, 0.12, false, 3, []);
    const ms = new T.Mesh(mushMoss, mossMats[0]); ms.position.set(0.004, 0, 0.012); g.add(ms);
    return g;
  }
  /* Petit lapin : formes douces fondues ensemble, pelage suggéré (poils fins et reflet velouté), oreilles roses */
  const furTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = "#e4ded4"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const x = rz(i) * w, y = rz(i + 0.5) * h, a = 1.3 + (rz(i + 0.2) - 0.5) * 0.8, l = 2 + rz(i + 0.7) * 4;
      g.strokeStyle = i % 3 ? "rgba(255,255,255,.35)" : "rgba(120,105,90,.22)"; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  }, [3, 3]);
  const furMat = new T.MeshPhysicalMaterial({ map: furTex, bumpMap: furTex, bumpScale: 0.8, roughness: 0.95, vertexColors: true, sheen: 1, sheenRoughness: 0.5, sheenColor: new T.Color("#fff3e4") });
  let rabbitGeo = null;
  function rabbit(parent, x, y, z, s) {
    const g = new T.Group(); g.position.set(x, y, z); g.scale.setScalar(s || 1); g.rotation.y = -0.5; parent.add(g);
    if (!rabbitGeo) {
      const B = "#f1ebe1", pink = "#e7b3ac", parts = [];
      const add = (m, c) => parts.push({ geo: unitBall, m, c: c || B, vc: (p) => 0.78 + Math.min(1, p.y / 0.08) * 0.22 });
      add(tm(0, 0.047, -0.012, -0.15, 0, 0, 0.05, 0.046, 0.062));          // corps
      add(tm(0, 0.062, 0.028, 0, 0, 0, 0.033, 0.04, 0.03));                 // poitrail
      add(tm(0, 0.104, 0.046, 0.15, 0, 0, 0.033, 0.031, 0.036));            // tête
      add(tm(0, 0.094, 0.077, 0, 0, 0, 0.012, 0.01, 0.01));                 // museau
      add(tm(0, 0.099, 0.0855, 0, 0, 0, 0.004, 0.003, 0.003), "#d9948e");   // nez
      add(tm(0, 0.04, -0.076, 0, 0, 0, 0.016, 0.016, 0.014), "#fbf8f2");    // queue
      [-1, 1].forEach((k) => {
        add(tm(k * 0.03, 0.033, -0.028, 0, 0, 0, 0.03, 0.033, 0.04));       // cuisses
        add(tm(k * 0.016, 0.095, 0.062, 0, 0, 0, 0.017, 0.015, 0.017));     // joues
        add(tm(k * 0.015, 0.01, 0.055, 0, 0, 0, 0.011, 0.01, 0.018));       // pattes avant
        add(tm(k * 0.034, 0.008, 0.014, 0, k * 0.2, 0, 0.012, 0.008, 0.03)); // pattes arrière
        const ear = tm(k * 0.013, 0.158, 0.03, -0.3, 0, -k * 0.22, 0.011, 0.042, 0.005);
        add(ear); add(ear.clone().multiply(tm(0, -0.06, 0.72, 0, 0, 0, 0.62, 0.8, 0.5)), pink);
      });
      rabbitGeo = [bake(parts), bake([-1, 1].map((k) => ({ geo: unitBall, m: tm(k * 0.019, 0.109, 0.073, 0, 0, 0, 0.0055) })))];
    }
    g.add(new T.Mesh(rabbitGeo[0], furMat), new T.Mesh(rabbitGeo[1], mat("#1b1412", { roughness: 0.12 })));
    return g;
  }
  /* Lanterne en métal noir avec une bougie : socle à gradins, montants, vitres avec reflet, toit en pointe, anneau */
  let lanternGeo = null;
  const lanternGlass = new T.MeshStandardMaterial({ color: "#fff8ea", transparent: true, opacity: 0.14, roughness: 0.05, depthWrite: false, side: T.DoubleSide });
  function lantern(parent, x, y, z, s) {
    const g = new T.Group(); g.position.set(x, y, z); g.scale.setScalar(s || 1); parent.add(g);
    if (!lanternGeo) {
      const B = (x0, y0, z0, sx, sy, sz) => ({ geo: unitBox, m: tm(x0, y0, z0, 0, 0, 0, sx, sy, sz) }), parts = [B(0, 0.0075, 0, 0.13, 0.015, 0.13), B(0, 0.019, 0, 0.118, 0.008, 0.118), B(0, 0.212, 0, 0.13, 0.012, 0.13), B(0, 0.222, 0, 0.116, 0.008, 0.116)];
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => parts.push(B(a * 0.056, 0.115, b * 0.056, 0.011, 0.19, 0.011)));
      [0, 1].forEach((k) => parts.push(B(0, 0.12, (k ? 1 : -1) * 0.056, 0.112, 0.005, 0.005), B((k ? 1 : -1) * 0.056, 0.12, 0, 0.005, 0.005, 0.112))); // barreaux au milieu
      parts.push({ geo: new T.ConeGeometry(0.094, 0.062, 4, 1), m: tm(0, 0.257, 0, 0, Math.PI / 4, 0) });
      parts.push({ geo: new T.CylinderGeometry(0.014, 0.019, 0.016, 12), m: tm(0, 0.29, 0) });
      parts.push({ geo: unitBall, m: tm(0, 0.301, 0, 0, 0, 0, 0.009) });
      parts.push({ geo: new T.TorusGeometry(0.021, 0.0035, 6, 20), m: tm(0, 0.329, 0) });
      const glass = [];
      for (let i = 0; i < 4; i++) { const a = i * QUARTER; glass.push({ geo: new T.PlaneGeometry(0.102, 0.18), m: tm(Math.sin(a) * 0.053, 0.115, Math.cos(a) * 0.053, 0, a, 0) }); }
      lanternGeo = [bake(parts), bake(glass)];
    }
    g.add(new T.Mesh(lanternGeo[0], new T.MeshStandardMaterial({ color: "#2b2724", metalness: 0.5, roughness: 0.45, bumpMap: grainTex, bumpScale: 0.6 })));
    g.add(new T.Mesh(lanternGeo[1], lanternGlass), new T.Mesh(lanternGeo[1], glassGlare));
    candle(g, 0, 0.023, 0, 0.75);
    return g;
  }
  /* Mousse posée sur le dessus du meuble : coussin touffu et irrégulier, avec des pans qui pendent devant */
  const mossTex = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = "#cfcfc4"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = i % 3 ? "rgba(255,255,230,.45)" : "rgba(40,50,20,.45)"; g.fillRect(rz(i) * w, rz(i + 0.5) * h, 1, 1 + (i % 2)); }
  }, [1, 1]);
  const mossMats = [new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, map: mossTex, bumpMap: mossTex, bumpScale: 2.5 })];
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function mossPatch(W, D, hang, seed, obst) {
    const HX = hang ? 0.05 : 0, nx = Math.max(8, Math.round(W / 0.02)), nz = Math.max(6, Math.round((D + HX) / 0.02));
    const geo = new T.PlaneGeometry(1, 1, nx, nz); geo.rotateX(-Math.PI / 2);
    const P = geo.attributes.position, U = geo.attributes.uv, col = new Float32Array(P.count * 3);
    const dark = new T.Color("#3f5a1c"), light = new T.Color("#97b543"), dry = new T.Color("#a49a4c"), c = new T.Color();
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i) * W, v = P.getZ(i) + 0.5, zz = -D / 2 + v * (D + HX);
      const n = vnoise(x * 30 + seed, zz * 30) * 0.6 + vnoise(x * 75, zz * 75 + seed) * 0.4;
      const e = Math.min(x + W / 2, W / 2 - x, zz + D / 2, hang ? 1 : D / 2 - zz) - vnoise(x * 9 + seed, zz * 9) * Math.min(0.045, D * 0.3);
      let m = smooth(0, 0.03, e) * smooth(0.05, 0.22, vnoise(x * 5 + seed * 3, zz * 5 + 1.7));
      for (const [ox, oz, r] of obst) m *= 0.25 + 0.75 * smooth(r * 0.8, r * 1.35, Math.hypot(x - ox, zz - oz)); // plus mince sous les pots
      const front = hang ? 0.6 + 0.4 * smooth(-0.05, D / 2, zz) : 1; // plus épais vers le bord avant
      let h = m * front * (0.005 + 0.03 * Math.pow(n, 1.4)), yy = m > 0.03 ? h : -0.006, z2 = zz;
      if (hang && zz > D / 2) { // devant le bord : la mousse retombe par endroits
        const d = (zz - D / 2) / HX, L = smooth(0.38, 0.52, vnoise(x * 7 + seed, 7.3)) * (0.45 + 0.55 * vnoise(x * 15, 2.1));
        if (L > 0.05 && d < L && m > 0.03) { z2 = D / 2 + 0.012 + 0.012 * n * (1 - d); yy = 0.012 * n - d * 0.08; h = 0.014; }
        else { z2 = D / 2 - 0.006; yy = -0.006; }
      }
      P.setXYZ(i, x, yy, z2); U.setXY(i, x / 0.07, zz / 0.07);
      c.copy(dark).lerp(light, Math.min(1, n * 1.1)); if (vnoise(x * 4 + 9, zz * 4) > 0.68) c.lerp(dry, 0.5);
      c.multiplyScalar(0.5 + 0.5 * Math.min(1, h / 0.02));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new T.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    return geo;
  }
  function moss(parent, W, y, z) {
    // les objets déjà posés sur le dessus : la mousse s'amincit sous eux
    const obst = parent.children.filter((o) => o.isGroup && Math.abs(o.position.y - y - 0.01) < 0.02).map((o) => [o.position.x, o.position.z - z, 0.08 * o.scale.x]);
    const m = new T.Mesh(mossPatch(W, 0.43, true, Math.round(W * 10), obst), mossMats[0]); m.position.set(0, y + 0.01, z); parent.add(m);
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
    const deco = decoOf(th), style = th.style || (th.gold ? "elegant" : "classique");
    const trim = style === "elegant" ? mat("#c9a227", { metalness: 0.7, roughness: 0.3 }) : wood;
    box(0.05, H, DEPTH, wood, -W / 2 - 0.025, H / 2, 0, g);           // montants
    box(0.05, H, DEPTH, wood, W / 2 + 0.025, H / 2, 0, g);
    if (style === "moderne") {
      box(W + 0.1, 0.04, DEPTH, wood, 0, H + 0.02, 0, g);                  // dessus tout simple
      box(W + 0.1, base, DEPTH - 0.04, wood, 0, base / 2, -0.02, g);
    } else {
      box(W + 0.18, 0.06, DEPTH + 0.06, wood, 0, H + 0.03, 0.01, g);       // dessus
      box(W + 0.22, 0.02, DEPTH + 0.08, trim, 0, H + 0.07, 0.01, g);
      box(W + 0.1, base, DEPTH, wood, 0, base / 2, 0, g);                   // socle
    }
    box(W, H - base, 0.02, backM, 0, base + (H - base) / 2, -DEPTH / 2 + 0.01, g); // fond
    for (let r = 0; r <= rows.length; r++) box(W, 0.028, DEPTH - 0.02, wood, 0, base + r * SHELF_H, 0, g);
    for (let r = 0; r < rows.length; r++) {
      const ao = new T.Mesh(new T.PlaneGeometry(W, SHELF_H - 0.028), aoMat);
      ao.position.set(0, base + r * SHELF_H + SHELF_H / 2, -DEPTH / 2 + 0.022); ao.renderOrder = 1; g.add(ao);
      // le dessous de chaque rayon assombrit aussi le haut des livres
      const under = new T.Mesh(new T.PlaneGeometry(W, DEPTH - 0.03), aoMat);
      under.rotation.x = -Math.PI / 2; under.position.set(0, base + r * SHELF_H + 0.0145, 0); under.scale.y = -1; under.renderOrder = 1; g.add(under);
    }
    if (style === "elegant") for (let r = 1; r <= rows.length; r++) box(W, 0.006, 0.004, trim, 0, base + r * SHELF_H - 0.012, DEPTH / 2, g);
    if (key === "alire") for (let i = 0; i < 3; i++) box(0.12, 0.016, 0.02, mat("#c9a227", { metalness: 0.7, roughness: 0.3 }), -W / 3 + (i * W) / 3, base / 2, DEPTH / 2 + 0.01, g);

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

    const ambient = new T.AmbientLight("#ffe2c4", 0.8); scene.add(ambient);
    const hemi = new T.HemisphereLight("#fff1dc", "#5a3a24", 0.8); scene.add(hemi);
    const ceilingLight = new T.PointLight("#ffd9a8", 8, 12, 1.3); ceilingLight.position.set(0, 2.75, 0); scene.add(ceilingLight);
    // lumière du jour qui entre de biais (plus chaude le matin et le soir, absente la nuit)
    const sun = new T.DirectionalLight("#fff4e6", 0); sun.position.set(3, 3.2, 2); scene.add(sun);
    /* La lumière suit l'heure : matin doré, journée claire, soirée chaude, nuit tamisée */
    const LIGHT_KEYS = [ // heure, ambiante, intensité, ciel, intensité, plafond, soleil, intensité, exposition
      [0, "#b9bde6", 0.45, "#c9c8ec", 0.35, 8.5, "#8090c0", 0, 0.95],
      [6, "#c9c4e0", 0.5, "#d8d4f0", 0.45, 8, "#ffb070", 0, 0.98],
      [8, "#ffe6c8", 0.75, "#fff0dc", 0.75, 5.5, "#ffc98a", 1.1, 1.05],
      [12, "#fff3e6", 0.9, "#fffaf0", 0.95, 4.5, "#fff4e6", 1.4, 1.1],
      [16, "#ffeedd", 0.85, "#fff4e4", 0.85, 5, "#ffe2b8", 1.2, 1.08],
      [19, "#ffd0a4", 0.6, "#ffe0bc", 0.55, 8, "#ff9a5a", 0.5, 1.02],
      [22, "#c4bfe4", 0.48, "#d0cceb", 0.4, 8.5, "#8090c0", 0, 0.96],
      [24, "#b9bde6", 0.45, "#c9c8ec", 0.35, 8.5, "#8090c0", 0, 0.95],
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
      kick();
    }
    const nowHour = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; };
    let fixedHour = opts.hour;
    setInterval(() => { if (fixedHour === undefined) setHour(nowHour()); }, 5 * 60 * 1000);
    ceilingLight.castShadow = true;
    ceilingLight.shadow.mapSize.set(1024, 1024);
    ceilingLight.shadow.radius = 4; ceilingLight.shadow.bias = -0.004; ceilingLight.shadow.normalBias = 0.02;
    ceilingLight.shadow.camera.near = 0.2; ceilingLight.shadow.camera.far = 8;

    // sol, plafond, tapis
    const floor = new T.Mesh(new T.PlaneGeometry(ROOM * 2, ROOM * 2), new T.MeshStandardMaterial({ map: floorTex(opts.floor), roughness: 0.8 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const ceil = new T.Mesh(new T.PlaneGeometry(ROOM * 2, ROOM * 2), mat("#f1e4cf")); ceil.rotation.x = Math.PI / 2; ceil.position.y = 3.6; scene.add(ceil);
    const rug = new T.Mesh(new T.CircleGeometry(1.5, 48), new T.MeshStandardMaterial({ map: rugTex(), roughness: 1 }));
    rug.rotation.x = -Math.PI / 2; rug.position.y = 0.004; rug.receiveShadow = true; scene.add(rug);
    // suspension au plafond
    cyl(0.005, 0.005, 0.6, mat("#3b2a1e"), 0, 3.3, 0, scene, 6);
    const lampShade = new T.Mesh(new T.CylinderGeometry(0.16, 0.32, 0.26, 28, 1, true), new T.MeshStandardMaterial({ color: "#f6d79a", emissive: "#ffb85c", emissiveIntensity: 0.7, side: T.DoubleSide }));
    lampShade.position.set(0, 2.9, 0); scene.add(lampShade);

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
