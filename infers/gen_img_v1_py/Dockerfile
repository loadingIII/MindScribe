# 图片生成 FastAPI 服务镜像（构建上下文为 gen_img_v1_py 目录本身）。
# 基础镜像：Python 3.13 slim（与本地 Anaconda 环境 MindScribe(Python 3.13) 保持一致）。
FROM python:3.13-slim

# 工作目录等价于仓库根：其下同时存在 infers/ 与 libs/，以兼容
# 相对导入（from .service）、绝对导入（from infers.gen_img_v1_py.xxx）与公共库 libs 的导入。
WORKDIR /app

# 先复制依赖清单并安装，利用 Docker 层缓存加速后续构建。
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# 复制仓库根目录的公共模块 libs（由 compose 以额外构建上下文 libs 引入），
# 供服务内 from libs.redis / from libs.store.service 等导入使用。
COPY --from=libs . ./libs

# 复制服务包到 infers/gen_img_v1_py，保持与仓库一致的包层级（目录名即包名）。
# 注意：.env 已通过 .dockerignore 排除，敏感配置由 docker-compose 环境变量注入。
COPY . ./infers/gen_img_v1_py

# 容器内监听 8000，由 docker-compose 映射到主机端口。
EXPOSE 8000

# 以包形式启动 uvicorn；config.yml 通过同目录占位符从环境变量读取密钥。
CMD ["uvicorn", "infers.gen_img_v1_py.app:app", "--host", "0.0.0.0", "--port", "8000"]
