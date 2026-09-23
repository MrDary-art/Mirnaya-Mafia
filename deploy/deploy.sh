#!/bin/bash
# Скрипт быстрого развёртывания «Арены Переговоров» на VPS
# Требования: Ubuntu 22.04+, Python 3.11+, Node 18+, Docker (для gpt2giga)

set -e

DOMAIN=${1:-}
EMAIL=${2:-}
INSTALL_DIR="/opt/arena"

if [ -z "$DOMAIN" ]; then
    echo "Использование: $0 ваш-домен.com email@example.com"
    echo "Пример: $0 arena.example.com admin@example.com"
    exit 1
fi

echo "=== Развёртывание Арены Переговоров на $DOMAIN ==="

# 1. Установка зависимостей
echo "[1/8] Установка системных пакетов..."
sudo apt update
sudo apt install -y nginx python3-pip python3-venv certbot python3-certbot-nginx git

# 2. Загрузка кода
echo "[2/8] Загрузка кода в $INSTALL_DIR..."
sudo mkdir -p "$INSTALL_DIR"
sudo chown $USER:$USER "$INSTALL_DIR"
cd "$INSTALL_DIR"
if [ -d ".git" ]; then
    git pull
else
    git clone . "$INSTALL_DIR"
fi

# 3. Сборка фронтенда
echo "[3/8] Сборка фронтенда..."
cd "$INSTALL_DIR/frontend"
npm ci
npm run build

# 4. Настройка бэкенда
echo "[4/8] Настройка бэкенда..."
cd "$INSTALL_DIR/backend"
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install gunicorn uvicorn

# Создание .env
if [ ! -f .env ]; then
    cp .env.example .env
    sed -i "s|DB_PATH=.*|DB_PATH=/var/www/arena/data/arena.db|" .env
    sed -i "s|CORS_ORIGINS=.*|CORS_ORIGINS=https://$DOMAIN|" .env
    sed -i "s|ROOM_ALLOWED_ORIGINS=.*|ROOM_ALLOWED_ORIGINS=https://$DOMAIN|" .env
    sed -i "s|ROOM_RECORDINGS_PATH=.*|ROOM_RECORDINGS_PATH=/var/www/arena/private/room-recordings|" .env
fi

# 5. Каталог данных
echo "[5/8] Создание каталога данных..."
sudo mkdir -p /var/www/arena/data
sudo mkdir -p /var/www/arena/private/room-recordings
sudo chown -R www-data:www-data /var/www/arena/data /var/www/arena/private
sudo chmod -R 700 /var/www/arena/private
cd "$INSTALL_DIR/backend"
sudo -u www-data "$INSTALL_DIR/backend/.venv/bin/alembic" -c "$INSTALL_DIR/backend/alembic.ini" upgrade head

# 6. systemd сервис
echo "[6/8] Установка systemd сервиса..."
sudo cp "$INSTALL_DIR/deploy/arena.service" /etc/systemd/system/arena.service
sudo sed -i "s|WorkingDirectory=.*|WorkingDirectory=$INSTALL_DIR/backend|" /etc/systemd/system/arena.service
sudo systemctl daemon-reload
sudo systemctl enable arena
sudo systemctl start arena

# 7. Nginx
echo "[7/8] Настройка Nginx..."
sudo cp "$INSTALL_DIR/deploy/nginx.conf" /etc/nginx/sites-available/arena
sudo sed -i "s|ваш-домен.com|$DOMAIN|g" /etc/nginx/sites-available/arena
sudo sed -i "s|/var/www/arena|/var/www/arena|g" /etc/nginx/sites-available/arena
sudo ln -sf /etc/nginx/sites-available/arena /etc/nginx/sites-enabled/arena
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

# 8. HTTPS
echo "[8/8] Настройка HTTPS..."
sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$EMAIL"

echo ""
echo "✅ Развёртывание завершено!"
echo "Откройте https://$DOMAIN"
echo ""
echo "Демо-пользователи: demo / demo"
echo ""
echo "Логи: sudo journalctl -u arena -f"
echo "Перезапуск: sudo systemctl restart arena"
