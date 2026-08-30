package com.ms.utils;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** 统一创建日志记录器，避免业务类重复编写初始化代码。 */
public final class LogUtil {
    private LogUtil() {
    }

    /** 为指定类型创建日志记录器。 */
    public static Logger getLogger(Class<?> type) {
        return LoggerFactory.getLogger(type);
    }
}
