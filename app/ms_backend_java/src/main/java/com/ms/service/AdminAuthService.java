package com.ms.service;

import com.ms.pojo.vo.LoginVO;

/** 管理端账号登录校验：独立于客户端 users 表。 */
public interface AdminAuthService {
    /** 使用邮箱和密码校验管理员身份；凭据无效时返回 null。 */
    LoginVO loginByEmail(String email, String password);

    /** 判断邮箱是否已被其他管理员占用。 */
    boolean emailExists(String email);

    /** 创建管理员账号（密码经 BCrypt 编码）；role 为 admin/super-admin。 */
    LoginVO createAdmin(String email, String password, String displayName, String role, String remark);
}
