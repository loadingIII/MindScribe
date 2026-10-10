package com.ms.controller;

import com.ms.mapper.CreditMapper;
import com.ms.service.CreditService;
import com.ms.service.PricingService;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 用户积分查询接口：余额、预估消耗与个人流水，JWT 登录即可访问。 */
@RestController
@RequestMapping("/credits")
public class CreditController {
    private final CreditService creditService;
    private final PricingService pricingService;
    private final CreditMapper creditMapper;

    public CreditController(CreditService creditService, PricingService pricingService, CreditMapper creditMapper) {
        this.creditService = creditService;
        this.pricingService = pricingService;
        this.creditMapper = creditMapper;
    }

    /** 返回当前登录用户的积分余额。 */
    @GetMapping("/balance")
    public Map<String, Object> balance(@RequestAttribute("userId") String userId) {
        return Map.of("balance", creditService.balance(userId));
    }

    /**
     * 预估一次生图消耗，用于提交前展示「本次预计消耗 X 积分」。
     * mode 与实际扣费（GenImgsService.quote）保持同一口径：有参考图即按图生图计价，
     * 前端传入的 mode 仅作为请求体里未携带参考图场景的补充，不一致时以参考图判定为准。
     */
    @GetMapping("/estimate")
    public Map<String, Object> estimate(@RequestAttribute("userId") String userId,
                                        @RequestParam(defaultValue = "gpt-image-2") String model,
                                        @RequestParam(defaultValue = "auto") String size,
                                        @RequestParam(defaultValue = "high") String quality,
                                        @RequestParam(defaultValue = "text-to-image") String mode,
                                        @RequestParam(defaultValue = "1") int n,
                                        @RequestParam(required = false) Integer referenceCount) {
        int safeN = Math.max(1, Math.min(n, 4));
        boolean hasReference = referenceCount != null && referenceCount > 0;
        String effectiveMode = hasReference ? PricingService.MODE_IMAGE_TO_IMAGE : mode;
        int cost = pricingService.quote(PricingService.ACTION_IMAGE_GENERATION, model, effectiveMode, size, quality, safeN);
        return Map.of("cost", cost, "balance", creditService.balance(userId));
    }

    /** 分页返回当前登录用户自己的积分流水，供个人中心展示；userId 强制取 JWT，不可查看他人流水。 */
    @GetMapping("/transactions")
    public Map<String, Object> transactions(@RequestAttribute("userId") String userId,
                                            @RequestParam(required = false) String type,
                                            @RequestParam(defaultValue = "1") int page,
                                            @RequestParam(defaultValue = "20") int size) {
        int safeSize = Math.max(1, Math.min(size, 100));
        int safePage = Math.max(page - 1, 0);
        List<com.ms.pojo.entity.CreditTransactionEntity> items =
                creditMapper.findTransactions(userId, type, null, null, safeSize, safePage * safeSize);
        long total = creditMapper.countTransactions(userId, type, null, null);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", total);
        result.put("items", items);
        return result;
    }
}
