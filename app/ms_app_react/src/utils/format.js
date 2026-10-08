/** 将数量转为适合紧凑 UI 展示的文本。 */
export function formatCompactNumber(value) { return value > 999 ? `${(value / 1000).toFixed(1)}k` : String(value); }

/** 格式化日期为年-月-日；缺失或无法解析时返回空串。 */
export function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\//g, "-");
}

/** 格式化为相对时间（分钟/小时前）；超过 30 天或无法解析时退回日期展示。 */
export function formatRelativeTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const elapsed = Date.now() - date.getTime();
  if (elapsed <= 0 || elapsed > 30 * 24 * 60 * 60 * 1000) return formatDate(value);
  if (elapsed < 60 * 60 * 1000) return `${Math.max(1, Math.floor(elapsed / (60 * 1000)))} 分钟前`;
  return `${Math.floor(elapsed / (60 * 60 * 1000))} 小时前`;
}
