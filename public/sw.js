// Modbus Web Monitor Service Worker
// Provides offline functionality and caching for PWA support

const CACHE_NAME = 'modbus-monitor-v1'
const CACHE_VERSION = '1.0.0'

// Assets to precache (core app files)
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  // Note: CSS and JS files will be added dynamically based on the current page
]

// Runtime cache patterns
const RUNTIME_CACHE_PATTERNS = [
  // Cache fonts from CDNs
  { pattern: /^https:\/\/fonts\.googleapis\.com\//, strategy: 'cacheFirst' },
  { pattern: /^https:\/\/fonts\.gstatic\.com\//, strategy: 'cacheFirst' },
  // Cache other external resources
  { pattern: /\.(png|jpg|jpeg|svg|gif|webp)$/, strategy: 'cacheFirst' },
]

// Cache strategies
const STRATEGIES = {
  cacheFirst: async (request, cache) => {
    const cached = await cache.match(request)
    if (cached) return cached

    try {
      const response = await fetch(request)
      if (response.ok) {
        cache.put(request, response.clone())
      }
      return response
    } catch (error) {
      console.warn('Network request failed:', request.url, error)
      throw error
    }
  },

  networkFirst: async (request, cache) => {
    try {
      const response = await fetch(request)
      if (response.ok) {
        cache.put(request, response.clone())
      }
      return response
    } catch (error) {
      const cached = await cache.match(request)
      if (cached) return cached
      throw error
    }
  },
}

// Install event - precache core assets
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...')

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('Service Worker: Precaching assets')

      try {
        // Cache the core assets
        await cache.addAll(PRECACHE_ASSETS)

        // Also cache the current page and its assets
        try {
          const response = await fetch('/')
          if (response.ok) {
            const html = await response.text()

            // Extract CSS and JS file references from HTML
            const cssMatches = html.match(/href="([^"]*\.css)"/g) || []
            const jsMatches = html.match(/src="([^"]*\.js)"/g) || []

            const additionalAssets = []

            cssMatches.forEach((match) => {
              const url = match.match(/href="([^"]*)"/)?.[1]
              if (url) additionalAssets.push(url)
            })

            jsMatches.forEach((match) => {
              const url = match.match(/src="([^"]*)"/)?.[1]
              if (url) additionalAssets.push(url)
            })

            if (additionalAssets.length > 0) {
              console.log(
                'Service Worker: Caching additional assets:',
                additionalAssets
              )
              await cache.addAll(additionalAssets)
            }
          }
        } catch (error) {
          console.warn(
            'Service Worker: Could not cache additional assets:',
            error
          )
        }

        console.log('Service Worker: Precaching completed')
      } catch (error) {
        console.error('Service Worker: Precaching failed', error)
        // Don't fail the install if precaching fails
      }
    })
  )

  // Force activation
  self.skipWaiting()
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...')

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('Service Worker: Deleting old cache:', cacheName)
              return caches.delete(cacheName)
            }
            return Promise.resolve()
          })
        )
      })
      .then(() => {
        console.log('Service Worker: Activated')
        // Take control of all clients immediately
        return self.clients.claim()
      })
  )
})

// Fetch event - handle requests with caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-HTTP requests
  if (!url.protocol.startsWith('http')) {
    return
  }

  // Skip requests that shouldn't be cached
  if (request.method !== 'GET') {
    return
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Check if this is a precached asset
      const cached = await cache.match(request)
      if (cached) {
        // For precached assets, always try network first to get updates
        try {
          const response = await fetch(request)
          if (response.ok) {
            cache.put(request, response.clone())
            return response
          }
        } catch (_error) {
          console.log(
            'Service Worker: Network failed, serving cached version:',
            request.url
          )
        }
        return cached
      }

      // Check runtime cache patterns
      for (const pattern of RUNTIME_CACHE_PATTERNS) {
        if (pattern.pattern.test(request.url)) {
          const strategy = STRATEGIES[pattern.strategy]
          if (strategy) {
            return strategy(request, cache)
          }
        }
      }

      // Default: network first for everything else
      return STRATEGIES.networkFirst(request, cache)
    })
  )
})

// Message event - handle cache updates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }

  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION })
  }
})
