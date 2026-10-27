/* Garde en mémoire sur le téléphone les images déjà vues (couvertures, photos de bois…),
   pour qu'elles s'affichent tout de suite la fois suivante, même sans réseau.
   Le reste de l'app (pages, code) passe toujours par le réseau, pour avoir les mises à jour. */
const CACHE = "images-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  const own = u.origin === self.location.origin;
  const isImage = r.destination === "image" || /\.(jpe?g|png|webp)$/i.test(u.pathname) || /books\/content|\/images\/P\//.test(u.pathname + u.search) || u.hostname === "covers.openlibrary.org";
  if (!isImage && !(own && /(three|zxing)\.min\.js$/.test(u.pathname))) return;
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
