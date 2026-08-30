package com.ms.service;

import com.ms.pojo.dto.GenerateImageDTO;
import com.ms.pojo.vo.ThreadVO;
import com.ms.pojo.entity.AttemptEntity;
import com.ms.pojo.entity.ThreadEntity;
import java.util.List;
import java.io.IOException;

public interface GenImgsService {
    ThreadVO createThread(String userId, GenerateImageDTO request) throws IOException, InterruptedException;
    ThreadVO retry(String threadId, GenerateImageDTO request) throws IOException, InterruptedException;
    ThreadVO getThread(String threadId) throws IOException;
    List<ThreadEntity> findThreads(String userId);
    List<AttemptEntity> findAttempts(String threadId);
    int updateThread(ThreadEntity thread);
    int updateAttempt(AttemptEntity attempt);
}
