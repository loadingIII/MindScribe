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

    @Override
    /** 按用户 ID 查询 active 用户，供 /auth/me 回查最新昵称。 */
    public com.ms.pojo.entity.UserLoginEntity findActiveById(String userId) {
        if (userId == null || userId.isBlank()) return null;
        return userMapper.findActiveById(userId);
    }

    @Override
    /** 修改昵称后回读用户信息，保证前端拿到的是落库后的最新数据。 */
    public LoginVO updateDisplayName(String userId, String displayName) {
        String name = displayName == null ? "" : displayName.trim();
        if (name.isEmpty()) throw new IllegalArgumentException("昵称不能为空");
        if (name.length() > 100) throw new IllegalArgumentException("昵称不能超过 100 个字符");
        if (userMapper.updateDisplayName(userId, name) == 0) return null;
        var user = userMapper.findActiveById(userId);
        if (user == null) return null;
        return new LoginVO(user.id(), user.email(), user.displayName(), user.role());
    }

    @Override
    /** 查询用户头像地址，未设置时返回 null。 */
    public String avatarOf(String userId) {
        if (userId == null || userId.isBlank()) return null;
        return userMapper.findAvatarUrl(userId);
    }

    @Override
    /** 更新头像地址；只接受 http(s) 链接，防止存入非法内容。 */
    public String updateAvatar(String userId, String avatarUrl) {
        String url = avatarUrl == null ? "" : avatarUrl.trim();
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            throw new IllegalArgumentException("头像地址不合法");
        }
        if (url.length() > 500) throw new IllegalArgumentException("头像地址过长");
        if (userMapper.updateAvatarUrl(userId, url) == 0) return null;
        return url;
    }

    @Override
    /** 查询个人中心资料（注册时间、最近登录时间）；用户不存在或被禁用时返回 null。 */
    public com.ms.pojo.entity.UserProfileEntity profileOf(String userId) {
        if (userId == null || userId.isBlank()) return null;
        return userMapper.findProfileById(userId);
    }

    @Override
    /**
     * 修改登录密码：先校验原密码，再写入新哈希。
     * 已知限制：当前 JWT 无版本号机制，改密码不会吊销已签发的会话。
     */
    public boolean updatePassword(String userId, String oldPassword, String newPassword) {
        if (userId == null || userId.isBlank()) return false;
        var user = userMapper.findActiveById(userId);
        if (user == null || user.passwordHash() == null) return false;
        if (oldPassword == null || !passwordEncoder.matches(oldPassword, user.passwordHash())) {
            throw new IllegalArgumentException("原密码不正确");
        }
        String newHash = passwordEncoder.encode(newPassword);
        return userMapper.updatePassword(userId, newHash) > 0;
    }
}
