package com.ms.utils;

import com.aliyun.oss.OSS;
import com.aliyun.oss.OSSClientBuilder;
import com.aliyun.oss.model.ObjectMetadata;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Date;
import java.util.UUID;

/** 通用 OSS 上传工具，负责将上传文件保存并生成临时访问地址。 */
@Component
public class OssStorageUtil {
    private static final org.slf4j.Logger log = LogUtil.getLogger(OssStorageUtil.class);
    private final OSS client;
    private final String bucket;
    private final String endpointHost;
    private final long expireSeconds;

    public OssStorageUtil(@Value("${oss.endpoint}") String endpoint,
                          @Value("${oss.access-key-id}") String accessKeyId,
                          @Value("${oss.access-key-secret}") String accessKeySecret,
                          @Value("${oss.bucket-name}") String bucket,
                          @Value("${oss.url-expire-seconds}") long expireSeconds) {
        // OSS SDK 要求 Endpoint 带协议；配置中即使只填写域名也自动补全。
        String normalizedEndpoint = endpoint.startsWith("http://") || endpoint.startsWith("https://")
                ? endpoint
                : "https://" + endpoint;
        this.client = new OSSClientBuilder().build(normalizedEndpoint, accessKeyId, accessKeySecret);
        this.bucket = bucket;
        this.endpointHost = normalizedEndpoint.replaceFirst("^https?://", "").replaceAll("/$", "");
        this.expireSeconds = expireSeconds;
    }

    /** 上传 MultipartFile，并按 yyyy/MM/dd/随机ID-文件名 生成对象路径后返回签名 URL。 */
    public String upload(MultipartFile file, String prefix) throws IOException {
        if (file == null || file.isEmpty()) {
            log.warn("拒绝上传空文件，prefix={}", prefix);
            throw new IOException("上传图片不能为空");
        }
        String originalName = file.getOriginalFilename();
        String fileName = originalName == null || originalName.isBlank()
                ? UUID.randomUUID() + ".bin"
                : originalName.replace("\\", "/").substring(originalName.replace("\\", "/").lastIndexOf('/') + 1);
        String datePath = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy/MM/dd"));
        String uniqueFileName = UUID.randomUUID().toString().replace("-", "") + "-" + fileName;
        String name = (prefix == null || prefix.isBlank() ? "" : prefix.replaceAll("^/+|/+$", "") + "/")
                + datePath + "/" + uniqueFileName;
        ObjectMetadata metadata = new ObjectMetadata();
        metadata.setContentType(file.getContentType());
        log.debug("开始上传文件，bucket={} prefix={} size={}", bucket, prefix, file.getSize());
        try {
            client.putObject(bucket, name, file.getInputStream(), metadata);
            // 数据库存储稳定的对象地址，不保存会过期的签名参数。
            String url = "https://" + bucket + "." + endpointHost + "/" + name;
            log.info("文件上传成功，bucket={} object={}", bucket, name);
            return url;
        } catch (RuntimeException e) {
            log.error("文件上传失败，bucket={} object={}", bucket, name, e);
            throw e;
        }
    }
}
