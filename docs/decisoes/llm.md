# Decisão: provedor e modelos de LLM

Provedor: **Groq** (decisão 8 do `TASKS.md`). A spec pede um modelo rápido e barato para
ENTENDER e um principal para AGIR (§5.1, §6.7); a transcrição de voz usa o mesmo provedor e a
mesma chave.

| Papel                                   | Modelo                   | Por quê                                                                                    |
| --------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------ |
| Rápido (ENTENDER, resumo acumulado)     | `openai/gpt-oss-20b`     | ~1.000 tokens/s, saída estruturada com `json_schema` estrito, metade do preço do principal |
| Principal (AGIR, com tools e streaming) | `openai/gpt-oss-120b`    | melhor raciocínio e tool calling da família, ainda barato; ~500 tokens/s                   |
| Transcrição (`/api/transcribe`, T15)    | `whisper-large-v3-turbo` | US$ 0,04/hora, PT-BR com `language: "pt"`; o `whisper-large-v3` custa ~3× mais             |

Variáveis: `LLM_PROVIDER=groq`, `LLM_MODEL_FAST`, `LLM_MODEL_MAIN`, `GROQ_API_KEY` e, opcional,
`TRANSCRIPTION_MODEL` (padrão `whisper-large-v3-turbo`). Leitura e preços em
`src/agent/llm/models.ts`.

**Critério:** custo por turno, latência até o primeiro token, PT-BR, tool calling confiável e saída
estruturada estrita. Reservas descartadas: Kimi K2 e Llama 4 saíram do Groq; Qwen 3.8 está em
preview e custa de 5 a 7 vezes mais.

## Preços (Groq, 29/10/2026)

| Modelo                | Entrada / M tokens | Entrada em cache | Saída / M tokens |
| --------------------- | ------------------ | ---------------- | ---------------- |
| `openai/gpt-oss-20b`  | US$ 0,075          | 50% de desconto  | US$ 0,30         |
| `openai/gpt-oss-120b` | US$ 0,15           | 50% de desconto  | US$ 0,60         |

Transcrição: `whisper-large-v3-turbo` a US$ 0,04 por hora de áudio, com mínimo cobrado de 10 s por
requisição.

O cache de prompt do gpt-oss é automático (prefixo igual entre chamadas). O uso informa
`cachedInputTokens`, e `estimateCostUsd` aplica o desconto. Tokens de raciocínio contam como saída.

## Medições

Rodada de 30/10/2026 com a chave paga (`npm run spike:llm`): 12 frases dos cenários (§8, §13.2) no
ENTENDER e 3 pedidos com tools falsas no AGIR, nos dois candidatos.

| Modelo                | JSON ok | Intenção ok | ENTENDER p50 | Tool certa | 1º token (AGIR) | AGIR p50 | US$/ENTENDER | US$/AGIR   |
| --------------------- | ------- | ----------- | ------------ | ---------- | --------------- | -------- | ------------ | ---------- |
| `openai/gpt-oss-20b`  | 100%    | 100%        | 622 ms       | 100%       | 955 ms          | 1.059 ms | US$ 0,00009  | US$ 0,0001 |
| `openai/gpt-oss-120b` | 92%     | 92%         | 1.029 ms     | 100%       | 686 ms          | 948 ms   | US$ 0,00022  | US$ 0,0002 |

O que a rodada confirmou:

- **ENTENDER no 20b:** acertou as 12 intenções, inclusive a tentativa de injeção ("ignore as regras…"
  → `out_of_scope`) e a mensagem vaga ("aquilo lá de novo" → `unclear`, confiança 0,3). É mais rápido
  e mais barato que o 120b nessa etapa.
- **Decisão 18 resolvida:** o modo estrito **aceita** o `minimum`/`maximum` da confiança (o 20b passou
  com `strict: true`). A recusa do 120b não foi do schema: o modelo gerou `category: "network"`, fora
  do enum, e o Groq rejeitou a resposta. Isso confirma a regra da §10: uma nova tentativa com lembrete
  do schema quando a saída estruturada vem inválida.
- **AGIR:** os dois escolheram a tool certa nos 3 pedidos; o 120b teve o primeiro token mais rápido.
  O português das respostas está correto e direto.

## Custo estimado por turno real

Hipóteses por turno, com a janela de 12 mensagens, o resumo acumulado e as 11 tools da §6.4:

| Etapa                                                 | Modelo | Entrada                                   | Saída (com raciocínio) | Custo       |
| ----------------------------------------------------- | ------ | ----------------------------------------- | ---------------------- | ----------- |
| ENTENDER                                              | 20b    | ~1.600 (prompt + schema + contexto)       | ~250                   | ~US$ 0,0002 |
| AGIR (2 passos)                                       | 120b   | ~6.400 (2 × 3.200; metade do 2º em cache) | ~300                   | ~US$ 0,0010 |
| **Turno completo**                                    |        |                                           |                        | ~US$ 0,0012 |
| Turno com curto-circuito (transferir, fora de escopo) | 20b    | só o ENTENDER                             |                        | ~US$ 0,0002 |

- **Por conversa:** ~8 mensagens do funcionário ≈ **US$ 0,01**; no limite de 30 mensagens,
  ≈ US$ 0,04.
- **Teto diário** `MAX_DAILY_LLM_COST_USD=5` ≈ 4.000 turnos completos.
- **Transcrição:** 60 s de áudio ≈ US$ 0,0007; áudio curto paga o mínimo de 10 s (≈ US$ 0,0001).

## Limite de taxa

A chave paga tem, pelos headers da rodada de 30/10/2026, **500.000 req/dia e 250.000 tokens/min**
(decisão 17 resolvida). Com ~7.000 tokens por turno completo, são mais de 30 turnos por minuto: não
é gargalo para o runner de evals nem para a demonstração. (A tabela base do plano gratuito, de
8.000 tokens/min, não se aplica.)

Mesmo assim:

- O runner de evals espera e repete no 429 usando o `retry-after` (o `spike:llm` já faz isso, ver
  `withRateLimitRetry`).
- No chat, um 429 que sobra depois da retentativa vira a mensagem de erro com "Tentar de novo"
  (§10), com `outcome: 'error'` no `DecisionRecord`.
