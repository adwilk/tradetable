import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TradeTable — Make your next trade night count",
  description: "Build your wish list, find your people, and make every trade night a good one.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
