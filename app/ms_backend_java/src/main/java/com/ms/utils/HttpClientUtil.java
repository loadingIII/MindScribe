package com.ms.utils;

import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Value;

import java.io.IOException;
import java.net.URI;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.net.URLEncoder;

/**
 * 通用 HTTP 调用工具，不绑定任何具体业务或服务地址。
 * 调用方传入完整 URL，即可复用于图片、文本等其他本地服务。
 */
@Component
public class HttpClientUtil {
    private static final org.slf4j.Logger log = LogUtil.getLogger(HttpClientUtil.class);
    private final HttpClient client;
    private final Duration readTimeout;

    /** 使用默认超时创建工具实例，适合一般请求。 */
    public HttpClientUtil(@Value("${http-client.connect-timeout:5s}") Duration connectTimeout,
                          @Value("${http-client.read-timeout:60s}") Duration readTimeout) {
        this.readTimeout = readTimeout;
        this.client = HttpClient.newBuilder().connectTimeout(connectTimeout).build();
    }

    /** 发起 GET 请求并返回文本响应。 */
    public HttpResponse<String> get(String url) throws IOException, InterruptedException {
        return send(HttpRequest.newBuilder(URI.create(url)).timeout(readTimeout).GET().build());
    }

    /**
     * 发起 multipart/form-data POST 请求。
     * Part 可表示普通文本字段，也可表示二进制文件字段。
     */
    public HttpResponse<String> postMultipart(String path, List<Part> parts)
            throws IOException, InterruptedException {
        String boundary = "----MindScribe-" + UUID.randomUUID();
        List<byte[]> chunks = new ArrayList<>();
        for (Part part : parts) {
            chunks.add(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + part.name()
                    + (part.filename() == null ? "\"" : "\"; filename=\"" + part.filename() + "\"")
                    + "\r\nContent-Type: " + (part.contentType() == null ? "text/plain; charset=UTF-8" : part.contentType()) + "\r\n"
                    + "\r\n").getBytes(StandardCharsets.UTF_8));
            chunks.add(part.value());
            chunks.add("\r\n".getBytes(StandardCharsets.UTF_8));
        }
        chunks.add(("--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
        byte[] body = chunks.stream().reduce(new byte[0], (a, b) -> {
            byte[] result = new byte[a.length + b.length];
            System.arraycopy(a, 0, result, 0, a.length);
            System.arraycopy(b, 0, result, a.length, b.length);
            return result;
        });
        HttpRequest request = HttpRequest.newBuilder(URI.create(path)).timeout(readTimeout)
                .header("Content-Type", MediaType.MULTIPART_FORM_DATA_VALUE + "; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofByteArray(body)).build();
        return send(request);
    }

    /** 发送标准 URL 编码表单，适合只包含文本字段的服务请求。 */
    public SimpleHttpResponse postForm(String url, List<Part> parts)
            throws IOException, InterruptedException {
        long start = System.nanoTime();
        log.debug("发起表单 POST 请求，uri={} parts={}", url, parts == null ? 0 : parts.size());
        StringBuilder body = new StringBuilder();
        for (Part part : parts) {
            if (body.length() > 0) body.append('&');
            body.append(URLEncoder.encode(part.name(), StandardCharsets.UTF_8))
                    .append('=')
                    .append(URLEncoder.encode(new String(part.value(), StandardCharsets.UTF_8), StandardCharsets.UTF_8));
        }
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout((int) readTimeout.toMillis());
        connection.setReadTimeout((int) readTimeout.toMillis());
        connection.setDoOutput(true);
        byte[] requestBody = body.toString().getBytes(StandardCharsets.UTF_8);
        connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
        connection.setFixedLengthStreamingMode(requestBody.length);
        try (var output = connection.getOutputStream()) {
            output.write(requestBody);
        }
        int status = connection.getResponseCode();
        try (var input = status >= 400 ? connection.getErrorStream() : connection.getInputStream()) {
            String responseBody = input == null ? "" : new String(input.readAllBytes(), StandardCharsets.UTF_8);
            if (status >= 400) {
                log.error("表单 POST 请求失败，status={} uri={} elapsedMs={}", status, url,
                        (System.nanoTime() - start) / 1_000_000);
                throw new IOException("图片生成服务返回 HTTP " + status + ": " + responseBody);
            }
            log.debug("表单 POST 请求完成，status={} uri={} elapsedMs={}", status, url,
                    (System.nanoTime() - start) / 1_000_000);
            return new SimpleHttpResponse(responseBody);
        }
    }

    private HttpResponse<String> send(HttpRequest request) throws IOException, InterruptedException {
        long start = System.nanoTime();
        log.debug("发起 HTTP 请求，method={} uri={}", request.method(), request.uri());
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        log.debug("HTTP 请求完成，status={} elapsedMs={}", response.statusCode(), (System.nanoTime() - start) / 1_000_000);
        if (response.statusCode() >= 400) {
            log.error("HTTP 请求失败，status={} uri={}", response.statusCode(), request.uri());
            throw new IOException("图片生成服务返回 HTTP " + response.statusCode() + ": " + response.body());
        }
        return response;
    }

    /** multipart 表单的一项，filename 为空时表示普通文本字段。 */
    public record Part(String name, byte[] value, String filename, String contentType) {
        public static Part text(String name, String value) { return new Part(name, value.getBytes(StandardCharsets.UTF_8), null, null); }
        public static Part file(String name, String filename, String contentType, byte[] value) { return new Part(name, value, filename, contentType); }
    }

    /** 统一表单调用的最小响应适配器。 */
    public record SimpleHttpResponse(String body) {}
}
