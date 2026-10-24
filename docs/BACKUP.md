# Backup do banco (VPS)

## O que existe
- Todo dia às **00:30 (Brasília)** a VPS salva dois bancos em `/root/backups/daily/`:
  - `chamalia-AAAA-MM-DD_HHMM.sql.gz`: agenda, clientes, planos, pagamentos, tudo do negócio.
  - `evolution-AAAA-MM-DD_HHMM.sql.gz`: a conexão do WhatsApp (sessão do chip).
- Guarda os **últimos 7 dias**. O script só apaga os próprios arquivos, nessa pasta.
- Script: `scripts/vps-backup.sh` (instalado em `/usr/local/bin/chamalia-backup.sh`). Agenda: `/etc/cron.d/chamalia-backup`. Registro: `/var/log/chamalia-backup.log`.
- Os arquivos têm dados de clientes: pasta e arquivos só do root (permissão 700/600).
- Testado em 2026-10-24: o backup foi restaurado num banco temporário e todas as tabelas conferiram (`scripts/vps-restore-test.sh`).

## Conferir se está rodando
```
ssh root@200.141.24.226 "ls -lh /root/backups/daily; tail -n 6 /var/log/chamalia-backup.log"
```
Deve haver arquivos de hoje e linhas `ok chamalia` e `ok evolution`. Linha `ERRO` = avisar a Claude.

## Fazer um backup agora (por exemplo, antes de uma mudança grande)
```
ssh root@200.141.24.226 "/usr/local/bin/chamalia-backup.sh"
```

## Levar uma cópia para o PC (recomendado, 1 vez por semana)
O backup mora na mesma VPS: se o servidor for perdido, ele vai junto. Uma cópia fora dele protege disso.
```powershell
scp root@200.141.24.226:/root/backups/daily/chamalia-*.sql.gz C:\Users\panda\Backups\chamalia\
```
Crie a pasta antes. Guarde com cuidado: tem telefones e nomes de clientes.
Outra camada: ligar o backup automático da própria Hostinger (painel da VPS, aba Backups).

## Restaurar
Restaurar **substitui** os dados atuais. Antes, faça um backup novo (comando acima), e peça ajuda à Claude: ela confere o arquivo, restaura num banco temporário e só então troca.
Teste seguro, sem tocar na produção: `scripts/vps-restore-test.sh`.
