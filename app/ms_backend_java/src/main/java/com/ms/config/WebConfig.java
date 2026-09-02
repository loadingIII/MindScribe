package com.ms.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import com.ms.security.JwtAuthInterceptor;
import com.ms.security.JwtService;

/** 注册需要登录的业务接口。 */
@Configuration
public class WebConfig implements WebMvcConfigurer {
    private final JwtService jwtService;
    /** 注入 JWT 服务，供请求拦截器校验 Cookie。 */
    public WebConfig(JwtService jwtService) { this.jwtService = jwtService; }
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new JwtAuthInterceptor(jwtService)).addPathPatterns("/gen_imgs/**");
    }
}
