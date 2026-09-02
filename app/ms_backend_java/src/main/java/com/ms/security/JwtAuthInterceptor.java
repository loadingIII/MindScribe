package com.ms.security;
import jakarta.servlet.http.*;
import org.springframework.web.servlet.HandlerInterceptor;
/** 校验 JWT Cookie。 */
public class JwtAuthInterceptor implements HandlerInterceptor {
    private final JwtService jwt;
    /** 创建使用指定 JWT 服务的拦截器。 */
    public JwtAuthInterceptor(JwtService jwt) { this.jwt = jwt; }
    @Override public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object h) throws Exception {
        String token = null;
        if (req.getCookies() != null) for (Cookie c : req.getCookies()) if (jwt.cookieName().equals(c.getName())) token = c.getValue();
        try { if (token != null) { req.setAttribute("userId", jwt.parse(token).getSubject()); return true; } } catch (Exception ignored) { }
        res.setStatus(401); res.setContentType("application/json;charset=UTF-8"); res.getWriter().write("{\"code\":\"UNAUTHORIZED\",\"message\":\"请先登录\"}"); return false;
    }
}
