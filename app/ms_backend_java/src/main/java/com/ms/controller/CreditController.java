package com.ms.controller;

import com.ms.service.CreditService;
import com.ms.service.PricingService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** 用户积分查询接口：余额与预估消耗，JWT 登录即可访问。 */
@RestController
@RequestMapping("/credits")
public class CreditController {
    private final CreditService creditService;
    private final PricingService pricingService;

    public CreditController(CreditService creditService, PricingService pricingService) {
        this.creditService = creditService;
        this.pricingService = pricingService;
    }

    /** 返回当前登录用户的积分余额。 */
    @GetMapping("/balance")
    public Map<String, Object> balance(@org.springframework.web.bind.annotation.RequestAttribute("userId") String userId) {
        return Map.of("balance", creditService.balance(userId));
    }

    /** 预估一次生图消耗，用于提交前展示「本次预计消耗 X 积分」；mode 决定按文生图或图生图计价。 */
    @GetMapping("/estimate")
    public Map<String, Object> estimate(@org.springframework.web.bind.annotation.RequestAttribute("userId") String userId,
                                        @RequestParam(defaultValue = "gpt-image-2") String model,
                                        @RequestParam(defaultValue = "auto") String size,
                                        @RequestParam(defaultValue = "high") String quality,
                                        @RequestParam(defaultValue = "text-to-image") String mode,
                                        @RequestParam(defaultValue = "1") int n) {
        int cost = pricingService.quote(PricingService.ACTION_IMAGE_GENERATION, model, mode, size, quality, n);
        return Map.of("cost", cost, "balance", creditService.balance(userId));
    }
}
