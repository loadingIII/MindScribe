package com.ms.service.impl;

import com.ms.mapper.CreditMapper;
import com.ms.pojo.entity.CreditTransactionEntity;
import com.ms.pojo.exception.InsufficientCreditException;
import com.ms.service.CreditService;
import com.ms.utils.LogUtil;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 积分账务实现：余额变动与流水写入同事务，幂等依赖 uk_attempt_type 唯一键。 */
@Service
public class CreditServiceImpl implements CreditService {
    private static final org.slf4j.Logger log = LogUtil.getLogger(CreditServiceImpl.class);

    /** 流水类型：生图预扣。 */
    private static final String TYPE_CONSUME = "consume";
    /** 流水类型：生成失败返还。 */
    private static final String TYPE_REFUND = "refund";
    /** 流水类型：管理端调整（充值/扣减）。 */
    private static final String TYPE_ADJUST = "adjust";

    private final CreditMapper creditMapper;

    public CreditServiceImpl(CreditMapper creditMapper) {
        this.creditMapper = creditMapper;
    }

    @Override
    @Transactional
    public int deduct(String userId, String attemptId, int cost) {
        if (cost <= 0) throw new IllegalArgumentException("扣减积分必须大于 0");
        // 原子扣减：影响行数为 0 即余额不足（或用户不存在/被禁用），不产生任何流水。
        if (creditMapper.deductBalance(userId, cost) == 0) {
            log.info("积分预扣失败（余额不足），userId={} attemptId={} cost={}", userId, attemptId, cost);
            throw new InsufficientCreditException("积分不足，无法发起生成");
        }
        Integer balance = creditMapper.findBalance(userId);
        // 扣减成功后写流水；同一 (attemptId, consume) 重复写入会因唯一键冲突回滚本次扣减。
        creditMapper.insertTransaction(tx(userId, attemptId, TYPE_CONSUME, -cost,
                balance == null ? 0 : balance, "生成图片预扣", null));
        log.info("积分预扣成功，userId={} attemptId={} cost={} balance={}", userId, attemptId, cost, balance);
        return balance == null ? 0 : balance;
    }

    @Override
    @Transactional
    public void refund(String userId, String attemptId, String reason) {
        // 金额以 consume 流水为唯一依据，避免重新计价与扣减时不一致。
        CreditTransactionEntity consume = creditMapper.findTransactionByAttempt(attemptId, TYPE_CONSUME);
        if (consume == null) {
            log.warn("返还跳过：未找到对应的 consume 流水，attemptId={}", attemptId);
            return;
        }
        int amount = Math.abs(consume.getAmount());
        CreditTransactionEntity refund = tx(userId, attemptId, TYPE_REFUND, amount,
                0, reason, null);
        try {
            // 先写流水占位：同一 (attemptId, refund) 重复返还时唯一键冲突，直接返回实现幂等。
            creditMapper.insertTransaction(refund);
        } catch (DuplicateKeyException ignored) {
            log.info("返还已执行过，跳过重复返还，attemptId={}", attemptId);
            return;
        }
        // 流水占位成功后再加余额；余额更新与流水在同一事务，任一失败整体回滚。
        creditMapper.addBalance(userId, amount);
        Integer balance = creditMapper.findBalance(userId);
        refund.setBalanceAfter(balance == null ? 0 : balance);
        log.info("积分返还成功，userId={} attemptId={} amount={} balance={}",
                userId, attemptId, amount, refund.getBalanceAfter());
    }

    @Override
    @Transactional
    public int adjust(String userId, int amount, String reason, String operatorId) {
        if (amount == 0) throw new IllegalArgumentException("调整量不能为 0");
        if (reason == null || reason.isBlank()) throw new IllegalArgumentException("调整原因必填");
        if (amount < 0) {
            // 负向调整同样走原子扣减，避免把余额扣成负数。
            if (creditMapper.deductBalance(userId, -amount) == 0) {
                throw new InsufficientCreditException("用户余额不足本次扣减");
            }
        } else if (creditMapper.addBalance(userId, amount) == 0) {
            throw new IllegalArgumentException("用户不存在或已被禁用");
        }
        Integer balance = creditMapper.findBalance(userId);
        creditMapper.insertTransaction(tx(userId, null, TYPE_ADJUST, amount,
                balance == null ? 0 : balance, reason, operatorId));
        log.info("积分调整完成，userId={} amount={} operator={} balance={}", userId, amount, operatorId, balance);
        return balance == null ? 0 : balance;
    }

    @Override
    public int balance(String userId) {
        Integer balance = creditMapper.findBalance(userId);
        if (balance == null) throw new IllegalArgumentException("用户不存在");
        return balance;
    }

    /** 构造流水记录；balanceAfter 为变动后的余额快照。 */
    private CreditTransactionEntity tx(String userId, String attemptId, String type, int amount,
                                       Integer balanceAfter, String reason, String operatorId) {
        CreditTransactionEntity entity = new CreditTransactionEntity();
        entity.setUserId(userId);
        entity.setAttemptId(attemptId);
        entity.setType(type);
        entity.setAmount(amount);
        entity.setBalanceAfter(balanceAfter == null ? 0 : balanceAfter);
        entity.setReason(reason);
        entity.setOperatorId(operatorId);
        return entity;
    }
}
