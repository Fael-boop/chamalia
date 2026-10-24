import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useRegisterSW } from "virtual:pwa-register/react";
import { APP_VERSION } from "@/version";

/** How often the panel asks whether a new version was deployed. */
const CHECK_EVERY_MS = 60_000;
const TOAST_ID = "app-update";

/** Last resort when no new service worker shows up: drop the cached app and load it fresh. */
async function hardReload() {
  try {
    const registrations = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(registrations.map((registration) => registration.unregister()));
    const keys = (await caches?.keys()) ?? [];
    await Promise.all(keys.map((key) => caches.delete(key)));
  } finally {
    window.location.reload();
  }
}

/**
 * The panel is installable and keeps a copy of itself to open fast, so after a deploy the
 * browser could keep showing the old version. This notices a new version within a minute
 * (new service worker, or /health reporting another version) and offers a one-click update.
 */
export function UpdatePrompt() {
  const [outdated, setOutdated] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => void registration.update().catch(() => {}), CHECK_EVERY_MS);
    },
  });

  // The server says which version is live; a different one here means this tab is stale.
  useEffect(() => {
    const check = async () => {
      try {
        const response = await fetch("/health", { cache: "no-store" });
        const { version } = (await response.json()) as { version?: string };
        if (version && version !== APP_VERSION) setOutdated(true);
      } catch {
        // Offline or deploying: try again later.
      }
    };
    void check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!needRefresh && !outdated) return;
    toast.info("Nova versão da Chama Lia disponível.", {
      id: TOAST_ID,
      duration: Infinity,
      action: {
        label: "Atualizar",
        onClick: () => void (needRefresh ? updateServiceWorker(true) : hardReload()),
      },
    });
  }, [needRefresh, outdated, updateServiceWorker]);

  return null;
}
