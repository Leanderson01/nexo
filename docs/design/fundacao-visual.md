# Fundação visual (V0)

Padrões extraídos dos prints de `docs/prototipo/` e aplicados uma vez só no tema
(`src/shared/theme/`) e nos ícones (`src/shared/icons/`). Os agents de tela seguem este
documento; layout fino (larguras de coluna, posição de cada bloco) é deles.

## Como foi medido

- Os prints são capturas de **1440 px de largura reduzidas para ~889 px**: 1 px do print ≈
  **1,62 px reais**. A escala foi confirmada pela fonte (o corpo dos balões ajusta a Inter em
  8,6 px no print = 14 px reais) e pela largura da barra lateral (141 px no print = 228 px).
  O print 06 tem a mesma escala, só a janela é mais larga (960 px → 1555 px).
- Para comparar com o app: viewport = tamanho do print × 1,62 (01: 1440×889; 02: 1442×893;
  03: 1430×896; 04: 1426×891; 05: 1432×883; 06: 1555×896), depois reduzir a captura ao
  tamanho do print.
- Cores amostradas no pixel (moda das regiões de fundo; pixel mais distante do fundo para
  texto). Bordas de 1 px saem clareadas pela redução; os valores abaixo já compensam isso.
- Fontes: cada trecho do print foi comparado pixel a pixel com o mesmo texto renderizado nas
  candidatas, na mesma largura (menor erro = mais parecida).

## Tipografia

| Uso               | Fonte          | Por quê                                                                                                                                                                        |
| ----------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Interface inteira | **Inter**      | Erro 0,109 contra 0,139 (DM Sans), 0,149 (Manrope), 0,151 (Geist), 0,165 (IBM Plex Sans), 0,171 (Source Sans 3); única com a mesma altura de x.                                |
| Títulos do login  | **Newsreader** | Erro 0,159 contra 0,197 (Fraunces), 0,206 (Libre Caslon), 0,221 (EB Garamond), 0,225 (Instrument Serif) e 0,226 (Source Serif 4, a anterior). Peso 400, tamanho óptico padrão. |

Variáveis: `--font-sans` (Inter) e `--font-serif` (Newsreader), definidas em `src/app/layout.tsx`.

Escala (px reais; `fz` do Mantine entre parênteses):

| Elemento                                                                      | Tamanho                            | Peso    |
| ----------------------------------------------------------------------------- | ---------------------------------- | ------- |
| Título serifado do login ("Seu problema de TI…")                              | 48 (`--nexo-font-size-display`)    | 400     |
| "Entrar" (serifado)                                                           | 36 (`--nexo-font-size-display-sm`) | 400     |
| Números do rodapé do login ("8 s", "72%")                                     | 32 (`--nexo-font-size-stat`)       | 400     |
| Título de página ("Meu perfil") — `h1`                                        | 24                                 | 700     |
| Título de coluna ("Conversas") — `h2`                                         | 20                                 | 600     |
| Título de card ("VPN não conecta…") — `h3` / `xl`                             | 18                                 | 600     |
| Nomes (lista, cabeçalho), título de painel, marca "Nexo Assist" — `h4` / `lg` | 15                                 | 600     |
| Subtítulo do login, corpo do painel escuro — `lg`                             | 15                                 | 400     |
| Corpo: balões, valores, subtítulo de página — `md` (padrão do body)           | 14                                 | 400     |
| Pergunta do agent ("Quem está sendo afetado?") — `h5`                         | 14                                 | 600     |
| Breadcrumb, itens da navegação, botões, chips, prévias, descrições — `sm`     | 13                                 | 400/500 |
| Rótulos de campo, "consultou seus chamados", contador, horários, selos — `xs` | 12                                 | 400     |
| Autor da mensagem ("Nexo Assist" sobre o balão)                               | 12                                 | 600     |

Entrelinha: 1,55 no corpo (`md`), 1,4–1,45 em `xs`/`sm`. Botões e rótulos de input: 500.

## Cores

Paletas de 10 tons substituem as do Mantine (`blue`, `gray`, `dark`, `green`, `red`; `orange` e
`yellow` usam a mesma paleta âmbar). Os índices que as telas já usavam caem no valor do print.
Para CSS novo, prefira as variáveis semânticas `--nexo-color-*`.

| Papel                                                         | Hex                         | Variável                                            | Mantine               |
| ------------------------------------------------------------- | --------------------------- | --------------------------------------------------- | --------------------- |
| Primária (botões, links, item ativo, badge)                   | `#0062c4`                   | `--nexo-color-primary`                              | `blue.7`              |
| Primária hover                                                | `#00529f`                   | `--nexo-color-primary-hover`                        | `blue.8`              |
| Fundo do item ativo, chip selecionado                         | `#edf6fe`                   | `--nexo-color-primary-subtle`                       | `blue.0`              |
| Avatar azul, tag "IA"                                         | `#dce9f7`                   | `--nexo-color-primary-muted`                        | `blue.1`              |
| Borda do chip selecionado                                     | `#8fbcec`                   | `--nexo-color-primary-border`                       | `blue.3`              |
| Texto principal (também painel escuro e balão do usuário)     | `#1b2431`                   | `--nexo-color-text`                                 | `gray.9`, `dark.7`    |
| Texto da navegação e dos chips                                | `#3d4656`                   | `--nexo-color-text-nav`                             | `gray.7`              |
| Texto secundário (breadcrumb, rótulos, placeholder)           | `#5b6472`                   | `--nexo-color-text-secondary`                       | `gray.6` (= `dimmed`) |
| Texto terciário / desabilitado / ícone de check               | `#848b95`                   | `--nexo-color-text-tertiary`                        | `gray.5`              |
| Borda (cards, inputs, divisores, barra lateral)               | `#e2e5ea`                   | `--nexo-color-border`                               | `gray.2`              |
| Superfície sutil (rodapé de card, trilho, item ativo da fila) | `#f6f7f9`                   | `--nexo-color-surface-subtle`                       | `gray.0`              |
| Fundo da conversa no console                                  | `#eef1f5`                   | `--nexo-color-surface-sunken`                       | `gray.1`              |
| Página, cards, lateral                                        | `#ffffff`                   | `--nexo-color-surface`                              |                       |
| Painel escuro do login                                        | `#1b2431`                   | `--nexo-color-surface-dark`                         |                       |
| Card do mock no login / balão do agent no mock                | `#242d39` / `#353d49`       | `--nexo-color-surface-dark-raised` / `-overlay`     |                       |
| Texto secundário / terciário no painel escuro                 | `#b6bcc5` / `#8f97a3`       | `--nexo-color-text-on-dark-secondary` / `-tertiary` |                       |
| Balão do usuário (chat)                                       | `#1b2431`                   | `--nexo-color-bubble-user`                          |                       |
| Balão do agent (chat)                                         | `#ffffff` + borda           | `--nexo-color-bubble-agent`                         |                       |
| Balão do agent (console)                                      | `#e6effa`                   | `--nexo-color-bubble-agent-console`                 |                       |
| Balão do analista                                             | `#e3f4ea`                   | `--nexo-color-bubble-analyst`                       | `green.1`             |
| Tag "Suporte N2"                                              | `#dbedea` / texto `#00804a` | `--nexo-color-tag-team` / `-text`                   |                       |

Status (cada um tem `-dot`, `-text`, `-bg`: `--nexo-color-status-<nome>-dot` etc.):

| Status                                                                                                                     | Ponto     | Texto     | Fundo     |
| -------------------------------------------------------------------------------------------------------------------------- | --------- | --------- | --------- |
| `warning` — "Aguardando analista/confirmação/atendente", prioridade alta, "há 5 dias", "Agent pediu ajuda" (laranja/âmbar) | `#f5a500` | `#946300` | `#fef7e7` |
| `progress` — "Em andamento", "Em atendimento", "Você está atendendo"                                                       | `#0285f7` | `#0062c4` | `#edf6fe` |
| `success` — "Aprovado", "Assistente online", "Disponível", "digitando…"                                                    | `#00bd6c` | `#00804a` | `#ebfaf3` |
| `danger` — "Transferida", "Encerrar atendimento"                                                                           | `#ee343b` | `#c4161d` | `#fef1f1` |
| `neutral` — "Resolvido", "Resolvida pelo agent", prioridade média                                                          | `#b4bac3` | `#5b6472` | `#f6f7f9` |

No print, o texto ao lado do ponto em listas ("Aguardando analista" na lista de chamados) é
secundário; o texto colorido aparece nos selos e nas linhas de status da fila.

Avatares de iniciais (`--nexo-avatar-0..6-bg` / `-text`, na ordem): azul `#dce9f7`/`#0062c4`,
laranja `#f6e3d3`/`#9a4a12`, violeta `#e6e1f7`/`#5b3fc4`, verde `#ddf0e6`/`#1e7a4c`, rosa
`#f7e1e6`/`#a3324f`, cinza `#e5e8ec`/`#3d4656`, amarelo `#fbefd0`/`#8a6100`. O avatar do
funcionário no chat usa o azul sutil `#edf6fe`/`#0062c4`.

## Formas

| Elemento                                                          | Medida                                                                                                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raio de botões, inputs, chips, item de navegação                  | 6 px (`radius.sm`, `defaultRadius`; `--nexo-radius-control`)                                                                                      |
| Raio de cards (rascunho, chamado, perfil, painel)                 | 12 px (`radius.lg`; `--nexo-radius-card`)                                                                                                         |
| Raio dos balões                                                   | 12 px, com o canto do "rabo" em 4 px (agent: superior esquerdo; usuário: inferior direito) — `--nexo-radius-bubble` / `--nexo-radius-bubble-tail` |
| Selos ("Assistente online", "Disponível") e contador de não lidas | pílula (`--nexo-radius-pill`)                                                                                                                     |
| Checkbox                                                          | 4 px                                                                                                                                              |
| Avatares                                                          | círculo: 32 px (lateral do chat), 40 px (cabeçalho do console), 44 px (fila)                                                                      |
| Bordas                                                            | 1 px `#e2e5ea`, sem borda dupla                                                                                                                   |
| Sombra de card                                                    | `0 1px 2px rgb(27 36 49 / 4%), 0 4px 12px rgb(27 36 49 / 5%)` (`shadow="sm"`, `--nexo-shadow-card`)                                               |
| Sombra do botão "Entrar"                                          | `0 4px 14px rgb(0 98 196 / 22%)` (`--nexo-shadow-primary`)                                                                                        |
| Balões e chips                                                    | sem sombra                                                                                                                                        |

Alturas (`size` do Mantine; ajustadas no tema para botões e inputs):

| `size` | Altura | Fonte | Onde                                                  |
| ------ | ------ | ----- | ----------------------------------------------------- |
| `xs`   | 32     | 12    | chips de resposta ("Só eu"), filtros da fila          |
| `sm`   | 36     | 13    | **padrão**: botões e inputs do app, item de navegação |
| `md`   | 40     | 14    | —                                                     |
| `lg`   | 44     | 14    | login (e-mail, senha, "Entrar")                       |

Caixa de mensagem (composer): 48 px de altura, com o botão "Enviar" `sm` dentro. Selo
(`Badge` padrão): 24 px, 12 px, peso 500, sem caixa alta.

Espaçamento (grade de 4 px): `xs` 8, `sm` 12, `md` 16, `lg` 24, `xl` 32. Padding de card e de
balão: 16 px na horizontal, 12 px na vertical. Medidas de layout observadas (para os agents de
tela): barra lateral do chat 228 px; cabeçalho 60 px; coluna do chat ~800 px; card do perfil
600 px; trilho do console 48 px; fila 376 px; painel direito 336 px; linha da fila ~86 px.

## Ícones

Conjunto: **Lucide** (`lucide-react` 1.52.0), tamanho padrão **16 px**, traço **1,75** (na
tela, ~1,2 px), pontas e junções arredondadas. Comparado com Tabler, o Lucide é o que tem as
formas dos prints: balão quadrado sem linhas internas, "sair" com meia porta, chave de cabeça
redonda, robô com antena, avião de papel horizontal. Use sempre `@/shared/icons` (nomes de uso,
`ICON_SIZE.sm/md/lg` = 14/16/20); o `IconProvider` no layout aplica tamanho e traço.

| Print (onde)                                                                  | Ícone do app (`@/shared/icons`)                                                                                             | Lucide                                                                                  |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Login: envelope no e-mail; perfil: aviso de redefinição                       | `MailIcon`                                                                                                                  | `Mail`                                                                                  |
| Login: cadeado na senha; perfil: "Gerenciado pela TI"                         | `LockIcon`                                                                                                                  | `Lock`                                                                                  |
| Login: olho na senha                                                          | `EyeIcon` / `EyeOffIcon`                                                                                                    | `Eye` / `EyeOff`                                                                        |
| Login: seta do "Entrar"                                                       | `ArrowRightIcon`                                                                                                            | `ArrowRight`                                                                            |
| Chat: "Atendimento" na lateral                                                | `ChatIcon`                                                                                                                  | `MessageSquare`                                                                         |
| Chat: "Meu perfil" na lateral                                                 | `UserIcon`                                                                                                                  | `User`                                                                                  |
| Chat: "Sair"                                                                  | `LogoutIcon`                                                                                                                | `LogOut`                                                                                |
| Chat: separador do breadcrumb; console: chevron dos chamados                  | `ChevronRightIcon`                                                                                                          | `ChevronRight`                                                                          |
| Chat: ✓ das ferramentas ("consultou seus chamados")                           | `CheckIcon`                                                                                                                 | `Check`                                                                                 |
| Chat: seta do "Enviar"                                                        | `SendIcon`                                                                                                                  | `ArrowUp`                                                                               |
| Chat: "Nova conversa"                                                         | `PlusIcon`                                                                                                                  | `Plus`                                                                                  |
| Chat: artigo da central                                                       | `ArticleIcon`                                                                                                               | `BookOpen`                                                                              |
| Perfil: chave da senha                                                        | `KeyIcon`                                                                                                                   | `KeyRound`                                                                              |
| Perfil: "Redefinir senha"                                                     | `ResetPasswordIcon`                                                                                                         | `RotateCcwKey`                                                                          |
| Console: conversas no trilho                                                  | `ConversationsIcon`                                                                                                         | `MessageCircle`                                                                         |
| Console: busca da fila e do cabeçalho                                         | `SearchIcon`                                                                                                                | `Search`                                                                                |
| Console: filtro da fila                                                       | `FilterIcon`                                                                                                                | `ListFilter`                                                                            |
| Console: ✓✓ de leitura                                                        | `ReadReceiptIcon`                                                                                                           | `CheckCheck`                                                                            |
| Console: robô em "Aguardando atendente" e "Devolver ao agent"                 | `AgentIcon`                                                                                                                 | `Bot`                                                                                   |
| Console: mão em "Ana espera um atendente"                                     | `HandIcon`                                                                                                                  | `Hand`                                                                                  |
| Console: "Assumir atendimento", "Assumido por"                                | `HeadsetIcon`                                                                                                               | `Headset`                                                                               |
| Console: "Transferida para Suporte N2"                                        | `TransferIcon`                                                                                                              | `ArrowRightLeft`                                                                        |
| Console: "Encerrar atendimento"                                               | `EndIcon`                                                                                                                   | `CircleCheckBig`                                                                        |
| Console: menu ⋮ do cabeçalho                                                  | `MoreIcon`                                                                                                                  | `EllipsisVertical`                                                                      |
| Console: fechar o painel                                                      | `CloseIcon`                                                                                                                 | `X`                                                                                     |
| Console: "Ver todos os chamados" ↗                                            | `ExternalLinkIcon`                                                                                                          | `ArrowUpRight`                                                                          |
| Console: enviar mensagem (avião)                                              | `SendMessageIcon`                                                                                                           | `SendHorizontal`                                                                        |
| Sem print (já existem no app): devolver, pausar, sino, métricas, voz, chamado | `ReturnIcon`, `PauseIcon`, `BellIcon`/`BellOffIcon`, `ChartIcon`, `MicrophoneIcon`, `SpeakerIcon`, `StopIcon`, `TicketIcon` | `Undo2`, `Pause`, `Bell`/`BellOff`, `ChartColumn`, `Mic`, `Volume2`, `Square`, `Ticket` |

O logotipo "N" continua sendo o `NexoMark` feito à mão (não é ícone do conjunto).

## O que fica para as telas

- Trocar os `icons.tsx` feitos à mão (chat, perfil, login, console, voz) pelos de
  `@/shared/icons` e apagar os antigos.
- Trocar os hex fixos dos CSS modules (`#1e2430`, `#fbfbfc`, `#f5f6f8`, `#eef2f8`…) pelas
  variáveis `--nexo-*`.
- Login: inputs e botão em `size="lg"`; balões e cards com os raios e sombras acima.
