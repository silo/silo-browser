export function getNotificationInjectionScript(enabled: boolean): string {
  return `
    (() => {
      if (window.__siloNotifWrapped) return;
      window.__siloNotifEnabled = ${enabled};
      const OrigNotification = window.Notification;
      const SiloNotification = function(title, options) {
        if (!window.__siloNotifEnabled) return {};
        return new OrigNotification(title, options);
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
      window.__siloNotifWrapped = true;
    })()
  `
}
