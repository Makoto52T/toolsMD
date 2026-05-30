/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/auth/google/callback',
        destination: '/api/auth/callback/google',
      },
    ];
  },
};

module.exports = nextConfig;
