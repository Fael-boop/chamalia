# Chama Lia

Agência solo de automação no WhatsApp com IA. Nicho principal: **beleza e estética**
(salões, estética, barbearias, clínicas estéticas).
A atendente virtual se chama **Lia** (nome configurável por cliente, `tenants.assistant_name`).
Este repo é o produto. Tudo aqui é feito do zero: não reutilizar código de outros projetos.

**Oferta:** bot que agenda, confirma e lembra o cliente final, e avisa o dono.
Setup R$ 1.500 + R$ 297/mês por cliente. Cada cliente é um *tenant* com seu próprio número.

## Cliente piloto
Salão de beleza (cabelo) da mãe do dono do projeto. Hoje agenda tudo pelo WhatsApp Business no
celular. Testes do piloto: tela "Testar a Lia" e depois Evolution com chip pré-pago.

## Escopo do MVP (reduzido em 2026-10-19)
Dentro:
- Serviços simples com **duração fixa**, uma ou mais profissionais (modelo da migration 001).
- A Lia agenda, consulta, remarca e cancela esses serviços sozinha.
- **Lembrete na véspera** com resposta "1 confirmar, 2 remarcar".
- **Passar para a dona**: química, combos (mais de um serviço no mesmo atendimento), encaixe,
  serviço fora da lista ou qualquer pedido que a Lia não resolva → a Lia avisa a cliente que vai
  chamar a dona, a conversa fica marcada como "com a dona" e a Lia **para de responder** nela até
  a dona devolver (pelo painel).
- Canal **trocável** (interface `Channel`): Evolution agora; Cloud API da Meta depois, sem mexer
  no motor.

Fora (depois do primeiro cliente pagante):
- Química com etapas/pausa, combos, encaixe, duração variável, modo assistente (aprovação da dona).
- Meta: Tech Provider, coexistência, Cloud API. Não implementar agora.

Domínio: **chamalia.com.br** (já registrado). Plano quando houver VPS: painel e webhook em
`app.chamalia.com.br`, site/landing em `chamalia.com.br`.

Área "Clientes" (feita em 2026-10-20): só o dono da agência acessa (senha `ADMIN_PASSWORD`).
Lista + "Novo cliente" (nome, nicho, atendente, dona e WhatsApp dela, endereço) e, por cliente,
abas: Agenda, Serviços, Profissionais (quem faz qual serviço), Horários, Configurações (tom,
emoji, informações extras, "sempre passar para a dona quando…", antecedência mínima, dias à
frente, ativo), WhatsApp (QR code no painel) e Testar a Lia. Migration 002 com os campos novos.
Nichos em `apps/server/src/tenants/niches.ts`: rótulo, "cliente"/"paciente" e serviços iniciais
(criados com o cliente, junto com 1 profissional = dona e horário ter–sáb 09–18).
Dois painéis (feito em 2026-10-20), mesmo endereço, decididos pelo login:
- **Agência** (usuário `admin` + `ADMIN_PASSWORD`): todos os clientes, cadastro, WhatsApp e
  "Acesso da dona" (cria usuário/senha, gera senha nova, bloqueia).
- **Dona** (tabela `tenant_users`, migration 003): só o próprio negócio (Agenda, Serviços,
  Profissionais, Horários, Configurações sem "ativo", Testar). Nada de Chama Lia nem de outros
  clientes. O servidor recusa (403) rotas de outro tenant e rotas `adminOnly`.
- Sessão: token assinado com `SESSION_SECRET` (HMAC), enviado como Bearer. Senha com scrypt.
  Troca de senha ou bloqueio derruba as sessões. Login limitado a 10 tentativas/15 min por IP.
  Em dev sem `ADMIN_PASSWORD`, chamada sem token vale como admin.

Ordem de trabalho:
1. Tela "Testar a Lia" funcionando (prioridade).
2. Evolution no PC do dono com Docker Desktop, testando com chip pré-pago.
3. Lembrete da véspera. 4. Resto do painel. 5. README de onboarding.

## Referência futura: Cloud API em coexistência com o app Business (pesquisado em 2026-10-19)
Não implementar no MVP. Guardado para quando houver cliente pagante.
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
- Deploy: `docker compose` (Postgres + Redis + Evolution + bot) num VPS. Ainda não há VPS.
  Dev local no Windows: bot e painel com npm; Evolution no Docker Desktop (`docker-compose.dev.yml`),
  chamando o bot em `host.docker.internal:3000`.

## Comandos
```
npm run dev:server   # bot em :3000 (lê ../../.env)
npm run dev:panel    # painel em :5173, faz proxy de /api e /health para :3000
npm run db:migrate   # aplica migrations pendentes (o servidor também aplica ao subir)
npm run db:seed      # cria o tenant "demo" (Barbearia Demo), idempotente
npm test / npm run typecheck / npm run build
npm run evolution:up       # sobe a Evolution local (Docker Desktop aberto); manager em :8080/manager
npm run evolution:down     # desliga
npm run whatsapp:connect -- demo   # conecta o chip do tenant "demo" por QR code
```
No Windows, se `npm` não for encontrado no terminal do VS Code, o PATH está desatualizado:
fechar todas as janelas do VS Code e reabrir.

## Regras
- **Marca:** em todo texto visível o nome é **Chama Lia** (com espaço). Identificadores, pacotes,
  pastas e domínio continuam `chamalia`.
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
3. [~] Webhook da Evolution → motor de conversa. Feito: `docker-compose.dev.yml` (Evolution +
   Postgres + Redis só para dev; Docker Desktop instalado no PC do dono), `EvolutionClient` /
   `EvolutionChannel`, rota `POST /webhooks/evolution?secret=WEBHOOK_SECRET`, comando
   `npm run whatsapp:connect -- <slug>` (cria instância `chamalia-<slug>`, liga webhook, abre QR).
   Mensagem enviada pelo próprio celular do chip (fromMe) que não é eco nosso → conversa vai
   para a dona. Áudio/foto → resposta fixa pedindo texto. LID: usa `remoteJidAlt`.
   Falta: teste real com chip pré-pago.
4. [ ] Lembretes 24h e 2h antes, com resposta "1 confirmar, 2 remarcar".
5. [~] Painel web (React) por tenant: agenda do dia, serviços, horários + tela "Testar a Lia".
   Feito: API do painel com senha (`ADMIN_PASSWORD`), motor de conversa com Claude (tools:
   buscar horários, agendar, listar, cancelar, salvar nome) e canal de teste
   (`CollectingChannel`). "Passar para a dona" (tool `transfer_to_owner`, Lia fica em silêncio).
   Tela "Testar a Lia" pronta (login, escolha do salão, chat, avisos à dona, nova conversa,
   devolver para a Lia). Testado com o Haiku 5.5: agendar, remarcar, química, encaixe.
   Painel refeito (ver seção "Painel: regras de UI"). Falta: validar no celular real.
6. [ ] README com passo a passo de onboarding de um cliente novo.

Decisões: modelo de dados continua o da 001, sem migration nova no MVP. "Com a dona" usa
`conversations.state = 'human'` (+ motivo em `context`); não precisa de coluna nova.

Atualizar esta seção ao fim de cada etapa.

## Painel: regras de UI e paleta (refeito em 2026-10-20)
Stack: Tailwind v4 + shadcn/ui (new-york), lucide-react, sonner, react-hook-form + zod,
TanStack Query, date-fns pt-BR, motion + tw-animate-css, PWA (vite-plugin-pwa). Fonte Inter.
- **Paleta por tokens** em `apps/panel/src/index.css`: `--brand-50..950` (azul) e
  `--graphite-50..950` (preto/grafite). Para trocar a cor da marca, mude só esses valores.
  Azul = ações e destaques; grafite/preto = estrutura (menu lateral, topo, texto principal).
  Fundo do conteúdo claro; modo escuro (base preta, destaque azul) com botão de alternar
  (`chamalia.theme` no localStorage, sem flash).
- Cores de status discretas, só para confirmado/pendente/cancelado/concluído
  (`--status-*`). Sem gradiente, sem card colorido, sem ícone decorativo.
- Desktop: menu lateral preto, agenda da semana com colunas por profissional, listas em tabela.
- Celular: menu inferior com 4 itens (Agenda, Clientes, Serviços, Mais), agenda do dia com
  deslizar para trocar de dia, listas viram itens compactos, formulários abrem em folha
  inferior (arrastar para fechar). Alvos de toque >= 44px (`pointer: coarse`).
- Animações 150-250 ms, respeitam `prefers-reduced-motion`. Skeleton ao carregar.
- Nomes: "Negócios" = clientes da agência (painel admin); "Clientes" = clientes finais do negócio.
- Dados de demonstração: `npm run db:seed:salon` recria o "Studio Bella (exemplo)" (3 profissionais,
  serviços de cabelo e unha, agenda cheia hoje e amanhã). Não mexe em outros negócios.
- Celular na mesma rede: `npm run dev:panel` já expõe na rede (`host: true`); abrir
  `http://<IP do PC>:5173`. Instalar como app exige HTTPS (só em produção).
