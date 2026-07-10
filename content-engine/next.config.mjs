/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/admin/migrate": ["./src/lib/db/migrations/**/*"],
  },
};

export default nextConfig;
