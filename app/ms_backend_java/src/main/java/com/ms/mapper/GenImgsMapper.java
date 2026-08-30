package com.ms.mapper;

import com.ms.pojo.entity.AttemptEntity;
import com.ms.pojo.entity.ThreadEntity;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/** Thread 与 Attempt 的持久化操作；删除暂不开放。 */
@Mapper
public interface GenImgsMapper {
    String THREAD_COLUMNS = "id, user_id AS userId, title, reference_images AS referenceImages, status, attempt_count AS attemptCount, created_at AS createdAt, updated_at AS updatedAt, archived_at AS archivedAt";
    String ATTEMPT_COLUMNS = "id, thread_id AS threadId, attempt_no AS attemptNo, status, prompt, model_name AS modelName, size, quality, output_format AS outputFormat, requested_count AS requestedCount, mode, results, external_task_id AS externalTaskId, error_code AS errorCode, error_message AS errorMessage, runtime_metadata AS runtimeMetadata, created_at AS createdAt, started_at AS startedAt, finished_at AS finishedAt, updated_at AS updatedAt";
    @Insert("""
            INSERT INTO threads (id, user_id, title, reference_images, status, attempt_count)
            VALUES (#{id}, #{userId}, #{title}, #{referenceImages}, #{status}, #{attemptCount})
            """)
    int insertThread(ThreadEntity thread);

    @Select("SELECT " + THREAD_COLUMNS + " FROM threads WHERE id = #{id}")
    ThreadEntity findThread(@Param("id") String id);

    @Select("SELECT " + THREAD_COLUMNS + " FROM threads WHERE user_id = #{userId} ORDER BY updated_at DESC")
    List<ThreadEntity> findThreadsByUser(@Param("userId") String userId);

    int updateThread(ThreadEntity thread);

    @Insert("""
            INSERT INTO attempts (id, thread_id, attempt_no, status, prompt, model_name, size, quality, output_format,
                                  requested_count, mode, results, external_task_id, error_code, error_message, runtime_metadata,
                                  started_at, finished_at)
            VALUES (#{id}, #{threadId}, #{attemptNo}, #{status}, #{prompt}, #{modelName}, #{size}, #{quality}, #{outputFormat},
                    #{requestedCount}, #{mode}, #{results}, #{externalTaskId}, #{errorCode}, #{errorMessage}, #{runtimeMetadata},
                    #{startedAt}, #{finishedAt})
            """)
    int insertAttempt(AttemptEntity attempt);

    @Select("SELECT " + ATTEMPT_COLUMNS + " FROM attempts WHERE id = #{id}")
    AttemptEntity findAttempt(@Param("id") String id);

    @Select("SELECT " + ATTEMPT_COLUMNS + " FROM attempts WHERE thread_id = #{threadId} ORDER BY attempt_no DESC")
    List<AttemptEntity> findAttemptsByThread(@Param("threadId") String threadId);

    int updateAttempt(AttemptEntity attempt);
}
