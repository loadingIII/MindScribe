package com.ms.controller;

import com.ms.service.impl.RegisterCodeServiceImpl;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 管理端注册验证码临时查看接口：外部邮件服务尚未接入，验证码写在 Redis 近期列表里，
 * 管理员在此查看后转告用户。接入邮件服务后，此接口与对应页面可整体移除。
 */
@RestController
@RequestMapping("/admin")
public class AdminRegisterCodeController {
    private final StringRedisTemplate redis;

    public AdminRegisterCodeController(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /** 读取近期验证码记录，按时间倒序返回（最新在前）。 */
    @GetMapping("/register-codes")
    public Map<String, Object> recentCodes() {
        List<String> entries = redis.opsForList().range(RegisterCodeServiceImpl.RECENT_KEY, 0, -1);
        List<Map<String, String>> items = new ArrayList<>();
        if (entries != null) {
            for (String entry : entries) {
                // 记录格式：邮箱|验证码|写入时间|状态（active/used/error）。
                String[] parts = entry.split("\\|", -1);
                if (parts.length != 4) continue;
                Map<String, String> item = new LinkedHashMap<>();
                item.put("email", parts[0]);
                item.put("code", parts[1]);
                item.put("createdAt", parts[2]);
                item.put("status", parts[3]);
                items.add(item);
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", items);
        return result;
    }
}
