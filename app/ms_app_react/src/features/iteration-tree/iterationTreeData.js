/**
 * 迭代树数据加载与布局工具。
 * 负责从后端拉取迭代树、把节点/边转换为 React Flow 数据，
 * 并用 Dagre 计算横向（从左到右）的节点坐标。
 */
import dagre from "dagre";

/** 树节点在画布上的统一尺寸：与 CustomTreeNode 的样式保持一致。 */
export const TREE_NODE_WIDTH = 200;
export const TREE_NODE_HEIGHT = 252;

/** 层级（横向）与同层（纵向）间距，预留悬停阴影和分支标签空间。 */
const RANK_SEPARATION = 90;
const NODE_SEPARATION = 46;

/** 兼容后端返回的驼峰/下划线字段，取出第一个非空值。 */
function pickField(source, ...keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

/** 将结构化提示词 JSON 中的 user_prompt 提取为可读文本；纯文本原样返回。 */
function readablePrompt(value) {
  const text = String(value || "");
  try {
    const data = JSON.parse(text);
    if (data && typeof data === "object" && typeof data.user_prompt === "string" && data.user_prompt.trim()) {
      return data.user_prompt;
    }
  } catch { /* 非 JSON 内容按原文返回，兼容旧数据。 */ }
  return text;
}

/** 从结构化提示词 JSON 中恢复标签列表；纯文本提示词返回空数组。 */
function parseNodeTags(value) {
  try {
    const data = JSON.parse(String(value || ""));
    const tags = data?.tags_prompt;
    if (!Array.isArray(tags)) return [];
    return tags
      .map((tag) => ({ key: String(tag?.tag_name || "").trim(), value: String(tag?.tag_value || "").trim() }))
      .filter((tag) => tag.key);
  } catch {
    return [];
  }
}

/**
 * 拉取指定 Thread 的迭代树并转换为页面可用的视图模型。
 * 树的根是虚拟的"原图"节点（用户上传的参考图，id 固定为 root），
 * 每次生成 Attempt 都是它的子节点或更深的迭代后代。
 * 返回 { threadId, title, rootNodeId, latestNodeId, nodes }，失败时抛出错误。
 */
export async function fetchIterationTree(threadId) {
  const response = await fetch(`/gen_imgs/threads/${threadId}/iteration-tree`);
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message || "无法读取迭代树");
  }
  const data = await response.json();
  const nodes = (data.nodes || []).map((node) => ({
    // 迭代节点 ID 复用 Attempt ID；根节点为后端约定的固定 id "root"。
    id: node.id,
    attemptId: node.attempt_id || node.attemptId || node.id,
    label: node.label || "#00",
    imageUrl: node.image_url || node.imageUrl || "",
    parentNodeId: node.parent_node_id || node.parentNodeId || null,
    childNodeIds: node.child_node_ids || node.childNodeIds || [],
    prompt: readablePrompt(node.prompt),
    rawPrompt: node.prompt || "",
    tags: parseNodeTags(node.prompt),
    modelName: node.modelName || node.model_name || "",
    size: node.size || "auto",
    quality: node.quality || "auto",
    status: String(node.status || "pending").toLowerCase(),
    createdAt: node.created_at || node.createdAt || "",
    depth: node.depth ?? 0,
    iterationType: node.iteration_type || node.iterationType || "initial",
    // 仅根节点携带：用户上传的全部原图地址，供"从原图继续"回填参考图。
    referenceImages: node.reference_images || node.referenceImages || []
  }));
  return {
    threadId: data.thread_id || data.threadId || threadId,
    title: data.title || "",
    rootNodeId: data.root_node_id || data.rootNodeId || nodes[0]?.id || null,
    latestNodeId: data.latest_node_id || data.latestNodeId || nodes.at(-1)?.id || null,
    nodes
  };
}

/**
 * 用 Dagre 计算横向树布局：根节点在最左，子节点向右逐层展开。
 * 入参与 React Flow 的 { nodes, edges } 同构，返回带 position 的新节点数组。
 */
export function layoutTreeNodes(nodes, edges) {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: "LR",
    nodesep: NODE_SEPARATION,
    ranksep: RANK_SEPARATION,
    marginx: 48,
    marginy: 48
  });
  graph.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((node) => {
    graph.setNode(node.id, { width: TREE_NODE_WIDTH, height: TREE_NODE_HEIGHT });
  });
  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target);
  });

  dagre.layout(graph);

  return nodes.map((node) => {
    const position = graph.node(node.id);
    return {
      ...node,
      position: {
        x: position.x - TREE_NODE_WIDTH / 2,
        y: position.y - TREE_NODE_HEIGHT / 2
      }
    };
  });
}

/**
 * 把迭代树视图模型转换为 React Flow 的节点与边。
 * isCurrent 标记"继续创作"时的默认定位节点（默认最新节点，或 URL 指定节点）。
 * 根节点（原图）isRoot 为真，节点样式与继续逻辑与之区分。
 */
export function toReactFlowData(tree, currentNodeId) {
  const edges = [];
  tree.nodes.forEach((node) => {
    (node.childNodeIds || []).forEach((childId) => {
      edges.push({
        id: `${node.id}-${childId}`,
        source: node.id,
        target: childId,
        type: "smoothstep"
      });
    });
  });
  const nodes = tree.nodes.map((node) => ({
    id: node.id,
    type: "treeNode",
    position: { x: 0, y: 0 },
    data: {
      ...node,
      // 根节点是用户上传的原图而非生成结果：样式与"从这里继续"的语义都不同。
      isRoot: node.id === tree.rootNodeId || node.attemptId === null,
      isCurrent: node.id === currentNodeId,
      // 失败节点在画布上用角标提示，避免用户误选空结果继续迭代。
      isFailed: node.status === "failed",
      isSucceeded: node.status === "succeeded"
    }
  }));
  const layoutedNodes = layoutTreeNodes(nodes, edges);
  return { nodes: layoutedNodes, edges };
}

/** 计算迭代树的统计信息：节点总数与最大深度。 */
export function treeStats(nodes) {
  const maxDepth = nodes.reduce((depth, node) => Math.max(depth, node.depth ?? 0), 0);
  return { count: nodes.length, maxDepth };
}
