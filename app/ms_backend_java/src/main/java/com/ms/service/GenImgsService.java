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
    List<ThreadEntity> findThreads(String userId);
    List<AttemptEntity> findAttempts(String userId, String threadId);
    int updateThread(String userId, ThreadEntity thread);
    int updateAttempt(String userId, AttemptEntity attempt);
}
