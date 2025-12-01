/*! coi-serviceworker - 最小化版本：只注入 headers，不緩存 */
let coepCredentialless = false;

if (typeof window === 'undefined') {
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

  self.addEventListener("fetch", function (e) {
    const r = e.request;
    if (r.cache === "only-if-cached" && r.mode !== "same-origin") {
      return;
    }

    const request =
      coepCredentialless && r.mode === "no-cors"
        ? new Request(r, { credentials: "omit" })
        : r;

    e.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 0) {
            return response;
          }

          const newHeaders = new Headers(response.headers);
          newHeaders.set("Cross-Origin-Embedder-Policy", coepCredentialless ? "credentialless" : "require-corp");
          newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        })
        .catch((err) => console.error(err))
    );
  });
} else {
  (() => {
    const reloadedBySelf = window.sessionStorage.getItem("coiReloadedBySelf");
    window.sessionStorage.removeItem("coiReloadedBySelf");

    const coiNotEnabled = !window.crossOriginIsolated;

    if (coiNotEnabled && reloadedBySelf !== "true") {
      navigator.serviceWorker.register(window.document.currentScript.src).then(
        (registration) => {
          if (registration.active && !navigator.serviceWorker.controller) {
            window.sessionStorage.setItem("coiReloadedBySelf", "true");
            window.location.reload();
          }
        },
        (err) => console.error("COI Service Worker registration failed:", err)
      );
    }
  })();
}
