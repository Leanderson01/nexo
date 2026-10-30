import { normalizeText } from "@/shared/normalize-text";

import type { Impact } from "./enums";

// Sinais de prioridade só valem quando o funcionário disse (§3.5): o modelo do ENTENDER às
// vezes deduz "equipe parada" de "o Wi-Fi da sala 3 caiu" ou lê "sem compromisso hoje" como
// compromisso. Aqui, em código, cada valor precisa de uma frase do funcionário que o sustente
// (palavras que dizem aquilo, sem a negação). Sem frase, o sinal fica nulo e o agent pergunta.

export type SignalName = "impact" | "blocked" | "deadlineToday";

/** Os três sinais da §3.5, cada um nulo quando o funcionário não disse. */
export interface SaidSignals {
  impact: Impact | null;
  blocked: boolean | null;
  deadlineToday: boolean | null;
}

export type SignalValue<Name extends SignalName> = NonNullable<SaidSignals[Name]>;

// Padrões sobre o texto normalizado (minúsculas, sem acento).

const INDIVIDUAL =
  /\b(so|somente|apenas) (eu|comigo|a mim|pra mim|para mim|o meu|a minha|no meu|na minha|meu|minha)\b|\b(ninguem mais|mais ninguem)\b|\bindividual\b/;
const GROUP =
  /\b(equipe|time|setor|departamento|todo mundo|ninguem (consegue|do|da|aqui|no|na)|o pessoal|galera|colegas|a gente|todos (nos|da|do|os colegas))\b/;
const COMPANY =
  /\b(empresa (toda|inteira)|toda a empresa|a empresa toda|toda a nexo|todos os funcionarios|todas as areas)\b/;

// Verbos de trabalho: "não consigo atender", "não dá para faturar". Sozinho, "não consigo
// imprimir" é um sintoma, não uma pessoa impedida de trabalhar; com uma equipe ("ninguém do
// andar consegue imprimir", "a equipe não consegue emitir"), qualquer verbo diz que ela parou.
const WORK = String.raw`(trabalhar|fazer (o|meu|nosso) trabalho|fazer nada|seguir|continuar|atender|vender|registrar|faturar|operar|produzir|emitir notas?)`;
const UNABLE = String.raw`(consigo|consegue|conseguimos|conseguem|da para|da pra|tem como|tenho como|temos como)`;
const BLOCKED = new RegExp(
  [
    String.raw`\bnao ${UNABLE} (\w+ ){0,2}${WORK}`,
    String.raw`\bsem conseguir (\w+ ){0,2}${WORK}`,
    String.raw`\bimpossivel ${WORK}`,
    // "ninguém consegue", "ninguém do andar consegue", "ninguém aqui no setor consegue"
    String.raw`\bninguem( \w+){0,4} (consegue|conseguimos|pode)\b`,
    String.raw`\b(estou|estamos|esta|estao|ficou|ficaram|ficamos|tudo|equipe|time|setor|operacao|atendimento) parad`,
    String.raw`\bparou tudo|\bimpedid|\bsem alternativa`,
    String.raw`\bnao (tenho|temos|ha|tem) (nenhuma )?alternativa`,
  ].join("|"),
);
/** "a equipe não consegue imprimir": um grupo que não consegue fazer o trabalho dele. */
const GROUP_UNABLE = /\bnao (consegue|conseguem|conseguimos|da para|da pra|tem como|temos como)\b/;
/** "caiu", "fora do ar": junto de uma equipe ou da empresa, é o sistema parado para elas. */
const OUTAGE = /\b(caiu|cairam|fora do ar|parou|pararam|nao funciona|nao abre|indisponivel)\b/;
const NOT_BLOCKED =
  /\b(da para|da pra|consigo|conseguimos|tem alternativa|ha alternativa|tenho alternativa|outro jeito|por enquanto|atrapalha|so incomoda|pelo celular|pelo navegador|pelo webmail)\b/;

// Compromisso: o substantivo ("reunião", "entrega") ou a obrigação ("tenho que entregar").
const COMMITMENT = new RegExp(
  [
    String.raw`\b(compromisso|reunia\w*|apresentacao|apresentacoes|prazo|entreg\w*|cliente|clientes|evento|aula|viagem|voo|visita|treinamento|auditoria|fechamento|palestra|prova|urgente)\b`,
    String.raw`\b(tenho|temos|tem|preciso|precisamos|precisa|vou|vamos) (que |de )?(entregar|enviar|mandar|fechar|apresentar|imprimir|emitir|faturar|finalizar|concluir|terminar|publicar|pagar|assinar)\b`,
  ].join("|"),
);
const TODAY = new RegExp(
  [
    String.raw`\b(hoje|hj|agora|daqui a pouco|logo mais|ainda hoje|esta tarde|essa tarde|nesta tarde|nessa tarde|hoje a tarde)\b`,
    String.raw`\b(ate )?as \d{1,2}( ?h| ?horas|:\d{2})?\b`,
    String.raw`\bem \d+ ?(min|minutos|h|horas)\b`,
    String.raw`\b(ate o |no )?(fim|final) do (dia|expediente)\b`,
    String.raw`\burgente\b`,
  ].join("|"),
);
/** "amanhã às 14h" não é hoje. */
const NOT_TODAY = /\bamanha\b/;
const NO_COMMITMENT =
  /\b(sem (nenhum |qualquer )?(compromisso|prazo|urgencia|pressa)|nao (tenho|ha|tem|temos|existe) (nenhum |nenhuma |nada |qualquer )?(compromisso|prazo|urgencia|pressa|urgente|reuniao|apresentacao|entrega|evento)|nao (tenho|temos|ha|tem) nada (para |pra )?hoje|nenhum compromisso|nada urgente|pode esperar|nao e urgente|sem urgencia|sem pressa)\b/;

function saysBlocked(text: string): boolean {
  const group = GROUP.test(text) || COMPANY.test(text);
  return BLOCKED.test(text) || (group && (OUTAGE.test(text) || GROUP_UNABLE.test(text)));
}

function saysDeadlineToday(text: string): boolean {
  const today = TODAY.test(text) && !(NOT_TODAY.test(text) && !/\bhoje\b/.test(text));
  return COMMITMENT.test(text) && today && !NO_COMMITMENT.test(text);
}

/** A frase diz o valor do sinal? */
export function sentenceSupports<Name extends SignalName>(
  signal: Name,
  value: SignalValue<Name>,
  sentence: string,
): boolean {
  const text = normalizeText(sentence);
  switch (signal) {
    case "impact":
      if (value === "company") return COMPANY.test(text);
      if (value === "team") return GROUP.test(text) || COMPANY.test(text);
      return INDIVIDUAL.test(text);
    case "blocked":
      if (value === true) return saysBlocked(text);
      return NOT_BLOCKED.test(text) && !saysBlocked(text);
    case "deadlineToday":
      if (value === true) return saysDeadlineToday(text);
      return NO_COMMITMENT.test(text);
    default:
      return false;
  }
}

/** Frases das mensagens, da mais recente para a mais antiga. */
export function sentencesOf(texts: string[]): string[] {
  return [...texts]
    .reverse()
    .flatMap((text) => text.split(/[.!?;\n]+/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== "");
}

/**
 * A frase do funcionário que sustenta o valor, ou `null`. Prefere a que contém o trecho citado
 * pelo modelo (`quote`); se ela não diz aquilo, procura em todas as frases dele.
 */
export function findSignalSupport<Name extends SignalName>(
  signal: Name,
  value: SignalValue<Name>,
  employeeTexts: string[],
  quote: string | null,
): string | null {
  const sentences = sentencesOf(employeeTexts);
  const quoted = quote ? normalizeText(quote).trim() : "";
  const ordered = quoted
    ? [...sentences.filter((sentence) => normalizeText(sentence).includes(quoted)), ...sentences]
    : sentences;
  return ordered.find((sentence) => sentenceSupports(signal, value, sentence)) ?? null;
}

/** Sinais conferidos: o que ficou e o que foi descartado por falta de evidência. */
export interface VerifiedSignals {
  signals: SaidSignals;
  /** Frase que sustenta cada sinal que ficou (ou a opção escolhida). */
  evidence: Partial<Record<SignalName, string>>;
  /** Sinais que o modelo trouxe sem nada que os sustente, com o valor descartado. */
  dropped: { signal: SignalName; value: string }[];
}

/**
 * Confere os sinais do ENTENDER. A opção escolhida numa pergunta do agent (`answered`) vale
 * por si; o resto precisa de uma frase do funcionário que o sustente.
 */
export function verifySignals(input: {
  claimed: SaidSignals;
  quotes: Partial<Record<SignalName, string | null>>;
  answered: Partial<SaidSignals>;
  employeeTexts: string[];
}): VerifiedSignals {
  const result: VerifiedSignals = {
    signals: { impact: null, blocked: null, deadlineToday: null },
    evidence: {},
    dropped: [],
  };
  verifyOne("impact", input, result);
  verifyOne("blocked", input, result);
  verifyOne("deadlineToday", input, result);
  return result;
}

function verifyOne<Name extends SignalName>(
  signal: Name,
  input: Parameters<typeof verifySignals>[0],
  result: VerifiedSignals,
): void {
  const answered = input.answered[signal];
  if (answered !== undefined && answered !== null) {
    setSignal(result.signals, signal, answered);
    result.evidence[signal] = "opção escolhida pelo funcionário";
    return;
  }
  const claimed = input.claimed[signal];
  if (claimed === null) {
    // O modelo às vezes esquece, num turno seguinte, o que foi dito antes ("Só eu..."): vale o
    // que a fala dele diz sem ambiguidade (um único valor sustentado).
    const said = saidWithoutAmbiguity(signal, input.employeeTexts);
    if (said) {
      setSignal(result.signals, signal, said.value);
      result.evidence[signal] = said.sentence;
    }
    return;
  }
  const support = findSignalSupport(
    signal,
    claimed as SignalValue<Name>,
    input.employeeTexts,
    input.quotes[signal] ?? null,
  );
  if (support) {
    setSignal(result.signals, signal, claimed);
    result.evidence[signal] = support;
    return;
  }
  result.dropped.push({ signal, value: String(claimed) });
  // O que ele disse de fato, se sem ambiguidade ("sem compromisso hoje" é false, não true).
  const said = saidWithoutAmbiguity(signal, input.employeeTexts);
  if (said) {
    setSignal(result.signals, signal, said.value);
    result.evidence[signal] = said.sentence;
  }
}

function setSignal<Name extends SignalName>(
  signals: SaidSignals,
  signal: Name,
  value: SaidSignals[Name],
): void {
  signals[signal] = value;
}

const VALUES: { [Name in SignalName]: SignalValue<Name>[] } = {
  impact: ["individual", "team", "company"],
  blocked: [true, false],
  deadlineToday: [true, false],
};

/** O único valor do sinal que alguma frase do funcionário sustenta, com a frase. */
export function saidWithoutAmbiguity<Name extends SignalName>(
  signal: Name,
  employeeTexts: string[],
): { value: SignalValue<Name>; sentence: string } | null {
  const sentences = sentencesOf(employeeTexts);
  const found = (VALUES[signal] as SignalValue<Name>[]).flatMap((value) => {
    const sentence = sentences.find((item) => sentenceSupports(signal, value, item));
    return sentence ? [{ value, sentence }] : [];
  });
  // "Minha equipe" também sustenta "a empresa toda"? Não: só equipe. Mas empresa sustenta
  // equipe; nesse caso fica a empresa, o valor mais específico.
  if (signal === "impact" && found.length === 2 && found.some((item) => item.value === "company")) {
    return found.find((item) => item.value === "company") ?? null;
  }
  return found.length === 1 ? found[0] : null;
}
