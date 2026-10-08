package com.ms.controller;

import com.ms.pojo.dto.EmailLoginRequest;
import com.ms.pojo.dto.RegisterRequest;
import com.ms.pojo.dto.SendRegisterCodeRequest;
import com.ms.security.JwtService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseCookie;
import com.ms.pojo.vo.LoginVO;
import com.ms.service.AuthService;
import com.ms.service.RegisterCodeService;
import com.ms.utils.LogUtil;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 登录、当前会话和退出接口。 */
@RestController
@RequestMapping("/auth")
public class AuthController {
    private static final org.slf4j.Logger log = LogUtil.getLogger(AuthController.class);
    private final AuthService authService;
    private final JwtService jwtService;
    private final RegisterCodeService registerCodeService;
    private final com.ms.utils.OssStorageUtil ossStorageUtil;

    public AuthController(AuthService authService, JwtService jwtService, RegisterCodeService registerCodeService,
                          com.ms.utils.OssStorageUtil ossStorageUtil) {
        this.authService = authService;
        this.jwtService = jwtService;
        this.registerCodeService = registerCodeService;
        this.ossStorageUtil = ossStorageUtil;
    }

    /** 使用邮箱密码登录，并写入 JWT HttpOnly Cookie。 */
    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody EmailLoginRequest request, jakarta.servlet.http.HttpServletResponse response) {
        LoginVO user = authService.loginByEmail(request == null ? null : request.email(), request == null ? null : request.password());
        if (user == null) {
            log.warn("登录失败，邮箱登录请求");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("{\"code\":\"INVALID_CREDENTIALS\",\"message\":\"邮箱或密码错误\"}");
        }
        response.addHeader("Set-Cookie",
                ResponseCookie.from(jwtService.cookieName(),
                        jwtService.create(user.userId(), user.email(), user.role()))
                        .httpOnly(true).sameSite("Lax").path("/")
                        .maxAge(jwtService.expirationSeconds())
                        .build().toString()
        );
        return ResponseEntity.ok(user);
    }

    /** 发送注册邮箱验证码。 */
    @PostMapping("/register/code")
    public ResponseEntity<?> code(@Valid @RequestBody SendRegisterCodeRequest request) {
        String email = request.email().trim().toLowerCase();
        if (authService.emailExists(email)) return ResponseEntity.status(HttpStatus.CONFLICT).body("{\"code\":\"EMAIL_EXISTS\",\"message\":\"邮箱已注册\"}");
        try { registerCodeService.send(email); }
        catch (IllegalStateException ex) { return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body("{\"code\":\"CODE_RATE_LIMIT\",\"message\":\"验证码发送过于频繁\"}"); }
        return ResponseEntity.ok(java.util.Map.of("message","验证码已发送"));
    }

    /** 校验验证码并创建用户，同时自动登录。 */
    @PostMapping("/register")
    public ResponseEntity<?> register(@Valid @RequestBody RegisterRequest request, jakarta.servlet.http.HttpServletResponse response) {
        try { if (!registerCodeService.verify(request.email(), request.verificationCode())) return ResponseEntity.badRequest().body("{\"code\":\"INVALID_CODE\",\"message\":\"验证码错误或已过期\"}"); }
        catch (IllegalStateException ex) { return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body("{\"code\":\"CODE_LOCKED\",\"message\":\"验证码错误次数过多\"}"); }
        LoginVO user=authService.register(request); if(user==null) return ResponseEntity.status(409).body("{\"code\":\"EMAIL_EXISTS\",\"message\":\"邮箱已注册\"}");
        response.addHeader("Set-Cookie", ResponseCookie.from(jwtService.cookieName(), jwtService.create(user.userId(), user.email(), user.role())).httpOnly(true).sameSite("Lax").path("/").maxAge(jwtService.expirationSeconds()).build().toString());
        return ResponseEntity.ok(user);
    }

    /** 根据 JWT Cookie 返回当前登录用户（含昵称，供侧边栏与个人中心展示）。 */
    @GetMapping("/me")
    public ResponseEntity<?> me(jakarta.servlet.http.HttpServletRequest request) {
        String token = null;
        if (request.getCookies() != null) for (jakarta.servlet.http.Cookie cookie : request.getCookies())
            if (jwtService.cookieName().equals(cookie.getName())) token = cookie.getValue();
        try {
            var claims = jwtService.parse(token);
            String userId = claims.getSubject();
            // 昵称与头像存库后可能被修改，JWT 里没有这些字段，这里回查数据库取最新值。
            var user = authService.findActiveById(userId);
            String displayName = user == null ? "" : user.displayName();
            String avatarUrl = authService.avatarOf(userId);
            // 个人中心展示注册时间与最近登录时间；查询失败不阻塞基础信息返回。
            java.time.LocalDateTime createdAt = null;
            java.time.LocalDateTime lastLoginAt = null;
            try {
                var profile = authService.profileOf(userId);
                if (profile != null) {
                    createdAt = profile.createdAt();
                    lastLoginAt = profile.lastLoginAt();
                }
            } catch (Exception ignored) { }
            java.util.Map<String, Object> body = new java.util.LinkedHashMap<>();
            body.put("userId", userId);
            body.put("email", claims.get("email", String.class));
            body.put("role", claims.get("role", String.class));
            body.put("displayName", displayName);
            body.put("avatarUrl", avatarUrl == null ? "" : avatarUrl);
            body.put("createdAt", createdAt);
            body.put("lastLoginAt", lastLoginAt);
            return ResponseEntity.ok(body);
        } catch (Exception ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("{\"code\":\"UNAUTHORIZED\",\"message\":\"请先登录\"}");
        }
    }

    /** 修改当前登录用户的昵称，返回更新后的用户信息。 */
    @PostMapping("/profile")
    public ResponseEntity<?> updateProfile(@org.springframework.web.bind.annotation.RequestBody com.ms.pojo.dto.UpdateProfileRequest request,
                                           jakarta.servlet.http.HttpServletRequest servletRequest) {
        // /auth 路径不经过 JWT 拦截器，这里与 me() 一致手动解析 Cookie 取当前用户。
        String userId = currentUserId(servletRequest);
        if (userId == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("{\"code\":\"UNAUTHORIZED\",\"message\":\"请先登录\"}");
        LoginVO user = authService.updateDisplayName(userId, request == null ? null : request.displayName());
        if (user == null) return ResponseEntity.status(HttpStatus.NOT_FOUND).body("{\"code\":\"USER_NOT_FOUND\",\"message\":\"用户不存在或已被禁用\"}");
        return ResponseEntity.ok(user);
    }

    /** 上传头像图片到 OSS 并写入用户资料，返回可直接访问的头像地址。 */
    @PostMapping("/avatar")
    public ResponseEntity<?> uploadAvatar(@org.springframework.web.bind.annotation.RequestParam("file") org.springframework.web.multipart.MultipartFile file,
                                          jakarta.servlet.http.HttpServletRequest servletRequest) {
        String userId = currentUserId(servletRequest);
        if (userId == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("{\"code\":\"UNAUTHORIZED\",\"message\":\"请先登录\"}");
        if (file == null || file.isEmpty()) throw new IllegalArgumentException("请选择头像图片");
        // 只接受常见图片格式，避免把任意文件存成头像。
        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) throw new IllegalArgumentException("头像必须是图片文件");
        if (file.getSize() > 5 * 1024 * 1024) throw new IllegalArgumentException("头像图片不能超过 5MB");
        try {
            String url = ossStorageUtil.upload(file, "avatars");
            String saved = authService.updateAvatar(userId, url);
            if (saved == null) return ResponseEntity.status(HttpStatus.NOT_FOUND).body("{\"code\":\"USER_NOT_FOUND\",\"message\":\"用户不存在或已被禁用\"}");
            return ResponseEntity.ok(java.util.Map.of("avatarUrl", saved));
        } catch (java.io.IOException ex) {
            log.warn("头像上传失败，userId={}", userId, ex);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("{\"code\":\"UPLOAD_FAILED\",\"message\":\"头像上传失败，请稍后重试\"}");
        }
    }

    /** 返回当前登录用户的头像地址；未设置时 avatarUrl 为空字符串。 */
    @GetMapping("/avatar")
    public ResponseEntity<?> avatar(jakarta.servlet.http.HttpServletRequest servletRequest) {
        String userId = currentUserId(servletRequest);
        if (userId == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("{\"code\":\"UNAUTHORIZED\",\"message\":\"请先登录\"}");
        String url = authService.avatarOf(userId);
        return ResponseEntity.ok(java.util.Map.of("avatarUrl", url == null ? "" : url));
    }

    /** 从请求 Cookie 中解析当前登录用户 ID；未登录时返回 null。 */
    private String currentUserId(jakarta.servlet.http.HttpServletRequest request) {
        if (request.getCookies() != null) for (jakarta.servlet.http.Cookie cookie : request.getCookies())
            if (jwtService.cookieName().equals(cookie.getName())) {
                try { return jwtService.parse(cookie.getValue()).getSubject(); } catch (Exception ignored) { }
            }
        return null;
    }

    /** 清理 JWT Cookie，结束当前浏览器登录状态。 */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(jakarta.servlet.http.HttpServletResponse response) {
        response.addHeader("Set-Cookie", ResponseCookie.from(jwtService.cookieName(),"").httpOnly(true).path("/").maxAge(0).build().toString());
        return ResponseEntity.noContent().build();
    }
}
