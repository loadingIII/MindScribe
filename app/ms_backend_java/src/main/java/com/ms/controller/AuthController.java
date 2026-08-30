package com.ms.controller;

import com.ms.pojo.dto.LoginRequest;
import com.ms.pojo.vo.LoginVO;
import com.ms.service.AuthService;
import com.ms.utils.LogUtil;
import jakarta.servlet.http.HttpSession;
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

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request, HttpSession session) {
        log.info("收到登录请求，用户名={}", request == null ? null : request.username());
        LoginVO user = authService.login(request);
        if (user == null) {
            log.warn("登录失败，用户名={}", request == null ? null : request.username());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("用户名或密码错误");
        }
        session.setAttribute("user", user);
        log.info("登录成功，userId={}", user.userId());
        return ResponseEntity.ok(user);
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(HttpSession session) {
        LoginVO user = (LoginVO) session.getAttribute("user");
        log.debug("查询当前会话，已登录={}", user != null);
        return user == null ? ResponseEntity.status(HttpStatus.UNAUTHORIZED).build() : ResponseEntity.ok(user);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpSession session) {
        log.info("退出登录");
        session.invalidate();
        return ResponseEntity.noContent().build();
    }
}
