/** 统一请求封装：携带登录 Cookie，非 2xx 时抛出后端 message 或兜底文案。 */
export async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    ...options
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    // 401/403 统一广播，让路由守卫跳回登录页。
    if (response.status === 401 || response.status === 403) {
      window.dispatchEvent(new CustomEvent("admin-auth-invalid"));
    }
    throw new Error(result?.message || `请求失败（${response.status}）`);
  }
  // 204 等无响应体场景直接返回空对象。
  if (response.status === 204) return {};
  return response.json().catch(() => ({}));
}

/** 简化的 GET/POST/PUT/DELETE 快捷方法。 */
export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: "DELETE" })
};
