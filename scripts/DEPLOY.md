# MindScribe 部署文档（ms 服务器）

> 本文档面向后续执行部署的人（或 AI 会话）。按照本文档可以从零完成一次增量部署或全量部署。
> 最后验证时间：2026-10-09，当时分支 `feat/admin-v1`（1e03ae1）部署成功。

## 1. 目标服务器

| 项目 | 值 |
| --- | --- |
| SSH 别名 | `ms`（本机 `~/.ssh/config` 中已配置） |
| 实际地址 | ubuntu@129.204.50.138（腾讯云，2 核 2G 低内存机器） |
| 部署目录 | `~/mindsrcibe/`（注意：目录名拼写就是 `mindsrcibe`，少一个 i，历史遗留，不要"纠正"） |
| 编排文件 | `~/mindsrcibe/docker-compose.yml`（低内存版，含 mem_limit 与 admin 服务） |
| 环境变量 | `~/mindsrcibe/.env`（服务器专属，与本地 `scripts/.env` 端口映射不同，**禁止用本地覆盖**） |

服务器主机端口映射（由服务器 `.env` 决定，可能与本地 example 默认值不同）：

| 服务 | 容器名 | 主机端口 → 容器端口 |
| --- | --- | --- |
| frontend（主前端） | mindscribe-frontend | 8081 → 80 |
| admin（管理端前端） | mindscribe-admin | 5000 → 80 |
| backend（Java API） | mindscribe-backend | 8080 → 8080 |
| infer（FastAPI 生图） | mindscribe-infer | 8000 → 8000 |
| mysql | mindscribe-mysql | 3307 → 3306 |
| redis | mindscribe-redis | 6379 → 6379 |

## 2. 核心原则：本地构建，服务器只 load + up

2 核 2G 的服务器**绝对不要执行 `docker compose build`**：Java 的 Maven 构建和 Vite 构建的内存峰值都超过 1G，会触发 OOM killer 拖垮 MySQL。

正确流程是：本地构建镜像 → `docker save` 导出 tar → `scp` 上传 → 服务器 `docker load` → `docker compose up -d` 滚动重建。

`docker load` 会把同名 `:latest` 旧镜像顶成悬空镜像，`up -d` 检测到镜像 ID 变化后会自动重建容器，无需先 `rm` 或 `stop`。

## 3. 增量部署（日常更新，最常用）

### 第 1 步：判断哪些服务需要重建

用 git log 对比"模块最后提交时间"与"服务器镜像构建时间"（`ssh ms "docker images --format '{{.Repository}} {{.CreatedAt}}'"`），晚于镜像构建时间的提交才算未部署。模块与服务对应关系：

| 代码路径变更 | 需重建的服务 |
| --- | --- |
| `app/ms_backend_java/` | backend |
| `app/ms_app_react/` | frontend |
| `app/ms_admin_web_react/` | admin |
| `infers/gen_img_v1_py/`（排除 config.yml）或 `libs/` | infer |
| `scripts/sql/mindscribe.sql` | 见第 6 节"数据库变更" |
| `scripts/docker-compose.yml*`、`scripts/.env.example` | 手动同步差异到服务器 `~/mindsrcibe/` 对应文件 |

注意：`infers/gen_img_v1_py/config.yml` 里 `vision.model` 用的 `${GEN_IMG_MODEL}` 占位符，服务器 `.env` 未必有这个变量；若仅为该文件变更，优先直接改服务器配置而不是重建 infer 镜像。

### 第 2 步：本地构建镜像

在 `scripts/` 目录执行。**必须用 `docker-compose.yml.example`**，因为本地 `docker-compose.yml` 是开发编排、不含 admin 服务：

```bash
cd scripts
docker compose -f docker-compose.yml.example build backend frontend admin
# 只重建需要的服务即可；全部重建也没问题，只是 tar 更大、传输更久
```

构建配置变更类提交（Dockerfile、nginx.conf、package.json）时，即使应用源码没变也要重建对应服务。

### 第 3 步：导出、上传、导入

```bash
# 导出（文件名带上日期便于识别）
docker save mindscribe/backend:latest mindscribe/frontend:latest mindscribe/admin:latest \
  -o mindscribe-update-YYYYMMDD.tar

# 上传（186M 左右，视包含的服务数量）
scp mindscribe-update-YYYYMMDD.tar ms:~/mindsrcibe/

# 服务器导入
ssh ms "cd ~/mindsrcibe && docker load -i mindscribe-update-YYYYMMDD.tar"
```

### 第 4 步：滚动更新容器

```bash
ssh ms "cd ~/mindsrcibe && docker compose up -d backend frontend admin"
# 服务列表与第 1 步判断的结果一致即可，不必照抄
```

backend 依赖 mysql/redis/infer 的 healthcheck，启动约需 10~40 秒。

### 第 5 步：验证

```bash
ssh ms "docker ps --format 'table {{.Names}}\t{{.Status}}'"
# 六个容器都应 Up；mysql/redis/infer 应带 (healthy)

ssh ms "docker logs mindscribe-backend --tail 20 2>&1 | grep -E 'Started|ERROR'"
# 应看到 "Started MsBackendJavaApplication"，时间戳应为 +08:00（时区修复已内置）

# HTTP 探活（在服务器本机 curl）
ssh ms "curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8081/"  # frontend，期望 200
ssh ms "curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5000/"  # admin，期望 200
ssh ms "curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8000/openapi.json"  # infer，期望 200
# backend 直接 curl 业务接口未带凭证返回 401 属正常，说明服务活着
```

### 第 6 步：清理（验证通过后再做）

```bash
# 本地与服务器各删掉本次的 tar 包
rm mindscribe-update-YYYYMMDD.tar
ssh ms "rm ~/mindsrcibe/mindscribe-update-YYYYMMDD.tar"

# 回收被顶掉的旧镜像层
ssh ms "docker image prune -f"
```

**回滚代价提示**：旧镜像被 prune 后无法直接回滚，只能 checkout 到旧提交重新走一遍构建流程。所以 prune 前请确认新版本运行正常。

## 4. 全量部署（新服务器或重装）

```bash
# 1. 服务器装 Docker（略，参考 Docker 官方 Ubuntu 文档）
# 2. 上传编排与配置
scp scripts/docker-compose.yml.example ms:~/mindsrcibe/docker-compose.yml
scp scripts/.env.example ms:~/mindsrcibe/.env   # 然后SSH上去填写真实值
# sql 目录在服务器上归 root 所有，先传到家目录再挪进去
scp scripts/sql/mindscribe.sql ms:~/mindscribe.sql
ssh ms "sudo mkdir -p ~/mindsrcibe/sql && sudo mv ~/mindscribe.sql ~/mindsrcibe/sql/"
# 3. 本地构建全部镜像并导出（含 infer）
cd scripts
docker compose -f docker-compose.yml.example build
docker save mindscribe/backend:latest mindscribe/frontend:latest \
  mindscribe/admin:latest mindscribe/gen-img:latest -o mindscribe-images-full.tar
# 4. 上传、load、up -d（MySQL 空数据卷时自动导入 sql/mindscribe.sql）
```

低内存机器建议先挂 2G swap 兜底：

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile \
  && sudo mkswap /swapfile && sudo swapon /swapfile
```

## 5. 数据库变更

- MySQL 数据卷 `mysql-data` **只在第一次空卷启动时**导入 `sql/mindscribe.sql`，之后更新该文件不会生效。
- 已运行环境的表结构变更：把 SQL 传到服务器后手动执行：

```bash
scp scripts/sql/xxx.sql ms:~/mindsrcibe/
ssh ms "docker exec -i mindscribe-mysql mysql -uroot -p\${MYSQL_ROOT_PASSWORD} <database> < ~/mindsrcibe/xxx.sql"
# 密码从服务器 ~/mindsrcibe/.env 读取，不要写进命令历史或文档
```

## 6. 常见坑（历史踩过的）

1. **容器时区**：服务器 compose 里 backend 已设 `TZ: Asia/Shanghai`，漏掉会导致 `LocalDateTime.now()` 慢 8 小时（验证码过期时间等）。新的编排文件务必保留。
2. **本地与服务器 compose 不同步**：本地 `docker-compose.yml` 是开发版（无 admin、无 mem_limit），服务器用的是 example 改造的低内存版。改编排时先改 `docker-compose.yml.example`，再手动把差异同步到服务器 `~/mindsrcibe/docker-compose.yml`。
3. **不要覆盖服务器 `.env`**：两边的端口映射不同（如服务器 MySQL 用 3307、admin 用 5000）。
4. **infer 的 `GEN_IMG_MODEL`**：config.yml 的 vision.model 已改为环境变量占位符，服务器 `.env` 若未配置该变量，重建 infer 镜像后 Vision 功能可能失败。
5. **目录拼写**：服务器部署目录是 `~/mindsrcibe`（少个 i），写脚本时别顺手改成 `mindscribe`。

## 7. 常用运维命令速查

```bash
ssh ms "cd ~/mindsrcibe && docker compose logs -f backend"     # 跟踪某服务日志
ssh ms "cd ~/mindsrcibe && docker compose restart backend"     # 重启某服务
ssh ms "cd ~/mindsrcibe && docker compose ps"                  # compose 视角的状态
ssh ms "docker stats --no-stream"                              # 内存占用（2G 机器重点关注）
ssh ms "docker exec -it mindscribe-mysql mysql -uroot -p"      # 进数据库
```
