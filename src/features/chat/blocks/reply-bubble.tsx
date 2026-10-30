import chatClasses from "../chat.module.css";

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
  return (
    <div className={className}>
      <p className={chatClasses.text}>
        {text}
        {showCaret && <span className={chatClasses.caret} aria-hidden />}
      </p>
      {children}
    </div>
  );
}
