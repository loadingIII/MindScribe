# 仓库协作指南

## 项目结构与模块组织

- `app/ms_app_react/` 是主要的 React/Vite Web 应用。页面位于 `src/pages/`，可复用组件位于 `src/components/`，共享状态位于 `src/store/`，模拟数据和 API 适配器位于 `src/apis/`。
- `exp/gen_img_frontend_demo/` 是用于探索的图片生成前端 Demo。
- `infers/gen_img_v1_py/` 包含 FastAPI 图片生成服务、数据模型、提示词映射、存储集成及其测试。
- `exp/gen_img_demo/` 包含较早的 Python 服务原型；`libs/store/` 提供共享的 OSS 客户端及测试。
- `deploys/` 和 `scripts/` 存放部署及运维相关内容。不要将密钥提交到版本库；请使用项目提供的 `config.yml.example` 文件作为配置模板。

## 构建、测试与开发命令

请在对应的前端包目录中运行命令：

```powershell
cd app/ms_app_react; npm install; npm run dev
cd app/ms_app_react; npm run build
cd exp/gen_img_frontend_demo; npm run dev
```

`npm run dev` 启动 Vite 开发服务器；`npm run build` 创建生产构建产物；`npm run preview` 在本地预览构建产物。运行 Python 测试时，请在仓库根目录执行 `pytest`；使用 `pip install -r infers/gen_img_v1_py/requirements.txt` 安装服务依赖，开发存储模块时还需安装 `libs/store/requirements.txt`。

## 编码风格与命名约定

Python 使用四个空格缩进，JavaScript/JSX 使用两个空格缩进。遵循项目现有的 ESLint-free 风格：JSX/JavaScript 使用分号，组件保持单一职责，组件文件名使用 PascalCase（例如 `CommunityPage.jsx`）。Python 模块和函数使用 snake_case，Python 类使用 PascalCase。用户可见的中文文案应与现有语言文件保持一致。

## 测试规范

Python 测试使用 `pytest` 和 FastAPI 的 `TestClient`；测试文件命名为 `test_*.py`，测试函数命名为 `test_*`。测试应保持离线，通过 mock OpenAI/OSS 调用避免访问外部服务。修改参数校验、任务状态流转或存储逻辑时，应补充回归测试。当前前端包只提供构建检查，尚未配置自动化 UI 测试套件。

## 提交与 Pull Request 规范

Git 历史使用简洁的约定式前缀，例如 `feat:`、`build:`、`refactor:`、`chore:` 和 `docs:`，也可以添加作用域（如 `feat(gen_img_v1): ...`）。每个提交应保持单一目的，并说明用户可见或模块级别的变更。Pull Request 应说明变更范围和验证命令；如有对应 Issue 请附上链接；涉及配置时请特别注明；涉及 UI 变更时请附截图或简短录屏。

## 安全与配置提示

不要提交 API 密钥、OSS 凭证、生成的图片或本地输出目录。请将 YAML 配置示例复制为本地且被 Git 忽略的配置文件，启动服务前确认所需环境变量已经设置，并避免记录提示词、凭证或签名 URL。

## 项目可读性与注释
- 所有代码都应包含必要的注释，包括函数、类、模块等。
- 注释应简洁明了，避免使用专业术语或复杂的逻辑。
- 注释应与代码保持同步，及时更新。
