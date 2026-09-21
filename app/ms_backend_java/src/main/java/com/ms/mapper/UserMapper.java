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

    /** 按用户 ID 查询 active 用户，用于个人中心读取昵称等基础信息。 */
    @Select("SELECT id, username, email, password_hash AS passwordHash, display_name AS displayName, role "
            + "FROM users WHERE id = #{userId} AND status = 'active' LIMIT 1")
    UserLoginEntity findActiveById(@Param("userId") String userId);

    /** 更新用户昵称（display_name）；影响行数为 0 表示用户不存在或被禁用。 */
    @Update("UPDATE users SET display_name = #{displayName} WHERE id = #{userId} AND status = 'active'")
    int updateDisplayName(@Param("userId") String userId, @Param("displayName") String displayName);

    /** 查询用户头像地址；未设置时返回 null。 */
    @Select("SELECT avatar_url FROM users WHERE id = #{userId} AND status = 'active'")
    String findAvatarUrl(@Param("userId") String userId);

    /** 更新用户头像地址（OSS 上的稳定对象 URL）。 */
    @Update("UPDATE users SET avatar_url = #{avatarUrl} WHERE id = #{userId} AND status = 'active'")
    int updateAvatarUrl(@Param("userId") String userId, @Param("avatarUrl") String avatarUrl);

    /** 统计指定邮箱的注册数量。 */
    @Select("SELECT COUNT(1) FROM users WHERE email = #{email}")
    int countByEmail(@Param("email") String email);

    /** 插入新的邮箱用户记录；新用户默认赠送 100 积分。 */
    @org.apache.ibatis.annotations.Insert("INSERT INTO users (id, username, email, password_hash, display_name, role, status, credit_balance) "
            + "VALUES (#{id}, #{username}, #{email}, #{passwordHash}, #{displayName}, 'user', 'active', 100)")
    int insertUser(@Param("id") String id, @Param("username") String username, @Param("email") String email,
                   @Param("passwordHash") String passwordHash, @Param("displayName") String displayName);

    /** 记录最近登录时间。 */
    @Update("UPDATE users SET last_login_at = CURRENT_TIMESTAMP(3) WHERE id = #{userId}")
    int updateLastLogin(@Param("userId") String userId);

    /** 管理端用户列表：keyword 模糊匹配用户名/邮箱，返回余额字段，按注册时间倒序。 */
    @Select("""
            <script>
            SELECT id, username, email, display_name AS displayName, role, status,
                   credit_balance AS creditBalance, created_at AS createdAt, last_login_at AS lastLoginAt
            FROM users
            <where>
                <if test="keyword != null">
                    AND (username LIKE #{keyword} OR email LIKE #{keyword})
                </if>
            </where>
            ORDER BY created_at DESC
            LIMIT #{limit} OFFSET #{offset}
            </script>
            """)
    java.util.List<java.util.Map<String, Object>> findUsersForAdmin(@Param("keyword") String keyword,
                                                                    @Param("limit") int limit,
                                                                    @Param("offset") int offset);

    /** 管理端用户总数：条件与 findUsersForAdmin 保持一致。 */
    @Select("""
            <script>
            SELECT COUNT(*)
            FROM users
            <where>
                <if test="keyword != null">
                    AND (username LIKE #{keyword} OR email LIKE #{keyword})
                </if>
            </where>
            </script>
            """)
    long countUsersForAdmin(@Param("keyword") String keyword);

    /** 查询全部管理员（admin/super-admin），供管理端管理员列表展示。 */
    @Select("""
            SELECT id, username, email, display_name AS displayName, role, status,
                   created_at AS createdAt, last_login_at AS lastLoginAt
            FROM users
            WHERE role IN ('admin', 'super-admin')
            ORDER BY created_at DESC
            """)
    java.util.List<java.util.Map<String, Object>> findAdmins();

    /** 按 role IN 查询是否存在；用于保护最后一个 super-admin 不被降级。 */
    @Select("SELECT COUNT(*) FROM users WHERE role = #{role} AND status = 'active'")
    long countByRole(@Param("role") String role);

    /* 已删除无人调用的 updateRole：users 表角色变更只能走 admin_users 管理链路，
       避免误接出客户端可触达的提权入口。 */

    /** 创建管理员账号：role 由调用方传入（admin/super-admin），状态直接 active。 */
    @org.apache.ibatis.annotations.Insert("INSERT INTO users (id, username, email, password_hash, display_name, role, status, credit_balance) "
            + "VALUES (#{id}, #{email}, #{email}, #{passwordHash}, #{displayName}, #{role}, 'active', 0)")
    int insertAdmin(@Param("id") String id, @Param("email") String email, @Param("passwordHash") String passwordHash,
                    @Param("displayName") String displayName, @Param("role") String role);
}
