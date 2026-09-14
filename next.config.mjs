/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["node-edge-tts", "ws"],
  },
};

export default nextConfig;
