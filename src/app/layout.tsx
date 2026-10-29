import "@mantine/core/styles.css";

import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import {
  Center,
  ColorSchemeScript,
  Loader,
  MantineProvider,
  mantineHtmlProps,
} from "@mantine/core";
import { Suspense } from "react";

import { ConvexClientProvider } from "@/features/auth/convex-client-provider";
import { theme } from "@/shared/theme/theme";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "Nexo Assist",
  description: "Service desk de TI da Nexo: seu problema resolvido em uma conversa.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${serif.variable}`} {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="light" />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="light">
          {/* O provider do Convex Auth lê os cookies da sessão; com Cache Components,
              leitura da requisição precisa ficar dentro de um <Suspense>. */}
          <Suspense fallback={<FullScreenLoader />}>
            <ConvexAuthNextjsServerProvider>
              <ConvexClientProvider>{children}</ConvexClientProvider>
            </ConvexAuthNextjsServerProvider>
          </Suspense>
        </MantineProvider>
      </body>
    </html>
  );
}

function FullScreenLoader() {
  return (
    <Center h="100vh">
      <Loader aria-label="Carregando" />
    </Center>
  );
}
