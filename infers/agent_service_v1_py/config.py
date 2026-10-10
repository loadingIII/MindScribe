"""智能体服务配置：复用 gen_img_v1_py 的 config.yml 加载约定。

- 非敏感配置写在同目录 config.yml（含 config.yml.example 模板）
- 敏感的 api_key 通过 ${AGENT_API_KEY} 占位符从 .env / 环境变量注入
"""

import os
import re
from pathlib import Path

import yaml

# 默认配置文件路径：与本文件同目录下的 config.yml
CONFIG_PATH = Path(__file__).resolve().parent / "config.yml"
ENV_PATH = Path(__file__).resolve().parent / ".env"
# ${ENV_VAR} 形式的占位符
ENVIRONMENT_VARIABLE_PATTERN = re.compile(r"^\$\{([A-Z][A-Z0-9_]*)\}$")


def load_env(path: str | Path = ENV_PATH) -> None:
    """读取本地 .env 文件，不覆盖已设置的进程环境变量。"""
    env_path = Path(path)
    if not env_path.exists():
        return

    # .env 为可选配置，读取失败时静默跳过，避免阻断服务启动
    try:
        lines = env_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    for line in lines:
        value = line.strip()
        if not value or value.startswith("#") or "=" not in value:
            continue
        name, content = value.split("=", 1)
        name = name.strip()
        content = content.strip().strip('"').strip("'")
        if name:
            os.environ.setdefault(name, content)


def _resolve_environment_variables(value: object) -> object:
    """递归解析配置中的 ${ENV_VAR} 占位符。

    缺失的环境变量直接抛错，让配置问题在启动阶段暴露。
    """
    if isinstance(value, dict):
        return {key: _resolve_environment_variables(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_resolve_environment_variables(item) for item in value]
    if not isinstance(value, str):
        return value

    match = ENVIRONMENT_VARIABLE_PATTERN.fullmatch(value)
    if not match:
        return value

    variable_name = match.group(1)
    environment_value = os.getenv(variable_name)
    if environment_value is None:
        raise ValueError(f"config.yml 缺少环境变量：{variable_name}")
    return environment_value


def load_config(path: str | Path = CONFIG_PATH) -> dict:
    """读取 YAML 配置文件并返回解析后的配置字典。"""
    with open(path, "r", encoding="utf-8") as f:
        raw_config = yaml.safe_load(f) or {}
    return _resolve_environment_variables(raw_config)


# 加载同目录的本地密钥配置，再读取 YAML 配置
load_env()

# 模块级配置对象，可直接导入使用
config = load_config()
