/** 迭代树的自定义节点：缩略图 + 编号 + 类型标签 + "添加子节点"按钮。 */
import { memo } from "react";
import { Handle, Position } from "reactflow";
import { Loader2, Plus, AlertCircle, ImagePlus } from "lucide-react";

/** 画面左上角的状态角标：生成中转圈，失败显示警示。 */
function StatusBadge({ status }) {
  if (status === "running" || status === "pending") {
    return <span className="tree-node-badge is-running" title="生成中"><Loader2 size={12} className="tree-node-spin" /></span>;
  }
  if (status === "failed") {
    return <span className="tree-node-badge is-failed" title="生成失败"><AlertCircle size={12} /></span>;
  }
  return null;
}

function CustomTreeNode({ data, selected }) {
  // 空白占位节点：只展示提示信息，点击节点本体即进入创作页（由画布的节点点击处理）。
  if (data.isBlank) {
    return (
      <div className="tree-node is-blank">
        <Handle type="target" position={Position.Left} className="tree-node-handle" isConnectable={false} />
        <Handle type="source" position={Position.Right} className="tree-node-handle" isConnectable={false} />
        <div className="tree-node-image is-blank-image"><Plus size={22} /></div>
        <div className="tree-node-info">
          <div className="tree-node-title"><b>新节点</b><span>待创作</span></div>
          <p className="tree-node-prompt">点击进入创作页面，填写提示词后生成图片</p>
        </div>
      </div>
    );
  }

  const typeLabel = data.isRoot ? "原图" : data.iterationType === "initial" ? "初始" : "优化";
  // 根节点（原图）始终可以新增子节点；生成节点需已成功产出结果图。
  const canAddChild = data.isRoot || data.status === "succeeded";
  return (
    <div
      className={[
        "tree-node",
        data.isRoot ? "is-root" : "",
        selected ? "is-selected" : "",
        data.isCurrent ? "is-current" : "",
        data.isFailed ? "is-failed" : ""
      ].filter(Boolean).join(" ")}
    >
      {/* 连接桩：横向布局下左侧接收、右侧输出。 */}
      <Handle type="target" position={Position.Left} className="tree-node-handle" isConnectable={false} />
      <Handle type="source" position={Position.Right} className="tree-node-handle" isConnectable={false} />

      <StatusBadge status={data.status} />

      <div className="tree-node-image">
        {data.isRoot && !data.imageUrl && (
          <span className="tree-node-image-empty"><ImagePlus size={18} /></span>
        )}
        {data.imageUrl && <img src={data.imageUrl} alt={data.label} loading="lazy" draggable={false} />}
        {data.isCurrent && <span className="tree-node-current-tag">当前</span>}
      </div>

      <div className="tree-node-info">
        <div className="tree-node-title">
          <b>{data.label}</b>
          <span>{typeLabel}</span>
        </div>
        <p className="tree-node-prompt" title={data.prompt}>
          {data.isRoot ? "用户上传的原始参考图，可作为起点开始创作" : (data.prompt || "暂无提示词")}
        </p>
      </div>

      <button
        type="button"
        className="tree-node-continue"
        title={canAddChild ? "在该节点下新增一个待创作节点" : "仅已生成的节点可以添加子节点"}
        onClick={(event) => {
          // 阻止事件冒泡，避免触发画布的节点选中逻辑。
          event.stopPropagation();
          if (canAddChild) data.onAddChild?.(data);
        }}
        disabled={!canAddChild}
      >
        <Plus size={13} />
        添加子节点
      </button>
    </div>
  );
}

// 节点数据在选中态变化之外保持稳定，memo 避免画布拖拽时全量重渲染。
export default memo(CustomTreeNode);
