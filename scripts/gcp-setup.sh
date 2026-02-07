#!/usr/bin/env bash
#
# gcp-setup.sh — Bootstrap a fresh Ubuntu 22.04 GCP VM for social-agent-cloud.
#
# Usage:  sudo bash gcp-setup.sh
#
# This script is idempotent: it checks for the presence of each component
# before installing, so it is safe to run multiple times.
#
set -euo pipefail

REPO_URL="https://github.com/ChrisVivasAI/social-agent-cloud.git"
INSTALL_DIR="/opt/social-agent"
SERVICE_NAME="social-agent"

# ──────────────────────────────────────────────
# 0. Must be run as root
# ──────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo "ERROR: This script must be run as root (use sudo)." >&2
  exit 1
fi

echo "==> Starting social-agent-cloud VM setup..."

# ──────────────────────────────────────────────
# 1. Install prerequisite packages
# ──────────────────────────────────────────────
echo "==> Installing prerequisite packages..."
apt-get update -y
apt-get install -y \
  ca-certificates \
  curl \
  gnupg \
  lsb-release \
  git \
  ufw

# ──────────────────────────────────────────────
# 2. Install Docker Engine (official apt repo)
#    https://docs.docker.com/engine/install/ubuntu/
# ──────────────────────────────────────────────
if command -v docker &>/dev/null; then
  echo "==> Docker is already installed: $(docker --version)"
else
  echo "==> Installing Docker Engine from official repository..."

  # Add Docker's official GPG key
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  # Set up the Docker apt repository
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu \
    $(lsb_release -cs) stable" \
    | tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -y
  apt-get install -y \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin

  echo "==> Docker installed: $(docker --version)"
fi

# ──────────────────────────────────────────────
# 3. Verify Docker Compose v2 plugin is present
# ──────────────────────────────────────────────
if docker compose version &>/dev/null; then
  echo "==> Docker Compose plugin detected: $(docker compose version)"
else
  echo "ERROR: docker compose plugin not found. Installation may have failed." >&2
  exit 1
fi

# Enable and start Docker so it runs on boot
systemctl enable docker
systemctl start docker

# ──────────────────────────────────────────────
# 4. Clone the repository (or pull if it exists)
# ──────────────────────────────────────────────
if [[ -d "${INSTALL_DIR}/.git" ]]; then
  echo "==> Repository already cloned at ${INSTALL_DIR}, pulling latest..."
  git -C "${INSTALL_DIR}" pull --ff-only || true
else
  echo "==> Cloning repository into ${INSTALL_DIR}..."
  mkdir -p "$(dirname "${INSTALL_DIR}")"
  git clone "${REPO_URL}" "${INSTALL_DIR}"
fi

# ──────────────────────────────────────────────
# 5. Create .env from .env.example (if missing)
# ──────────────────────────────────────────────
if [[ -f "${INSTALL_DIR}/.env" ]]; then
  echo "==> .env file already exists — skipping (will not overwrite)."
else
  if [[ -f "${INSTALL_DIR}/.env.example" ]]; then
    echo "==> Creating .env from .env.example..."
    cp "${INSTALL_DIR}/.env.example" "${INSTALL_DIR}/.env"
    echo "    IMPORTANT: Edit ${INSTALL_DIR}/.env and fill in your secrets before starting."
  else
    echo "WARNING: .env.example not found in repo. Creating empty .env placeholder." >&2
    touch "${INSTALL_DIR}/.env"
  fi
fi

# ──────────────────────────────────────────────
# 6. Create systemd service for docker compose
#    This ensures the stack starts on boot and
#    can be managed with systemctl.
# ──────────────────────────────────────────────
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

echo "==> Writing systemd unit file to ${SERVICE_FILE}..."
cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=Social Agent Cloud (Docker Compose)
After=docker.service network-online.target
Requires=docker.service
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/docker compose up -d --build
ExecStop=/usr/bin/docker compose down
ExecReload=/usr/bin/docker compose up -d --build
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}.service"
echo "==> Systemd service '${SERVICE_NAME}' enabled (will start on boot)."

# ──────────────────────────────────────────────
# 7. Configure UFW firewall
#    Allow SSH (so we don't lock ourselves out)
#    and port 3002 for the agent API / Slack events.
# ──────────────────────────────────────────────
echo "==> Configuring UFW firewall..."

# Ensure SSH is always allowed before enabling UFW
ufw allow OpenSSH

# Allow the agent API port
ufw allow 3002/tcp comment "social-agent API / Slack events"

# Enable UFW non-interactively (idempotent — no-op if already active)
ufw --force enable

echo "==> UFW status:"
ufw status verbose

# ──────────────────────────────────────────────
# 8. Done
# ──────────────────────────────────────────────
echo ""
echo "============================================"
echo "  Setup complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Edit secrets:        sudo nano ${INSTALL_DIR}/.env"
echo "  2. Start the stack:     sudo systemctl start ${SERVICE_NAME}"
echo "  3. View logs:           cd ${INSTALL_DIR} && sudo docker compose logs -f"
echo "  4. Check status:        sudo systemctl status ${SERVICE_NAME}"
echo ""
