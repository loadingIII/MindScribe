package com.ms.service.impl;

import com.ms.mapper.AdminUserMapper;
import com.ms.pojo.entity.UserLoginEntity;
import com.ms.pojo.vo.LoginVO;
import com.ms.service.AdminAuthService;
import com.ms.utils.LogUtil;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.UUID;

/** 管理端账号业务实现：登录、查重与创建，全部操作 admin_users 表。 */
@Service
public class AdminAuthServiceImpl implements AdminAuthService {
    private static final org.slf4j.Logger log = LogUtil.getLogger(AdminAuthServiceImpl.class);

    private final AdminUserMapper adminUserMapper;
    private final PasswordEncoder passwordEncoder;

    public AdminAuthServiceImpl(AdminUserMapper adminUserMapper, PasswordEncoder passwordEncoder) {
        this.adminUserMapper = adminUserMapper;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public LoginVO loginByEmail(String email, String password) {
        UserLoginEntity admin = adminUserMapper.findActiveByEmail(email == null ? "" : email.trim().toLowerCase());
        if (admin == null || password == null || !passwordEncoder.matches(password, admin.passwordHash())) {
            log.warn("管理员认证失败，email={}", email);
            return null;
        }
        adminUserMapper.updateLastLogin(admin.id());
        return new LoginVO(admin.id(), admin.email(), admin.displayName(), admin.role());
    }

    @Override
    public boolean emailExists(String email) {
        // findActiveByEmail 不含停用账号；查重需要覆盖全部账号，直接再查一次全表字段。
        return adminUserMapper.findAllAdmins().stream()
                .anyMatch(item -> email != null && email.equalsIgnoreCase(String.valueOf(item.get("email"))));
    }

    @Override
    public LoginVO createAdmin(String email, String password, String displayName, String role, String remark) {
        String normalized = email == null ? "" : email.trim().toLowerCase();
        String id = UUID.randomUUID().toString();
        adminUserMapper.insertAdmin(id, normalized, passwordEncoder.encode(password), displayName.trim(), role, remark);
        log.info("管理员账号已创建，email={} role={}", normalized, role);
        return new LoginVO(id, normalized, displayName.trim(), role);
    }
}
