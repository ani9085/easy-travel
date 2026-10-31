import type { MetadataRoute } from "next";

// 휴대폰 홈 화면에 앱처럼 설치하기 위한 정보입니다. 설치하면 부모님 화면이 바로 열립니다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "easy-travel 부모님 여행 도우미",
    short_name: "easy-travel",
    description: "오늘 갈 곳, 숙소 가기, 통역, 가족에게 알리기를 크게 보여주는 여행 도우미",
    lang: "ko",
    start_url: "/traveler",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#0f2d45",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
