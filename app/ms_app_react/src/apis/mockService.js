/** 模拟后端延迟，后续可在这里替换真实 HTTP 服务。 */
export function wait(milliseconds) { return new Promise((resolve) => window.setTimeout(resolve, milliseconds)); }
/** 模拟异步图片生成生命周期。 */
export async function simulateGeneration(onStage) { onStage("queued"); await wait(850); onStage("working"); await wait(1950); onStage("done"); }
