package com.ms.service.impl;

import com.ms.service.RegisterCodeService;
import java.security.SecureRandom;
import java.time.Duration;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

/** 使用 Redis 保存验证码、冷却时间和失败次数。 */
@Service
public class RegisterCodeServiceImpl implements RegisterCodeService {
    private static final Duration CODE_TTL = Duration.ofMinutes(10);
    private static final Duration COOLDOWN_TTL = Duration.ofSeconds(60);
    private static final int MAX_FAILURES = 5;
    private final StringRedisTemplate redis;
    private final SecureRandom random = new SecureRandom();

    /** 注入 Redis 字符串模板。 */
    public RegisterCodeServiceImpl(StringRedisTemplate redis) { this.redis = redis; }

    @Override
    /** 生成验证码并写入 Redis，同时设置发送冷却时间。 */
    public void send(String email) {
        String normalized = normalize(email);
        String cooldownKey = "mindscribe:register:cooldown:" + normalized;
        Boolean allowed = redis.opsForValue().setIfAbsent(cooldownKey, "1", COOLDOWN_TTL);
        if (!Boolean.TRUE.equals(allowed)) throw new IllegalStateException("验证码发送过于频繁，请 60 秒后重试");
        String code = String.format("%06d", random.nextInt(1_000_000));
        redis.opsForValue().set(codeKey(normalized), code, CODE_TTL);
        redis.delete(failureKey(normalized));
        System.out.printf("[register-code] email=%s code=%s%n", normalized, code);
    }

    @Override
    /** 校验验证码，成功后删除；错误达到上限时锁定。 */
    public boolean verify(String email, String code) {
        String normalized = normalize(email);
        String failureKey = failureKey(normalized);
        String failures = redis.opsForValue().get(failureKey);
        if (failures != null && Integer.parseInt(failures) >= MAX_FAILURES) throw new IllegalStateException("验证码错误次数过多，请重新获取验证码");
        String saved = redis.opsForValue().get(codeKey(normalized));
        if (saved == null || !saved.equals(code)) {
            Long count = redis.opsForValue().increment(failureKey);
            redis.expire(failureKey, CODE_TTL);
            if (count != null && count >= MAX_FAILURES) throw new IllegalStateException("验证码错误次数过多，请重新获取验证码");
            return false;
        }
        redis.delete(codeKey(normalized));
        redis.delete(failureKey);
        return true;
    }

    /** 统一邮箱格式，避免大小写导致 Redis 键不一致。 */
    private static String normalize(String email) { return email == null ? "" : email.trim().toLowerCase(); }
    /** 生成验证码 Redis 键。 */
    private static String codeKey(String email) { return "mindscribe:register:code:" + email; }
    /** 生成验证码失败次数 Redis 键。 */
    private static String failureKey(String email) { return "mindscribe:register:failures:" + email; }
}
