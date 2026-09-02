package com.ms.config;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** 将后端异常统一转换为前端可展示的错误结构。 */
@RestControllerAdvice
public class GlobalExceptionHandler {
    /** 处理请求体校验失败，返回第一条字段错误信息。 */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidation(MethodArgumentNotValidException exception) {
        String message = exception.getBindingResult().getFieldErrors().stream()
                .findFirst().map(error -> error.getDefaultMessage()).orElse("请求参数不合法");
        return response(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", message);
    }

    /** 处理业务参数错误。 */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleIllegalArgument(IllegalArgumentException exception) {
        return response(HttpStatus.BAD_REQUEST, "BAD_REQUEST", exception.getMessage());
    }

    /** 处理未被控制器显式转换的业务状态错误。 */
    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>> handleIllegalState(IllegalStateException exception) {
        return response(HttpStatus.CONFLICT, "BUSINESS_ERROR", exception.getMessage());
    }

    /** 处理未预期异常，避免将堆栈信息暴露给客户端。 */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleUnknown(Exception exception) {
        return response(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务暂时不可用，请稍后重试");
    }

    /** 构造统一错误响应。 */
    private ResponseEntity<Map<String, String>> response(HttpStatus status, String code, String message) {
        Map<String, String> body = new LinkedHashMap<>();
        body.put("code", code);
        body.put("message", message == null || message.isBlank() ? "请求处理失败" : message);
        return ResponseEntity.status(status).body(body);
    }
}
