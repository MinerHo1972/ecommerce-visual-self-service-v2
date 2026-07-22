#!/bin/bash
# 把本地 trunk 代码同步到 ECS release 目录（不触发 build）
# 用法：bash scripts/sync-to-ecs.sh [--build]
# 默认只同步源码；加 --build 会在 ECS 上跑 npm run build + pm2 重启
set -e
TR=/app/data/所有对话/主对话/evss-v2-trunk
ECS_HOST=root@115.190.227.72
ECS_KEY=/app/data/所有对话/主对话/基础设定/ssh/LHS-VOLC-ECS-01.pem
ECS_REL=/root/evss-releases/s18-p1-seedream-full
SSH="ssh -i $ECS_KEY -o StrictHostKeyChecking=no $ECS_HOST"

echo "==> rsync trunk -> ECS:$ECS_REL"
rsync -az --delete \
  -e "ssh -i $ECS_KEY -o StrictHostKeyChecking=no" \
  --exclude='node_modules' --exclude='.next' --exclude='.env' --exclude='.git' \
  --exclude='.p1-backup' --exclude='*.bak*' --exclude='*.tar.gz' \
  --exclude='tsconfig.tsbuildinfo' --exclude='.tmp_*' --exclude='ecosystem.config.js' \
  "$TR"/ "$ECS_HOST:$ECS_REL/"

if [ "$1" == "--build" ]; then
  echo "==> building on ECS"
  $SSH "cd $ECS_REL && npm run build 2>&1 | tail -20 && cp -r .next/static .next/standalone/.next/static && (cp -r public .next/standalone/ 2>/dev/null || true) && pm2 delete evss-web 2>/dev/null; sleep 1; cd .next/standalone && pm2 start server.js --name evss-web -i 2 --wait-ready --listen-timeout 5000 && sleep 3 && curl -s -o /dev/null -w 'health=%{http_code}\n' http://localhost:3000/"
fi
echo "==> done"
