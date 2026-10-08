package com.ms.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/** 个人中心聚合查询：创作统计、常用配置与最近作品；attempts 无 user_id，一律 JOIN threads 归属。 */
@Mapper
public interface ProfileMapper {

    /** 创作统计：attempt 总数、成功数、失败数、成功任务的申请张数合计。 */
    Map<String, Object> selectCreationStats(@Param("userId") String userId);

    /** 本月消耗算力：consume 流水负增量绝对值合计，按服务器本地时区自然月。 */
    Long selectMonthConsumed(@Param("userId") String userId,
                             @Param("monthStart") String monthStart);

    /** 常用配置：成功 attempt 中模型/尺寸/模式的众数组合。 */
    Map<String, Object> selectPreferredConfig(@Param("userId") String userId);

    /** 最近成功作品：只取带结果的 attempt 行，results JSON 由服务层解析出图片地址。 */
    List<Map<String, Object>> selectRecentWorks(@Param("userId") String userId,
                                                @Param("limit") int limit);
}
