package com.ms.service;

import com.ms.pojo.dto.LoginRequest;
import com.ms.pojo.vo.LoginVO;
import com.ms.pojo.dto.RegisterRequest;

/** 提供用户登录校验能力。 */
public interface AuthService {
    /** 校验登录凭据；凭据无效时返回 null。 */
    LoginVO login(LoginRequest request);
    /** 使用邮箱和密码完成登录校验。 */
    LoginVO loginByEmail(String email, String password);
    /** 创建邮箱用户并返回登录信息。 */
    LoginVO register(RegisterRequest request);
    /** 判断邮箱是否已被注册。 */
    boolean emailExists(String email);
}
