/** 将数量转为适合紧凑 UI 展示的文本。 */
export function formatCompactNumber(value) { return value > 999 ? `${(value / 1000).toFixed(1)}k` : String(value); }
