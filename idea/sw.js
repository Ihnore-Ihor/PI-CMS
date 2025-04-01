const CACHE_NAME = "pwa-cms-cache-v6";
const ASSETS = [
    "/PI-CMS/idea/Dashboard.js",
    "/PI-CMS/idea/Dashboard.html",
    "/PI-CMS/idea/index.html",
    "/PI-CMS/idea/init_sw.js",
    "/PI-CMS/idea/manifest.json",
    "/PI-CMS/idea/Messages.html",
    "/PI-CMS/idea/Messages.js",
    "/PI-CMS/idea/Students.css",
    "/PI-CMS/idea/Students.js",
    "/PI-CMS/idea/sw.js",
    "/PI-CMS/idea/Tasks.html",
    "/PI-CMS/idea/Tasks.js",
    "/PI-CMS/idea/assets/Amethyst.png",
    "/PI-CMS/idea/assets/bell.png",
    "/PI-CMS/idea/assets/Garnet.png",
    "/PI-CMS/idea/assets/isaac.gif",
    "/PI-CMS/idea/assets/Menu.png",
    "/PI-CMS/idea/assets/notification.png",
    "/PI-CMS/idea/assets/Pearl.png",
    "/PI-CMS/idea/assets/pngegg.png",
    "/PI-CMS/idea/assets/status_off.png",
    "/PI-CMS/idea/assets/status_on.png",
    "/PI-CMS/idea/assets/user.png",
    "/PI-CMS/idea/assets/logo-192.png"
];

// Встановлення Service Worker та кешування файлів
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Caching files');
            return Promise.all(
                ASSETS.map((asset) => {
                    return fetch(asset)
                        .then((response) => {
                            if (!response.ok) {
                                console.warn(`Failed to fetch ${asset}: ${response.status}`);
                                return; // Skip caching this asset
                            }
                            return cache.put(asset, response);
                        })
                        .catch((err) => {
                            console.error(`Error caching ${asset}: ${err}`);
                        });
                })
            ).then(() => console.log('Caching complete'));
        }).catch((err) => console.error('Install failed:', err))
    );
});

// Перехоплення запитів і завантаження з кешу
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});

// Оновлення Service Worker і видалення старого кешу
self.addEventListener("activate", (event) => {
    console.log('Updating cache');
    event.waitUntil(
        caches
            .keys()
            .then((keys) => {
                return Promise.all(
                    keys
                        .filter((key) => key !== CACHE_NAME)
                        .map((key) => caches.delete(key))
                );
            })
            .then(() => {
                return self.clients.claim(); // Підключаємо новий SW до всіх вкладок
            })
    );
});