/* Garde en mémoire sur le téléphone les images déjà vues (couvertures, photos de bois…),
   pour qu'elles s'affichent tout de suite la fois suivante, même sans réseau.
   Le code de l'app et les listes (Sorties, top ventes) passent d'abord par le réseau, pour avoir les mises à jour ;
   une copie est gardée pour ouvrir l'app sans connexion. */
const CACHE = "images-v1", APP = "app-v1";
const GARDER = [CACHE, CACHE + "-3d", APP, "recherches-google-v1"];
const BASE = ["./", "index.html", "room3d.js", "three.min.js", "manifest.json", "icon.png", "data/sorties.json", "data/ventes.json",
  "textures/bois.jpg", "textures/briques-gris.jpg", "textures/briques.jpg", "textures/parquet.jpg"];
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(APP).then((c) => Promise.all(BASE.map((f) => c.add(new Request(f, { cache: "reload" })).catch(() => {})))));
});
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => !GARDER.includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));
/* Réseau d'abord ; sans réseau (ou s'il tarde trop), la dernière copie enregistrée */
async function reseauPuisCopie(r, nav) {
  const c = await caches.open(APP);
  const cle = nav ? new Request(new URL(r.url).origin + new URL(r.url).pathname) : r;
  try {
    const res = await Promise.race([fetch(r), new Promise((_, no) => setTimeout(() => no(new Error("lent")), 8000))]);
    if (res.ok) c.put(cle, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const hit = (await c.match(cle, { ignoreSearch: true })) || (nav && (await c.match("index.html")));
    if (hit) return hit;
    throw err;
  }
}
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  const own = u.origin === self.location.origin;
  const isImage = r.destination === "image" || /\.(jpe?g|png|webp)$/i.test(u.pathname) || /books\/content|\/images\/P\//.test(u.pathname + u.search) || u.hostname === "covers.openlibrary.org";
  if (own) {
    if (u.pathname.endsWith("/sw.js")) return;
    e.respondWith(reseauPuisCopie(r, r.mode === "navigate"));
    return;
  }
  if (!isImage) return;
  // deux réserves : les images lues par la 3D (mode « cors ») ne peuvent pas réutiliser une image opaque
  e.respondWith(caches.open(CACHE + (r.mode === "cors" ? "-3d" : "")).then(async (c) => {
    const hit = await c.match(r);
    if (hit) return hit;
    const res = await fetch(r);
    // on ne garde pas les échecs (sauf les réponses opaques des grands sites d'images, toujours en 200)
    if (res.ok || (res.type === "opaque" && u.hostname !== "covers.openlibrary.org")) c.put(r, res.clone()).catch(() => {});
    return res;
  }));
});
