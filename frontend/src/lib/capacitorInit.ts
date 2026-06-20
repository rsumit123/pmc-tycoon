import { Capacitor } from "@capacitor/core";

// Native-only setup: Android hardware back button + status bar styling.
// No-op on web so it's safe to call unconditionally at app start.
export function initCapacitor(): void {
  if (!Capacitor.isNativePlatform()) return;

  import("@capacitor/app").then(({ App }) => {
    App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else App.exitApp();
    });
  });

  import("@capacitor/status-bar").then(({ StatusBar, Style }) => {
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  });
}
