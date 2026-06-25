/** @type {import('next').NextConfig} */
const nextConfig = {
  // Type errors should fail the build. Lint is run separately; do not block deploys on it.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  // Keep the headless-Chrome packages out of the webpack bundle so Vercel traces
  // the Chromium binary correctly for the meeting-PDF route.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
};

export default nextConfig;
