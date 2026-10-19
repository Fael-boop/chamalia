# ChamaLia

Atendente virtual no WhatsApp (a "Lia") para clínicas, estética e barbearias:
agenda, confirma, lembra o cliente e avisa o dono. Cada cliente da agência é um
*tenant* com seu próprio número.

## Estrutura

```
apps/server   bot: webhook do WhatsApp, motor de conversa, lembretes e API do painel
apps/panel    painel web (React + Vite), servido pelo bot em produção
docker/       arquivos de apoio do docker-compose
```

## Rodando localmente (Windows, sem Docker)

Requer Node 22 ou mais novo.

```bash
cp .env.example .env      # preencha DATABASE_URL (Supabase) e ANTHROPIC_API_KEY
npm install
npm run dev:server        # bot em http://localhost:3000  (teste: /health)
npm run dev:panel         # painel em http://localhost:5173
```

Outros comandos: `npm test`, `npm run typecheck`, `npm run build`.

## Produção (VPS)

```bash
cp .env.example .env      # preencha POSTGRES_PASSWORD, EVOLUTION_API_KEY etc.
docker compose up -d --build
```

Sobe Postgres, Redis, Evolution API e o bot. Bot e Evolution ficam acessíveis só
no próprio VPS (`127.0.0.1`); a exposição pública via proxy com HTTPS será
documentada no passo a passo de onboarding.
