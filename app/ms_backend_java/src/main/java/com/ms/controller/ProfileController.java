package com.ms.controller;

import com.ms.service.AuthService;
import com.ms.service.ProfileService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** 个人中心接口：聚合信息查询与账号安全（修改密码）；userId 强制取 JWT，仅可操作本人数据。 */
@RestController
@RequestMapping("/profile")
public class ProfileController {
    private final ProfileService profileService;
    private final AuthService authService;

    public ProfileController(ProfileService profileService, AuthService authService) {
        this.profileService = profileService;
        this.authService = authService;
    }

    /** 返回当前登录用户的创作统计、常用配置与最近作品墙数据。 */
    @GetMapping("/summary")
    public Map<String, Object> summary(@org.springframework.web.bind.annotation.RequestAttribute("userId") String userId,
                                       @RequestParam(required = false) Integer gallerySize) {
        return profileService.summary(userId, gallerySize);
    }

    /**
     * 修改当前登录用户的密码：校验原密码后写入新哈希。
     * 已知限制：JWT 无版本号机制，已签发的会话不会因改密码失效。
     */
    @PostMapping("/password")
    public ResponseEntity<?> changePassword(@Valid @RequestBody com.ms.pojo.dto.ChangePasswordRequest request,
                                            @org.springframework.web.bind.annotation.RequestAttribute("userId") String userId) {
        try {
            boolean updated = authService.updatePassword(userId, request.oldPassword(), request.newPassword());
            if (!updated) return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("code", "USER_NOT_FOUND", "message", "用户不存在或已被禁用"));
            return ResponseEntity.ok(Map.of("message", "密码已修改"));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(Map.of("code", "INVALID_OLD_PASSWORD", "message", ex.getMessage()));
        }
    }
}
