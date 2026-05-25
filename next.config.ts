import type { NextConfig } from "next";

// Hostname del proyecto Supabase de Vendí. Si lo movemos a otro proyecto,
// actualizar acá + en `.env.local`. Hardcodeado porque `remotePatterns` se
// evalúa en build-time y no acepta env vars dinámicas sin un wrapper.
const SUPABASE_HOST = "njmxxdaxzzzlloweudgv.supabase.co";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: SUPABASE_HOST,
        pathname: "/storage/v1/object/**",
      },
    ],
  },
};

export default nextConfig;
