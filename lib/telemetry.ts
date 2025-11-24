// Minimal client-side telemetry wrapper with PostHog (optional)
"use client";

export const ENV_POSTHOG_KEY =
  process.env.NEXT_PUBLIC_POSTHOG_KEY || undefined;
export const ENV_POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

let posthogLoaded = false;
let posthog: any = null;

type TelemetryConfig = {
  enabled: boolean;
  key?: string;
  apiHost?: string;
};

type TelemetryEvent = {
  ts: number;
  event: string;
  props?: Record<string, any>;
};

const MAX_EVENTS = 50;
const recentEvents: TelemetryEvent[] = [];
const listeners = new Set<(e: TelemetryEvent) => void>();

function pushEvent(e: TelemetryEvent) {
  recentEvents.push(e);
  if (recentEvents.length > MAX_EVENTS) recentEvents.shift();
  // Why: live-update UI even if PostHog disabled/missing key.
  listeners.forEach((cb) => {
    try {
      cb(e);
    } catch {
      /* no-op */
    }
  });
}

export function subscribeToEvents(cb: (e: TelemetryEvent) => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getRecentEvents(): TelemetryEvent[] {
  return [...recentEvents];
}

export function initTelemetry(config: TelemetryConfig) {
  if (typeof window === "undefined") return;
  if (!config.enabled) return;
  if (posthogLoaded) return;

  const key = config.key ?? ENV_POSTHOG_KEY;
  const apiHost = config.apiHost ?? ENV_POSTHOG_HOST;
  if (!key) return;

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
      // no-op
    });
}

export function capture(event: string, props?: Record<string, any>) {
  const e: TelemetryEvent = { ts: Date.now(), event, props };
  pushEvent(e);
  if (!posthogLoaded || !posthog) return;
  try {
    posthog.capture(event, props);
  } catch {
    /* no-op */
  }
}

export function shutdownTelemetry() {
  if (posthogLoaded && posthog) {
    try {
      posthog.shutdown();
    } catch {
      /* no-op */
    }
  }
  posthogLoaded = false;
  posthog = null;
}
