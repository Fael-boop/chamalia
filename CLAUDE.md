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
  Troca de senha ou bloqueio derruba as sessões. Login: 10 senhas erradas por IP + usuário bloqueiam por 1 min.
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
npm run dev:site     # site de apresentação em :5174 (botão Entrar vai para VITE_APP_URL, padrão https://app.chamalia.com.br)
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
4. [x] Lembrete da véspera (`apps/server/src/reminders/reminders.ts`), feito em 2026-10-20.
   Job a cada 5 min (só liga com Evolution configurada): horários entre 2h e 24h à frente, marcados
   há mais de 2h, enviados só das 08h às 21h no fuso do negócio, só para negócio com WhatsApp.
   Decisão do dono: **sem resposta = confirmado** (ao enviar, status vira `confirmed`).
   Resposta "1" → "Combinado, te esperamos!". Resposta "2" → desmarca na hora, avisa a dona e a Lia
   oferece novos horários. Outro texto ("não vou poder") → a Lia trata pela conversa.
   Pendente fica em `conversations.context.reminder` (vale 36h). Painel: botão "Simular lembrete"
   em Testar a Lia (manda o lembrete do próximo horário da cliente de teste na hora).
   Lembrete de 2h antes: não feito (coluna `reminder_2h_sent_at` existe, sem uso).
5. [~] Painel web (React) por tenant: agenda do dia, serviços, horários + tela "Testar a Lia".
   Feito: API do painel com senha (`ADMIN_PASSWORD`), motor de conversa com Claude (tools:
   buscar horários, agendar, listar, cancelar, salvar nome) e canal de teste
   (`CollectingChannel`). "Passar para a dona" (tool `transfer_to_owner`, Lia fica em silêncio).
   Tela "Testar a Lia" pronta (login, escolha do salão, chat, avisos à dona, nova conversa,
   devolver para a Lia). Testado com o Haiku 5.5: agendar, remarcar, química, encaixe.
   Painel refeito (ver seção "Painel: regras de UI"). Falta: validar no celular real.
6. [ ] README com passo a passo de onboarding de um cliente novo.

Passar para a dona configurável (feito em 2026-10-20, migration 004): tela "Passar para a dona" com
serviços marcados "sempre com a dona" + motivo (`services.handoff`, `handoff_reason`; as tools recusam
buscar/agendar esses serviços), assuntos + motivo (tabela `handoff_topics`; o antigo
`tenants.handoff_rules` virou o primeiro assunto e não é mais usado) e a regra fixa "na dúvida, passa".
Volta da conversa para a Lia (migration 010, `tenants.handoff_return_hours`, padrão 12 h): (1) botão "Devolver para a Lia" na lista "Conversas com a equipe agora" (tela Passar para a equipe; rotas `GET /handoffs` e `POST /conversations/:id/release`); (2) sozinha, quando a cliente escreve e ninguém da equipe escreveu na conversa há mais que o tempo configurado (conta do `handoffAt` ou do `teamLastAt`, atualizado a cada mensagem da dona pelo celular); aí a dona recebe aviso de pedido pendente. Depois de voltar, `context.returned` (24 h) avisa a Lia para não repassar o mesmo pedido de novo (evita ciclo).
Passar para outra pessoa (feito em 2026-10-20, migration 005): `professionals.kind` (`professional` ou
`reception`, recepção não faz serviço nem aparece na agenda) e `notify_phone` (WhatsApp para avisos).
Cada serviço "com a dona" e cada assunto escolhe quem resolve (`handoff_professional_id` /
`professional_id`), e `tenants.default_handoff_professional_id` recebe "todo o resto". null = dona.
Pessoa inativa ou sem WhatsApp → aviso vai para a dona. Quem recebe responde pelo WhatsApp do salão.
A tool `transfer_to_owner` recebe `service_id`/`topic_id` e o servidor decide o destino.
Depois (com cliente pagante): caixa de conversas no painel com login por pessoa.
Acesso do responsável: "Nova senha" abre uma janela onde a agência digita a senha que quiser (mín. 8) ou gera uma; no Novo acesso a senha é digitada ou gerada. Lixeira exclui o acesso (DELETE, sessões abertas param na hora); o último acesso do negócio não pode ser excluído (409, e a lixeira mostra aviso). Senha atual não pode ser vista (só hash scrypt), de propósito.
WhatsApp real (2026-10-22): chip conectado ao Luciana Beauty Center; a Lia respondeu e agendou pelo WhatsApp. Aviso ao responsável falhou porque owner_phone estava sem 55 (Evolution leu como outro país): agora `withCountryCode` no envio (EvolutionClient) e ao salvar telefones no painel. Logs: telefones dentro de mensagens de erro são mascarados (`maskPhonesInText`) e o `?secret=` do webhook sai da URL logada.
Resolvido pelo WhatsApp (2026-10-22): o aviso de passar conversa traz um código ("Quando resolver, responda aqui *RESOLVIDO 1234*"; guardado em `context.handoffCode`). Se o responsável ou um profissional com WhatsApp de avisos manda "resolvido/fim/finalizar/encerrar" (com ou sem o código) para o número do negócio (telefone comparado com `samePhone`, que ignora o 9 extra de celular BR: o WhatsApp manda alguns números sem ele), `handleTeamDone` (engine.ts) devolve a conversa para a Lia e confirma. Prioridade: resposta (Responder do WhatsApp) a um aviso, cujo id fica em `context.handoffNoticeIds` (`stanzaId` do webhook) > código > sem código, que vale se só houver um atendimento aberto com aquela pessoa (o responsável vê todos). Botões do WhatsApp não funcionam de forma confiável fora da API oficial, por isso é texto. Ecos dos avisos (não ficam em `messages`) são reconhecidos por `sentByUs` para não marcar a conversa do responsável como "com a equipe".
Áudio (2026-10-23, `channels/transcribe.ts`): a Claude não ouve áudio, então o webhook baixa o áudio pela Evolution (`POST /chat/getBase64FromMediaMessage/{instance}` com o `data` do webhook) e transcreve na Groq (Whisper `whisper-large-v3-turbo`, `language: pt`, chave `GROQ_API_KEY`). A mensagem fica salva como "[áudio] texto" e a Lia responde normalmente. Limite de 2 min (`MAX_AUDIO_SECONDS`); mais longo ou sem texto → resposta fixa pedindo para escrever. Sem a chave, tudo segue como antes. O áudio vai para a Groq (terceiro): citar na política de privacidade quando houver. Transcrição nunca vai para o log.
Ritmo de envio (2026-10-22, `channels/send-pacing.ts`): cada envio pela Evolution passa `delay` (mostra "digitando…" antes: ~1 s + 30 ms por caractere, entre 1,2 e 5 s; arquivo 1,5 s) e um limite de 20 mensagens por minuto por número (as extras esperam a vez). Reduz padrão de robô na conexão não oficial.
Login com "Lembrar de mim" (2026-10-23): marcado (padrão, lembrado em `chamalia.remember`) = token no localStorage e sessão longa (admin 7 dias, responsável 30); desmarcado = token no sessionStorage (some ao fechar o navegador) e sessão de 12 h no servidor (`SHORT_SESSION_MS`, campo `remember` no `/auth/login`). Lembra também o último usuário. Revisado com a skill web-design-guidelines: botão Entrar sempre ativo (campo vazio é explicado e focado), aviso de Caps Lock, name/spellCheck nos campos, título da esquerda virou parágrafo (h1 é o do formulário), "Esqueceu a senha?" abre o WhatsApp de contato.
Login: o limite conta só senhas erradas, por IP + usuário, e zera ao acertar (antes contava todo login por IP; pelo túnel todos os visitantes têm o mesmo IP e travavam juntos).
Demonstração (2026-10-20): `cloudflared tunnel --url http://localhost:5173` gera um link trycloudflare.com para o painel no PC (Vite aceita `.trycloudflare.com` e `app.chamalia.com.br` em allowedHosts). Exige `ADMIN_PASSWORD` no .env (entre aspas se tiver `#`). Login `demo` no Studio Bella; `db:seed:salon` apaga esse login (cascade), recriar depois. Site no Cloudflare Pages (`chamalia.pages.dev`, build `npm run build -w @chamalia/site`, saída `apps/site/dist`); domínio em transição para os nameservers da Cloudflare.
Clientes (migration 009): a dona cria e edita clientes no painel (nome, WhatsApp com DDD — o servidor põe o 55 —, observações só para a equipe; telefone único por negócio, 409 se repetir). Não há excluir cliente.
Treinar a Lia (migration 015, tabela `assistant_rules`, feito em 2026-10-20): tela "Treinar a Lia" com
(1) primeiros passos com barra de progresso (serviços, quem faz o quê, horários, endereço/WhatsApp do
responsável, 3 respostas prontas, tabela de preços, 3 mensagens no teste, WhatsApp conectado; cada passo
leva para a tela certa), (2) regras "Sempre/Nunca" em frase curta, com sugestões de um toque, que entram no
prompt num bloco OBRIGATÓRIO antes de "Como atender" (no fim da lista ela ignorava). Em Testar a Lia:
perguntas prontas de um toque e botão "Corrigir" em cada resposta, que vira resposta pronta (pergunta
anterior + resposta certa) ou regra. "Treinar" é cadastro guiado, não treino de modelo.
Sugestão para a Lia (2026-10-23): caixa abaixo do chat em Testar a Lia. O dono escreve do jeito dele ("escreve textos menores"); `POST /tenants/:id/rules/suggest` manda o pedido + a última pergunta/resposta para a Claude (modelo da conversa, effort low, saída estruturada com `zodOutputFormat`) e volta uma regra Sempre/Nunca clara; o dono confere/edita e salva como regra comum (`assistant_rules`). O toast oferece "Testar de novo" (reenvia a última pergunta).
Pedido por nome (feito em 2026-10-20): se a cliente pede uma pessoa pelo nome ("falo com a Luciana?"), a Lia
confere na lista de Profissionais e na nova seção "Equipe" do prompt (recepção com WhatsApp de avisos) e usa
`professional_id` em transfer_to_owner, que tem prioridade sobre serviço/assunto/padrão. Sem pessoa definida,
fala o nome do responsável (antes dizia "a equipe" mesmo com nome cadastrado). Confirma o nome do negócio quando
perguntam e nunca diz que "não consegue garantir" quando respondem: "a resposta vem em breve".
Lista de Negócios (agência): clicar na linha abre a edição do cadastro (nome, nicho, responsável, endereço,
atendente); interruptor Ativo na própria linha; a seta abre a agenda do negócio.
Gênero por nome (feito em 2026-10-20): a Lia usa "ele"/"ela" e "o"/"a" de acordo com o nome de quem
está conversando e dos profissionais, sem perguntar (regra explícita no prompt, logo após o estilo de
escrever). Antes de saber o nome de quem conversa, trata por "você". Corrigido um bug de verdade: o texto que
sugere chamar um profissional (tools.ts, transfer_to_owner) tinha "a" fixo antes do nome ("a Pedro"); agora o
nome vai sem artigo ("vou chamar Pedro"/"vou chamar Dayane", as duas formas corretas em português) e o
modelo mesmo escolhe o artigo certo nas frases que ele escreve. Testado com profissional homem (Pedro) e
clientes de teste com nome masculino e feminino.
Nichos no banco (migration 014, feito em 2026-10-20): a tabela `niches` substitui o antigo
`apps/server/src/tenants/niches.ts` estático. Cada nicho tem slug (igual ao antigo valor de
`tenants.business_type`, agora FK para `niches.slug` em vez de CHECK fixo), label, place, customer_word,
`starter_services`/`starter_hours` (jsonb, usados só ao criar um negócio novo). Tela "Nichos" no painel da
agência (listar, criar, editar, excluir — bloqueado com 409 se algum negócio usa o nicho). Rotas em
`api/niches.ts`; `GET /api/niches` é público (painel da dona usa no campo Nicho), o resto é adminOnly.
A Lia recebe place/customerWord via `nicheForPrompt` (engine.ts), não mais import estático.
Linguagem neutra (feito em 2026-10-20): "dona" saiu de todo texto visível, da Lia e do painel, porque
o produto agora atende qualquer negócio, não só salões com dona mulher. Duas palavras diferentes:
"equipe" = quem resolve handoffs em geral (serviço/assunto "sempre com a equipe", regra "na dúvida passa
para a equipe", mensagens da Lia); "responsável" = o contato único cadastrado em ownerName/ownerPhone
(tela "Acesso do responsável", campos "Nome do responsável"/"WhatsApp do responsável", fallback quando
ninguém mais está configurado). Nenhuma tabela ou coluna mudou de nome.
Endereço com bairro e cidade (migration 013, `address_neighborhood`/`address_city`): campos
separados em Configurações e no cadastro de novo negócio; o prompt junta tudo (`fullAddress` em prompt.ts)
antes de mandar para a Lia.
Localização (migration 012, `tenants.location_url`): campo em Configurações, link do Google Maps (ou
parecido). A Lia manda junto com o endereço quando a cliente pede endereço/localização/como chegar.
Anexo da tabela de preços (migration 011, `messages.attachment` jsonb): a mensagem do arquivo guarda
{kind: "price_table", name, mime}; o painel (Testar a Lia) busca a tabela atual e mostra a imagem, em vez do
nome do arquivo cru. A Lia não repete nem corrige os valores da tabela (ela é da dona, pode diferir da lista
de serviços).
Foto de perfil da atendente (migration 011, `tenants.assistant_photo`): tela WhatsApp, corta em quadrado e
reduz no navegador (até 1 MB), salva no banco e, se o número estiver conectado, atualiza a foto no WhatsApp
de verdade (Evolution `/chat/updateProfilePicture`, NÃO testado com WhatsApp real).
Tabela de preços (migration 009, tabela `price_tables`, tela "Tabela de preços"): texto e/ou um arquivo (JPG/PNG/WebP/PDF, até 5 MB, guardado em `bytea`; o painel reduz fotos grandes). A Lia usa a tool `send_price_table` quando pedem a tabela: manda a resposta, depois o texto e o arquivo (`Channel.sendFile` → Evolution `/message/sendMedia`, testado com WhatsApp real em 2026-10-23: texto + imagem chegaram). Sem tabela, responde pelos preços dos serviços.
WhatsApp pela própria dona (feito em 2026-10-20): a tela "WhatsApp" agora é do painel da dona também (conectar/reconectar por QR code ou por código digitado no celular, ver o número conectado, trocar/desconectar com confirmação). Rotas `/whatsapp/connect` (aceita `phone` para código) e `/whatsapp/disconnect` não são mais `adminOnly`; o servidor ainda recusa tenant alheio. Número conectado fica em `tenants.whatsapp_number`. Código por telefone não foi testado com um celular real.
Duração do serviço no formulário: horas + minutos (`duration-input.tsx`), continua guardada em minutos.
Combos (migration 008, `appointments.combo_id`, feito em 2026-10-20): 2 a 3 serviços no mesmo atendimento, em sequência, na ordem que a cliente falar, com a mesma profissional ou com profissionais diferentes. Um agendamento por serviço ligados pelo `combo_id`. Tools `find_combo_slots` / `book_combo`; `computeComboSlots` (availability.ts) e `bookCombo` (scheduling/combo.ts). A busca separa `slots_with_one_professional` (uma pessoa faz tudo, oferecidos primeiro; `ComboSlot.solo`) de `slots_with_different_professionals`; `bookCombo` usa a mesma profissional em todas as partes quando ela está livre. Cancelar uma parte pela Lia cancela o combo todo; no painel cada parte é independente. Fora: serviços ao mesmo tempo com duas profissionais, mais de 3 serviços, remarcar combo (a Lia agenda de novo).
Recepção: a primeira recepção cadastrada vira o destino padrão de "todo o resto" (dúvidas de corte, progressiva etc.) se ainda não houver um; a Lia cita "a recepção" ao oferecer chamar alguém. Textos do painel dizem "equipe" (não "dona") nas telas de passar conversa.
Respostas prontas (migration 007, tabela `faq_entries`, tela "Respostas prontas"): pergunta + resposta que a dona escreve; entram no prompt e a Lia responde com elas. Sem resposta cadastrada, ela passa a pergunta para a equipe.
Excluir profissional (migration 006, `archived_at`): mesmo critério do serviço; ao arquivar, serviços/assuntos/padrão que a citavam voltam para a dona. Botão de lixeira também na lista de serviços.
Excluir serviço: apaga se nunca teve agendamento; senão arquiva (`archived_at`, some do painel e da Lia).
Corrigido: PATCH de serviço apagava preço/descrição (defaults do zod no partial).

Histórico para a IA guarda só texto (sem as chamadas de ferramenta): o prompt avisa que ações
anteriores aconteceram de verdade, e mostra horários cancelados nas últimas 24h.

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
- Site de apresentação (`apps/site`, feito em 2026-10-20): página única para `chamalia.com.br` (Vite + React + Tailwind, estático), com como funciona, o que a Lia faz, para quem é, "Fale com a gente" (WhatsApp +55 62 9473-7276 (trocado em 2026-10-23), sem preço no site de propósito), FAQ e botão **Entrar** para o painel em `app.chamalia.com.br`. Paleta compartilhada em `brand/palette.css` (painel e site importam; trocar a cor da marca é só ali). Plano: site agora → pagamento por link → assinatura automática só depois de uns 5 a 10 clientes. O painel continua em `apps/panel`.
- Landing refeita (2026-10-23, `apps/site/src`: App, hero, sections, fragments, ui; paleta azul/grafite, Inter, raio único de 12px; 2ª versão em 2026-10-23: página toda escura, fundo grafite-950, palcos azul-escuro brand-950 atrás das peças, fecho em bloco azul). Ideia: a hora marcada. Topo = h1 "Seu negócio com hora marcada!" + conversa da Lia que toca sozinha e deixa o visitante escolher o horário (cartão escuro, balões azuis) com a agenda ao lado se preenchendo; "Como funciona" = 4 linhas com horário (23h42, 23h43, 23h44, Na véspera) e a peça daquele momento; "O que a Lia faz" = grade de 5 cartões com a peça inteira (agenda de duas profissionais, lembrete, combo, aviso RESOLVIDO, horários); "Você ensina, ela segue" = recorte da tela Treinar a Lia + conversa que muda com a regra escolhida; quadro de página com linhas finas e "+" nos cruzamentos (pedido do dono, inspirado na Cal.com; exceção marcada com taste-skill-ignore e `inspect.mjs --allow hairline`); "Para quem"; Perguntas; fecho escuro com frase "Quero a Lia na minha [empresa]" que abre o WhatsApp. As peças de interface são desenhadas em código (`data-ui`), com dados de exemplo (nomes fictícios). Estrutura inspirada na Cal.com, sem copiar. Conferida com a taste-skill (`inspect.mjs`: 0 FAIL; avisos restantes: sem fotos/vídeo reais, de propósito, e margem de 20px da barra de rolagem do navegador de teste). Contato do site: +55 62 9473-7276.
- Ferramentas de design e teste (2026-10-22): skills `web-design-guidelines` (Vercel, revisa UI contra boas práticas) e `playwright-cli` (Microsoft, controla o navegador; CLI global `npm i -g @playwright/cli`) em `.claude/skills/`; MCP Context7 (docs atualizadas de bibliotecas) no escopo do usuário (`claude mcp add --scope user context7 -- npx -y @upstash/context7-mcp`).
- Referência visual da landing: `brand/referencia/cal-DESIGN.md` (análise do design da Cal.com, de VoltAgent/awesome-design-md, MIT). Inspiração de estrutura e ritmo; a identidade continua a da Chama Lia.
- Skill de design `.claude/skills/taste-skill` (design-taste-frontend, de terceiros, MIT, revisada em 2026-10-22; origem em ORIGEM.txt): usar **só na landing** (`apps/site`). O painel continua com as regras desta seção (sóbrio, tabelas limpas), mesmo que a skill fale de dashboards.
- Identidade: marca = quadrado escuro com "L" branco e ponto azul (`public/logo.svg`, componente `components/logo.tsx`, que usa os tokens `--graphite-950`/`--brand-500`). Aparece no login (painel preto com frase à esquerda no desktop; marca no topo no celular), menu lateral, barra do topo no celular, tela de carregamento e rodapé de "Mais". Nome com "Lia" na cor da marca. Não usar a marca como enfeite em outros lugares.
- Cores de status discretas, só para confirmado/pendente/cancelado/concluído
  (`--status-*`). Sem gradiente, sem card colorido, sem ícone decorativo.
- Desktop: menu lateral preto, agenda da semana com colunas por profissional, listas em tabela.
- Celular: menu inferior com 4 itens (Agenda, Clientes, Serviços, Mais), agenda do dia com
  deslizar para trocar de dia, listas viram itens compactos, formulários abrem em folha
  inferior (arrastar para fechar). Alvos de toque >= 44px (`pointer: coarse`).
- Animações 150-250 ms, respeitam `prefers-reduced-motion`. Skeleton ao carregar.
- Horário por profissional: em Profissionais > "Horários" (linhas de `business_hours` com `professional_id`). Sem horário próprio = segue o do salão. A Lia recebe esses horários no prompt e a busca de vagas já respeita.
- Nomes: "Negócios" = clientes da agência (painel admin); "Clientes" = clientes finais do negócio.
- Dados de demonstração: `npm run db:seed:salon` recria o "Studio Bella (exemplo)" (3 profissionais,
  serviços de cabelo e unha, agenda cheia hoje e amanhã). Não mexe em outros negócios.
- Celular na mesma rede: `npm run dev:panel` já expõe na rede (`host: true`); abrir
  `http://<IP do PC>:5173`. Instalar como app exige HTTPS (só em produção).
