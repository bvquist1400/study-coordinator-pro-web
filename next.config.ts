if (process.env.NEXT_TURBOPACK_USE_WORKER === undefined) {
  // Turbopack workers bind local ports; this keeps builds working in restricted environments.
  process.env.NEXT_TURBOPACK_USE_WORKER = "0";
}

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Re-enabled strict type and ESLint checks for builds
};

export default nextConfig;
