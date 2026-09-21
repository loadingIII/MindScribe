package com.ms.controller;

import com.ms.pojo.dto.EmailLoginRequest;
import com.ms.pojo.vo.LoginVO;
import com.ms.security.JwtService;
import com.ms.service.AdminAuthService;
import com.ms.utils.LogUtil;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 管理端独立登录接口：账号来自 admin_users 表，JWT 写入专用 Cookie（mindscribe-admin-token），
 * 与客户端登录态（users 表 + mindscribe-token）完全隔离。
 */
@RestController
@RequestMapping("/auth/admin")
public class AdminAuthController {
    private static final org.slf4j.Logger log = LogUtil.getLogger(AdminAuthController.class);

    private final AdminAuthService adminAuthService;
    private final JwtService jwtService;

    public AdminAuthController(AdminAuthService adminAuthService, JwtService jwtService) {
        this.adminAuthService = adminAuthService;
        this.jwtService = jwtService;
    }

    /** 管理员邮箱密码登录，签发管理端专用 JWT Cookie。 */
    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody EmailLoginRequest request, HttpServletResponse response) {
        LoginVO admin = adminAuthService.loginByEmail(request == null ? null : request.email(), request == null ? null : request.password());
        if (admin == null) {
            log.warn("管理端登录失败，email={}", request == null ? null : request.email());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("{\"code\":\"INVALID_CREDENTIALS\",\"message\":\"邮箱或密码错误\"}");
        }
        response.addHeader("Set-Cookie",
                ResponseCookie.from(jwtService.adminCookieName(),
                                jwtService.create(admin.userId(), admin.email(), admin.role()))
                        .httpOnly(true).sameSite("Lax").path("/")
                        .maxAge(jwtService.expirationSeconds()).build().toString());
        return ResponseEntity.ok(admin);
    }

    /** 读取当前管理端登录态（从专用 Cookie 解析）。 */
    @GetMapping("/me")
    public ResponseEntity<?> me(HttpServletRequest request) {
        String token = null;
        if (request.getCookies() != null) {
            for (jakarta.servlet.http.Cookie cookie : request.getCookies()) {
                if (jwtService.adminCookieName().equals(cookie.getName())) token = cookie.getValue();
            }
        }
        try {
            var claims = jwtService.parse(token);
            return ResponseEntity.ok(java.util.Map.of(
                    "userId", claims.getSubject(),
                    "email", claims.get("email", String.class),
                    "role", claims.get("role", String.class)));
        } catch (Exception ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("{\"code\":\"UNAUTHORIZED\",\"message\":\"请先登录\"}");
        }
    }

    /** 退出管理端登录：清除专用 Cookie。 */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletResponse response) {
        response.addHeader("Set-Cookie", ResponseCookie.from(jwtService.adminCookieName(), "")
                .httpOnly(true).sameSite("Lax").path("/").maxAge(0).build().toString());
        return ResponseEntity.noContent().build();
    }
}
