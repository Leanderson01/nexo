@AGENTS.md

# Nexo Assist: convenções

- Plano e status das tasks: `TASKS.md`. Referência visual: `docs/prototipo/`.
- TypeScript estrito, sem `any`. Clareza vence esperteza: nomes explícitos, funções pequenas,
  nada de abstração sem uso.
- Enums vivem só em `src/domain/enums.ts`; tipos, Zod e validators do Convex derivam deles.
- `src/domain/` é TypeScript puro: não importa Next, Convex, Mastra nem Zod.
- Dentro de `convex/`, importe `src/` por caminho relativo (o bundler do Convex não lê o alias `@/`).
- Erros esperados retornam `Result<T, E>` (`src/domain/result.ts`); exceção só para o inesperado.
- Commits em Conventional Commits, um por passo lógico, mensagem em português.
- Antes de commitar: `npm run typecheck && npm run lint && npm test`.
