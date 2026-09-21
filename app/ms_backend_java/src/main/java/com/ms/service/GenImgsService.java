package com.ms.service;

import com.ms.pojo.dto.GenerateImageDTO;
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
}
