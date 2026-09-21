package com.ms.controller;

import com.ms.mapper.AdminUserMapper;
import com.ms.pojo.dto.CreateAdminRequest;
import com.ms.pojo.vo.LoginVO;
import com.ms.service.AdminAuthService;
import com.ms.utils.LogUtil;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 管理员账号管理接口：全部操作 admin_users 表（与客户端用户表隔离）。
 * 仅 super-admin 可操作（requireSuperAdmin 校验 role 请求属性）。
 */
@RestController
@RequestMapping("/admin/admins")
public class AdminAccountController {
    private static final org.slf4j.Logger log = LogUtil.getLogger(AdminAccountController.class);

    private final AdminUserMapper adminUserMapper;
    private final AdminAuthService adminAuthService;

    public AdminAccountController(AdminUserMapper adminUserMapper, AdminAuthService adminAuthService) {
        this.adminUserMapper = adminUserMapper;
        this.adminAuthService = adminAuthService;
    }

    /** 管理员列表：数据来自 admin_users 表。 */
    @GetMapping
    public Map<String, Object> list(@RequestAttribute("role") String role) {
        requireSuperAdmin(role, "查看管理员列表");
        List<Map<String, Object>> items = adminUserMapper.findAllAdmins();
        return Map.of("items", items);
    }

    /** 创建管理员账号：写入 admin_users 表；角色支持 admin 与 super-admin。 */
    @PostMapping
    public Map<String, Object> create(@RequestAttribute("role") String role, @Valid @RequestBody CreateAdminRequest request) {
        requireSuperAdmin(role, "创建管理员");
        if (adminAuthService.emailExists(request.email())) throw new IllegalArgumentException("该邮箱已存在管理员账号");
        LoginVO created = adminAuthService.createAdmin(request.email(), request.password(),
                request.displayName(), request.role(), "由超级管理员创建");
        return Map.of("id", created.userId(), "email", created.email(), "role", created.role());
    }

    /** 调整管理员角色（提权/降级）；禁止降级最后一个 super-admin。 */
    @PostMapping("/{adminId}/role")
    public Map<String, Object> changeRole(@RequestAttribute("userId") String operatorId,
                                          @RequestAttribute("role") String role,
                                          @PathVariable String adminId,
                                          @RequestBody Map<String, String> body) {
        requireSuperAdmin(role, "调整管理员角色");
        String target = body == null ? null : body.get("role");
        if (!"admin".equals(target) && !"super-admin".equals(target)) {
            throw new IllegalArgumentException("角色仅支持 super-admin / admin");
        }
        // 降级会减少 super-admin 数量；若这是最后一个则拒绝，避免管理端失去控制权。
        if (!"super-admin".equals(target) && adminUserMapper.countActiveSuperAdmins() <= 1) {
            throw new IllegalStateException("系统至少需要保留一个超级管理员");
        }
        if (adminUserMapper.updateRole(adminId, target) == 0) throw new IllegalArgumentException("管理员不存在");
        log.info("管理员角色已调整，operator={} adminId={} newRole={}", operatorId, adminId, target);
        return Map.of("id", adminId, "role", target);
    }

    /** 停用/启用管理员账号；停用后立即无法登录（登录时查 active 状态）。 */
    @PostMapping("/{adminId}/status")
    public Map<String, Object> changeStatus(@RequestAttribute("userId") String operatorId,
                                            @RequestAttribute("role") String role,
                                            @PathVariable String adminId,
                                            @RequestBody Map<String, String> body) {
        requireSuperAdmin(role, "调整管理员状态");
        String target = body == null ? null : body.get("status");
        if (!"active".equals(target) && !"disabled".equals(target)) {
            throw new IllegalArgumentException("状态仅支持 active / disabled");
        }
        // 停用同样受最后一个超管保护，避免把自己唯一可用的超管账号停掉。
        if ("disabled".equals(target) && adminUserMapper.countActiveSuperAdmins() <= 1) {
            var target_ = adminUserMapper.findAllAdmins().stream()
                    .filter(item -> adminId.equals(String.valueOf(item.get("id"))))
                    .findFirst().orElse(null);
            if (target_ != null && "super-admin".equals(target_.get("role"))) {
                throw new IllegalStateException("系统至少需要保留一个可用的超级管理员");
            }
        }
        if (adminUserMapper.updateStatus(adminId, target) == 0) throw new IllegalArgumentException("管理员不存在");
        log.info("管理员状态已调整，operator={} adminId={} status={}", operatorId, adminId, target);
        return Map.of("id", adminId, "status", target);
    }

    /** 校验当前操作者必须是 super-admin，否则拒绝并提示权限不足。 */
    private static void requireSuperAdmin(String role, String action) {
        if (!"super-admin".equals(role)) {
            log.warn("非 super-admin 尝试{}，已拒绝", action);
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.FORBIDDEN, "该操作仅超级管理员可执行");
        }
    }
}
