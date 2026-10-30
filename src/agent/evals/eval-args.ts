import { err, ok, type Result } from "@/domain/result";

import type { Scenario } from "./scenario";

// Puro: lê as opções de `npm run evals -- [--only <id>]... [--repeat N] [--out arquivo]`.

export interface EvalOptions {
  /** Ids dos cenários a rodar; vazio = todos. `--only` pode repetir. */
  only: string[];
  /** Quantas vezes rodar cada cenário (mede estabilidade). */
  repeat: number;
  /** Onde gravar o Markdown; null = não grava. */
  outFile: string | null;
}

export const DEFAULT_OUT_FILE = "docs/evals/resultado.md";

export function parseEvalArgs(args: string[]): Result<EvalOptions, string> {
  const options: EvalOptions = { only: [], repeat: 1, outFile: DEFAULT_OUT_FILE };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    const value = args[index + 1];
    switch (flag) {
      case "--only":
        if (!value) return err("--only precisa do id de um cenário.");
        options.only.push(value);
        index++;
        break;
      case "--repeat": {
        const repeat = Number(value);
        if (!Number.isInteger(repeat) || repeat < 1) {
          return err("--repeat precisa de um número inteiro maior que zero.");
        }
        options.repeat = repeat;
        index++;
        break;
      }
      case "--out":
        if (!value) return err("--out precisa do caminho do arquivo.");
        options.outFile = value;
        index++;
        break;
      case "--no-out":
        options.outFile = null;
        break;
      default:
        return err(`Opção desconhecida: ${flag}.`);
    }
  }
  return ok(options);
}

/** Os cenários escolhidos, na ordem do arquivo; ids desconhecidos viram erro. */
export function selectScenarios(all: Scenario[], only: string[]): Result<Scenario[], string> {
  const unknown = only.filter((id) => !all.some((scenario) => scenario.id === id));
  if (unknown.length > 0) return err(`Cenário desconhecido: ${unknown.join(", ")}.`);
  return ok(only.length === 0 ? all : all.filter((scenario) => only.includes(scenario.id)));
}
