import type { Metadata } from "next";
import "./globals.css";
import { Shell } from "@/components/shell";
export const metadata: Metadata = {
  title: "HCAssets · Hello Chef",
  description: "Private local asset inventory preview",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
