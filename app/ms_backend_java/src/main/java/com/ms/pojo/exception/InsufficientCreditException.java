package com.ms.pojo.exception;

/** 余额不足或积分变动冲突时抛出，由 GlobalExceptionHandler 映射为 409。 */
public class InsufficientCreditException extends RuntimeException {
    /** 用面向用户的提示创建异常。 */
    public InsufficientCreditException(String message) { super(message); }
}
