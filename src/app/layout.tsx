import "~/app/globals.css";
import { type Metadata } from "next";
import { TRPCReactProvider } from "./_components/TRPCReactProvider";

export const metadata: Metadata = {
  title: "commit·viz — Git Analytics",
  description: "Beautiful commit analytics for your local git repositories",
  icons: [
    { rel: "icon", url: "/favicon.svg", type: "image/svg+xml" },
    { rel: "icon", url: "/favicon.ico" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#08080f] text-white antialiased">
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
