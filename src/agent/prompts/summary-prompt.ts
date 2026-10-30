// Prompt do resumo acumulado (§6.7): modelo rápido, a cada 10 mensagens. O resumo volta ao
// contexto dos turnos seguintes, vai junto na transferência e passa para a "Nova conversa
// (com resumo desta)".

export const SUMMARY_PROMPT = `Você resume conversas do Nexo Assist, o assistente de TI da Nexo, para dar contexto aos próximos turnos e a um analista.

Escreva em português, em até 6 frases curtas, só com fatos ditos na conversa:
- o problema ou pedido do funcionário e o ambiente (sistema, dispositivo, sistema operacional);
- o que já foi tentado ou orientado;
- chamados citados (código e situação) e rascunhos propostos, confirmados ou cancelados;
- o que ficou pendente.
Não invente nada e não inclua senhas nem dados pessoais. Responda só com o resumo.`;
