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

    public AuthController(AuthService authService, JwtService jwtService, RegisterCodeService registerCodeService) {
        this.authService = authService;
        this.jwtService = jwtService;
        this.registerCodeService = registerCodeService;
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

    /** 根据 JWT Cookie 返回当前登录用户。 */
    @GetMapping("/me")
    public ResponseEntity<?> me(jakarta.servlet.http.HttpServletRequest request) {
        String token = null;
        if (request.getCookies() != null) for (jakarta.servlet.http.Cookie cookie : request.getCookies())
            if (jwtService.cookieName().equals(cookie.getName())) token = cookie.getValue();
        try {
            var claims = jwtService.parse(token);
            return ResponseEntity.ok(java.util.Map.of("userId", claims.getSubject(), "email", claims.get("email", String.class), "role", claims.get("role", String.class)));
        } catch (Exception ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("{\"code\":\"UNAUTHORIZED\",\"message\":\"请先登录\"}");
        }
    }

    /** 清理 JWT Cookie，结束当前浏览器登录状态。 */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(jakarta.servlet.http.HttpServletResponse response) {
        response.addHeader("Set-Cookie", ResponseCookie.from(jwtService.cookieName(),"").httpOnly(true).path("/").maxAge(0).build().toString());
        return ResponseEntity.noContent().build();
    }
}
