#!/bin/sh
# Closes the Easypanel port 3000 to the internet; the panel is used at https://painel.chamalia.com.br.
# Runs on the VPS as root. Emergency access: SSH tunnel (ssh -L 3000:localhost:3000 root@IP) or the
# Hostinger web console. Undo: see the end of this file.
#
# Why two parts: Easypanel publishes 3000 through Docker.
#  - IPv4 is forwarded by Docker (DNAT) and skips UFW: blocked in the DOCKER-USER chain.
#  - IPv6 reaches docker-proxy on the host itself: closed by removing the UFW allow rule.
set -eu

cat > /usr/local/sbin/chamalia-block-3000.sh <<'EOF'
#!/bin/sh
# Drops connections from the internet (eth0) to the Easypanel port 3000. Idempotent.
RULE="-i eth0 -p tcp -m conntrack --ctorigdstport 3000 --ctdir ORIGINAL -j DROP"
iptables -C DOCKER-USER $RULE 2>/dev/null || iptables -I DOCKER-USER $RULE
EOF
chmod 700 /usr/local/sbin/chamalia-block-3000.sh

# Re-applied every time Docker starts (Docker recreates its chains on restart/reboot).
cat > /etc/systemd/system/chamalia-block-3000.service <<'EOF'
[Unit]
Description=Close Easypanel port 3000 to the internet (Chama Lia)
After=docker.service
PartOf=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/chamalia-block-3000.sh
RemainAfterExit=yes

[Install]
WantedBy=docker.service multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now chamalia-block-3000.service

ufw --force delete allow 3000/tcp || true

iptables -L DOCKER-USER -n | grep 3000
ufw status | grep -c 3000 || true

# Undo:
#   systemctl disable --now chamalia-block-3000.service
#   iptables -D DOCKER-USER -i eth0 -p tcp -m conntrack --ctorigdstport 3000 --ctdir ORIGINAL -j DROP
#   ufw allow 3000/tcp comment 'Easypanel'
