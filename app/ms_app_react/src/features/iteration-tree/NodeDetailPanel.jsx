/** 节点详情侧栏：画布右侧固定展示选中节点的图片、提示词、参数，并提供"从这里继续创作"入口。 */
import { useState } from "react";
import { ChevronDown, Download, Maximize2, X } from "lucide-react";

/** 将 ISO 时间格式化为中文可读文本；无效值显示"暂无"。 */
function formatCreatedAt(value) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  }).replace(/\//g, "-");
}

export default function NodeDetailPanel({ node, isOpen, onToggle }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  if (!node) return null;

  const typeLabel = node.iterationType === "initial" ? "初始生成" : "优化迭代";
  // 下载文件名使用节点编号，避免提示词中的非法字符破坏文件系统。
  const filename = `mindscribe-iteration-${node.label.replace("#", "")}.png`;

  return (
    <>
      {previewOpen && (
        <div className="tree-node-preview-backdrop" role="dialog" aria-modal="true" onClick={() => setPreviewOpen(false)}>
          <img src={node.imageUrl} alt={node.label} onClick={(event) => event.stopPropagation()} />
          <button type="button" className="tree-node-preview-close" onClick={() => setPreviewOpen(false)} title="关闭"><X size={18} /></button>
        </div>
      )}
      <aside className={`node-detail-panel ${isOpen ? "open" : "collapsed"}`}>
        <button type="button" className="panel-toggle" onClick={onToggle} aria-expanded={isOpen} aria-label={isOpen ? "收起详情" : "展开详情"}>
          {/* 右侧栏语义：展开时箭头向右（收起方向），收起时箭头向左（展开方向）。 */}
          <ChevronDown size={16} className={isOpen ? "rotated" : ""} />
          <span>{isOpen ? "收起详情" : node ? `节点详情 ${node.label}` : "节点详情"}</span>
        </button>

        {isOpen && (
          <div className="panel-content">
            <div className="panel-preview">
              {node.imageUrl
                ? <img src={node.imageUrl} alt={node.label} onClick={() => setPreviewOpen(true)} title="点击查看大图" />
                : <div className="panel-preview-empty">{node.status === "failed" ? "生成失败" : "暂无结果图"}</div>}
              <div className="preview-actions">
                {node.imageUrl && (
                  <>
                    <button type="button" onClick={() => setPreviewOpen(true)}><Maximize2 size={13} />大图</button>
                    <button type="button" onClick={() => { const anchor = document.createElement("a"); anchor.href = node.imageUrl; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); }}>
                      <Download size={13} />下载
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="panel-details">
              <div className="detail-section">
                <dl>
                  <div><dt>编号</dt><dd>{node.label} · {typeLabel}</dd></div>
                  <div><dt>深度</dt><dd>第 {node.depth + 1} 层</dd></div>
                  <div><dt>状态</dt><dd>{node.status === "succeeded" ? "已生成" : node.status === "failed" ? "失败" : node.status === "running" ? "生成中" : "待生成"}</dd></div>
                  <div><dt>创建时间</dt><dd>{formatCreatedAt(node.createdAt)}</dd></div>
                  <div><dt>模型</dt><dd>{node.modelName || "暂无"}</dd></div>
                  <div><dt>尺寸 / 质量</dt><dd>{node.size} / {node.quality}</dd></div>
                </dl>
              </div>

              <div className="detail-section">
                <h4>提示词</h4>
                <p className="panel-prompt">{node.prompt || "暂无"}</p>
              </div>

              {node.tags.length > 0 && (
                <div className="detail-section">
                  <h4>标签</h4>
                  <div className="panel-tags">
                    {node.tags.map((tag, index) => <span key={index} title={tag.value ? `${tag.key}：${tag.value}` : tag.key}>{tag.key}{tag.value ? `：${tag.value}` : ""}</span>)}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
