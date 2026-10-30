import { ArticleIcon, ICON_SIZE } from "@/shared/icons";
import classes from "./blocks.module.css";

/** Artigo da central de ajuda citado pelo agent (§7.2). */
export function ArticleCard({ title, excerpt }: { title: string; excerpt: string }) {
  return (
    <article className={classes.card}>
      <div className={classes.cardBody}>
        <div className={classes.cardKicker}>
          <span className={classes.kickerTrail}>
            <span className={classes.articleIcon}>
              <ArticleIcon size={ICON_SIZE.sm} />
            </span>
            Central de ajuda
          </span>
        </div>
        <h3 className={classes.articleTitle}>{title}</h3>
        <p className={classes.cardText}>{excerpt}</p>
      </div>
    </article>
  );
}
