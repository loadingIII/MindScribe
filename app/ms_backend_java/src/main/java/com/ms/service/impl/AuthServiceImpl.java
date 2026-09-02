package com.ms.service.impl;

import com.ms.mapper.UserMapper;
import com.ms.pojo.dto.LoginRequest;
import com.ms.pojo.vo.LoginVO;
import com.ms.pojo.dto.RegisterRequest;
import com.ms.service.AuthService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import com.ms.utils.LogUtil;

/** 登录业务实现：组合用户查询和密码校验，不直接处理 SQL。 */
@Service
public class AuthServiceImpl implements AuthService {
    private static final org.slf4j.Logger log = LogUtil.getLogger(AuthServiceImpl.class);
    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;

    public AuthServiceImpl(UserMapper userMapper, PasswordEncoder passwordEncoder) {
        this.userMapper = userMapper;
        this.passwordEncoder = passwordEncoder;
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
        return new LoginVO(user.id(), user.email(), user.displayName(), user.role());
    }
    /** 使用邮箱和密码校验用户身份。 */
    public LoginVO loginByEmail(String email, String password) {
        var user = userMapper.findActiveByEmail(email == null ? "" : email.trim().toLowerCase());
        if (user == null || password == null || !passwordEncoder.matches(password, user.passwordHash())) return null;
        userMapper.updateLastLogin(user.id()); return new LoginVO(user.id(), user.email(), user.displayName(), user.role());
    }
    /** 创建用户并保存 BCrypt 密码哈希。 */
    public LoginVO register(RegisterRequest request) {
        String email=request.email().trim().toLowerCase();
        if (userMapper.countByEmail(email)>0) return null;
        String id=java.util.UUID.randomUUID().toString();
        userMapper.insertUser(id,email,email,passwordEncoder.encode(request.password()),request.displayName().trim());
        return new LoginVO(id,email,request.displayName().trim(),"user");
    }
    @Override
    /** 判断邮箱是否已经被注册。 */
    public boolean emailExists(String email) {
        return email != null && userMapper.countByEmail(email.trim().toLowerCase()) > 0;
    }
}
