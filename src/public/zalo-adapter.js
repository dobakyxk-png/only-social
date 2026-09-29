/* Zalo Mini App compatibility adapter.
 * zmp-sdk is injected by the Mini App runtime; browser fallback remains functional.
 */
(function () {
  window.ONLY_ZALO_MINI_APP = Boolean(window.zmp || window.zmpSdk || window.my);
  window.ONLY_ZALO_SDK = window.zmp || window.zmpSdk || window.my || null;
  window.ONLY_ZALO_STORAGE = window.ONLY_ZALO_SDK?.storage || null;

  window.onlyMiniStorage = {
    async get(key) {
      if (window.ONLY_ZALO_STORAGE?.getItem) {
        try { return await window.ONLY_ZALO_STORAGE.getItem(key); } catch (_) { /* fallback */ }
      }
      if (window.ONLY_ZALO_STORAGE?.get) {
        try { return await window.ONLY_ZALO_STORAGE.get({ key }); } catch (_) { /* fallback */ }
      }
      return window.localStorage?.getItem(key) || null;
    },
    async set(key, value) {
      if (window.ONLY_ZALO_STORAGE?.setItem) {
        try { await window.ONLY_ZALO_STORAGE.setItem(key, value); return; } catch (_) { /* fallback */ }
      }
      if (window.ONLY_ZALO_STORAGE?.set) {
        try { await window.ONLY_ZALO_STORAGE.set({ key, value }); return; } catch (_) { /* fallback */ }
      }
      window.localStorage?.setItem(key, value);
    },
    async remove(key) {
      if (window.ONLY_ZALO_STORAGE?.removeItem) {
        try { await window.ONLY_ZALO_STORAGE.removeItem(key); return; } catch (_) { /* fallback */ }
      }
      if (window.ONLY_ZALO_STORAGE?.remove) {
        try { await window.ONLY_ZALO_STORAGE.remove({ key }); return; } catch (_) { /* fallback */ }
      }
      window.localStorage?.removeItem(key);
    }
  };

  window.onlyZaloGetLocation = function () {
    if (window.ONLY_ZALO_SDK?.getLocation) return window.ONLY_ZALO_SDK.getLocation();
    if (window.ONLY_ZALO_SDK?.getLocationAsync) return window.ONLY_ZALO_SDK.getLocationAsync();
    return new Promise((resolve, reject) => navigator.geolocation?.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 8000 }));
  };
})();
