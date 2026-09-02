/** 统一携带浏览器会话 Cookie，并将失效会话通知应用层。 */
export function installAuthFetch() {
  if (window.__mindscribeAuthFetchInstalled) return;
  const nativeFetch = window.fetch.bind(window);
  /** 统一为同源请求携带认证 Cookie，并处理失效登录态。 */
  window.fetch = async (input, init = {}) => {
    const requestUrl = typeof input === "string" ? input : input?.url || "";
    const isSameOrigin = requestUrl.startsWith("/") || requestUrl.startsWith(window.location.origin);
    const response = await nativeFetch(input, isSameOrigin ? { ...init, credentials: init.credentials || "include" } : init);
    const path = requestUrl.startsWith(window.location.origin) ? new URL(requestUrl).pathname : requestUrl;
    if ((response.status === 401 || response.status === 403) && !path.startsWith("/auth/login")) {
      window.dispatchEvent(new CustomEvent("mindscribe-auth-invalid"));
    }
    return response;
  };
  window.__mindscribeAuthFetchInstalled = true;
}
