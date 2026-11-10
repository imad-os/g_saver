/*
 * MyPC Drive Streaming Service Worker (v1.7.0)
 * Enhanced for multi-hour Smart TV video loops and nested MyPC iframes:
 *  - Broadcasts Range requests across all window/iframe clients until the client holding `streams[token]` replies
 *    (fixes the 2nd-chunk 404 'gone' bug after ~3 seconds when Chromium omits `event.clientId` on subsequent Range fetches).
 *  - Caches recent 2 MB slices in memory so looping videos and MP4 moov-atom tail seeks do not re-fetch over the network.
 */
(function () {
  'use strict';

  var PREFIX = '__mypc_drive/';
  var PIECE = 2 * 1024 * 1024;
  var MAX_CACHE_ENTRIES = 24; // Up to 48 MB cached in SW memory for zero-network looping
  var chunkCache = new Map();

  function getCachedChunk(key) {
    if (!chunkCache.has(key)) return null;
    var entry = chunkCache.get(key);
    chunkCache.delete(key);
    chunkCache.set(key, entry);
    return entry;
  }

  function setCachedChunk(key, entry) {
    if (chunkCache.has(key)) {
      chunkCache.delete(key);
    } else if (chunkCache.size >= MAX_CACHE_ENTRIES) {
      var oldestKey = chunkCache.keys().next().value;
      if (oldestKey !== undefined) chunkCache.delete(oldestKey);
    }
    chunkCache.set(key, entry);
  }

  self.addEventListener('install', function () {
    self.skipWaiting();
  });

  self.addEventListener('activate', function (e) {
    e.waitUntil(self.clients.claim());
  });

  self.addEventListener('fetch', function (event) {
    var url = new URL(event.request.url);
    var at = url.pathname.indexOf('/' + PREFIX);
    if (url.origin !== self.location.origin || at < 0) return;
    var token = url.pathname.slice(at + PREFIX.length + 1);
    event.respondWith(serve(event, token));
  });

  function askSingleClient(client, msg) {
    return new Promise(function (resolve) {
      var ch = new MessageChannel();
      var timer = setTimeout(function () {
        resolve({ error: 'timeout', status: 504 });
      }, 45000);
      ch.port1.onmessage = function (e) {
        clearTimeout(timer);
        resolve(e.data || { error: 'empty', status: 502 });
      };
      try {
        client.postMessage(msg, [ch.port2]);
      } catch (err) {
        clearTimeout(timer);
        resolve({ error: 'post-failed', status: 502 });
      }
    });
  }

  function requestChunkFromClients(event, msg) {
    return (event.clientId ? self.clients.get(event.clientId) : Promise.resolve(null))
      .then(function (primary) {
        return self.clients
          .matchAll({ type: 'window', includeUncontrolled: true })
          .then(function (all) {
            var candidates = [];
            if (primary) candidates.push(primary);
            for (var i = 0; i < all.length; i++) {
              if (!primary || all[i].id !== primary.id) {
                candidates.push(all[i]);
              }
            }
            if (candidates.length === 0) {
              return { error: 'No active client window', status: 503 };
            }

            var idx = 0;
            function tryNext() {
              if (idx >= candidates.length) {
                return Promise.resolve({ error: 'gone', status: 404 });
              }
              var c = candidates[idx++];
              return askSingleClient(c, msg).then(function (res) {
                if (res && res.error === 'gone' && idx < candidates.length) {
                  return tryNext();
                }
                return res;
              });
            }
            return tryNext();
          });
      });
  }

  function buildRangeResponse(buf, start, total, contentType) {
    var n = buf.byteLength;
    var totalStr = total ? String(total) : '*';
    return new Response(buf, {
      status: 206,
      headers: {
        'Content-Type': contentType || 'video/mp4',
        'Content-Length': String(n),
        'Content-Range': 'bytes ' + start + '-' + (start + n - 1) + '/' + totalStr,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  }

  function serve(event, token) {
    var rangeHeader = event.request.headers.get('range') || '';
    var m = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
    var start = m ? +m[1] : 0;
    var want = m && m[2] ? +m[2] : start + PIECE - 1;
    var end = Math.min(want, start + PIECE - 1);
    var cacheKey = token + ':' + start + ':' + end;

    var cached = getCachedChunk(cacheKey);
    if (cached && cached.buf) {
      return Promise.resolve(
        buildRangeResponse(cached.buf.slice(0), start, cached.total, cached.type)
      );
    }

    return requestChunkFromClients(event, {
      mypcDrive: 1,
      token: token,
      start: start,
      end: end,
    }).then(function (a) {
      if (!a || a.error || !a.buf) {
        return new Response(String((a && a.error) || 'Stream error'), {
          status: (a && a.status) || 502,
        });
      }
      if (a.buf.byteLength <= PIECE) {
        setCachedChunk(cacheKey, {
          buf: a.buf.slice(0),
          total: a.total,
          type: a.type || 'video/mp4',
        });
      }
      return buildRangeResponse(a.buf, start, a.total, a.type);
    });
  }
})();
