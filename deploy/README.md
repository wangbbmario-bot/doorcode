# 门锁项目（doorcode）服务器部署包

> 目标服务器：47.107.46.78（2 核 / 1.87GB 内存 / 41G 可用磁盘）
> 与 todo 项目同机，但**形态完全不同**，所以不用 Docker：
> doorcode = Vite 静态产物 + 一个 Express 进程 → **systemd 裸跑**，常驻约 40MB。

---

## 0. 为什么不用 Docker

| | todo 项目 | doorcode（门锁） |
|---|---|---|
| 形态 | Next.js 一进程跑前端+API+Prisma | Vite 静态产物 + 独立 Express，合成一个进程 |
| 常驻内存 | 83MB（容器） | **~40MB**（裸 node） |
| 数据库 | PostgreSQL 容器 | 无（历史索引是 JSON 文件） |
| 运行时依赖 | 整棵 node_modules | 只有 express（react 已被 vite 打进 bundle） |
| 端口 | 3000 | **8787** |

服务器上 Docker 本身常驻 145MB，doorcode 裸跑比再起一个容器更省。
而且没有 DB → 没有卷、没有 project 名、没有迁移，**没有那 5 个 compose 坑**。

---

## 1. 三步部署

### ① 本地打包并上传（一条命令）
```bash
cd /Users/qi/Desktop/doorcode
bash deploy/upload.sh 47.107.46.78 root
```
它会：本地 `npm run build` → 打包（dist/ + server/ + deploy/ + package*.json，排除 .env）→
scp 传到服务器 → scp `.env` 单独传 → 服务器解包 → 调 `install.sh` → 打印访问地址。

### ② 服务器装 Node（install.sh 会自动做）
```bash
# install.sh 里已经包含这一步，Node 版本锁 v22.23.4（和 todo 容器一致）
curl -fsSLO https://nodejs.org/dist/v22.23.4/node-v22.23.4-linux-x64.tar.xz
tar -xJf node-v22.23.4-linux-x64.tar.xz
mv node-v22.23.4-linux-x64 /usr/local/node22
ln -sf /usr/local/node22/bin/node /usr/local/bin/node
ln -sf /usr/local/node22/bin/npm  /usr/local/bin/npm
```

### ③ 启动 + 验证
```bash
systemctl status doorcode
curl -s http://127.0.0.1:8787/api/health
# → {"ok":true,"model":"doubao-seedream-5-0-flash-260915","keyConfigured":true}
```
访问：**http://47.107.46.78:8787**

### 日常更新
```bash
# 本地改完代码后
bash deploy/upload.sh 47.107.46.78 root
```

---

## 2. ⚠️ 上线前必须处理的 4 件事

### ① `SITE_PASSWORD` 没设 = 公开烧你的 ARK 额度

`/api/generate` 会调火山方舟（**你的钱**），`/api/history` 会暴露所有人的效果图。
服务器上 `.env` 里**必须**加：

```bash
echo "SITE_PASSWORD='换成一串难猜的'" >> /opt/doorcode/.env
chmod 600 /opt/doorcode/.env
systemctl restart doorcode
```
客户访问 `http://47.107.46.78:8787/?k=你的口令` 直接进，地址栏会自动变干净；
不带 `?k=` 时前端会弹框要口令。

### ② `.env` 权限
ARK_API_KEY 在里面。`install.sh` 会 `chmod 600`，但确认一下：
```bash
ls -l /opt/doorcode/.env    # 应该是 -rw------- 且属主 doorcode
```

### ③ 8787 端口目前是公开的
Express 里 `app.listen(PORT, '0.0.0.0')` 写死了。IP+端口访问阶段没问题，
但**配了域名之后**要把它收进 Caddy：
- 改 `server/index.mjs` 的 listen 为 `app.listen(PORT, process.env.HOST || '0.0.0.0')`
- systemd 里加 `Environment=HOST=127.0.0.1`
- 或者先用防火墙挡掉 8787 的公网入站

### ④ `server/generated/` 会一直涨
现在 17MB（33 张图，平均 540KB/张），历史索引上限 200 条（`MAX_HISTORY`），
但**图片文件不会被自动删**。建议：
```bash
# 定时备份（/etc/cron.d/doorcode-backup）
23 3 * * * root /opt/doorcode/deploy/backup.sh >> /var/log/doorcode/backup.log 2>&1
```
再配一条清理策略（比如只保留最近 200 张对应的图）。

---

## 3. 将来配域名（配完 Caddy 后）

```bash
# 1) 阿里云 DNS：doorcode.你的域名.com → A 记录 → 47.107.46.78
# 2) 把 deploy/Caddyfile.doorcode 的片段加进宿主机 Caddyfile
#    /opt/todo/app/deploy/Caddyfile
# 3) 校验 + 热加载（不要重启，会断连接）
docker exec todo-caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec todo-caddy caddy reload  --config /etc/caddy/Caddyfile --adapter caddyfile
# 4) 按上面第 ③ 条把 8787 收成 127.0.0.1
```
> Caddy 在 todo-caddy 容器里（不在 compose project 里），所以改配置后要单独 reload。

---

## 4. 和 todo 项目共存

| 项 | todo | doorcode |
|---|---|---|
| 端口 | 3000（web）+ 5432（db，不映射）+ 80/443（Caddy） | **8787** |
| 内存 | 83MB + 28MB + 34MB(caddy) | ~40MB |
| 反代 | Caddy → `web:3000`（docker 网络内） | Caddy → `127.0.0.1:8787` |
| 进程管理 | docker compose | **systemd** |
| 数据 | PostgreSQL 卷 | `server/generated/` 目录（本地文件） |
| 备份 | `scripts/backup.sh todo` | `deploy/backup.sh` |

两个项目互不干扰；共同的上限是 1.87GB 内存，**但 doorcode 只占 40MB，压力主要还在 todo 那边**。

---

## 5. 排错

```bash
systemctl status doorcode --no-pager -l   # 状态
journalctl -u doorcode -n 50 --no-pager   # systemd 日志
tail -f /var/log/doorcode/app.log         # 应用日志
curl -s http://127.0.0.1:8787/api/health  # 健康检查（keyConfigured=false = .env 没读到）
```

| 现象 | 原因 |
|---|---|
| `keyConfigured: false` | `.env` 没传上去 / 权限不对（服务用户读不到） |
| 502 反代 | doorcode 服务没起 → `systemctl status doorcode` |
| 生成报 500 | ARK key 无效或额度用尽 → 看 app.log 里上游返回 |
| 图片生成后刷新没了 | `server/generated/` 没持久化（这里是本地目录，systemd 方案下天然持久） |
| 端口冲突 | `ss -tln | grep 8787` → 改 systemd 里的 `Environment=PORT=` |
