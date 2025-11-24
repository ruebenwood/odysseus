// Minimal client-side telemetry wrapper with PostHog (optional)
"use client";

let posthogLoaded = false;
let posthog: any = null;

type TelemetryConfig = {
  enabled: boolean;
  key?: string;
  apiHost?: string;
};

export function initTelemetry(config: TelemetryConfig) {
  // Why: avoid SSR/init costs when disabled or key missing.
  if (typeof window === "undefined") return;
  if (!config.enabled) return;
  if (posthogLoaded) return;

  const key = config.key ?? process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const apiHost =
    config.apiHost ?? process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
  if (!key) return;

  // Lazy import; safe no-op if bundle missing.
  import("posthog-js")
    .then((mod) => {
      posthog = mod.default;
      posthog.init(key, {
        api_host: apiHost,
        autocapture: false,
        person_profiles: "identified_only",
        capture_pageview: false,
        capture_pageleave: false,
      });
      posthogLoaded = true;
    })
    .catch(() => {
      // Swallow; operate as no-op
    });
}

export function capture(event: string, props?: Record<string, any>) {
  if (!posthogLoaded || !posthog) return;
  try {
    posthog.capture(event, props);
  } catch {
    // no-op
  }
}

export function shutdownTelemetry() {
  if (!posthogLoaded || !posthog) return;
  try {
    posthog.shutdown();
  } catch {
    // no-op
  } finally {
    posthogLoaded = false;
    posthog = null;
  }
}
