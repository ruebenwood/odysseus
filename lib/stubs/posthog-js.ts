// Minimal PostHog client stub used when the real dependency is unavailable.
// Provides the API surface the telemetry wrapper expects without external installs.
const posthog = {
  init: (_key?: string, _opts?: Record<string, unknown>) => undefined,
  capture: (_event?: string, _props?: Record<string, unknown>) => undefined,
  reset: () => undefined,
};

export default posthog;
