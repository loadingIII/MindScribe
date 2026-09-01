# MindScribe

MindScribe 是一个面向创作与知识整理的全栈应用，当前包含 React Web 前端、Spring Boot 业务后端，以及用于图片生成的 FastAPI 推理服务。项目仍在持续开发中，部分页面和接口使用模拟数据。

## 项目结构

```text
MindScribe/
├─ app/
│  ├─ ms_app_react/       # React + Vite Web 应用
│  └─ ms_backend_java/    # Spring Boot + MyBatis 业务后端
├─ infers/
│  └─ gen_img_v1_py/      # FastAPI 图片生成服务及离线测试
├─ exp/                    # 图片生成相关实验与早期原型
├─ libs/store/             # 阿里云 OSS 公共存储模块
├─ deploys/                # 部署脚本与配置
└─ scripts/                # 开发和运维工具脚本
```

## 技术栈

- 前端：React、Vite、React Router、GSAP、Lucide React
- 业务服务：Java 17、Spring Boot、MyBatis、MySQL
- 图片生成：Python、FastAPI、OpenAI SDK、阿里云 OSS

## 快速开始

### 启动 Web 前端

```powershell
cd app/ms_app_react
npm install
npm run dev
```

开发服务器启动后，按终端提示打开对应地址。生产构建可使用 `npm run build`，本地预览使用 `npm run preview`。

### 启动 Java 后端

请先准备 MySQL 数据库，并根据环境设置 `MYSQL_URL`、`MYSQL_USERNAME`、`MYSQL_PASSWORD` 等变量。然后执行：

```powershell
cd app/ms_backend_java
mvn spring-boot:run
```

后端默认从 `src/main/resources/application.yml` 读取配置，并通过 `IMAGE_GENERATION_BASE_URL` 与 `IMAGE_GENERATION_PORT` 连接本地图片生成服务。

### 启动图片生成服务

在仓库根目录安装依赖后运行：

```powershell
pip install -r infers/gen_img_v1_py/requirements.txt
uvicorn infers.gen_img_v1_py.app:app --reload --port 8000
```

服务提供 `POST /generate` 创建任务，以及 `GET /tasks/{task_id}` 查询任务状态。调用真实模型和 OSS 前，请配置相应的 OpenAI、MySQL、OSS 环境变量；不要将密钥写入版本库。

## 测试

Python 测试使用离线替身模拟 OpenAI 和 OSS 调用，在仓库根目录执行：

```powershell
pytest
```

前端当前以构建检查为主：

```powershell
cd app/ms_app_react
npm run build
```

Java 测试可在 `app/ms_backend_java` 目录执行 `mvn test`。

## 配置说明

- OSS 配置模板：[`libs/store/config.yml.example`](libs/store/config.yml.example)
- Java 服务配置：[`app/ms_backend_java/src/main/resources/application.yml`](app/ms_backend_java/src/main/resources/application.yml)
- 各 Python 原型目录中的 `config.yml.example` 可作为本地配置参考。

请使用本地未跟踪的配置文件或系统环境变量保存凭据，并确认 `.gitignore` 已覆盖本地输出和敏感配置。

## 开发约定

- JavaScript/JSX 使用两个空格缩进并保留分号；组件文件使用 PascalCase。
- Python 使用四个空格缩进，模块和函数使用 snake_case，类使用 PascalCase。
- 提交信息使用简洁的约定式前缀，例如 `feat:`、`fix:`、`refactor:`、`build:` 和 `docs:`。

## 项目分支

- `main`：主开发分支。
- `feat/`：功能分支，用于开发新功能或修复问题。
- `fix/`：修复分支，用于修复已知问题。
- `dev/`：开发分支，用于集成新功能和修复。
- `target/`：表示目标分支，用于某一个阶段的分支合并。
- `codex/`：借助 Codex 生成的代码分支，用于快速原型开发。
## 相关文档

- [`app/README.md`](app/README.md)
- [`infers/README.md`](infers/README.md)
- [`libs/README.md`](libs/README.md)
- [`deploys/README.md`](deploys/README.md)
- [`scripts/README.md`](scripts/README.md)
