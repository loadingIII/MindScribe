package com.ms.mapper;

import com.ms.pojo.entity.AttemptEntity;
import com.ms.pojo.entity.ThreadEntity;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/** Thread 与 Attempt 的持久化操作；删除暂不开放。 */
@Mapper
public interface GenImgsMapper {
    String THREAD_COLUMNS = "id, user_id AS userId, title, reference_images AS referenceImages, status, attempt_count AS attemptCount, created_at AS createdAt, updated_at AS updatedAt, archived_at AS archivedAt";
    String ATTEMPT_COLUMNS = "id, thread_id AS threadId, attempt_no AS attemptNo, status, prompt, model_name AS modelName, size, quality, output_format AS outputFormat, requested_count AS requestedCount, mode, parent_attempt_id AS parentAttemptId, results, external_task_id AS externalTaskId, error_code AS errorCode, error_message AS errorMessage, runtime_metadata AS runtimeMetadata, created_at AS createdAt, started_at AS startedAt, finished_at AS finishedAt, updated_at AS updatedAt";
    @Insert("""
            INSERT INTO threads (id, user_id, title, reference_images, status, attempt_count)
            VALUES (#{id}, #{userId}, #{title}, #{referenceImages}, #{status}, #{attemptCount})
            """)
    int insertThread(ThreadEntity thread);

    @Select("SELECT " + THREAD_COLUMNS + " FROM threads WHERE id = #{id}")
    ThreadEntity findThread(@Param("id") String id);

    @Select("SELECT " + THREAD_COLUMNS + " FROM threads WHERE user_id = #{userId} ORDER BY created_at DESC LIMIT #{limit} OFFSET #{offset}")
    List<ThreadEntity> findThreadsByUser(@Param("userId") String userId, @Param("limit") int limit, @Param("offset") int offset);

    int updateThread(ThreadEntity thread);

    @Insert("""
            INSERT INTO attempts (id, thread_id, attempt_no, status, prompt, model_name, size, quality, output_format,
                                  requested_count, mode, parent_attempt_id, results, external_task_id, error_code, error_message, runtime_metadata,
                                  started_at, finished_at)
            VALUES (#{id}, #{threadId}, #{attemptNo}, #{status}, #{prompt}, #{modelName}, #{size}, #{quality}, #{outputFormat},
                    #{requestedCount}, #{mode}, #{parentAttemptId}, #{results}, #{externalTaskId}, #{errorCode}, #{errorMessage}, #{runtimeMetadata},
                    #{startedAt}, #{finishedAt})
            """)
    int insertAttempt(AttemptEntity attempt);

    @Select("SELECT " + ATTEMPT_COLUMNS + " FROM attempts WHERE id = #{id}")
    AttemptEntity findAttempt(@Param("id") String id);

    /**
     * 原子分配下一个 attempt 序号：attempt_count 自增 1。
     * 并发重试各自推进计数，配合"取回值 > 0 即本次分配值"的校验避免序号冲突；
     * 返回影响行数为 0 表示 Thread 不存在。分配值由调用方在事务内回读确认。
     */
    @Update("""
            UPDATE threads
            SET attempt_count = attempt_count + 1, updated_at = CURRENT_TIMESTAMP(3)
            WHERE id = #{threadId}
            """)
    int incrementAttemptCount(@Param("threadId") String threadId);

    @Select("SELECT " + ATTEMPT_COLUMNS + " FROM attempts WHERE thread_id = #{threadId} ORDER BY attempt_no DESC LIMIT #{limit} OFFSET #{offset}")
    List<AttemptEntity> findAttemptsByThread(@Param("threadId") String threadId, @Param("limit") int limit, @Param("offset") int offset);

    /** 查询指定父 Attempt 的直接子节点（按创建时间正序），用于构建迭代树。 */
    @Select("SELECT " + ATTEMPT_COLUMNS + " FROM attempts WHERE parent_attempt_id = #{parentAttemptId} ORDER BY created_at ASC")
    List<AttemptEntity> findAttemptsByParent(@Param("parentAttemptId") String parentAttemptId);

    /** 查询停留在 pending/running 且早于阈值的僵死 Attempt（含属主 userId），供兜底任务关闭并返还。 */
    @Select("""
            SELECT a.id, a.thread_id AS threadId, t.user_id AS userId
            FROM attempts a
            JOIN threads t ON t.id = a.thread_id
            WHERE a.status IN ('pending', 'running') AND a.created_at < #{threshold}
            ORDER BY a.created_at
            LIMIT #{limit}
            """)
    List<java.util.Map<String, Object>> findStaleAttempts(@Param("threshold") java.time.LocalDateTime threshold, @Param("limit") int limit);

    /** 仅当 Thread 仍停留在 pending/running 时把状态推进为指定值，避免覆盖更新的 Attempt 状态。 */
    @Update("""
            UPDATE threads
            SET status = #{status}, updated_at = CURRENT_TIMESTAMP(3)
            WHERE id = #{threadId} AND status IN ('pending', 'running')
            """)
    int updateThreadStatusIfPending(@Param("threadId") String threadId, @Param("status") String status);

    int updateAttempt(AttemptEntity attempt);
}
