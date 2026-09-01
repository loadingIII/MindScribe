"""
配置读取工具：从 gen_img_demo/config.yml 加载配置信息。

用法：
    from config import config, load_config

    # 直接使用模块级配置字典
    print(config["base_url"])
    print(config["vision"]["model"])

    # 或手动指定路径重新加载
    cfg = load_config("path/to/config.yml")
"""

import os
import re
from pathlib import Path

import yaml

# 默认配置文件路径：与本文件同目录下的 config.yml
CONFIG_PATH = Path(__file__).resolve().parent / "config.yml"
ENV_PATH = Path(__file__).resolve().parent / ".env"
ENVIRONMENT_VARIABLE_PATTERN = re.compile(r"^\$\{([A-Z][A-Z0-9_]*)\}$")


def load_env(path: str | Path = ENV_PATH) -> None:
    """读取本地 .env 文件，不覆盖已设置的进程环境变量。"""
    env_path = Path(path)
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        value = line.strip()
        if not value or value.startswith("#") or "=" not in value:
            continue
        name, content = value.split("=", 1)
        name = name.strip()
        content = content.strip().strip('\"').strip("'")
        if name:
            os.environ.setdefault(name, content)


def load_config(path: str | Path = CONFIG_PATH) -> dict:
    """
    读取 YAML 配置文件并返回配置字典。

    Args:
        path: 配置文件路径，默认为同目录下的 config.yml

    Returns:
        配置信息字典，文件为空时返回空字典
    """
    with open(path, "r", encoding="utf-8") as f:
        raw_config = yaml.safe_load(f) or {}
    return _resolve_environment_variables(raw_config)


def _resolve_environment_variables(value: object) -> object:
    """递归替换 YAML 中格式为 ${VARIABLE_NAME} 的环境变量占位符。"""
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


# 加载同目录的本地密钥配置，再读取非敏感 YAML 配置。
load_env()

# 模块级配置对象，可直接导入使用
config = load_config()
