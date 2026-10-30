import { normalizeText } from "@/shared/normalize-text";

import type { TicketCategory, TicketKind } from "./enums";
import type { SaidSignals } from "./signal-evidence";

// Tipo, categoria, título e descrição do rascunho conferidos em código quando a fala deixa claro
// (QA R1): o tipo oscilava entre INC e REQ, o "sistema de vendas" caía em "Outros", o título
// dizia "impede trabalho" de quem disse que dá para seguir e a descrição saía em primeira pessoa.

/** Algo quebrado ou parado: incidente. */
const DEFECT =
  /\b(nao (funciona|funcionam|liga|abre|conecta|imprime|carrega|sincroniza|reconhece|inicia|responde|consigo|consegue|entra)|parou|pararam|travad\w*|trava|travou|travando|caiu|cairam|quebr\w*|defeito|falhand\w*|falha|falhou|erro|lento|lenta|bloquead\w*|bloqueou|fora do ar)\b/;
/** Um pedido de acesso, equipamento ou software, sem nada quebrado: requisição. */
const REQUEST =
  /\b(preciso de|preciso|quero|queria|gostaria de|solicito|solicitar|pedir|pedido de|requisicao)\b.*\b(acesso|instalar|instalacao|novo|nova|segundo|segunda|equipamento|monitor|teclado|mouse|headset|licenca|software|programa|permissao)\b/;

/** O tipo que a fala deixa claro, ou `null` quando não dá para dizer. */
export function kindFromSpeech(employeeTexts: string[]): TicketKind | null {
  const text = normalizeText(employeeTexts.join(" \n "));
  if (DEFECT.test(text)) return "INC";
  if (REQUEST.test(text)) return "REQ";
  return null;
}

/** Sistemas corporativos: um "sistema de vendas" é software, não "Outros". */
const SOFTWARE =
  /\b(sistema|sistemas|erp|crm|sap|aplicativo|app|programa|software|excel|word|planilha|teams|navegador|portal)\b/;

/** A categoria do modelo, trocada só quando ele pôs "Outros" e a fala fala de um sistema. */
export function categoryFromSpeech(
  modelCategory: TicketCategory,
  employeeTexts: string[],
): TicketCategory {
  if (modelCategory !== "other") return modelCategory;
  return SOFTWARE.test(normalizeText(employeeTexts.join(" "))) ? "software" : modelCategory;
}

/** Trecho do título que diz que o trabalho parou. */
const SAYS_BLOCKED =
  /\b(impede|impedindo|impedid\w*|bloqueia|bloqueando|sem alternativa|parad\w*|sem conseguir trabalhar)\b/;

/**
 * O título sem dizer que o trabalho parou quando a pessoa disse que dá para seguir
 * ("Teclado com teclas falhando impede trabalho" → "Teclado com teclas falhando").
 */
export function titleConsistentWithSignals(title: string, signals: SaidSignals): string {
  if (signals.blocked !== false) return title.trim();
  const words = title.trim().split(/\s+/);
  const cut = words.findIndex((word) => SAYS_BLOCKED.test(normalizeText(word)));
  if (cut === -1) return title.trim();
  const kept = words
    .slice(0, cut)
    .join(" ")
    .replace(/[\s,;:–—-]+(e|que|o|a)?$/i, "")
    .trim();
  return kept === "" ? title.trim() : kept;
}

const FIRST_PERSON: [RegExp, string][] = [
  [/\b(d)o meu\b/gi, "$1o"],
  [/\b(d)a minha\b/gi, "$1a"],
  [/\b(d)os meus\b/gi, "$1os"],
  [/\b(d)as minhas\b/gi, "$1as"],
  [/\b(n)o meu\b/gi, "$1o"],
  [/\b(n)a minha\b/gi, "$1a"],
  [/\b(n)os meus\b/gi, "$1os"],
  [/\b(n)as minhas\b/gi, "$1as"],
  [/\b(o|a|os|as) (meu|minha|meus|minhas)\b/gi, "$1"],
  [/\bmeu\b/g, "o"],
  [/\bMeu\b/g, "O"],
  [/\bminha\b/g, "a"],
  [/\bMinha\b/g, "A"],
  [/\bmeus\b/g, "os"],
  [/\bMeus\b/g, "Os"],
  [/\bminhas\b/g, "as"],
  [/\bMinhas\b/g, "As"],
  [/\b([Nn])ão consigo\b/g, "$1ão consegue"],
  [/\bconsigo\b/g, "consegue"],
  [/\bestou\b/g, "está"],
  [/\bEstou\b/g, "Está"],
  [/\btenho\b/g, "tem"],
  [/\bpreciso\b/g, "precisa"],
  [/\bjá tentei\b/gi, "já tentou"],
  [/\btentei\b/g, "tentou"],
  [/\breiniciei\b/g, "reiniciou"],
  [/\bfiz\b/g, "fez"],
  [/\bcomigo\b/g, "com o solicitante"],
  [/\bpra mim\b/gi, "para o solicitante"],
  [/\bpara mim\b/gi, "para o solicitante"],
];

/**
 * A descrição do chamado é impessoal: "O microfone do meu headset não funciona" vira "O
 * microfone do headset não funciona". Só troca possessivos e verbos comuns de primeira pessoa.
 */
export function impersonal(text: string): string {
  return FIRST_PERSON.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    text,
  )
    .replace(/\s{2,}/g, " ")
    .trim();
}
