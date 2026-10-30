import "@mantine/core/styles.css";

import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import {
  Center,
  ColorSchemeScript,
  Loader,
  MantineProvider,
  mantineHtmlProps,
} from "@mantine/core";
import { Suspense } from "react";

import { AuthProviders } from "@/features/auth/auth-providers";
import { IconProvider } from "@/shared/icons";
import { cssVariablesResolver } from "@/shared/theme/css-variables";
import { theme } from "@/shared/theme/theme";

// Fontes escolhidas comparando os prints com as candidatas (docs/design/fundacao-visual.md):
// Inter na interface e Newsreader só nos títulos do login.
const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const serif = Newsreader({ subsets: ["latin"], variable: "--font-serif" });

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
        <MantineProvider
          theme={theme}
          cssVariablesResolver={cssVariablesResolver}
          defaultColorScheme="light"
        >
          {/*
            A sessão é lida na requisição: com Cache Components, isso fica num <Suspense>.
            Efeito conhecido: todo carregamento completo mostra este loader por ~300 ms (medido
            no build de produção; o servidor responde em ~20 ms, o resto é o React revelando o
            conteúdo que chega em streaming). Tirar o Suspense quebra o build (leitura de
            cookie fora de Suspense) e ler a sessão só no cliente perde o cookie httpOnly do
            Convex Auth; por isso ficou assim. A navegação dentro do app não passa por aqui.
          */}
          <IconProvider>
            <Suspense fallback={<FullScreenLoader />}>
              <AuthProviders>{children}</AuthProviders>
            </Suspense>
          </IconProvider>
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
