# Colocar a Chama Lia no ar (VPS Hostinger + Easypanel)

Guia para o dono do projeto. O site (chamalia.com.br) já está na Cloudflare Pages e não entra aqui.
Aqui entra o **app**: painel + Lia + WhatsApp, em `app.chamalia.com.br`.

## O que vai rodar na VPS
| Serviço | O que é | Origem |
|---|---|---|
| `app` | servidor da Lia + painel (uma imagem só) | este repositório, pelo `Dockerfile` |
| `postgres` | banco de dados (bancos `chamalia` e `evolution`) | serviço do Easypanel |
| `redis` | cache da Evolution | serviço do Easypanel |
| `evolution` | conexão com o WhatsApp | modelo do Easypanel, ou imagem `evoapicloud/evolution-api:v2.3.7` |

O Easypanel usa a porta 3000 do servidor. Por isso, na VPS usamos os **apps do Easypanel** (rede interna,
sem abrir porta) e não o `docker-compose.yml`, que publica `127.0.0.1:3000`. O compose continua valendo para
quem quiser subir sem Easypanel, em outro servidor.

## Antes de começar
1. VPS criada (Ubuntu 24.04 com Easypanel) e o **IP** anotado.
2. Sua chave SSH cadastrada na Hostinger.
3. Segredos gerados (PowerShell). Guarde num gerenciador de senhas, nunca no chat nem no Git:
   ```powershell
   # 3 valores longos e aleatórios
   1..3 | ForEach-Object { -join ((48..57)+(97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_}) }
   ```
   Use um para cada: `SESSION_SECRET`, `WEBHOOK_SECRET`, `EVOLUTION_API_KEY`. Mais uma senha forte
   (12+ caracteres) para `ADMIN_PASSWORD` e outra para o Postgres.

## 1. DNS (Cloudflare)
Em **Domains → chamalia.com.br → DNS → Add record**: tipo `A`, nome `app`, valor = IP da VPS.
Comece com a nuvem **cinza (DNS only)**, para o Easypanel conseguir emitir o HTTPS sozinho.

## 2. Easypanel (primeiro acesso)
Abra `http://IP-DA-VPS:3000`, crie o usuário administrador (senha forte) e um projeto chamado `chamalia`.

## 3. Serviços de apoio
1. **Postgres**: crie o serviço, anote usuário, senha e o nome interno do serviço (aparece na tela dele).
   Crie os bancos `chamalia` e `evolution` (o `docker/postgres/init.sql` mostra o mesmo).
2. **Redis**: crie o serviço.
3. **Evolution**: use o modelo do Easypanel, se houver, ou um app com a imagem `evoapicloud/evolution-api:v2.3.7`.
   Variáveis: as mesmas do bloco `evolution` do `docker-compose.yml` (`AUTHENTICATION_API_KEY` = a `EVOLUTION_API_KEY`).
   **Não** dê domínio público para a Evolution.

## 4. O app (este repositório)
1. Novo serviço **App** → fonte **GitHub**, repositório `Fael-boop/chamalia`, branch `main`, build por **Dockerfile**.
2. Variáveis de ambiente:
   ```
   NODE_ENV=production
   PORT=3000
   PUBLIC_URL=https://app.chamalia.com.br
   ADMIN_PASSWORD=<senha forte>
   SESSION_SECRET=<48 caracteres>
   DATABASE_URL=postgresql://USUARIO:SENHA@<servico-postgres>:5432/chamalia
   ANTHROPIC_API_KEY=<chave>
   ANTHROPIC_MODEL=claude-haiku-5-5
   GROQ_API_KEY=<chave>
   WHATSAPP_PROVIDER=evolution
   WEBHOOK_SECRET=<48 caracteres>
   EVOLUTION_API_URL=http://<servico-evolution>:8080
   EVOLUTION_API_KEY=<a mesma da Evolution>
   EVOLUTION_PUBLIC_URL=http://<servico-evolution>:8080
   EVOLUTION_WEBHOOK_BASE_URL=http://<servico-app>:3000
   ```
   Assinaturas: com `MERCADOPAGO_ACCESS_TOKEN` (e, opcional, `MERCADOPAGO_WEBHOOK_SECRET`) o Pix é do Mercado Pago e
   libera sozinho quando pago (aviso em `https://app.chamalia.com.br/webhooks/mercadopago`, sempre conferido na API).
   Sem o token, vale o Pix configurado no painel em Planos → Recebimento por Pix (QR code do banco), confirmado à mão.
   Senha do banco com símbolos precisa ser codificada na URL (`#` vira `%23`, `@` vira `%40`).
3. **Domínio**: `app.chamalia.com.br`, porta `3000`, HTTPS automático ligado.
4. **Deploy**. O servidor aplica as migrations sozinho ao subir.
5. Confira: `https://app.chamalia.com.br/health` deve mostrar `"database":"ok"` e `"ai":"configured"`.

## 5. Levar os dados de hoje
Hoje os negócios (Luciana, exemplo) estão no Supabase. Para a VPS:
1. No PC: `pg_dump` do banco do Supabase para um arquivo (só dados de negócios reais; o Studio Bella é exemplo e pode ser recriado).
2. Restaurar no Postgres da VPS (`psql`), depois do primeiro deploy criar as tabelas.
3. Reconectar o chip: a instância da Evolution é nova. Em **WhatsApp → Conectar**, escaneie o QR de novo.
   **Antes**, desconecte o chip da Evolution do PC (`npm run evolution:down`) para os dois não brigarem pelo número.

## 6. Depois de no ar
- Trocar `VITE_APP_URL`? Não precisa: o botão Entrar do site já aponta para `https://app.chamalia.com.br`.
- Ligar a nuvem laranja do Cloudflare no `app` só depois que tudo estiver funcionando, se quiser.
- **Backup**: ligar o backup automático da Hostinger e, no Easypanel, o backup do Postgres.
- Testar: login no painel, mensagem para o chip, áudio, lembrete da véspera.

## Segurança (conferir antes de divulgar)
- `ADMIN_PASSWORD` e `SESSION_SECRET` fortes (em produção o servidor nem sobe sem eles).
- Evolution sem domínio público; só o `app` tem HTTPS.
- Desligar o login por senha do SSH na VPS depois de testar a chave.
- `.env` e chaves nunca no Git.
