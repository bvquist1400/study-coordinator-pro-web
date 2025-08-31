import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import ErrorBoundary from "@/components/ErrorBoundary";
import { SiteProvider } from "@/components/site/SiteProvider";
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
  title: "Study Coordinator Pro",
  description: "Clinical research coordination made simple",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ErrorBoundary>
          <ThemeProvider
            defaultTheme="system"
            storageKey="scp-ui-theme"
          >
            <SiteProvider>
              {children}
            </SiteProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
