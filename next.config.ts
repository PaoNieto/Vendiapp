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
  // La política de privacidad y los términos viven en la landing. Acá solo se
  // redirige, para que los links de la app (y /privacidad, que ya está como
  // ruta pública en proxy.ts) no den 404. La política explica el pixel de Meta
  // que corre en la app.
  async redirects() {
    return [
      {
        source: "/privacidad",
        destination: "https://www.vendilatam.com/privacidad.html",
        permanent: false,
      },
      {
        source: "/terminos",
        destination: "https://www.vendilatam.com/terminos.html",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
