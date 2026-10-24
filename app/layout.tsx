import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "easy-travel | 부모님 여행 도우미",
  description: "가족이 함께 준비하고 확인하는 해외여행 도우미"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
