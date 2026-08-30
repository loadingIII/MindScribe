package com.ms.mapper;

import com.ms.pojo.entity.UserLoginEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/** 用户表数据访问层。简单 SQL 直接使用 MyBatis 注解维护。 */
@Mapper
public interface UserMapper {
    /** 查询处于 active 状态的用户。 */
    @Select("SELECT id, username, password_hash AS passwordHash, display_name AS displayName, role "
            + "FROM users WHERE username = #{username} AND status = 'active' LIMIT 1")
    UserLoginEntity findActiveByUsername(@Param("username") String username);

    /** 记录最近登录时间。 */
    @Update("UPDATE users SET last_login_at = CURRENT_TIMESTAMP(3) WHERE id = #{userId}")
    int updateLastLogin(@Param("userId") String userId);
}
