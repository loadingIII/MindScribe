package com.ms.service;

import com.ms.pojo.dto.GenerateImageDTO;
import com.ms.pojo.vo.IterationTreeVO;
import com.ms.pojo.vo.ThreadVO;
import com.ms.pojo.entity.AttemptEntity;
import com.ms.pojo.entity.ThreadEntity;
import java.util.List;
import java.io.IOException;

public interface GenImgsService {
    ThreadVO createThread(String userId, GenerateImageDTO request) throws IOException, InterruptedException;
    ThreadVO retry(String userId, String threadId, GenerateImageDTO request) throws IOException, InterruptedException;
    ThreadVO getThread(String userId, String threadId) throws IOException;
    List<ThreadEntity> findThreads(String userId, int page, int size);
    List<AttemptEntity> findAttempts(String userId, String threadId, int page, int size);
    /** 客户端仅允许重命名 Thread；状态、结果等字段只能由服务端状态机维护。 */
    int renameThread(String userId, String threadId, String title);
    /** 构建指定 Thread 的迭代树：以首个 Attempt 为根，按 parent_attempt_id 逐层展开。 */
    IterationTreeVO getIterationTree(String userId, String threadId) throws IOException;
    /** 校验 Attempt 属主并返回其所属 Thread ID，供基于节点的迭代入口反查归属。 */
    String resolveThreadIdByAttempt(String userId, String attemptId);
}
