import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import ErrorBoundary from "@/components/ErrorBoundary";
import { SiteProvider } from "@/components/site/SiteProvider";
import "./globals.css";

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
      <body className="antialiased font-sans">
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
