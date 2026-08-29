import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (container: HTMLElement, options: {
    sitekey: string;
    callback: (token: string) => void;
    "expired-callback": () => void;
    "error-callback": () => void;
  }) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const loadTurnstile = () => new Promise<TurnstileApi>((resolve, reject) => {
  if (window.turnstile) return resolve(window.turnstile);
  const existing = document.querySelector<HTMLScriptElement>('script[src^="https://challenges.cloudflare.com/turnstile/"]');
  const script = existing ?? document.createElement("script");
  const complete = () => window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile did not load."));
  if (!existing) {
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    document.head.append(script);
  }
  script.addEventListener("load", complete, { once: true });
  script.addEventListener("error", () => reject(new Error("Turnstile could not load.")), { once: true });
});

export function TurnstileWidget({
  siteKey,
  onToken,
  onError,
}: {
  siteKey: string;
  onToken: (token: string) => void;
  onError: (message: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let widgetId: string | undefined;
    let disposed = false;
    void loadTurnstile()
      .then((turnstile) => {
        if (disposed || !container.current) return;
        widgetId = turnstile.render(container.current, {
          sitekey: siteKey,
          callback: onToken,
          "expired-callback": () => onError("Verification expired. Please try again."),
          "error-callback": () => onError("Verification could not load. Please try again."),
        });
      })
      .catch((error: Error) => onError(error.message));
    return () => {
      disposed = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [onError, onToken, siteKey]);

  return <div className="turnstile" ref={container} aria-label="Human verification" />;
}
