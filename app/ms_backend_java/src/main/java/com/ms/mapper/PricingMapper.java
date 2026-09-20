package com.ms.mapper;

import com.ms.pojo.entity.PricingRuleEntity;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/** 计价规则持久化；写入口只允许 /admin 接口，业务链路只调用查询方法。 */
@Mapper
public interface PricingMapper {
    String RULE_COLUMNS = "id, action, model, base_cost AS baseCost, img2img_cost AS img2imgCost, "
            + "size_multipliers AS sizeMultipliers, quality_multipliers AS qualityMultipliers, "
            + "is_active AS isActive, remark, created_at AS createdAt, updated_at AS updatedAt";

    /** 查询全部生效规则，供 PricingService 全量加载缓存。 */
    @Select("SELECT " + RULE_COLUMNS + " FROM credit_pricing_rules WHERE is_active = 1")
    List<PricingRuleEntity> findActiveRules();

    /** 查询全部规则（含停用），管理端列表使用。 */
    @Select("SELECT " + RULE_COLUMNS + " FROM credit_pricing_rules ORDER BY action, model")
    List<PricingRuleEntity> findAllRules();

    /** 按主键查询规则，管理端编辑回显使用。 */
    @Select("SELECT " + RULE_COLUMNS + " FROM credit_pricing_rules WHERE id = #{id}")
    PricingRuleEntity findRule(@Param("id") String id);

    /** 新建规则；action+model 唯一键冲突时抛异常。 */
    @Insert("""
            INSERT INTO credit_pricing_rules (id, action, model, base_cost, img2img_cost,
                                              size_multipliers, quality_multipliers, is_active, remark)
            VALUES (#{id}, #{action}, #{model}, #{baseCost}, #{img2imgCost},
                    #{sizeMultipliers}, #{qualityMultipliers}, #{isActive}, #{remark})
            """)
    int insertRule(PricingRuleEntity rule);

    /** 按主键整条更新，字段在 XML 中动态拼接。 */
    int updateRule(PricingRuleEntity rule);

    /** 停用规则：仅置 is_active=0，不物理删除。 */
    @Update("UPDATE credit_pricing_rules SET is_active = 0 WHERE id = #{id}")
    int deactivateRule(@Param("id") String id);
}
