# Histórico de versões

Versão no formato `MAIOR.MENOR.CORREÇÃO` (versionamento semântico):

- **CORREÇÃO** (1.0.**1**): conserto de erro, sem mudar o que o sistema faz.
- **MENOR** (1.**1**.0): função nova, sem quebrar nada do que existe.
- **MAIOR** (**2**.0.0): mudança grande, que muda o jeito de usar ou exige ação dos clientes.

A versão em produção aparece em `https://app.chamalia.com.br/health` e no rodapé do menu do painel.

## 1.6.3 · 2026-11-11

- Transparência no uso de IA: na primeira resposta de cada conversa (ou depois de 24 h sem conversa) a Lia se apresenta como atendente virtual do negócio. Se perguntarem se é robô ou pessoa, ela diz que é a atendente virtual e oferece chamar alguém da equipe; nunca finge ser gente. Vale para todos os negócios e não pode ser desligado.
- Lembrete da véspera diz quem está escrevendo ("Aqui é Lia, atendente virtual") e o nome do negócio, inclusive para quem marcou pelo painel e nunca falou com a Lia.

## 1.6.2 · 2026-10-25

- Cada Lia é do negócio dela: a regra de "química" (coloração, mechas, progressiva…) deixou de estar no texto base, que valia para todos, e virou um assunto de "Passar para a equipe" que cada negócio mantém, edita ou apaga. Negócios que já existem ficam exatamente como estavam; salões novos começam com o assunto e os outros nichos sem. As palavras fixas "salão" também passaram a seguir o tipo de local de cada negócio.
- Teste automático de isolamento: uma Lia nunca recebe dados, regras ou respostas de outro negócio.
- O menu do perfil mostra a versão do sistema (útil para conferir se a aba está atualizada).
- Banco: migration 024 (assuntos iniciais por nicho), só acrescenta coluna e dados.

## 1.6.1 · 2026-10-24

- Menu lateral recolhido por padrão: só a faixa de ícones, e o menu aparece ao chegar com o mouse na borda. Quem quiser manter o menu aberto clica no botão ao lado da logo (a escolha fica salva; quem já tinha escolhido mantém).
- Aviso de nova versão: o painel confere também ao voltar para a aba, sem esperar o minuto.

## 1.6.0 · 2026-10-24

- **Início:** nova tela inicial com saudação (Bom dia, Fulano), nome e logo do negócio, data, resumo do dia, atalhos para as telas, números da agenda, clientes e valor dos atendimentos concluídos, e o trabalho da atendente. Período: hoje, semana, mês ou mês passado.
- **Agenda nova (PC):** grade por hora que cabe na tela sem rolar, uma coluna por profissional com foto, linha da hora de agora, clique no espaço livre para agendar, painel lateral com calendário, busca de cliente, filtro de profissionais e de situação, e a exibição "Só marcados". Histórico da cliente dentro do agendamento. Cores firmes nos cartões (cor por profissional).
- **Folgas e feriados:** em Horários e folgas, bloqueio do negócio todo ou de uma profissional (dia inteiro ou faixa de horas). A agenda mostra o dia fechado e a Lia explica o motivo e oferece outro dia.
- **Fotos dos profissionais** (Profissionais e agenda).
- **Perfil da pessoa:** Configurações > Meu perfil, com foto, nome, "como quer ser chamado", e-mail, WhatsApp e senha. A logo do negócio ficou em Configurações > Negócio.
- **Menu por módulos:** Cadastros, Atendente Lia e Configurações, um aberto por vez. Menu que recolhe sozinho em uma faixa de ícones e abre ao chegar com o mouse, empurrando a página; clicar na logo leva ao Início. Barra lateral clara no tema claro.
- **Tema claro** com fundo cinza suave, bordas e cores de status mais fortes.
- **Site:** aviso de cookies com Aceitar e Recusar.
- Banco: migrations 022 (foto do profissional) e 023 (apelido, telefone e foto da pessoa), só acrescentam colunas.

## 1.5.0 · 2026-10-24

- Barra superior no painel: o negócio (com a logo) à esquerda e, à direita, avisos (sininho com os agendamentos pendentes), ajuda, tema e o menu do perfil. A agência vê "Todos os negócios / <negócio>".
- O menu lateral ficou só com as telas, e o cartão do negócio saiu dele. O menu do perfil (Perfil e logo, Trocar senha, Cobrança, Sair) fica na barra, no canto direito.
- Itens do menu são links de verdade: dá para abrir uma tela em outra aba (clique com o botão do meio ou Ctrl+clique).
- Menu lateral: Treinar a Lia, Testar a Lia, WhatsApp e, por último, Configurações.
- Agência dentro de um negócio: "Acesso do responsável" também aparece no menu do perfil (canto direito), para criar ou trocar o login sem procurar no menu lateral.
- Acessibilidade: "Pular para o conteúdo" no primeiro Tab e foco visível no menu.
- Página de pagamento: "Dúvidas? Fale com a gente" abre o e-mail contato@chamalia.com.br.

## 1.4.0 · 2026-10-24

- Aviso "Nova versão da Chama Lia disponível" com botão Atualizar: o painel percebe um deploy novo em até 1 minuto e atualiza com um clique, sem Ctrl+Shift+R.

## 1.3.0 · 2026-10-24

- Cada tela do painel tem o próprio endereço (/clientes, /servicos, /configuracoes, /pagamento...): dá para mandar link, abrir em outra aba, e o F5 e o voltar do navegador funcionam.
- Agência: o negócio aberto fica no endereço (/negocio/<id>/...).
- Endereço digitado errado é corrigido sozinho: /termos e /privacidade levam ao site, nomes parecidos viram a tela certa e o resto volta para o início.
- Perfil: clicar no cartão do negócio (menu) mostra quem está conectado e abre Perfil e logo, Trocar senha, Cobrança e Sair. Logo do negócio só para o painel (a foto do WhatsApp continua separada, na tela WhatsApp). No celular, o perfil fica no topo de Mais.

## 1.2.0 · 2026-10-24

- Cartão sem desconto: o atrativo é a renovação automática ("você nunca fica sem acesso"). O desconto fica no plano anual (2 meses grátis), no Pix e no cartão, com o equivalente por mês no resumo.
- Dá para trocar mensal/anual a qualquer momento, sem apagar o que foi digitado no cartão.
- Endereço próprio para a cobrança: app.chamalia.com.br/pagamento (para mandar como link; F5 e voltar funcionam).
- Termos de Uso versão 2026-10-24.2 (sem o desconto de 5% no cartão).

## 1.1.0 · 2026-10-24

- Página de pagamento refeita no padrão de checkout: passos numerados, bandeiras dos cartões e símbolo do Pix, resumo do pedido sempre visível com descontos e total, bloco de segurança (Mercado Pago, 7 dias de garantia, LGPD).
- Botão de assinatura próprio ("Assinar"), na cor da marca, no lugar do botão do Mercado Pago.
- Configurações > Cobrança usa o mesmo checkout; troca de cartão com "Salvar cartão".

## 1.0.0 · 2026-10-24

Primeira versão em produção (VPS + Easypanel, `app.chamalia.com.br`).

- Agenda: semana, dia em tabela no computador e lista no celular, agendamento manual, avisos de novo agendamento e de pendentes.
- Lia no WhatsApp: agenda, remarca, cancela, combos, áudio transcrito, tabela de preços, lembrete da véspera, passar para a equipe e "RESOLVIDO" pelo WhatsApp.
- Treinar a Lia: regras, respostas prontas, sugestão em texto livre, tela de teste.
- Planos: Agenda Online e Agenda Online + Lia, aba Planos da agência, bloqueio ao vencer.
- Cobrança: Pix pelo Mercado Pago (libera sozinho), cartão com débito automático (5% de desconto), anual com 2 meses grátis, aviso 3 dias antes de vencer, aba Configurações > Cobrança (trocar cartão, cancelar em 1 clique, histórico).
- Lei e segurança: Termos de Uso, Política de Privacidade e acordo de tratamento de dados, aceite registrado, registro de acessos (Marco Civil), dados antigos apagados após 12 meses, backup diário, Easypanel só por HTTPS.
