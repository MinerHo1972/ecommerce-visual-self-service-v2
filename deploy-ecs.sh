#!/bin/bash
# 电商视觉自助台 ECS 部署脚本
# 在阿里云 ECS (8.153.195.8) 上执行

set -e

APP_NAME="ecommerce-visual-self-service"
APP_DIR="/opt/${APP_NAME}"
REPO_URL="https://github.com/MinerHo1972/ecommerce-visual-self-service.git"
PORT=3000
PM2_NAME="ecom-visual"

echo "=== 1/6 克隆/更新代码 ==="
if [ -d "${APP_DIR}" ]; then
  cd "${APP_DIR}"
  git pull origin main
else
  git clone "${REPO_URL}" "${APP_DIR}"
  cd "${APP_DIR}"
fi

echo "=== 2/6 安装依赖 ==="
npm install --production=false

echo "=== 3/6 配置环境变量 ==="
if [ ! -f .env.local ]; then
  echo "⚠️  .env.local 不存在，需要手动配置"
  exit 1
fi

echo "=== 4/6 构建 ==="
npm run build

echo "=== 5/6 启动/重启 PM2 ==="
if pm2 describe "${PM2_NAME}" > /dev/null 2>&1; then
  pm2 restart "${PM2_NAME}"
else
  pm2 start npm --name "${PM2_NAME}" -- start -- -p ${PORT}
fi

pm2 save

echo "=== 6/6 配置 Nginx ==="
NGINX_CONF="/etc/nginx/conf.d/${APP_NAME}.conf"
cat > "${NGINX_CONF}" << 'NGINX_EOF'
server {
    listen 3000;
    server_name _;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX_EOF

nginx -t && nginx -s reload

echo "=== 部署完成 ==="
echo "应用地址: http://8.153.195.8:3000"
pm2 status
