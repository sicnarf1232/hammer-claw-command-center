/** @type {import('next').NextConfig} */
const nextConfig = {
  // Type errors should fail the build. Lint is run separately; do not block deploys on it.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
