import chatClasses from "../chat.module.css";

/** Indicador de digitação, antes do primeiro pedaço de texto do agent (§7.2). */
export function TypingBubble() {
  return (
    <div className={chatClasses.replyCard}>
      <span className={chatClasses.typing} role="status" aria-label="Nexo Assist está digitando">
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}
