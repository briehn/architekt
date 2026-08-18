import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@xyflow/react/dist/style.css";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Architekt",
  description: "A System Design Visualizer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex h-dvh flex-col">{children}</body>
    </html>
  );
}
