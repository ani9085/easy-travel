import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "../components/ServiceWorker.tsx";
import "./globals.css";

export const metadata: Metadata = {
  title: "easy-travel | 부모님 여행 도우미",
  description: "가족이 함께 준비하고 확인하는 해외여행 도우미",
  applicationName: "easy-travel",
  appleWebApp: { capable: true, title: "easy-travel", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" }
};

export const viewport: Viewport = {
  themeColor: "#0f2d45",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        {/* 배포 보호(Vercel Authentication)가 켜져 있어도 설치 정보를 읽을 수 있게 쿠키를 함께 보냅니다. */}
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
      </head>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
