package com.ms.security;

import jakarta.servlet.http.*;
import org.springframework.web.servlet.HandlerInterceptor;

/** 管理端拦截器：在 JWT 校验基础上要求 admin 角色。 */
public class AdminAuthInterceptor implements HandlerInterceptor {
    private final JwtService jwt;
    /** 创建使用指定 JWT 服务的拦截器。 */
    public AdminAuthInterceptor(JwtService jwt) { this.jwt = jwt; }

    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object h) throws Exception {
        String token = null;
        // 取 Cookie 逻辑与 JwtAuthInterceptor 保持一致，共用同一登录态。
        if (req.getCookies() != null) {
            for (Cookie c : req.getCookies()) {
                if (jwt.cookieName().equals(c.getName())) token = c.getValue();
            }
        }
        try {
            if (token != null) {
                var claims = jwt.parse(token);
                // 角色直接取自 JWT claim（登录时写入），无需查库。
                if ("admin".equals(claims.get("role", String.class))) {
                    req.setAttribute("userId", claims.getSubject());
                    return true;
                }
            }
        } catch (Exception ignored) { }

        res.setStatus(403);
        res.setContentType("application/json;charset=UTF-8");
        res.getWriter().write("{\"code\":\"FORBIDDEN\",\"message\":\"需要管理员权限\"}");
        return false;
    }
}
