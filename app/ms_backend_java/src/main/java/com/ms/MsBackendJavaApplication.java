package com.ms;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/** 开启定时任务：计价规则兜底刷新与僵死 Attempt 清理依赖 @Scheduled。 */
@SpringBootApplication
@EnableScheduling
public class MsBackendJavaApplication {

    public static void main(String[] args) {
        SpringApplication.run(MsBackendJavaApplication.class, args);
    }

}
