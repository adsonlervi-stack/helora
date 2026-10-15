// Service worker mínimo: deixa o Helora instalável como app no celular.
// Não guarda cache das telas (sempre busca a versão nova na internet).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
