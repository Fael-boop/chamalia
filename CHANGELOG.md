# Histórico de versões

Versão no formato `MAIOR.MENOR.CORREÇÃO` (versionamento semântico):

- **CORREÇÃO** (1.0.**1**): conserto de erro, sem mudar o que o sistema faz.
- **MENOR** (1.**1**.0): função nova, sem quebrar nada do que existe.
- **MAIOR** (**2**.0.0): mudança grande, que muda o jeito de usar ou exige ação dos clientes.

A versão em produção aparece em `https://app.chamalia.com.br/health` e no rodapé do menu do painel.

## 1.3.0 · 2026-10-24

- Cada tela do painel tem o próprio endereço (/clientes, /servicos, /configuracoes, /pagamento...): dá para mandar link, abrir em outra aba, e o F5 e o voltar do navegador funcionam.
- Agência: o negócio aberto fica no endereço (/negocio/<id>/...).
- Endereço digitado errado é corrigido sozinho: /termos e /privacidade levam ao site, nomes parecidos viram a tela certa e o resto volta para o início.

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
