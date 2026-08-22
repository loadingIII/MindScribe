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

from pathlib import Path

import yaml

# 默认配置文件路径：与本文件同目录下的 config.yml
CONFIG_PATH = Path(__file__).resolve().parent / "config.yml"


def load_config(path: str | Path = CONFIG_PATH) -> dict:
    """
    读取 YAML 配置文件并返回配置字典。

    Args:
        path: 配置文件路径，默认为同目录下的 config.yml

    Returns:
        配置信息字典，文件为空时返回空字典
    """
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


# 模块级配置对象，可直接导入使用
config = load_config()
