# ChamaLia

Agência solo de automação no WhatsApp com IA para clínicas, estética e barbearias.
A atendente virtual se chama **Lia** (nome configurável por cliente, `tenants.assistant_name`).
Este repo é o produto. Tudo aqui é feito do zero: não reutilizar código de outros projetos.

**Oferta:** bot que agenda, confirma e lembra o cliente final, e avisa o dono.
Setup R$ 1.500 + R$ 297/mês por cliente. Cada cliente é um *tenant* com seu próprio número.

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
5. [ ] Painel web (React) por tenant: agenda do dia, serviços, horários. ← próximo
6. [ ] README com passo a passo de onboarding de um cliente novo.

Atualizar esta seção ao fim de cada etapa.
