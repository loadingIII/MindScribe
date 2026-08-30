package com.ms.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.HandlerInterceptor;
import com.ms.utils.LogUtil;

/** 拦截未登录的生图接口。 */
public class AuthInterceptor implements HandlerInterceptor {
    private static final String USER_SESSION_ATTRIBUTE = "user";
    private static final String LOGIN_REQUIRED_BODY = "{\"message\":\"请先登录\"}";
    private static final org.slf4j.Logger log = LogUtil.getLogger(AuthInterceptor.class);
    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        var session = request.getSession(false);
        if (session != null && session.getAttribute(USER_SESSION_ATTRIBUTE) != null) return true;
        log.warn("拦截未登录请求，method={} uri={}", request.getMethod(), request.getRequestURI());
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(LOGIN_REQUIRED_BODY);
        return false;
    }
}
