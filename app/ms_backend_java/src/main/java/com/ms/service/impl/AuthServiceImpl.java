package com.ms.service.impl;

import com.ms.mapper.UserMapper;
import com.ms.pojo.dto.LoginRequest;
import com.ms.pojo.vo.LoginVO;
import com.ms.service.AuthService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import com.ms.utils.LogUtil;

/** 登录业务实现：组合用户查询和密码校验，不直接处理 SQL。 */
@Service
public class AuthServiceImpl implements AuthService {
    private static final org.slf4j.Logger log = LogUtil.getLogger(AuthServiceImpl.class);
    private final UserMapper userMapper;
    private final BCryptPasswordEncoder passwordEncoder;

    public AuthServiceImpl(UserMapper userMapper) {
        this.userMapper = userMapper;
        this.passwordEncoder = new BCryptPasswordEncoder();
    }

    @Override
    public LoginVO login(LoginRequest request) {
        if (request == null || request.username() == null || request.password() == null
                || request.username().isBlank() || request.password().isBlank()) {
            log.warn("登录参数为空或格式无效");
            return null;
        }
        var user = userMapper.findActiveByUsername(request.username().trim());
        if (user == null || user.passwordHash() == null
                || !passwordEncoder.matches(request.password(), user.passwordHash())) {
            log.warn("用户认证失败，username={}", request.username());
            return null;
        }
        userMapper.updateLastLogin(user.id());
        return new LoginVO(user.id(), user.username(), user.displayName(), user.role());
    }
}
