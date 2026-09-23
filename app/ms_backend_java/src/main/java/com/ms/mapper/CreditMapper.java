package com.ms.mapper;

import com.ms.pojo.entity.CreditTransactionEntity;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/** 积分流水持久化；uk_attempt_type 唯一键保证扣减与返还的幂等。 */
@Mapper
public interface CreditMapper {
    String TX_COLUMNS = "id, user_id AS userId, attempt_id AS attemptId, type, amount, balance_after AS balanceAfter, reason, operator_id AS operatorId, created_at AS createdAt";

    /** 原子扣减余额：影响行数为 0 表示余额不足或用户不存在/被禁用。 */
    @Update("""
            UPDATE users
            SET credit_balance = credit_balance - #{cost}
            WHERE id = #{userId} AND status = 'active' AND credit_balance >= #{cost}
            """)
    int deductBalance(@Param("userId") String userId, @Param("cost") int cost);

    /** 原子增加余额：返还、充值、调整共用；禁止出现负数增量。 */
    @Update("UPDATE users SET credit_balance = credit_balance + #{amount} WHERE id = #{userId} AND status = 'active'")
    int addBalance(@Param("userId") String userId, @Param("amount") int amount);

    /** 查询当前余额；用户不存在时返回空。 */
    @Select("SELECT credit_balance FROM users WHERE id = #{userId}")
    Integer findBalance(@Param("userId") String userId);

    /** 插入流水；同一 (attempt_id, type) 重复插入会因唯一键冲突抛异常，由事务回滚。 */
    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("""
            INSERT INTO credit_transactions (user_id, attempt_id, type, amount, balance_after, reason, operator_id)
            VALUES (#{userId}, #{attemptId}, #{type}, #{amount}, #{balanceAfter}, #{reason}, #{operatorId})
            """)
    int insertTransaction(CreditTransactionEntity tx);

    /** 查询某次 Attempt 已写入的指定类型流水；返还前据此取原扣减金额。 */
    @Select("SELECT " + TX_COLUMNS + " FROM credit_transactions WHERE attempt_id = #{attemptId} AND type = #{type} LIMIT 1")
    CreditTransactionEntity findTransactionByAttempt(@Param("attemptId") String attemptId, @Param("type") String type);

    /** 回填流水的变动后余额快照：余额变动与流水写入无法同表同语句完成，落库后补写。 */
    @Update("UPDATE credit_transactions SET balance_after = #{balanceAfter} WHERE id = #{id}")
    int updateBalanceAfter(@Param("id") long id, @Param("balanceAfter") int balanceAfter);

    /**
     * 孤儿扣费对账：只返还"Attempt 行从未落库"的真孤儿扣费（进程崩溃在扣费与落库之间）。
     * 必须关联 attempts 表区分三种情况，否则会把成功消费误判为孤儿：
     * - attempt 行不存在：真孤儿，返还；
     * - attempt 已 succeeded：正常消费，绝不返还；
     * - attempt 已 failed 但无 refund 流水：轮询链路漏返的兜底场景，返还。
     * 金额与属主从 consume 流水自携带；attempt 状态滞后于扣费 24 小时仍非终态的，
     * 由 StaleAttemptSweeper 负责关闭，这里不处理在途任务。
     */
    @Select("""
            SELECT c.attempt_id AS attemptId, c.user_id AS userId, ABS(c.amount) AS amount
            FROM credit_transactions c
            LEFT JOIN attempts a ON a.id = c.attempt_id
            WHERE c.type = 'consume'
              AND c.created_at < #{threshold}
              AND NOT EXISTS (
                  SELECT 1 FROM credit_transactions r
                  WHERE r.attempt_id = c.attempt_id AND r.type = 'refund')
              AND (a.id IS NULL OR a.status = 'failed')
            LIMIT #{limit}
            """)
    List<java.util.Map<String, Object>> findOrphanConsumes(@Param("threshold") java.time.LocalDateTime threshold,
                                                           @Param("limit") int limit);

    /** 分页查询流水，条件由 XML 动态拼接。 */
    List<CreditTransactionEntity> findTransactions(@Param("userId") String userId,
                                                   @Param("type") String type,
                                                   @Param("startTime") String startTime,
                                                   @Param("endTime") String endTime,
                                                   @Param("limit") int limit,
                                                   @Param("offset") int offset);

    /** 流水总数，条件与 findTransactions 一致，供分页计算。 */
    long countTransactions(@Param("userId") String userId,
                           @Param("type") String type,
                           @Param("startTime") String startTime,
                           @Param("endTime") String endTime);
}
