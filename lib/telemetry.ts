export const ENV_POSTHOG_KEY =
  typeof process !== "undefined" ? process.env.NEXT_PUBLIC_POSTHOG_KEY : undefined;

type Event = { ts: number; event: string; props?: Record<string, any> };
let buffer: Event[] = [];
let ph: any = null;

export function initTelemetry(opts: { enabled: boolean }) {
  if (typeof window === "undefined") return;
  if (!opts.enabled) return;
  if (!ENV_POSTHOG_KEY) return;

  // Lazy import on client
  import("posthog-js")
    .then((mod) => {
      ph = mod.default;
      ph.init(ENV_POSTHOG_KEY!, { api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com" });
    })
    .catch(() => {
      // no-op if package missing or init fails
    });
}

export function shutdownTelemetry() {
  if (ph?.reset) ph.reset();
}

export function capture(event: string, props?: Record<string, any>) {
  const e = { ts: Date.now(), event, props };
  buffer.push(e);
  if (buffer.length > 200) buffer = buffer.slice(buffer.length - 200);
  if (ph?.capture) ph.capture(event, props);
}

export function subscribeToEvents(cb: (e: Event) => void) {
  let i = 0;
  const id = setInterval(() => {
    if (i < buffer.length) cb(buffer[i++]);
  }, 300);
  return () => clearInterval(id);
}

export function getRecentEvents(): Event[] {
  return buffer.slice(-10);
}
