import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tongji Health Map | 同济大学健康生活地图",
  description: "同济大学四平路校区健康资源地图：标注校园地点，绘制和规划步行路线。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
