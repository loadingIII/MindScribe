# 多阶段构建：先用 Node 完成前端静态资源构建，再用 Nginx 托管并反代后端 API。
# 构建阶段：Node 22 + Vite 构建（存在 package-lock.json，使用 npm ci 保证依赖一致）。
FROM node:22-alpine AS builder

WORKDIR /build

# 先复制依赖清单并安装，利用 Docker 层缓存加速后续构建。
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# 再复制源码并执行生产构建，产物位于 dist/ 目录。
COPY . .
RUN npm run build

# 运行阶段：使用轻量 Nginx 托管静态资源。
FROM nginx:alpine

# 移除默认站点配置，复制自定义配置（含 /gen_imgs、/auth、/ai 反向代理）。
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/app.conf

# 复制构建产物。
COPY --from=builder /build/dist /usr/share/nginx/html

EXPOSE 80
