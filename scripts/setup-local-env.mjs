// Prepara o ambiente local para o agent responder: segredos internos e modelos do LLM.
// Uso: npm run setup:local   (depois de `npx convex dev` ter criado o .env.local)
//
// - Gera AGENT_SERVER_SECRET e TICKETING_SERVICE_KEY se ainda não existirem no .env.local.
// - Completa no .env.local os modelos do Groq que estiverem faltando.
// - Grava os dois segredos, com o MESMO valor, nas variáveis do deployment atual do Convex.
// Não mexe no que já está preenchido e nunca imprime os valores.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ENV_FILE = ".env.local";

const DEFAULTS = {
  LLM_PROVIDER: "groq",
  LLM_MODEL_FAST: "openai/gpt-oss-20b",
  LLM_MODEL_MAIN: "openai/gpt-oss-120b",
  TRANSCRIPTION_MODEL: "whisper-large-v3-turbo",
};

/** Segredos que o Next e o Convex precisam compartilhar. */
const SHARED_SECRETS = ["AGENT_SERVER_SECRET", "TICKETING_SERVICE_KEY"];

if (!existsSync(ENV_FILE)) {
  console.error(`${ENV_FILE} não existe. Rode "npx convex dev" antes, para criar o deployment.`);
  process.exit(1);
}

const lines = readFileSync(ENV_FILE, "utf8").split("\n");
const current = readValues(lines);
const added = [];

for (const name of SHARED_SECRETS) {
  if (!current[name]) {
    current[name] = randomBytes(32).toString("hex");
    added.push(`${name}=${current[name]}`);
  }
}
for (const [name, value] of Object.entries(DEFAULTS)) {
  if (!current[name]) added.push(`${name}=${value}`);
}

if (added.length > 0) {
  const text = lines.join("\n").replace(/\n*$/, "\n");
  writeFileSync(ENV_FILE, `${text}\n# Gerado por npm run setup:local\n${added.join("\n")}\n`);
}

for (const name of SHARED_SECRETS) {
  execFileSync("npx", ["convex", "env", "set", "--", name, current[name]], { stdio: "inherit" });
}

if (!current.GROQ_API_KEY) {
  console.warn("Falta a GROQ_API_KEY no .env.local: sem ela o agent não responde.");
}
console.log(
  `Pronto: ${added.length} variável(is) acrescentada(s) ao ${ENV_FILE} e os segredos ` +
    "gravados no Convex. Reinicie o `npm run dev` para o Next ler o .env.local.",
);

/** NOME=valor por linha, ignorando comentários e linhas vazias. */
function readValues(fileLines) {
  const values = {};
  for (const line of fileLines) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}
