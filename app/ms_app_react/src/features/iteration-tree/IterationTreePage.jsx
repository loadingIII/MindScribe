/**
 * 迭代树可视化页面：以横向树状图展示一个任务的完整迭代历史。
 * 点击节点查看详情，双击或点击"继续"可带着该节点的参数与结果图
 * 跳回创作页继续迭代（通过全局草稿 iterationContext 传递上下文）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  useEdgesState,
  useNodesState,
  useReactFlow,
  ReactFlowProvider
} from "reactflow";
import "reactflow/dist/style.css";
import { ArrowLeft, GitBranch, Layers } from "lucide-react";
import { useStore } from "../../store/AppStore";
import { ROUTES } from "../../config/routes";
import CustomTreeNode from "./CustomTreeNode";
import NodeDetailPanel from "./NodeDetailPanel";
import { fetchIterationTree, toReactFlowData, layoutTreeNodes, treeStats } from "./iterationTreeData";

/** React Flow 的自定义节点类型表：模块级常量避免每次渲染重建。 */
const NODE_TYPES = { treeNode: CustomTreeNode };

/** 页面容器：负责加载数据与组织布局，画布逻辑放在内部的 Flow 组件里。 */
export default function IterationTreePage() {
  return (
    <div className="iteration-tree-page">
      <ReactFlowProvider>
        <IterationTreeScreen />
      </ReactFlowProvider>
    </div>
  );
}

function IterationTreeScreen() {
  const { threadId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setDraft, setToast } = useStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tree, setTree] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);

  // 保存最近一次从节点跳转的上下文写入标记，避免创作页重复消费。
  // 当前节点的定位由 URL ?nodeId= 决定，缺省时定位到最新节点。
  const focusNodeId = searchParams.get("nodeId") || tree?.latestNodeId || tree?.rootNodeId || "";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await fetchIterationTree(threadId);
        if (cancelled) return;
        setTree(data);
        // 初始选中"当前节点"，详情面板随之展示，用户可直接继续创作。
        setSelectedNodeId(data.latestNodeId || data.rootNodeId || "");
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || "加载迭代树失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [threadId]);

  const stats = useMemo(() => tree ? treeStats(tree.nodes) : { count: 0, maxDepth: 0 }, [tree]);

  /** 从指定节点继续创作：写入全局草稿并跳转创作页，由创作页消费 iterationContext。 */
  const continueFromNode = useCallback((node) => {
    if (!node) return;
    // 空白占位节点：创建时已嵌入父节点的完整创作上下文，这里直接使用、无需反查。
    if (node.isBlank) {
      const baseImageUrl = node.baseImageUrl;
      if (!baseImageUrl) { setToast("该节点缺少迭代基础图，请重新添加"); return; }
      setDraft((current) => ({
        ...current,
        prompt: "",
        tags: [],
        model: node.modelName || current.model || "gpt-image-2",
        size: node.size || current.size || "auto",
        quality: node.quality || current.quality || "auto",
        references: [{
          id: `iteration-base-${node.parentNodeId}`,
          url: baseImageUrl,
          file: { name: `迭代基础图-${node.parentLabel}.png`, type: "image/png" },
          isIterationBase: true
        }],
        // 迭代上下文：新结果提交时挂到父节点下；父为原图时 parentNodeId 置空走普通重试。
        iterationContext: {
          threadId: tree.threadId,
          threadTitle: tree.title,
          parentNodeId: node.parentIsRoot ? null : node.parentNodeId,
          parentNodeLabel: node.parentLabel,
          baseImageUrl
        }
      }));
      navigate(`/create?from=iteration-tree&threadId=${tree.threadId}&nodeId=${node.parentNodeId}`);
      return;
    }
    // 根节点（原图）始终可以开始；生成节点必须已成功。
    if (!node.isRoot && node.status !== "succeeded") {
      setToast("该节点尚未生成完成，无法继续迭代");
      return;
    }
    // 根节点以用户上传的全部原图为参考；生成节点以自身结果图为迭代基础。
    const references = node.isRoot
      ? (node.referenceImages || []).map((url, index) => ({
        id: `iteration-base-${node.id}-${index}`,
        url,
        file: { name: `原图 ${index + 1}.png`, type: "image/png" },
        isIterationBase: true
      }))
      : [{
        id: `iteration-base-${node.id}`,
        url: node.imageUrl,
        file: { name: `迭代基础图-${node.label}.png`, type: "image/png" },
        // 标记迭代基础图：再次从其它节点继续时替换它而不是无限堆积。
        isIterationBase: true
      }];
    if (!references.length) {
      setToast("该节点没有可用图片");
      return;
    }
    setDraft((current) => ({
      ...current,
      prompt: node.isRoot ? "" : (node.prompt || ""),
      tags: node.isRoot ? [] : (node.tags || []),
      model: node.modelName || current.model || "gpt-image-2",
      size: node.size || current.size || "auto",
      quality: node.quality || current.quality || "auto",
      references,
      // 迭代上下文：创作页据此进入迭代模式；从原图开始时无父节点，提交走普通重试。
      iterationContext: {
        threadId: tree.threadId,
        threadTitle: tree.title,
        parentNodeId: node.isRoot ? null : node.id,
        parentNodeLabel: node.label,
        baseImageUrl: node.isRoot ? references[0]?.url : node.imageUrl
      }
    }));
    navigate(`/create?from=iteration-tree&threadId=${tree.threadId}&nodeId=${node.id}`);
  }, [navigate, setDraft, setToast, tree]);

  if (loading) {
    return (
      <div className="iteration-tree-state">
        <div className="orbit-loader"><span /></div>
        <h2>迭代树加载中</h2>
        <p>正在整理这个任务的全部迭代节点…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="iteration-tree-state">
        <GitBranch size={28} />
        <h2>无法加载迭代树</h2>
        <p>{error}</p>
        <button type="button" className="primary-action" onClick={() => navigate(ROUTES.create)}>
          <ArrowLeft size={15} />返回创作
        </button>
      </div>
    );
  }

  return (
    <IterationTreeScreenInner
      tree={tree}
      stats={stats}
      focusNodeId={focusNodeId}
      selectedNodeId={selectedNodeId}
      onSelectNode={setSelectedNodeId}
      panelOpen={panelOpen}
      onTogglePanel={() => setPanelOpen((open) => !open)}
      onContinue={continueFromNode}
      onBack={() => navigate(ROUTES.create)}
    />
  );
}

/** 画布内部组件：管理 React Flow 的节点/边状态与视图控制。 */
function IterationTreeScreenInner({
  tree, stats, focusNodeId, selectedNodeId, onSelectNode, panelOpen, onTogglePanel, onContinue, onBack
}) {
  const { setToast } = useStore();
  const flow = useReactFlow();
  const wrapperRef = useRef(null);
  const initialData = useMemo(
    () => toReactFlowData(tree, focusNodeId),
    // 树数据与定位节点变化时重算布局；其余渲染期间保持稳定。
    [tree, focusNodeId]
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(initialData.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialData.edges);
  // 初次渲染后把视图聚焦到目标节点，让用户落地即看到"当前"分支。
  const didFocusRef = useRef(false);

  useEffect(() => {
    setNodes(initialData.nodes);
    didFocusRef.current = false;
  }, [initialData, setNodes]);

  useEffect(() => {
    if (didFocusRef.current || !wrapperRef.current || !initialData.nodes.length) return;
    didFocusRef.current = true;
    // 等待布局渲染完成后再聚焦，避免 fitView 拿到空的节点尺寸。
    const timer = setTimeout(() => {
      const target = focusNodeId
        ? initialData.nodes.find((node) => node.id === focusNodeId)
        : null;
      if (target) {
        flow.setCenter(target.position.x + 100, target.position.y + 126, { zoom: 0.9, duration: 400 });
      } else {
        flow.fitView({ padding: 0.2, duration: 400 });
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [initialData, flow, focusNodeId]);

  // 选中态写入节点数据，让自定义节点渲染高亮边框。
  useEffect(() => {
    setNodes((current) => current.map((node) => ({
      ...node,
      selected: node.id === selectedNodeId,
      data: { ...node.data, isSelected: node.id === selectedNodeId }
    })));
  }, [selectedNodeId, setNodes]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = nodes.find((item) => item.id === selectedNodeId);
    return node ? node.data : null;
  }, [nodes, selectedNodeId]);

  /** 单击节点：空白占位节点直接进入创作页；普通节点仅选中并展示详情。 */
  const handleNodeClick = useCallback((event, node) => {
    if (node.data?.isBlank) {
      onContinue(node.data);
      return;
    }
    onSelectNode(node.id);
  }, [onSelectNode, onContinue]);

  /** 双击节点：直接进入"从这里继续创作"。 */
  const handleNodeDoubleClick = useCallback((event, node) => {
    if (node.data?.isBlank) return;
    onContinue(node.data);
  }, [onContinue]);

  // 节点/边的实时快照：addChildNode 通过 ref 读取最新值，自身保持稳定引用，
  // 避免依赖 nodes/edges 造成"更新 → 回调重建 → 绑定 effect 再更新"的无限循环。
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;

  /**
   * 在指定节点下新增一个空白占位子节点：
   * 仅存在于前端画布（无后端记录）。创建时就把父节点的完整创作上下文
   * （迭代基础图、参数等）嵌入节点数据，点击空白节点时无需再反查树数据。
   */
  const addChildNode = useCallback((parentNode) => {
    // 空白节点自身还没有产出图片，不允许再在它下面规划子节点。
    if (parentNode.isBlank) {
      setToast("请先完成该节点的创作，再添加子节点");
      return;
    }
    const blankId = `blank-${parentNode.id}-${Date.now()}`;
    // 父节点为原图时迭代基础取第一张上传原图，否则取父节点结果图。
    const baseImageUrl = parentNode.isRoot
      ? (parentNode.referenceImages || [])[0]
      : parentNode.imageUrl;
    if (!baseImageUrl) {
      setToast("该节点没有可用图片，无法作为迭代基础");
      return;
    }
    const blankNode = {
      id: blankId,
      type: "treeNode",
      position: { x: 0, y: 0 },
      // 自包含上下文：点击空白节点时直接使用，不再依赖 tree.nodes 反查。
      data: {
        isBlank: true,
        isRoot: false,
        isCurrent: false,
        label: "新节点",
        parentNodeId: parentNode.id,
        parentIsRoot: Boolean(parentNode.isRoot),
        parentLabel: parentNode.label,
        baseImageUrl,
        modelName: parentNode.modelName,
        size: parentNode.size,
        quality: parentNode.quality,
        onAddChild: addChildNode
      }
    };
    const nextNodes = [...nodesRef.current, blankNode];
    const nextEdges = [...edgesRef.current, { id: `${parentNode.id}-${blankId}`, source: parentNode.id, target: blankId, type: "smoothstep" }];
    // 连边后整体交给 Dagre 重排，保持横向树形不重叠。
    setNodes(layoutTreeNodes(nextNodes, nextEdges));
    setEdges(nextEdges);
    setToast(`已在节点 ${parentNode.label} 下新增待创作节点，点击它开始创作`);
  }, [setNodes, setEdges, setToast]);

  // 数据重置与回调绑定：initialData 变化时重建节点并注入稳定的 addChildNode。
  useEffect(() => {
    setNodes(initialData.nodes.map((node) => ({
      ...node,
      data: { ...node.data, onAddChild: addChildNode }
    })));
    didFocusRef.current = false;
  }, [initialData, setNodes, addChildNode]);

  /** 复制节点提示词，方便用户在创作页或其它工具中粘贴调整。 */
  const copyPrompt = useCallback(async () => {
    if (!selectedNode?.prompt) { setToast("该节点没有提示词"); return; }
    try {
      await navigator.clipboard.writeText(selectedNode.prompt);
      setToast("提示词已复制");
    } catch {
      setToast("复制失败，请手动选择文本");
    }
  }, [selectedNode, setToast]);

  return (
    <div className="iteration-tree-body" ref={wrapperRef}>
      <header className="iteration-tree-topbar">
        <div className="topbar-left">
          <button type="button" className="tree-back-button" onClick={onBack}>
            <ArrowLeft size={16} />返回创作
          </button>
          <div className="topbar-divider" />
          <div className="task-info">
            <h2>{tree.title || "未命名任务"}</h2>
            <span className="task-stats">{stats.count} 个节点 · 最深 {stats.maxDepth + 1} 层</span>
          </div>
        </div>
        <div className="topbar-right">
          <button type="button" className="topbar-action" onClick={copyPrompt} disabled={!selectedNode?.prompt}>
            复制提示词
          </button>
          <button type="button" className="topbar-action" onClick={() => flow.fitView({ padding: 0.2, duration: 400 })}>
            适应画布
          </button>
        </div>
      </header>

      <div className="iteration-tree-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          nodeTypes={NODE_TYPES}
          nodesDraggable
          nodesConnectable={false}
          edgesFocusable={false}
          minZoom={0.15}
          maxZoom={1.8}
          // 拖拽节点时自动吸附到 20px 网格，间距与背景网格保持一致。
          snapToGrid
          snapGrid={[20, 20]}
          defaultEdgeOptions={{ type: "smoothstep", style: { stroke: "var(--neo-accent-dark, #8B9DD9)", strokeWidth: 2 } }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Lines} gap={20} color="rgba(163,177,198,0.28)" />
          <Controls showInteractive={false} position="bottom-right" />
          <MiniMap
            pannable
            zoomable
            nodeColor={(node) => node.data?.isCurrent ? "var(--neo-primary, #8899CC)" : "rgba(139,157,217,0.5)"}
            maskColor="rgba(255,255,255,0.8)"
            position="bottom-left"
          />
          <Panel position="top-left" className="tree-canvas-stats">
            <Layers size={13} />
            <span>点击"添加子节点"规划新方向，双击节点可直接继续创作</span>
          </Panel>
        </ReactFlow>

        <NodeDetailPanel
          node={selectedNode}
          isOpen={panelOpen}
          onToggle={onTogglePanel}
          onContinue={onContinue}
          onClose={() => onSelectNode("")}
        />
      </div>
    </div>
  );
}
