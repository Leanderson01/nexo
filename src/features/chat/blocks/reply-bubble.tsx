import chatClasses from "../chat.module.css";
import { splitFinalQuestion } from "./reply-segments";

/** Balão de texto de uma resposta (agent ou analista), com o cursor do streaming. */
export function ReplyBubble({
  text,
  analyst = false,
  showCaret = false,
  children,
}: {
  text: string;
  /** Mensagem do analista: verde, para não confundir com o agent (§7.2). */
  analyst?: boolean;
  showCaret?: boolean;
  /** Opções rápidas que fazem parte do balão. */
  children?: React.ReactNode;
}) {
  const className = analyst
    ? `${chatClasses.replyCard} ${chatClasses.analystCard}`
    : chatClasses.replyCard;
  // Com opções rápidas, a pergunta que elas respondem fica em destaque, logo acima (protótipo 02).
  const { body, question } = children ? splitFinalQuestion(text) : { body: text, question: null };
  const caret = showCaret && <span className={chatClasses.caret} aria-hidden />;
  return (
    <div className={className}>
      <p className={chatClasses.text}>
        {body}
        {!question && caret}
      </p>
      {question && (
        <p className={`${chatClasses.text} ${chatClasses.question}`}>
          {question}
          {caret}
        </p>
      )}
      {children}
    </div>
  );
}
