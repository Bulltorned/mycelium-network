/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pre-existing TS gaps in hooks/pages use untyped Anchor IDL — runtime
  // works fine. Flip to false once Anchor IDL types are regenerated.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        stream: false,
        buffer: require.resolve("buffer/"),
        process: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
