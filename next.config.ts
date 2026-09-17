import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Deliberately not 'standalone': App Platform's buildpack runs `next start`,
  // and Next warns that standalone output is incompatible with it.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
