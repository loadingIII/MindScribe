package com.ms.service;

import com.ms.pojo.dto.LoginRequest;
import com.ms.pojo.vo.LoginVO;
import com.ms.pojo.dto.RegisterRequest;

/** 提供用户登录校验能力。 */
public interface AuthService {
    /** 校验登录凭据；凭据无效时返回 null。 */
    LoginVO login(LoginRequest request);
    /** 使用邮箱和密码完成登录校验。 */
    LoginVO loginByEmail(String email, String password);
    /** 创建邮箱用户并返回登录信息。 */
    LoginVO register(RegisterRequest request);
    /** 判断邮箱是否已被注册。 */
    boolean emailExists(String email);

    /** 按用户 ID 查询 active 用户；不存在或被禁用时返回 null。 */
    com.ms.pojo.entity.UserLoginEntity findActiveById(String userId);

    /**
     * 修改当前用户的昵称（display_name）。
     *
     * @param userId      用户 ID（从 JWT 取）
     * @param displayName 新昵称（调用方已做非空校验）
     * @return 更新后的登录信息；用户不存在或被禁用时返回 null
     */
    LoginVO updateDisplayName(String userId, String displayName);

    /** 查询用户头像地址；未设置时返回 null。 */
    String avatarOf(String userId);

    /**
     * 更新用户头像地址（通常是上传到 OSS 后得到的稳定 URL）。
     *
     * @param userId    用户 ID（从 JWT 取）
     * @param avatarUrl 头像地址（非空）
     * @return 更新后的地址；用户不存在或被禁用时返回 null
     */
    String updateAvatar(String userId, String avatarUrl);
}
