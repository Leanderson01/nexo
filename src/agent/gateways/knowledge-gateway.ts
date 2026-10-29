import type { Article } from "@/domain/article";
import type { Result } from "@/domain/result";

import type { GatewayError } from "./gateway-error";

export interface ArticleMatch extends Article {
  /** Trecho para o card de artigo. */
  excerpt: string;
}

export interface KnowledgeGateway {
  search(query: string): Promise<Result<ArticleMatch[], GatewayError>>;
}
