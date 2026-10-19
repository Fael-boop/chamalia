# ChamaLia

Agência solo de automação no WhatsApp com IA. Nicho principal: **beleza e estética**
(salões, estética, barbearias, clínicas estéticas).
A atendente virtual se chama **Lia** (nome configurável por cliente, `tenants.assistant_name`).
Este repo é o produto. Tudo aqui é feito do zero: não reutilizar código de outros projetos.

**Oferta:** bot que agenda, confirma e lembra o cliente final, e avisa o dono.
Setup R$ 1.500 + R$ 297/mês por cliente. Cada cliente é um *tenant* com seu próprio número.

## Cliente piloto
Salão de beleza (cabelo) da mãe do dono do projeto. Hoje agenda tudo pelo WhatsApp Business no
celular. Vai usar a **WhatsApp Cloud API oficial em coexistência** com o app (ver abaixo).

Requisitos que o piloto trouxe (registrados em 2026-10-19):
- Serviço com **duração variável** (ex.: escova em cabelo curto x longo).
- **Combos** (ex.: corte + escova), podendo envolver mais de uma profissional.
- Serviço que **ocupa a profissional por horas** (química).
- **Mais de uma profissional**.
- **Encaixe** (agendar mesmo em horário cheio, por decisão da dona).
- **Modo assistente**: a Lia propõe o horário, a dona aprova, e só então a cliente recebe a
  confirmação. (Modo automático continua existindo: a Lia confirma sozinha.)

## WhatsApp Cloud API: coexistência com o app Business (pesquisado em 2026-10-19)
Fonte principal: doc da Meta "Onboard WhatsApp Business app users" (Embedded Signup).
- A dona continua usando o app WhatsApp Business no celular **no mesmo número**; a API roda junto.
  Mensagens enviadas por ela no app chegam para nós pelo webhook `smb_message_echoes`.
- Requisitos: app Business 2.24.17+; quem conecta precisa ser **Tech Provider** ou Solution
  Partner da Meta (não existe autoatendimento); Embedded Signup **v4** (v2/v3 descontinuados em
  2026-10-15) com `featureType: whatsapp_business_app_onboarding`.
- Virar Tech Provider: verificação do negócio na Meta (CNPJ, site, endereço) + App Review com 2
  vídeos (envio de mensagem e criação de template) + Access Verification. Pode levar semanas.
  Alternativa: conectar por um BSP que já é parceiro e suporta coexistência (custo mensal).
- Sincroniza: contatos e histórico 1:1 de até 6 meses (só se a dona aceitar; prazo de 24h após
  conectar; roda uma vez só). Grupos não sincronizam.
- No app, depois de conectar: listas de transmissão ficam só leitura; mensagens temporárias,
  visualização única e localização em tempo real são desativadas nas conversas 1:1; aparelhos
  conectados (WhatsApp Web etc.) são desconectados e precisam ser reconectados (WhatsApp para
  Windows não é suportado). Etiquetas, respostas rápidas, catálogo e mensagem de ausência
  continuam no app, mas não existem na API.
- O celular principal precisa abrir o app pelo menos a cada ~14 dias, senão desconecta.
- Custo: mensagens que a dona manda pelo app continuam grátis. Mensagens da API seguem a tabela
  da Meta: resposta dentro da janela de 24h após a cliente escrever é grátis; fora da janela só
  com template pago (lembrete de 24h antes normalmente cai aqui). Brasil passou a ser cobrado em
  BRL; conferir a tabela atual antes de precificar.
- Vazão fixa de 20 mensagens/s no número compartilhado (sobra para um salão).
- Desconectar: pela dona no app (Configurações > Conta > Plataforma comercial > Desconectar).
- Consequência para o produto: quando a dona responde a cliente pelo app, a Lia precisa
  **parar de responder naquela conversa** (assumir que a humana entrou) até um tempo/comando.

## Stack
- Node 22 + TypeScript (ESM), npm workspaces: `apps/server` (bot + API) e `apps/panel` (React + Vite).
- Fastify, zod (validação do env), `postgres` (porsager) com `transform: postgres.camel`.
- Postgres: Supabase (projeto gratuito, região São Paulo) em dev; container no VPS em produção.
  Usamos só o Postgres do Supabase (conexão direta via Session pooler), não a API/SDK dele.
- WhatsApp: Evolution API self-hosted (`evoapicloud/evolution-api:v2.3.7`) para demo e prospecção,
  atrás de uma abstração que permite trocar pela WhatsApp Cloud API oficial da Meta.
- IA: `@anthropic-ai/sdk`, modelo `claude-haiku-5-5` na conversa, chave em `ANTHROPIC_API_KEY`.
- Deploy: `docker compose` (Postgres + Redis + Evolution + bot) num VPS. Ainda não há VPS nem Docker;
  desenvolvimento local no Windows.

## Comandos
```
npm run dev:server   # bot em :3000 (lê ../../.env)
npm run dev:panel    # painel em :5173, faz proxy de /api e /health para :3000
npm run db:migrate   # aplica migrations pendentes (o servidor também aplica ao subir)
npm run db:seed      # cria o tenant "demo" (Barbearia Demo), idempotente
npm test / npm run typecheck / npm run build
```
No Windows, se `npm` não for encontrado no terminal do VS Code, o PATH está desatualizado:
fechar todas as janelas do VS Code e reabrir.

## Regras
- **Idioma:** mensagens ao usuário final (WhatsApp, painel) em português; identificadores,
  nomes de tabela/coluna e comentários de código em inglês.
- **Telefone nunca completo no log:** usar `maskPhone` (`apps/server/src/lib/phone.ts`); o logger
  mascara automaticamente campos como `phone`, `remoteJid`, `to`, `from`. Campo novo com telefone →
  incluir em `PHONE_FIELDS` (`apps/server/src/lib/logger.ts`).
- **Segredos:** `.env` está no `.gitignore` e nunca entra em commit. Só o `.env.example` (sem valores
  reais) é versionado. Antes de commitar, conferir que nenhuma senha/chave está no diff.
  Senha do banco com símbolos precisa ser codificada na URL (`#` → `%23`, `@` → `%40`).
- **Banco só por migration:** toda mudança de esquema é um arquivo novo em
  `apps/server/migrations/NNN_descricao.sql`, versionado no repo. Nunca alterar o banco pelo
  painel do Supabase. Nunca editar uma migration já aplicada; criar outra. Um banco novo (ex.:
  produção) deve ficar idêntico só rodando `npm run db:migrate`.
- **Multi-tenant:** toda tabela de negócio tem `tenant_id`; FKs entre dados de tenant incluem
  `tenant_id` (composite FK) para impedir referência cruzada. Toda query filtra por `tenant_id`.
  Tabelas novas: `enable row level security` (fecha a API pública do Supabase).
- **Commits pequenos**, mensagem curta em português, sem acento e sem emoji, um assunto por commit.
- **Comunicação:** explicar ao dono do projeto em português, sem jargão desnecessário.
  Mostrar cada item funcionando antes de passar ao próximo.

## Andamento do MVP
1. [x] Estrutura do projeto, `.env.example`, `docker-compose.yml` + `Dockerfile`.
   Compose validado só como YAML; ainda não rodado (sem Docker).
2. [x] Modelo de dados multi-tenant (`001_initial_schema.sql`): tenants, services, professionals,
   professional_services, business_hours, time_off, customers, appointments (com bloqueio de
   horário sobreposto no banco), conversations, messages. Aplicado no Supabase + seed demo.
3. [ ] Webhook da Evolution → motor de conversa (identificar cliente, oferecer horários livres,
   confirmar, gravar agendamento, notificar o dono no WhatsApp). Depende do VPS/Evolution.
4. [ ] Lembretes 24h e 2h antes, com resposta "1 confirmar, 2 remarcar".
5. [~] Painel web (React) por tenant: agenda do dia, serviços, horários + tela "Testar a Lia".
   Feito: API do painel com senha (`ADMIN_PASSWORD`), motor de conversa com Claude (tools:
   buscar horários, agendar, listar, cancelar, salvar nome) e canal de teste
   (`CollectingChannel`). Telas React começadas (api.ts, format.ts, styles.css, não commitadas).
   **Pausado** para redesenhar o modelo de dados do piloto (abaixo).
6. [ ] README com passo a passo de onboarding de um cliente novo.

## Redesenho do modelo para o piloto (proposta, aguardando aprovação)
Migration nova `002_...` (nunca editar a 001). Ideia:
- `service_variants`: duração/preço por variação (ex.: cabelo curto/médio/longo); a Lia pergunta.
- `service_steps`: etapas do serviço com duração e se ocupa a profissional (ex.: aplicação 40 min
  ocupa, pausa 40 min livre, finalização 30 min ocupa). Química "ocupa por horas" = etapas todas
  ocupadas. Padrão: 1 etapa ocupada.
- Combos: `bookings` (o pedido da cliente: status, aprovação, origem) com vários
  `appointments` (um por serviço, em sequência, cada um com sua profissional).
- O bloqueio de horário duplicado passa a valer por **trecho ocupado** da profissional, não pelo
  atendimento inteiro.
- Encaixe: flag no agendamento que dispensa o bloqueio de conflito.
- Modo assistente: `tenants.booking_mode` (`auto` | `assistant`); booking com status
  `pending_approval` segura o horário por um prazo até a dona aprovar.
- Pendências para decidir com o dono: canal de aprovação da dona, quem pode fazer encaixe,
  duração variável por tamanho de cabelo e/ou por profissional, se a pausa da química libera a
  profissional, caminho Tech Provider x BSP.

Atualizar esta seção ao fim de cada etapa.
