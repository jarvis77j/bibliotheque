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
  /* Ombre douce au fond de chaque case (sous le rayon du dessus et dans les coins) */
  const aoMat = new T.MeshBasicMaterial({ map: canvasTex(128, 128, (g, w, h) => {
    const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, "rgba(0,0,0,.62)"); v.addColorStop(0.35, "rgba(0,0,0,.12)"); v.addColorStop(0.85, "rgba(0,0,0,.05)"); v.addColorStop(1, "rgba(0,0,0,.3)");
    g.fillStyle = v; g.fillRect(0, 0, w, h);
    const sides = g.createLinearGradient(0, 0, w, 0); sides.addColorStop(0, "rgba(0,0,0,.4)"); sides.addColorStop(0.08, "rgba(0,0,0,0)"); sides.addColorStop(0.92, "rgba(0,0,0,0)"); sides.addColorStop(1, "rgba(0,0,0,.4)");
    g.fillStyle = sides; g.fillRect(0, 0, w, h);
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
