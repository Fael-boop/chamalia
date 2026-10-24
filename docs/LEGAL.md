# Lei, privacidade e segurança: o que já está feito e o que falta

Guia para o dono da Chama Lia. Não substitui um advogado: os textos foram escritos com base na
pesquisa das regras em vigor em outubro de 2026 e **devem ser revisados por um advogado** antes de
escalar as vendas.

## Já feito no sistema

| Regra | Como a Chama Lia cumpre |
|---|---|
| LGPD: transparência | Política de Privacidade em `chamalia.com.br/privacidade/` (quem trata, dados, finalidades, bases legais, fornecedores, transferência internacional, prazos, segurança, direitos) |
| LGPD art. 39: contrato com o operador | Anexo I dos Termos (`/termos/#anexo-i`): o negócio é controlador dos dados dos clientes dele, a Chama Lia é operadora |
| LGPD: canal para titulares (pequeno porte, Res. CD/ANPD 2/2022) | `contato@chamalia.com.br`, citado na Política |
| LGPD: guardar só o necessário | Mensagens apagadas sozinhas após 12 meses; registros de login após 12 meses (`maintenance/retention.ts`) |
| LGPD: segurança | HTTPS, senha com scrypt, sessão assinada, cada negócio só vê os próprios dados, telefones mascarados nos logs, SSH só por chave, firewall, backup diário |
| Cartão (PCI) | O cartão é digitado nos campos seguros do Mercado Pago; só o token chega ao servidor. Guardamos só bandeira e 4 últimos dígitos |
| Marco Civil, art. 15 | Data, hora e IP de cada login guardados 6 meses (tabela `access_logs`) |
| CDC art. 49: arrependimento | 7 dias da primeira contratação, devolução integral (Termos item 7 e aviso na tela de pagamento) |
| CDC: informação clara e renovação automática | Valor, frequência, "até você cancelar", desconto e como cancelar aparecem antes de assinar |
| Cancelamento fácil | Um clique em Configurações > Cobrança, sem multa, mesmo canal da contratação |
| Prova do aceite | Versão e data do aceite dos Termos guardadas no negócio (`terms_version`, `terms_accepted_at`) a cada pagamento |
| Aviso antes de vencer | Faixa no painel 3 dias antes, para quem paga por Pix |

## Falta você fazer (em ordem)

1. **Abrir o CNPJ** (com um contador). Depois, troque "CNPJ em registro" pelo número nas duas páginas
   (`apps/site/public/termos/index.html` e `privacidade/index.html`). O Decreto 7.962/2013 pede nome,
   CNPJ (ou CPF) e endereço do fornecedor visíveis no site de quem vende pela internet.
2. **Revisão por advogado** dos Termos e da Política (especialmente limitação de responsabilidade,
   reembolso e transferência internacional).
3. **Conferir os contratos de dados (DPA) da Anthropic e da Groq**: se oferecem as cláusulas-padrão
   da ANPD (Resolução CD/ANPD 19/2024, obrigatórias para cláusulas contratuais desde 23/08/2025) e
   se não usam os dados para treinar modelos. Guarde os PDFs.
4. **Ligar a verificação em 2 etapas** em: Mercado Pago, Hostinger, Easypanel, GitHub, Cloudflare e Gmail.
5. **Cópia do backup fora da VPS** (ver `docs/BACKUP.md`).
6. **Incidente de segurança**: se suspeitar de vazamento, avise a Claude e siga a Resolução CD/ANPD
   15/2024 (comunicar a ANPD e os afetados em até 3 dias úteis; pequeno porte tem prazo em dobro).

## Recomendações abertas

- **Painel do Easypanel** (`http://IP:3000`) está aberto na internet sem HTTPS. Recomendado: fechar a
  porta 3000 no firewall e acessar só por túnel SSH, ou dar a ele um domínio com HTTPS.
- **Banco de dev (Supabase)** tem uma cópia real dos dados da Luciana. Recomendado: apagar ou trocar
  por dados fictícios.
- **WhatsApp não oficial** (Evolution): risco de bloqueio do número pela Meta, informado nos Termos.
  Plano: migrar para a API oficial quando houver clientes pagantes.
- **Aviso de atendimento automático**: os Termos pedem que o negócio informe aos clientes que a
  atendente é virtual; uma frase automática na primeira mensagem da Lia ajudaria.
