package com.ms.mapper;

import com.ms.pojo.entity.PromptTemplateEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

/** 提示词模板、收藏和使用记录的数据访问接口；SQL 定义在同名 XML 映射文件中。 */
@Mapper
public interface PromptTemplateMapper {

    /** 按 id 读取未删除的模板。 */
    PromptTemplateEntity findById(@Param("id") String id);

    /** 分页查询当前用户可见的模板，支持来源、分类与关键词过滤。 */
    List<PromptTemplateEntity> findVisible(@Param("userId") String userId, @Param("source") String source,
                                           @Param("category") String category, @Param("keyword") String keyword,
                                           @Param("limit") int limit, @Param("offset") int offset);

    /** 按 id 读取当前用户拥有的模板，用于修改前的权限校验。 */
    PromptTemplateEntity findOwned(@Param("userId") String userId, @Param("id") String id);

    /** 新建模板。 */
    int insert(PromptTemplateEntity template);

    /** 部分更新模板：实体中为 null 的字段不会被写入，保持数据库原值。 */
    int update(PromptTemplateEntity template);

    /** 只更新封面地址；用于封面上传后的定点覆盖。 */
    int updateCover(@Param("id") String id, @Param("userId") String userId, @Param("coverUrl") String coverUrl);

    /** 软删除模板并归档。 */
    int softDelete(@Param("id") String id, @Param("userId") String userId);

    /** 判断用户是否已收藏某模板。 */
    boolean isFavorite(@Param("userId") String userId, @Param("templateId") String templateId);

    /** 新增收藏；重复收藏会被忽略。 */
    int addFavorite(@Param("userId") String userId, @Param("templateId") String templateId);

    /** 取消收藏。 */
    int removeFavorite(@Param("userId") String userId, @Param("templateId") String templateId);

    /** 调整收藏计数，GREATEST 保证不为负。 */
    int changeFavoriteCount(@Param("templateId") String templateId, @Param("delta") int delta);

    /** 使用次数加一。 */
    int increaseUsage(@Param("templateId") String templateId);

    /** 记录一次模板使用，用于最近使用与审计。 */
    int insertUsage(@Param("id") String id, @Param("userId") String userId, @Param("templateId") String templateId, @Param("renderedPrompt") String renderedPrompt);
}
