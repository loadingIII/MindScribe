package com.ms.mapper;

import com.ms.pojo.entity.UserLoginEntity;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;
import java.util.Map;

/** 管理端账号表（admin_users）数据访问层；与客户端 users 表完全独立。 */
@Mapper
public interface AdminUserMapper {
    String ADMIN_COLUMNS = "id, email, password_hash AS passwordHash, display_name AS displayName, role, status";

    /**
     * 按邮箱查询 active 状态的管理员，登录校验使用。
     * 注意：UserLoginEntity 是 record，MyBatis 按"列的返回顺序"填充构造参数，
     * 所以此处列顺序必须与 record 字段顺序一致（id, username, email, passwordHash,
     * displayName, role）；管理端表没有 username 列，用空串占位。
     */
    @Select("SELECT id, '' AS username, email, password_hash AS passwordHash, display_name AS displayName, role "
            + "FROM admin_users WHERE email = #{email} AND status = 'active' LIMIT 1")
    UserLoginEntity findActiveByEmail(@Param("email") String email);

    /** 查询全部管理员账号（含停用），管理端管理员列表使用。 */
    @Select("""
            SELECT id, email, display_name AS displayName, role, status, remark,
                   created_at AS createdAt, last_login_at AS lastLoginAt
            FROM admin_users
            ORDER BY created_at DESC
            """)
    List<Map<String, Object>> findAllAdmins();

    /** 统计 active 状态的 super-admin 数量；用于保护最后一个超级管理员。 */
    @Select("SELECT COUNT(*) FROM admin_users WHERE role = 'super-admin' AND status = 'active'")
    long countActiveSuperAdmins();

    /** 创建管理员账号；role 为 admin/super-admin。 */
    @Insert("""
            INSERT INTO admin_users (id, email, password_hash, display_name, role, status, remark)
            VALUES (#{id}, #{email}, #{passwordHash}, #{displayName}, #{role}, 'active', #{remark})
            """)
    int insertAdmin(@Param("id") String id, @Param("email") String email, @Param("passwordHash") String passwordHash,
                    @Param("displayName") String displayName, @Param("role") String role, @Param("remark") String remark);

    /** 修改指定管理员的角色。 */
    @Update("UPDATE admin_users SET role = #{role} WHERE id = #{id}")
    int updateRole(@Param("id") String id, @Param("role") String role);

    /** 停用/启用管理员账号。 */
    @Update("UPDATE admin_users SET status = #{status} WHERE id = #{id}")
    int updateStatus(@Param("id") String id, @Param("status") String status);

    /** 记录最近登录时间。 */
    @Update("UPDATE admin_users SET last_login_at = CURRENT_TIMESTAMP(3) WHERE id = #{id}")
    int updateLastLogin(@Param("id") String id);
}
