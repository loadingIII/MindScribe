package com.ms.service;

import com.ms.mapper.UserMapper;
import com.ms.pojo.entity.UserLoginEntity;
import com.ms.service.impl.AuthServiceImpl;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/** 修改密码业务单元测试：离线运行，mock 数据层，密码哈希用真实 BCrypt。 */
@ExtendWith(MockitoExtension.class)
class AuthServicePasswordTest {
    @Mock
    private UserMapper userMapper;

    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    /** 构造一个 active 用户，passwordHash 由真实 BCrypt 生成。 */
    private UserLoginEntity activeUser(String rawPassword) {
        return new UserLoginEntity("u1", "u1", "u1@exam.com", passwordEncoder.encode(rawPassword), "用户一", "user");
    }

    @Test
    void updatePasswordVerifiesOldAndStoresNewHash() {
        Mockito.when(userMapper.findActiveById("u1")).thenReturn(activeUser("old-password-1"));
        Mockito.when(userMapper.updatePassword(Mockito.eq("u1"), Mockito.anyString())).thenReturn(1);

        AuthServiceImpl service = new AuthServiceImpl(userMapper, passwordEncoder);
        Assertions.assertTrue(service.updatePassword("u1", "old-password-1", "new-password-8"));

        ArgumentCaptor<String> hashCaptor = ArgumentCaptor.forClass(String.class);
        Mockito.verify(userMapper).updatePassword(Mockito.eq("u1"), hashCaptor.capture());
        // 落库的是新密码的 BCrypt 哈希，且能通过 matches 校验。
        Assertions.assertTrue(passwordEncoder.matches("new-password-8", hashCaptor.getValue()));
    }

    @Test
    void updatePasswordRejectsWrongOldPassword() {
        Mockito.when(userMapper.findActiveById("u1")).thenReturn(activeUser("old-password-1"));

        AuthServiceImpl service = new AuthServiceImpl(userMapper, passwordEncoder);
        Assertions.assertThrows(IllegalArgumentException.class,
                () -> service.updatePassword("u1", "wrong-password", "new-password-8"));
        // 原密码错误时不应触达更新语句。
        Mockito.verify(userMapper, Mockito.never()).updatePassword(Mockito.anyString(), Mockito.anyString());
    }

    @Test
    void updatePasswordReturnsFalseWhenUserMissing() {
        Mockito.when(userMapper.findActiveById("ghost")).thenReturn(null);

        AuthServiceImpl service = new AuthServiceImpl(userMapper, passwordEncoder);
        Assertions.assertFalse(service.updatePassword("ghost", "old-password-1", "new-password-8"));
    }
}
