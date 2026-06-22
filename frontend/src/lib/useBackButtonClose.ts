import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

// On Android (Capacitor), pressing the hardware back button while a modal/sheet
// is open should close it instead of navigating away. No-op on web.
export function useBackButtonClose(isOpen: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!isOpen || !Capacitor.isNativePlatform()) return;
    let remove: (() => void) | undefined;
    import("@capacitor/app").then(({ App }) => {
      App.addListener("backButton", () => onClose()).then((handle) => {
        remove = () => handle.remove();
      });
    });
    return () => { remove?.(); };
  }, [isOpen, onClose]);
}
