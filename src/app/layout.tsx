import "@mantine/core/styles.css";

import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import { ColorSchemeScript, mantineHtmlProps } from "@mantine/core";
import { Suspense } from "react";

import { AuthProviders } from "@/features/auth/auth-providers";
import { NexoLoader } from "@/shared/brand/nexo-loader";
import { IconProvider } from "@/shared/icons";
import { ThemeProvider } from "@/shared/theme/theme-provider";

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
        <ThemeProvider>
          <IconProvider>
            {/*
              A sessão é lida na requisição: com Cache Components, isso fica num <Suspense>.
              Efeito conhecido: todo carregamento completo mostra a marca animada por ~300 ms
              (medido no build de produção; o servidor responde em ~20 ms, o resto é o React
              revelando o conteúdo que chega em streaming). Tirar o Suspense quebra o build
              (leitura de cookie fora de Suspense) e ler a sessão só no cliente perde o cookie
              httpOnly do Convex Auth; por isso ficou assim. A navegação dentro do app não passa
              por aqui: ela mostra a mesma marca pelos loading.tsx de cada tela.
            */}
            <Suspense fallback={<NexoLoader placement="fullScreen" size={48} />}>
              <AuthProviders>{children}</AuthProviders>
            </Suspense>
          </IconProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
