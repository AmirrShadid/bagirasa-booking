import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bagirasa Salt Bread",
  description: "A Premium Viral Salt Bread Booking System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased font-sans">
        {children}
      </body>
    </html>
  );
}