/**
 * 草稿存储工具
 * 用于管理图像解析等功能产生的草稿数据
 */

const DRAFT_STORAGE_KEY = "mindscribe_drafts";
const DRAFT_EXPIRY_DAYS = 7; // 草稿保留天数

/**
 * 生成唯一的草稿 ID
 */
function generateDraftId() {
  return `draft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 获取所有草稿
 */
function getAllDrafts() {
  try {
    const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!stored) return [];
    const drafts = JSON.parse(stored);
    return Array.isArray(drafts) ? drafts : [];
  } catch (error) {
    console.error("读取草稿失败:", error);
    return [];
  }
}

/**
 * 保存草稿
 * @param {Object} draftData - 草稿数据
 * @param {string} draftData.prompt - 提示词内容
 * @param {Array} draftData.tags - 标签数组
 * @param {Array} draftData.references - 参考图数组
 * @param {string} draftData.source - 草稿来源（如 "图像解析"）
 * @param {string} draftData.model - 模型名称
 * @param {string} draftData.type - 草稿类型（如 "parse"）
 * @param {string} [existingId] - 可选：要更新的草稿 ID，传入时不新建
 * @returns {string|null} 草稿 ID，失败返回 null
 */
export function saveDraft(draftData, existingId = null) {
  try {
    const drafts = getAllDrafts();
    const now = Date.now();

    // 传入已有 ID 时更新原草稿，保留创建时间；否则新建。
    if (existingId) {
      const index = drafts.findIndex((d) => d.id === existingId);
      if (index !== -1) {
        drafts[index] = { ...drafts[index], ...draftData, updatedAt: now };
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
        return existingId;
      }
    }

    const draft = {
      id: generateDraftId(),
      type: draftData.type || "parse", // 使用传入的类型，默认为 "parse"
      ...draftData,
      createdAt: now,
      updatedAt: now
    };

    drafts.push(draft);
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));

    return draft.id;
  } catch (error) {
    console.error("保存草稿失败:", error);
    return null;
  }
}

/**
 * 加载指定草稿
 * @param {string} draftId - 草稿 ID
 * @returns {Object|null} 草稿数据，不存在返回 null
 */
export function loadDraft(draftId) {
  try {
    const drafts = getAllDrafts();
    const draft = drafts.find((d) => d.id === draftId);
    return draft || null;
  } catch (error) {
    console.error("加载草稿失败:", error);
    return null;
  }
}

/**
 * 删除指定草稿
 * @param {string} draftId - 草稿 ID
 * @returns {boolean} 是否删除成功
 */
export function deleteDraft(draftId) {
  try {
    const drafts = getAllDrafts();
    const filtered = drafts.filter((d) => d.id !== draftId);
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error("删除草稿失败:", error);
    return false;
  }
}

/**
 * 按类型获取草稿列表
 * @param {string} type - 草稿类型（如 "parse"）
 * @returns {Array} 草稿列表，按更新时间倒序
 */
export function getDraftsByType(type) {
  try {
    const drafts = getAllDrafts();
    return drafts
      .filter((d) => d.type === type)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (error) {
    console.error("获取草稿列表失败:", error);
    return [];
  }
}

/**
 * 清理过期草稿
 * @returns {number} 清理的草稿数量
 */
export function cleanupOldDrafts() {
  try {
    const drafts = getAllDrafts();
    const now = Date.now();
    const expiryTime = DRAFT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    
    const validDrafts = drafts.filter((d) => {
      const age = now - (d.createdAt || 0);
      return age < expiryTime;
    });
    
    const removedCount = drafts.length - validDrafts.length;
    
    if (removedCount > 0) {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(validDrafts));
    }
    
    return removedCount;
  } catch (error) {
    console.error("清理过期草稿失败:", error);
    return 0;
  }
}

/**
 * 格式化相对时间
 * @param {number} timestamp - 时间戳
 * @returns {string} 相对时间文本
 */
export function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  
  if (diff < minute) {
    return "刚刚";
  } else if (diff < hour) {
    const minutes = Math.floor(diff / minute);
    return `${minutes} 分钟前`;
  } else if (diff < day) {
    const hours = Math.floor(diff / hour);
    return `${hours} 小时前`;
  } else if (diff < 7 * day) {
    const days = Math.floor(diff / day);
    return `${days} 天前`;
  } else {
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
}
