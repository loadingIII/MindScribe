package com.ms.controller;

import com.ms.mapper.CreditMapper;
import com.ms.mapper.UserMapper;
import com.ms.pojo.dto.AdminCreateUserRequest;
import com.ms.pojo.dto.AdjustCreditRequest;
import com.ms.pojo.entity.CreditTransactionEntity;
import com.ms.service.CreditService;
import com.ms.utils.LogUtil;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** 管理端积分接口：用户列表、创建用户、积分调整、流水查询；由 AdminAuthInterceptor 保护。 */
@RestController
@RequestMapping("/admin")
public class AdminCreditController {
    private static final org.slf4j.Logger log = LogUtil.getLogger(AdminCreditController.class);

    private final CreditService creditService;
    private final CreditMapper creditMapper;
    private final com.ms.mapper.UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;

    public AdminCreditController(CreditService creditService, CreditMapper creditMapper,
                                 UserMapper userMapper, PasswordEncoder passwordEncoder) {
        this.creditService = creditService;
        this.creditMapper = creditMapper;
        this.userMapper = userMapper;
        this.passwordEncoder = passwordEncoder;
    }

    /** 分页查询用户（keyword 模糊匹配用户名/邮箱），返回含余额，供积分调整页使用。 */
    @GetMapping("/users")
    public Map<String, Object> listUsers(@RequestParam(defaultValue = "") String keyword,
                                         @RequestParam(defaultValue = "1") int page,
                                         @RequestParam(defaultValue = "20") int size) {
        int safeSize = Math.max(1, Math.min(size, 100));
        int safePage = Math.max(page - 1, 0);
        String like = (keyword == null || keyword.isBlank()) ? null : "%" + keyword.trim() + "%";
        List<Map<String, Object>> rows = userMapper.findUsersForAdmin(like, safeSize, safePage * safeSize);
        long total = userMapper.countUsersForAdmin(like);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", total);
        result.put("items", rows);
        return result;
    }

    /** 管理端直接创建普通用户账号：跳过邮箱验证码，角色固定 user，赠送与其他注册一致的 100 积分。 */
    @PostMapping("/users")
    public Map<String, Object> createUser(@RequestAttribute("userId") String operatorId,
                                          @RequestBody AdminCreateUserRequest request) {
        String email = request.email().trim().toLowerCase();
        if (userMapper.countByEmail(email) > 0) throw new IllegalArgumentException("该邮箱已被注册");
        String id = UUID.randomUUID().toString();
        userMapper.insertUser(id, email, email, passwordEncoder.encode(request.password()), request.displayName().trim());
        log.info("管理端创建用户成功，operator={} email={}", operatorId, email);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", id);
        result.put("email", email);
        result.put("displayName", request.displayName().trim());
        return result;
    }

    /** 调整指定用户积分：amount 正为充值、负为扣减；流水记录操作人与原因。 */
    @PostMapping("/users/{userId}/credits/adjust")
    @Transactional
    public Map<String, Object> adjust(@RequestAttribute("userId") String operatorId,
                                      @PathVariable String userId,
                                      @RequestBody AdjustCreditRequest request) {
        if (request == null || request.getAmount() == null) throw new IllegalArgumentException("调整量不能为空");
        int balance = creditService.adjust(userId, request.getAmount(), request.getReason(), operatorId);
        log.info("管理端积分调整成功，operator={} userId={} amount={}", operatorId, userId, request.getAmount());
        return Map.of("balance", balance);
    }

    /** 分页查询积分流水，可按用户/类型/时间段筛选。 */
    @GetMapping("/credits/transactions")
    public Map<String, Object> listTransactions(@RequestParam(required = false) String userId,
                                                @RequestParam(required = false) String type,
                                                @RequestParam(required = false) String startTime,
                                                @RequestParam(required = false) String endTime,
                                                @RequestParam(defaultValue = "1") int page,
                                                @RequestParam(defaultValue = "20") int size) {
        int safeSize = Math.max(1, Math.min(size, 100));
        int safePage = Math.max(page - 1, 0);
        List<CreditTransactionEntity> items = creditMapper.findTransactions(
                userId, type, startTime, endTime, safeSize, safePage * safeSize);
        long total = creditMapper.countTransactions(userId, type, startTime, endTime);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", total);
        result.put("items", items);
        return result;
    }
}
