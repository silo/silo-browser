export function getNotificationInjectionScript(enabled: boolean, tabId?: string): string {
  return `
    (() => {
      if (window.__siloNotifWrapped) return;
      window.__siloNotifEnabled = ${enabled};
      ${tabId ? `window.__siloTabId = '${tabId}'; document.documentElement.dataset.siloTabId = '${tabId}';` : ''}
      const OrigNotification = window.Notification;
      const SiloNotification = function(title, options) {
        if (!window.__siloNotifEnabled) return {};
        const notif = new OrigNotification(title, options);
        if (window.__siloTabId) {
          notif.addEventListener('click', () => {
            window.postMessage({ type: '__silo_notification_click', tabId: window.__siloTabId }, '*');
          });
        }
        return notif;
      };
      SiloNotification.requestPermission = () => {
        return OrigNotification.requestPermission.call(OrigNotification);
      };
      Object.defineProperty(SiloNotification, 'permission', {
        get: () => OrigNotification.permission
      });
      SiloNotification.prototype = OrigNotification.prototype;
      window.Notification = SiloNotification;
      const origShow = ServiceWorkerRegistration.prototype.showNotification;
      ServiceWorkerRegistration.prototype.showNotification = function(...args) {
        if (!window.__siloNotifEnabled) return Promise.resolve();
        return origShow.apply(this, args);
      };
      // Intercept WindowClient.focus() — Gmail Service Workers call this
      // and it bypasses the preload window.focus() override
      if (window.WindowClient && window.WindowClient.prototype) {
        window.WindowClient.prototype.focus = function() {
          return Promise.resolve(this);
        };
      }

      // clients.openWindow() runs in SW global scope (not accessible here)
      // but is already intercepted by setWindowOpenHandler in the main process.

      // Patch window.focus() in same-origin iframes to prevent focus stealing
      function patchIframeFocus(iframe) {
        try {
          if (iframe.contentWindow && iframe.contentWindow.focus) {
            iframe.contentWindow.focus = () => {};
          }
        } catch(e) { /* cross-origin — already a no-op for parent window */ }
      }
      document.querySelectorAll('iframe').forEach(patchIframeFocus);
      const iframeObs = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeName === 'IFRAME') {
              node.addEventListener('load', () => patchIframeFocus(node));
              patchIframeFocus(node);
            }
          }
        }
      });
      if (document.documentElement) {
        iframeObs.observe(document.documentElement, { childList: true, subtree: true });
      }

      // Override window.open() in the MAIN WORLD to prevent Electron's internal
      // popup handling from activating the parent BrowserWindow (which steals focus).
      // The webview preload runs in an isolated world so its override doesn't catch
      // calls from web page JS. We route URLs via postMessage → preload → IPC.
      const _siloOrigOpen = window.open;
      window.open = function(url, target, features) {
        const urlStr = (url || '').toString();
        if (urlStr) {
          window.postMessage({ type: '__silo_window_open', url: urlStr }, '*');
        }
        return null;
      };

      // Lock focus and open against reassignment
      const _lockedProps = { focus: window.focus, open: window.open };
      for (const [key, val] of Object.entries(_lockedProps)) {
        Object.defineProperty(window, key, {
          get: () => val,
          set: () => {},
          configurable: false
        });
      }

      window.__siloNotifWrapped = true;
    })()
  `
}
