// Gera as chaves do Convex Auth e grava as variáveis no deployment atual do Convex.
// Uso: npm run setup:auth [-- SITE_URL]   (padrão: http://localhost:3000)
// Para produção: npx convex env set --prod ... com os mesmos nomes (ver README).
import { execFileSync } from "node:child_process";
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const siteUrl = process.argv[2] ?? "http://localhost:3000";

const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = (await exportPKCS8(keys.privateKey)).trimEnd().replace(/\n/g, " ");
const publicKey = await exportJWK(keys.publicKey);
const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey }] });

function setConvexEnv(name, value) {
  // O "--" impede que um valor começado por "-----BEGIN" vire opção da CLI.
  execFileSync("npx", ["convex", "env", "set", "--", name, value], { stdio: "inherit" });
}

setConvexEnv("JWT_PRIVATE_KEY", privateKey);
setConvexEnv("JWKS", jwks);
setConvexEnv("SITE_URL", siteUrl);
console.log("Variáveis do Convex Auth gravadas: JWT_PRIVATE_KEY, JWKS e SITE_URL.");
