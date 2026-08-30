package com.ms.pojo.vo;
import java.util.List;
/** 一次用户生成任务及其全部尝试记录。 */
public record ThreadVO(String threadId, List<AttemptVO> attempts) {}
