import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  // @ffmpeg-installer uses a dynamic require to pick its platform binary.
  // Turbopack can't statically resolve it; mark these as runtime-only
  // node requires (matches the blurter setup).
  serverExternalPackages: [
    "@ffmpeg-installer/ffmpeg",
    "@ffmpeg-installer/linux-x64",
    "@ffmpeg-installer/darwin-x64",
    "@ffmpeg-installer/darwin-arm64",
  ],
  // The workflow step that runs ffmpeg needs the binary present in the
  // function bundle on Vercel. outputFileTracingIncludes pulls the linux
  // binary into every workflow route's deployment bundle.
  outputFileTracingIncludes: {
    "/.well-known/workflow/v1/step": [
      "./node_modules/@ffmpeg-installer/ffmpeg/**",
      "./node_modules/@ffmpeg-installer/linux-x64/**",
    ],
  },
};

export default withWorkflow(nextConfig);
