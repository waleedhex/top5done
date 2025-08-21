// Service Worker للعبة التوب 5 - استراتيجية الكاش أولاً
// تحميل فوري لجميع الملفات للعمل بدون إنترنت

const CACHE_VERSION = 'v2.0.0';
const STATIC_CACHE_NAME = `top5-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE_NAME = `top5-dynamic-${CACHE_VERSION}`;

// جميع الملفات الثابتة - يتم تحميلها فوراً عند التثبيت
const CRITICAL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/questions.json',
  '/codes.json',
  '/robots.txt',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/apple-touch-icon.png',
  // ملفات JavaScript و CSS الرئيسية
  '/src/main.tsx',
  '/src/App.tsx',
  '/src/pages/Index.tsx',
  '/src/components/Top5Game.tsx',
  '/src/index.css'
];

// إضافة ملفات أخرى مهمة
const ADDITIONAL_ASSETS = [
  // Vite assets pattern
  /\/assets\/.*\.(js|css|woff|woff2)$/,
  // Component files
  /\/src\/.*\.(tsx|ts|css)$/,
  // UI components
  /\/src\/components\/ui\/.*\.(tsx|ts)$/
];

// تثبيت Service Worker - تحميل فوري لجميع الملفات
self.addEventListener('install', (event) => {
  console.log('[SW] تثبيت Service Worker بالإصدار:', CACHE_VERSION);
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then(async (cache) => {
        console.log('[SW] بدء تحميل الملفات الثابتة فوراً...');
        
        // تحميل جميع الملفات الحرجة فوراً
        const responses = await Promise.allSettled(
          CRITICAL_ASSETS.map(async (asset) => {
            try {
              const response = await fetch(asset);
              if (response.ok) {
                await cache.put(asset, response);
                console.log('[SW] تم تحميل:', asset);
                return asset;
              } else {
                console.warn('[SW] فشل تحميل:', asset, response.status);
              }
            } catch (error) {
              console.warn('[SW] خطأ في تحميل:', asset, error);
            }
          })
        );
        
        console.log('[SW] تم تحميل جميع الملفات الأساسية');
        return responses;
      })
      .then(() => {
        console.log('[SW] التثبيت مكتمل - تفعيل فوري');
        // تفعيل فوري للـ Service Worker الجديد
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[SW] خطأ في التثبيت:', error);
      })
  );
});

// تفعيل Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] تفعيل Service Worker:', CACHE_VERSION);
  
  event.waitUntil(
    Promise.all([
      // حذف الكاش القديم
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== STATIC_CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
              console.log('[SW] حذف كاش قديم:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // السيطرة على جميع العملاء فوراً
      self.clients.claim()
    ]).then(() => {
      console.log('[SW] تم التفعيل بنجاح');
    })
  );
});

// معالجة الطلبات - استراتيجية الكاش أولاً
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // تجاهل الطلبات غير GET
  if (request.method !== 'GET') {
    return;
  }
  
  // تجاهل الـ extensions والـ non-http requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  event.respondWith(handleCacheFirstRequest(request));
});

// استراتيجية الكاش أولاً المحسنة
async function handleCacheFirstRequest(request) {
  const url = new URL(request.url);
  
  try {
    // البحث في الكاش الثابت أولاً
    const staticCache = await caches.open(STATIC_CACHE_NAME);
    let cachedResponse = await staticCache.match(request);
    
    if (cachedResponse) {
      console.log('[SW] من الكاش الثابت:', url.pathname);
      return cachedResponse;
    }
    
    // البحث في الكاش الديناميكي
    const dynamicCache = await caches.open(DYNAMIC_CACHE_NAME);
    cachedResponse = await dynamicCache.match(request);
    
    if (cachedResponse) {
      console.log('[SW] من الكاش الديناميكي:', url.pathname);
      
      // تحديث في الخلفية إذا كان ممكناً
      fetchAndUpdateCache(request, dynamicCache);
      
      return cachedResponse;
    }
    
    // إذا لم يوجد في الكاش، تحميل من الشبكة
    console.log('[SW] تحميل من الشبكة:', url.pathname);
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // تحديد نوع الكاش المناسب
      const shouldCacheAsStatic = CRITICAL_ASSETS.includes(url.pathname) ||
                                 CRITICAL_ASSETS.some(asset => url.pathname.endsWith(asset));
      
      const shouldCache = shouldCacheAsStatic ||
                         ADDITIONAL_ASSETS.some(pattern => pattern.test(url.pathname)) ||
                         url.pathname.includes('/assets/') ||
                         url.pathname.endsWith('.js') ||
                         url.pathname.endsWith('.css') ||
                         url.pathname.endsWith('.json') ||
                         url.pathname.endsWith('.png') ||
                         url.pathname.endsWith('.jpg') ||
                         url.pathname.endsWith('.svg');
      
      if (shouldCache) {
        const targetCache = shouldCacheAsStatic ? staticCache : dynamicCache;
        const responseClone = networkResponse.clone();
        targetCache.put(request, responseClone);
        console.log('[SW] تم تخزين في الكاش:', url.pathname);
      }
    }
    
    return networkResponse;
    
  } catch (error) {
    console.warn('[SW] خطأ في الشبكة:', error);
    
    // محاولة العثور على أي نسخة محفوظة
    const allCaches = await caches.keys();
    for (const cacheName of allCaches) {
      const cache = await caches.open(cacheName);
      const cachedResponse = await cache.match(request);
      if (cachedResponse) {
        console.log('[SW] من كاش احتياطي:', url.pathname);
        return cachedResponse;
      }
    }
    
    // إذا كانت صفحة رئيسية، إرجاع الصفحة الرئيسية المحفوظة
    if (request.mode === 'navigate') {
      const staticCache = await caches.open(STATIC_CACHE_NAME);
      const mainPage = await staticCache.match('/') || await staticCache.match('/index.html');
      if (mainPage) {
        console.log('[SW] إرجاع الصفحة الرئيسية');
        return mainPage;
      }
    }
    
    // رد افتراضي للحالات الطارئة
    return new Response(
      '⚠️ هذا المحتوى غير متوفر دون اتصال بالإنترنت\n\nالرجاء التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.',
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Headers({
          'Content-Type': 'text/plain; charset=utf-8'
        })
      }
    );
  }
}

// تحديث الكاش في الخلفية
async function fetchAndUpdateCache(request, cache) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
  } catch (error) {
    // تجاهل أخطاء التحديث في الخلفية
    console.log('[SW] تحديث خلفي فاشل - لا بأس');
  }
}

// معالج الرسائل
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FORCE_UPDATE') {
    console.log('[SW] إجبار تحديث الكاش');
    event.waitUntil(
      caches.open(STATIC_CACHE_NAME).then(cache => {
        return Promise.all(
          CRITICAL_ASSETS.map(asset => {
            return fetch(asset).then(response => {
              if (response.ok) {
                return cache.put(asset, response);
              }
            }).catch(err => console.log('فشل تحديث:', asset));
          })
        );
      })
    );
  }
});

console.log('[SW] Service Worker جاهز للعمل بدون إنترنت ✅');