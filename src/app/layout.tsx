import "@mantine/core/styles.css";

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

import { AuthProviders } from "@/features/auth/auth-providers";
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
          {/* A sessão é lida na requisição: com Cache Components, isso fica num <Suspense>. */}
          <Suspense fallback={<FullScreenLoader />}>
            <AuthProviders>{children}</AuthProviders>
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
