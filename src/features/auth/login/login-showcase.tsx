import { NexoMark } from "./icons";
import classes from "./login.module.css";

// Painel escuro do login: apresentação, chat de exemplo e números.
// Os números são estáticos (decisões 14 e 29).

const STATS = [
  { value: "8 s", label: "primeira resposta, em média" },
  { value: "72%", label: "resolvidos sem fila" },
  { value: "6", label: "analistas online agora", online: true },
];

export function LoginShowcase() {
  return (
    <section className={classes.showcase} aria-label="Sobre o Nexo Assist">
      <div className={classes.brand}>
        <NexoMark size={28} />
        Nexo Assist
      </div>

      <div className={classes.showcaseBody}>
        <div>
          <p className={classes.eyebrow}>Service desk de TI da Nexo</p>
          <h1 className={classes.headline}>Seu problema de TI, resolvido em uma conversa.</h1>
          <p className={classes.pitch}>
            Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central
            de ajuda e chama um analista quando precisa.
          </p>
        </div>
        <SampleChat />
      </div>

      <dl className={classes.stats}>
        {STATS.map((stat) => (
          <div key={stat.label} className={classes.stat}>
            <dt className={classes.statLabel}>{stat.label}</dt>
            <dd className={classes.statValue}>
              {stat.value}
              {stat.online && <span className={`${classes.dot} ${classes.dotOnline}`} />}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SampleChat() {
  return (
    <div className={classes.sampleChat} aria-hidden>
      <div className={classes.userBubble}>Meu notebook não conecta na VPN. Erro 809.</div>
      <div className={classes.agentLabel}>
        <strong>Nexo Assist</strong> consultou seus chamados · criou um chamado
      </div>
      <div className={classes.agentBubble}>
        Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.
      </div>
      <div className={classes.ticketChip}>
        <span className={`${classes.dot} ${classes.dotWarning}`} />
        <strong>INC-20517</strong> Rede e VPN · Alta · em até 4 h
      </div>
    </div>
  );
}
