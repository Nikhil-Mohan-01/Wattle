import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Next.js and React use inline scripts and styles, so those stay allowed; the
// policy mainly blocks framing, plugins, foreign scripts and foreign requests.
// Development needs eval and websockets for hot reloading, so it's prod-only.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isProd
    ? [
        { key: "Content-Security-Policy", value: contentSecurityPolicy },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // The embedded dev/test database ships WebAssembly files; load it from
  // node_modules at runtime rather than bundling it.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Files the game servers read from disk at runtime; make sure serverless
  // deployments (Vercel) ship them with the functions that need them.
  // Plain-text banks stay on the developer's machine; never ship them.
  outputFileTracingExcludes: {
    "/**": ["./content/private/**"],
  },
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/word-list/words.txt", "./content/examples/*.json", "./content/encrypted/*.enc"],
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
