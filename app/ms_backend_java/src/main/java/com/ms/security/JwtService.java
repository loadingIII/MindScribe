package com.ms.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** 负责 JWT 的签发和验证。 */
@Service
public class JwtService {
    private final SecretKey key;
    private final String issuer;
    private final long expirationSeconds;
    private final String cookieName;

    public JwtService(
            @Value("${jwt.secret}") String secret,
            @Value("${jwt.issuer}") String issuer,
            @Value("${jwt.expiration-seconds}") long expirationSeconds,
            @Value("${jwt.cookie-name}") String cookieName) {
        // HS256 至少需要 256 bit 密钥，避免启动时出现难以定位的异常。
        if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalArgumentException("JWT_SECRET 至少需要 32 个字节，请在 .env 或系统环境变量中配置高强度密钥");
        }
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.issuer = issuer;
        this.expirationSeconds = expirationSeconds;
        this.cookieName = cookieName;
    }

    /** 返回浏览器保存 JWT 的 Cookie 名称。 */
    public String cookieName() { return cookieName; }

    /** 返回 JWT 与认证 Cookie 共用的有效期（秒）。 */
    public long expirationSeconds() { return expirationSeconds; }

    /** 根据用户身份创建带有效期和签发方的 JWT。 */
    public String create(String userId, String email, String role) {
        Date now = new Date();
        return Jwts.builder().subject(userId).issuer(issuer).claim("email", email)
                .claim("role", role).issuedAt(now)
                .expiration(new Date(now.getTime() + expirationSeconds * 1000)).signWith(key).compact();
    }

    /** 验证 JWT 签名、签发方和有效期，并返回声明内容。 */
    public Claims parse(String token) {
        return Jwts.parser().verifyWith(key).requireIssuer(issuer).build()
                .parseSignedClaims(token).getPayload();
    }
}
