package com.ms.service;

import java.util.Map;

/** 个人中心聚合信息：创作统计、常用配置与最近作品。 */
public interface ProfileService {
    /**
     * 汇总当前用户的创作统计与最近作品。
     *
     * @param userId      用户 ID（从 JWT 取）
     * @param gallerySize 作品墙数量（服务层会做范围收敛）
     * @return stats / preferences / gallery 三段结构
     */
    Map<String, Object> summary(String userId, Integer gallerySize);
}
