import { splitWords } from "@/shared/normalize-text";

// Em que tipo de aparelho o problema acontece, lido das palavras: o "Outlook não sincroniza no
// celular" (INC-20402) e "o Outlook do meu computador não abre" não são o mesmo problema, mesmo
// sendo o mesmo sistema (QA R1). Sem nenhuma palavra de aparelho, não dá para dizer.

export type DeviceClass = "mobile" | "computer";

const DEVICE_WORDS: Record<DeviceClass, readonly string[]> = {
  mobile: ["celular", "celulares", "smartphone", "iphone", "android", "tablet", "ipad"],
  computer: ["computador", "notebook", "desktop", "pc", "laptop"],
};

/** Os tipos de aparelho citados no texto. */
export function deviceClassesIn(text: string): Set<DeviceClass> {
  const words = new Set(splitWords(text));
  const classes = new Set<DeviceClass>();
  for (const [deviceClass, names] of Object.entries(DEVICE_WORDS) as [DeviceClass, string[]][]) {
    if (names.some((name) => words.has(name))) classes.add(deviceClass);
  }
  return classes;
}

/**
 * O chamado fala de um aparelho e o funcionário, só de outro: não é o mesmo problema. Quando um
 * dos dois não cita aparelho, não há conflito (pode ser o mesmo).
 */
export function devicesConflict(ticketText: string, employeeTexts: string[]): boolean {
  const ticket = deviceClassesIn(ticketText);
  const said = deviceClassesIn(employeeTexts.join(" "));
  if (ticket.size === 0 || said.size === 0) return false;
  return ![...said].some((deviceClass) => ticket.has(deviceClass));
}
