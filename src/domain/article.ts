/** Condição que o agent confirma antes de aplicar o artigo, ex.: { field: "os", appliesTo: ["Windows 10"] }. */
export interface ArticleCondition {
  field: string;
  appliesTo: string[];
}

export interface Article {
  slug: string;
  title: string;
  body: string;
  tags: string[];
  conditions?: ArticleCondition[];
}
