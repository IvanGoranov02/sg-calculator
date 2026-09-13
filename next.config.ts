import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com", pathname: "/**" },
      { protocol: "https", hostname: "financialmodelingprep.com", pathname: "/image-stock/**" },
    ],
  },
};

export default nextConfig;
