package com.ms.service.impl;

import com.ms.service.RegisterCodeService;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

/** 使用 Redis 保存验证码、冷却时间和失败次数。 */
@Service
public class RegisterCodeServiceImpl implements RegisterCodeService {
    private static final Duration CODE_TTL = Duration.ofMinutes(10);
    private static final Duration COOLDOWN_TTL = Duration.ofSeconds(60);
    private static final int MAX_FAILURES = 5;
    /** 近期验证码审计列表的容量上限与保留时长（供管理端临时查看，接入邮件后可移除）。 */
    private static final int RECENT_LIMIT = 20;
    private static final Duration RECENT_TTL = Duration.ofHours(2);
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
        // 外部邮件服务尚未接入：把验证码写入近期列表，供管理端临时查看（有 TTL，自动过期）。
        recordRecent(normalized, code);
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
            markRecentStatus(normalized, code, "error");
            return false;
        }
        redis.delete(codeKey(normalized));
        redis.delete(failureKey);
        markRecentStatus(normalized, code, "used");
        return true;
    }

    /** 追加一条验证码记录到近期列表：邮箱|验证码|时间|初始状态，超量裁剪并设置整体过期。 */
    private void recordRecent(String email, String code) {
        String entry = email + "|" + code + "|" + LocalDateTime.now() + "|active";
        redis.opsForList().leftPush(RECENT_KEY, entry);
        redis.opsForList().trim(RECENT_KEY, 0, RECENT_LIMIT - 1);
        redis.expire(RECENT_KEY, RECENT_TTL);
    }

    /** 按邮箱+验证码把近期列表中的记录标记为 used/error，便于管理端区分展示。 */
    private void markRecentStatus(String email, String code, String status) {
        java.util.List<String> entries = redis.opsForList().range(RECENT_KEY, 0, RECENT_LIMIT - 1);
        if (entries == null) return;
        for (int i = 0; i < entries.size(); i++) {
            String[] parts = entries.get(i).split("\\|", -1);
            // 只更新仍处于 active 的记录，避免覆盖已有终态。
            if (parts.length == 4 && parts[0].equals(email) && parts[1].equals(code) && "active".equals(parts[3])) {
                redis.opsForList().set(RECENT_KEY, i, parts[0] + "|" + parts[1] + "|" + parts[2] + "|" + status);
                break;
            }
        }
    }

    /** 近期验证码列表的 Redis 键，供管理端读取。 */
    public static final String RECENT_KEY = "mindscribe:register:recent-codes";

    /** 统一邮箱格式，避免大小写导致 Redis 键不一致。 */
    private static String normalize(String email) { return email == null ? "" : email.trim().toLowerCase(); }
    /** 生成验证码 Redis 键。 */
    private static String codeKey(String email) { return "mindscribe:register:code:" + email; }
    /** 生成验证码失败次数 Redis 键。 */
    private static String failureKey(String email) { return "mindscribe:register:failures:" + email; }
}
