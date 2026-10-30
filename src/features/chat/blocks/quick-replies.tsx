import classes from "./blocks.module.css";

export interface QuickReplyOption {
  label: string;
  value: string;
}

/**
 * Opções rápidas (§7.2). O clique envia o rótulo como mensagem do funcionário; depois do uso
 * (ou se a mensagem não é a última) ficam desabilitadas, com a escolhida em destaque.
 */
export function QuickReplies({
  options,
  chosenText,
  interactive,
  onChoose,
}: {
  options: QuickReplyOption[];
  /** O que o funcionário mandou logo depois, para marcar a opção escolhida. */
  chosenText: string | null;
  interactive: boolean;
  onChoose: (text: string) => void;
}) {
  return (
    <div className={classes.quickReplies}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={classes.quickReply}
          data-chosen={chosenText === option.label || undefined}
          disabled={!interactive}
          onClick={() => onChoose(option.label)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
