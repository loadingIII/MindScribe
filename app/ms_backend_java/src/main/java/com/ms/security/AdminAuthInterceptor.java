package com.ms.security;

import jakarta.servlet.http.*;
import org.springframework.web.servlet.HandlerInterceptor;

/** 管理端拦截器：校验管理端专用 JWT Cookie，且要求 admin 或 super-admin 角色。 */
public class AdminAuthInterceptor implements HandlerInterceptor {
    private final JwtService jwt;
    /** 创建使用指定 JWT 服务的拦截器。 */
    public AdminAuthInterceptor(JwtService jwt) { this.jwt = jwt; }

    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object h) throws Exception {
        String token = null;
        // 只认管理端专用 Cookie；客户端 Cookie 即使有效也无法访问管理接口。
        if (req.getCookies() != null) {
            for (Cookie c : req.getCookies()) {
                if (jwt.adminCookieName().equals(c.getName())) token = c.getValue();
            }
        }
        try {
            if (token != null) {
                var claims = jwt.parse(token);
                // 角色直接取自 JWT claim（管理员登录时写入），无需查库。
                String role = claims.get("role", String.class);
                if ("admin".equals(role) || "super-admin".equals(role)) {
                    req.setAttribute("userId", claims.getSubject());
                    req.setAttribute("role", role);
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
