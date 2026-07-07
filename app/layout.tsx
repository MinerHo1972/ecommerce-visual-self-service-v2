import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "电商视觉自助台",
  description: "模板驱动的电商改图自助台 MVP"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
