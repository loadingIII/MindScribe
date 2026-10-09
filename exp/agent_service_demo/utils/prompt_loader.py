"""
提示词加载工具模块。

用于从 md 文件中加载提示词，支持缓存、变量替换等功能，
避免每次调用都重复读取磁盘文件。
"""

import os
from functools import lru_cache

# 提示词文件所在的默认目录：agent 模块下的 prompts 文件夹
DEFAULT_PROMPTS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "agent",
    "prompts",
)


class PromptLoader:
    """
    提示词加载器。

    负责读取 md 格式的提示词文件，并提供缓存与变量替换能力。

    使用示例:
        loader = PromptLoader()
        prompt = loader.load("chat_system", user_name="小明")
    """

    def __init__(self, prompts_dir: str = None):
        """
        初始化加载器。

        :param prompts_dir: 提示词文件所在目录，
                            不传时使用项目下的 prompts 目录
        """
        if prompts_dir is None:
            prompts_dir = DEFAULT_PROMPTS_DIR
        # 提示词目录
        self.prompts_dir = prompts_dir
        # 缓存字典，key 为提示词名称，value 为文件内容
        self._cache = {}

    def load(self, name: str, **variables) -> str:
        """
        加载指定名称的提示词。

        :param name: 提示词名称，对应 prompts 目录下的文件名（不含 .md 后缀）
        :param variables: 可选的模板变量，会替换内容中的 {变量名} 占位符
        :return: 提示词文本内容
        :raises FileNotFoundError: 提示词文件不存在时抛出
        """
        # 优先从缓存读取，避免重复读磁盘
        if name not in self._cache:
            self._cache[name] = self._read_file(name)

        content = self._cache[name]

        # 如果传入了变量，则进行占位符替换
        if variables:
            content = content.format(**variables)

        return content

    def reload(self, name: str = None) -> None:
        """
        重新加载提示词，用于开发阶段修改文件后刷新缓存。

        :param name: 指定要刷新的提示词名称，不传时清空全部缓存
        """
        if name is None:
            # 清空全部缓存
            self._cache.clear()
        else:
            # 仅移除指定提示词的缓存
            self._cache.pop(name, None)

    def _read_file(self, name: str) -> str:
        """
        从磁盘读取提示词文件。

        :param name: 提示词名称
        :return: 文件文本内容
        :raises FileNotFoundError: 文件不存在时抛出
        """
        # 拼接完整的文件路径
        file_path = os.path.join(self.prompts_dir, f"{name}.md")

        # 文件不存在时给出更清晰的错误信息
        if not os.path.isfile(file_path):
            raise FileNotFoundError(
                f"提示词文件不存在: {file_path}"
            )

        # 以 UTF-8 编码读取，避免中文乱码
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()


@lru_cache(maxsize=None)
def get_prompt_loader() -> PromptLoader:
    """
    获取全局共享的 PromptLoader 实例。

    使用 lru_cache 保证整个进程只创建一次，
    各模块可以共用同一份缓存。

    :return: 全局 PromptLoader 实例
    """
    return PromptLoader()

if __name__ == "__main__":
    # 测试代码，直接运行此文件时会执行
    loader = get_prompt_loader()
    try:
        prompt = loader.load("chat_system", user_name="小明")
        print(prompt)
    except FileNotFoundError as e:
        print(e)
