import "@/styles/globals.css";
import clsx from "clsx";
import { Metadata, Viewport } from "next";

import { fontMono, fontSans } from "@/config/fonts";
import { siteConfig } from "@/config/site";
import { ConvexClientProvider } from "@/components/convex-client-provider";

import { Providers } from "./providers";

export const metadata: Metadata = {
    description: siteConfig.description,
    icons: {
        icon: "/favicon.ico",
    },
    title: {
        default: siteConfig.name,
        template: `%s - ${siteConfig.name}`,
    },
};

export const viewport: Viewport = {
    themeColor: [
        { color: "white", media: "(prefers-color-scheme: light)" },
        { color: "black", media: "(prefers-color-scheme: dark)" },
    ],
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html suppressHydrationWarning lang="en">
            
            <body
                className={clsx(
                    "min-h-screen bg-background font-sans antialiased",
                    fontSans.variable,
                    fontMono.variable,
                )}
            >
                <Providers
                    themeProps={{ attribute: "class", defaultTheme: "dark" }}
                >
                    <ConvexClientProvider>
                        <div className="flex flex-col">
                            <main className="grow">{children}</main>
                        </div>
                    </ConvexClientProvider>
                </Providers>
            </body>
        </html>
    );
}
