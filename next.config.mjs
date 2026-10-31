const isDev = process.env.NODE_ENV !== "production";

// 외부로 나가는 연결은 같은 출처(/api/ai)와 환율 조회(Frankfurter)만 허용합니다.
// Next.js의 인라인 스크립트 때문에 script-src에 'unsafe-inline'이 필요합니다(개발 모드는 'unsafe-eval'도).
// vercel.live는 Vercel 미리보기 배포의 툴바입니다.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://vercel.live`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' https://api.frankfurter.dev https://vercel.live${isDev ? " ws:" : ""}`,
  "frame-src https://vercel.live",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=()" }
        ]
      }
    ];
  }
};

export default nextConfig;
