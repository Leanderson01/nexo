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

**Pendente:** a chave do Groq não estava no `.env.local` quando a T6 foi feita. Para medir:

```bash
# GROQ_API_KEY no .env.local
npm run spike:llm
```

O script roda 12 frases dos cenários (§8, §13.2) no ENTENDER e 3 pedidos com tools falsas no AGIR,
nos dois candidatos, e imprime: JSON válido, acerto da intenção, latência, tokens e custo (ENTENDER);
tools chamadas, tempo até o primeiro token, latência, tokens e custo (AGIR); um resumo por modelo;
e os headers `x-ratelimit-*` da chave. Ele também responde a **decisão 18**: se o modo estrito
recusar o `minimum`/`maximum` da confiança, o script avisa e segue com `strictJsonSchema: false`.

Preencher depois da rodada:

| Modelo                | JSON ok | Intenção ok | ENTENDER p50 | Tool certa | 1º token (AGIR) | AGIR p50 | US$/ENTENDER | US$/AGIR |
| --------------------- | ------- | ----------- | ------------ | ---------- | --------------- | -------- | ------------ | -------- |
| `openai/gpt-oss-20b`  | —       | —           | —            | —          | —               | —        | —            | —        |
| `openai/gpt-oss-120b` | —       | —           | —            | —          | —               | —        | —            | —        |

## Custo estimado (até a medição)

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

A tabela base do Groq mostra, **por modelo**: 30 req/min, 1.000 req/dia e **8.000 tokens/min**.
Com ~6.700 tokens por AGIR, isso dá cerca de **um turno completo por minuto** no 120b, o que aperta
o runner de evals (T14b) e a demonstração com várias pessoas. A chave paga deve ter limite maior:
o `spike:llm` imprime os `x-ratelimit-limit-*` reais, e o console do Groq mostra o plano
(decisão 17).

Consequências:

- O runner de evals espera e repete no 429 usando o `retry-after` (o `spike:llm` já faz isso, ver
  `withRateLimitRetry`).
- No chat, um 429 que sobra depois da retentativa vira a mensagem de erro com "Tentar de novo"
  (§10), com `outcome: 'error'` no `DecisionRecord`.
