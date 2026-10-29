import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Apni Sawari - Pakistan's Nationwide Intercity Ride Network",
  description: "Apni Sawari (اپنی سواری) - Pakistan's trusted intercity travel network. Reserve whole cars, book individual seats, find Khali Wapsi deals, and post ride requests across Pakistan with direct cash payment.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#065f46",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
