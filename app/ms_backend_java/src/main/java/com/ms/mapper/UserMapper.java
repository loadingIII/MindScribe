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
    /** 按邮箱查询处于 active 状态的用户。 */
    @Select("SELECT id, username, email, password_hash AS passwordHash, display_name AS displayName, role "
            + "FROM users WHERE username = #{username} AND status = 'active' LIMIT 1")
    UserLoginEntity findActiveByUsername(@Param("username") String username);

    @Select("SELECT id, username, email, password_hash AS passwordHash, display_name AS displayName, role "
            + "FROM users WHERE email = #{email} AND status = 'active' LIMIT 1")
    UserLoginEntity findActiveByEmail(@Param("email") String email);

    /** 统计指定邮箱的注册数量。 */
    @Select("SELECT COUNT(1) FROM users WHERE email = #{email}")
    int countByEmail(@Param("email") String email);

    /** 插入新的邮箱用户记录。 */
    @org.apache.ibatis.annotations.Insert("INSERT INTO users (id, username, email, password_hash, display_name, role, status, credit_balance) "
            + "VALUES (#{id}, #{username}, #{email}, #{passwordHash}, #{displayName}, 'user', 'active', 300)")
    int insertUser(@Param("id") String id, @Param("username") String username, @Param("email") String email,
                   @Param("passwordHash") String passwordHash, @Param("displayName") String displayName);

    /** 记录最近登录时间。 */
    @Update("UPDATE users SET last_login_at = CURRENT_TIMESTAMP(3) WHERE id = #{userId}")
    int updateLastLogin(@Param("userId") String userId);
}
