# 多阶段构建：先用 Maven 完成编译打包，再使用精简 JRE 镜像运行。
# 构建阶段：Maven 3.9 + JDK 17，与 pom.xml 中的 java.version=17 保持一致。
FROM maven:3.9-eclipse-temurin-17 AS builder

WORKDIR /build

# 先复制 pom.xml 并预下载依赖，利用 Docker 层缓存加速后续构建。
COPY pom.xml ./
RUN mvn -q dependency:go-offline

# 再复制源码并打包（跳过测试，测试依赖外部环境）。
COPY src ./src
RUN mvn -q -DskipTests package

# 运行阶段：仅使用 JRE 17，减小镜像体积。
FROM eclipse-temurin:17-jre

WORKDIR /app

# 将打包出的可执行 jar 统一复制为 app.jar，便于启动命令引用。
COPY --from=builder /build/target/*.jar app.jar

# 容器内监听 8080（Spring Boot 默认端口），由 docker-compose 映射到主机端口。
EXPOSE 8080

# 通过环境变量注入数据库/Redis/OSS/LLM 等配置（见 application.yml）。
ENTRYPOINT ["java", "-jar", "app.jar"]
