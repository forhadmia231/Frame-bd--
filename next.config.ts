import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  logging: {
    incomingRequests: { ignore: [/\/api\/auth/, /\/reset-password/] },
    serverFunctions: false,
    browserToTerminal: false,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default nextConfig;
