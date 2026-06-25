/** @type {import('next').NextConfig} */
const nextConfig = {
  // Type errors should fail the build. Lint is run separately; do not block deploys on it.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  // Keep the headless-Chrome packages out of the webpack bundle so Vercel traces
  // the Chromium binary correctly for the meeting-PDF route.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // Belt-and-suspenders: make sure the Chromium binary files ship with the PDF
  // function (node-file-trace can miss the runtime-resolved .br binaries).
  outputFileTracingIncludes: {
    "/api/meetings/pdf": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;
