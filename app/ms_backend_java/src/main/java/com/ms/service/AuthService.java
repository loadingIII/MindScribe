package com.ms.service;

import com.ms.pojo.dto.LoginRequest;
import com.ms.pojo.vo.LoginVO;

/** 提供用户登录校验能力。 */
public interface AuthService {
    /** 校验登录凭据；凭据无效时返回 null。 */
    LoginVO login(LoginRequest request);
}
