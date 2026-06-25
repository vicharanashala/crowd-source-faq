import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Vicharanashala · IIT Ropar",
  description: "The student knowledge hub for IIT Ropar — community Q&A powered by AI.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: "#0f1e30",
                color: "#e8f0f8",
                border: "1px solid rgba(74,144,196,0.2)",
                fontFamily: "'Syne', sans-serif",
                fontSize: "13px",
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
