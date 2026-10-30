import { describe, expect, test } from "vitest";

import {
  buildExcerpt,
  matchesArticleSubject,
  MAX_EXCERPT_LENGTH,
  rankArticles,
  scoreArticle,
} from "../knowledge/ranking";
import { buildArticleSearchText, stem, toSearchTerms } from "../knowledge/searchTerms";
import { SEED_ARTICLES } from "../seedData";

describe("toSearchTerms", () => {
  test("tira acento, caixa, hífen e palavras vazias", () => {
    expect(toSearchTerms("Minha VPN dá erro 809")).toEqual(["vpn", "erro", "809"]);
    expect(toSearchTerms("Wi-Fi da empresa")).toEqual(["wifi", "empres"]);
    expect(toSearchTerms("Configurar o e-mail")).toEqual(["configur", "email"]);
  });

  test("junta conjugações e plurais no mesmo radical", () => {
    const forms = ["instalo", "instalar", "instalação", "instalados", "Instale"];
    expect(new Set(forms.flatMap(toSearchTerms))).toEqual(new Set(["instal"]));
    expect(toSearchTerms("monitores")).toEqual(toSearchTerms("monitor"));
  });

  test("palavra curta fica inteira", () => {
    expect(stem("rede")).toBe("rede");
    expect(stem("erro")).toBe("erro");
    expect(stem("sap")).toBe("sap");
  });

  test("sem repetir termo", () => {
    expect(toSearchTerms("senha senha Senhas")).toEqual(["senh"]);
  });
});

describe("buildArticleSearchText", () => {
  test("título, corpo e tags viram termos separados por espaço", () => {
    const text = buildArticleSearchText({
      title: "Horário do service desk",
      body: "Atende das 8h às 18h.",
      tags: ["suporte"],
    });
    expect(text).toBe("horari servic desk atend 8h 18h suport");
  });
});

describe("rankArticles", () => {
  const hours = { title: "Horário", body: "Segunda a sexta.", tags: ["horário"] };
  const equipment = { title: "Equipamento", body: "Monitores.", tags: ["monitor"] };

  test("termo no título ou nas tags vale mais que no corpo", () => {
    const terms = toSearchTerms("segundo monitor");
    expect(scoreArticle(hours, terms)).toBe(1);
    expect(scoreArticle(equipment, terms)).toBe(2);
    expect(rankArticles([equipment, hours], terms)).toEqual([equipment]);
  });

  test("ordena pela pontuação: mais termos no assunto vem primeiro", () => {
    const terms = toSearchTerms("horário do monitor");
    const both = { title: "Horário", body: "Monitores.", tags: ["monitor"] };
    expect(rankArticles([hours, both], terms)).toEqual([both, hours]);
  });

  test("corte de relevância: termo só no corpo não traz o artigo", () => {
    const sap = {
      title: "Senha do SAP bloqueada",
      body: "Se persistir, abra um chamado.",
      tags: ["sap", "senha"],
    };
    const terms = toSearchTerms("impressora não imprime, quero atualizar o chamado");
    expect(scoreArticle(sap, terms)).toBe(1);
    expect(matchesArticleSubject(sap, terms)).toBe(false);
    expect(rankArticles([sap], terms)).toEqual([]);
  });

  test("descarta o que não tem termo em comum", () => {
    expect(rankArticles([hours, equipment], toSearchTerms("teclado"))).toEqual([]);
  });

  test("artigo do celular só entra quando a consulta fala de celular (QA R1, Outlook)", () => {
    const mobileMail = SEED_ARTICLES.find(
      (article) => article.slug === "email-corporativo-no-celular",
    );
    if (!mobileMail) throw new Error("artigo do seed sumiu");
    expect(
      rankArticles([mobileMail], toSearchTerms("O Outlook do meu computador não abre")),
    ).toEqual([]);
    expect(rankArticles([mobileMail], toSearchTerms("Outlook não sincroniza os e-mails"))).toEqual(
      [],
    );
    expect(rankArticles([mobileMail], toSearchTerms("Outlook não sincroniza no celular"))).toEqual([
      mobileMail,
    ]);
    expect(rankArticles([mobileMail], toSearchTerms("configurar e-mail no iPhone"))).toEqual([
      mobileMail,
    ]);
  });
});

describe("buildExcerpt", () => {
  const body = "Primeira frase sobre rede. Segunda frase sobre a VPN. Terceira sobre a VPN também.";

  test("fica com as frases que têm o termo buscado", () => {
    expect(buildExcerpt(body, ["vpn"])).toBe(
      "Segunda frase sobre a VPN. Terceira sobre a VPN também.",
    );
  });

  test("sem frase com o termo, usa a primeira", () => {
    expect(buildExcerpt(body, ["teclado"])).toBe("Primeira frase sobre rede.");
  });

  test("corta no limite sem partir palavra", () => {
    const long = `VPN ${"palavra ".repeat(60)}`.trim();
    const excerpt = buildExcerpt(long, ["vpn"]);
    expect(excerpt.length).toBeLessThanOrEqual(MAX_EXCERPT_LENGTH);
    expect(excerpt.endsWith("palavra…")).toBe(true);
  });
});
