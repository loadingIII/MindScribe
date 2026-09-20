package com.ms.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import com.ms.security.JwtAuthInterceptor;
import com.ms.security.JwtService;

/** 注册需要登录的业务接口与管理端接口。 */
@Configuration
public class WebConfig implements WebMvcConfigurer {
    private final JwtService jwtService;
    /** 注入 JWT 服务，供请求拦截器校验 Cookie。 */
    public WebConfig(JwtService jwtService) { this.jwtService = jwtService; }
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // 业务接口：登录即可访问（含积分查询）。
        registry.addInterceptor(new JwtAuthInterceptor(jwtService))
                .addPathPatterns("/gen_imgs/**", "/prompt_templates/**", "/credits/**");
        // 管理接口：登录且必须具备 admin 角色，与业务拦截器路径互不重叠。
        registry.addInterceptor(new com.ms.security.AdminAuthInterceptor(jwtService))
                .addPathPatterns("/admin/**");
    }
}
