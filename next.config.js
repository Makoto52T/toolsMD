/** @type {import('next').NextConfig} */
const nextConfig = {
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
