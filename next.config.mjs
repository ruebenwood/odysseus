import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Alias PostHog to a local stub so builds work when the package isn't installed.
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "posthog-js": path.resolve(process.cwd(), "lib/stubs/posthog-js.ts"),
    };
    return config;
  },
};

export default nextConfig;
