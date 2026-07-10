import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
      { protocol: 'https', hostname: '*.blob.vercel-storage.com' },
    ],
  },
  // Keep the native ffmpeg binary external so the bundler doesn't inline it,
  // and pg-boss because its CJS entry has no default export under Turbopack.
  serverExternalPackages: ['@ffmpeg-installer/ffmpeg', 'pg-boss'],
  // The caption font is read via import.meta.url at render time; Next's file
  // tracer can't see that, so force it into every API function bundle.
  outputFileTracingIncludes: {
    '/api/**/*': ['./src/lib/render/font.ttf'],
  },
};

export default nextConfig;
