# 迭代树可视化页面设计文档

## 一、需求分析

### 1.1 核心需求

用户在创作页面点击"查看迭代树"按钮后，进入一个**全新的独立页面**，该页面以横向布局展示当前任务的完整迭代历史，用户可以：

1. **可视化查看**：以树状图横向展示所有迭代节点（从左到右）
2. **节点交互**：点击任意节点，将该节点的结果图作为基础图
3. **进入创作**：自动跳转回创作页面，参数和参考图已回填，可直接输入新提示词继续优化

### 1.2 用户场景

```
创作页面 
  ↓ 点击"查看迭代历史"
迭代树页面（横向树状图）
  ↓ 点击某个节点
创作页面（已回填该节点的参数和结果图作为参考图）
  ↓ 修改提示词，提交生成
新的迭代节点被添加到树中
```

### 1.3 设计目标

- ✅ 清晰展示完整的迭代历史和分支关系
- ✅ 支持大型迭代树（10+ 层级，50+ 节点）
- ✅ 流畅的交互体验：缩放、平移、聚焦
- ✅ 无缝衔接创作工作流：一键回到创作页面

---

## 二、功能设计

### 2.1 页面结构

```
┌─────────────────────────────────────────────────────────────┐
│  Topbar: 任务名称 | 面包屑 | 操作按钮                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────┐      ┌──────┐      ┌──────┐                       │
│  │ 初始 │──┬──▶│ 优化1│──┬──▶│ 优化3│                       │
│  │ #01  │  │   │ #02  │  │   │ #04  │                       │
│  └──────┘  │   └──────┘  │   └──────┘                       │
│            │             │                                   │
│            │             └──▶┌──────┐                       │
│            │                 │ 变体1│                       │
│            │                 │ #05  │                       │
│            │                 └──────┘                       │
│            │                                                 │
│            └──▶┌──────┐                                     │
│                │ 变体2│──┬──▶┌──────┐                       │
│                │ #03  │  │   │ 精修 │                       │
│                └──────┘  │   │ #06  │                       │
│                          └──▶└──────┘                       │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│  Detail Panel: 选中节点的详细信息（可折叠）                    │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 核心功能模块

#### 模块 1: 树状图可视化（主画布）

**功能点：**
- 横向布局：根节点在最左侧，子节点向右延伸
- 节点展示：缩略图 + 标签（迭代类型、编号）
- 连接线：曲线连接父子节点，支持分支
- 当前节点高亮：视觉突出当前正在查看的节点
- 节点状态：待生成 / 生成中 / 已完成 / 失败

**交互：**
- 点击节点：选中并展示详情
- 双击节点：立即跳转到创作页面
- 悬浮节点：显示快速预览（提示词摘要、参数）
- 画布拖拽：支持平移整个树
- 滚轮缩放：放大/缩小树的显示比例
- 自动聚焦：打开页面时自动居中显示当前节点

#### 模块 2: 详情面板（底部）

**展示内容：**
- 节点缩略图（可点击放大）
- 完整提示词
- 标签列表
- 模型参数（模型、尺寸、质量）
- 参考图列表
- 创建时间
- 迭代类型和深度

**操作：**
- "从这里继续"按钮：跳转到创作页面
- "下载图片"按钮
- "删除此分支"按钮（危险操作）
- 面板可折叠/展开

#### 模块 3: 顶部工具栏

**左侧：**
- 返回创作页面按钮
- 任务名称
- 节点统计（共 N 个节点，N 个分支）

**右侧：**
- 视图控制：
  - 缩放比例（50% / 75% / 100% / 125% / 150%）
  - 适应画布（自动缩放到最佳大小）
  - 重置视图（恢复到初始状态）
- 布局切换：横向 / 纵向（未来扩展）
- 导出树（PNG / SVG）

#### 模块 4: 节点操作菜单（右键菜单）

右键点击节点时弹出：
- 从这里继续创作
- 查看大图
- 复制提示词
- 删除此节点及子节点
- 设为封面

---

## 三、技术设计

### 3.1 技术选型

#### 树状图渲染库

**方案 A（推荐）：React Flow**
- ✅ React 生态，易于集成
- ✅ 内置拖拽、缩放、平移
- ✅ 支持自定义节点和边
- ✅ 性能优化：虚拟渲染
- ✅ 文档完善，社区活跃

**方案 B：D3.js**
- ✅ 功能强大，高度定制
- ❌ 学习曲线陡峭
- ❌ 需要更多自定义代码

**方案 C：纯 Canvas 绘制**
- ✅ 性能最优
- ❌ 开发成本高
- ❌ 交互需要手动实现

**结论：选择 React Flow，平衡开发效率和用户体验。**

### 3.2 数据结构

#### 树节点数据

```typescript
interface TreeNode {
  id: string;
  type: 'root' | 'iteration' | 'variation';
  data: {
    nodeId: string;           // 后端节点 ID
    imageUrl: string;         // 结果图 URL
    thumbnailUrl: string;     // 缩略图 URL（优化加载）
    label: string;            // 节点标签："初始 #01"
    prompt: string;           // 提示词
    tags: Tag[];              // 标签
    modelParams: {
      model: string;
      size: string;
      quality: string;
    };
    referenceImages: string[];
    createdAt: string;
    status: 'pending' | 'running' | 'succeeded' | 'failed';
    depth: number;            // 深度
    isCurrent: boolean;       // 是否为当前节点
  };
  position: { x: number; y: number };  // React Flow 需要的位置
}

interface TreeEdge {
  id: string;
  source: string;            // 父节点 ID
  target: string;            // 子节点 ID
  type: 'smoothstep';        // 边的类型
  animated: boolean;         // 是否动画（生成中的连接线）
}

interface IterationTreeData {
  nodes: TreeNode[];
  edges: TreeEdge[];
  currentNodeId: string;
  rootNodeId: string;
}
```

### 3.3 布局算法

使用 **Dagre** 自动布局算法：
- 横向层级布局（LR: Left to Right）
- 自动计算节点位置，避免重叠
- 调整节点间距和层级间距

```javascript
import dagre from 'dagre';

function getLayoutedElements(nodes, edges, direction = 'LR') {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  
  const nodeWidth = 180;
  const nodeHeight = 240;
  
  dagreGraph.setGraph({ 
    rankdir: direction,
    nodesep: 60,      // 同层节点间距
    ranksep: 120,     // 层级间距
    marginx: 40,
    marginy: 40
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  return nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });
}
```

### 3.4 路由设计

新增路由：`/create/iteration-tree/:threadId`

**参数：**
- `threadId`：任务 ID
- 可选查询参数 `?nodeId=xxx`：直接定位到某个节点

**路由配置：**
```jsx
<Route 
  path="/create/iteration-tree/:threadId" 
  element={<IterationTreePage />} 
/>
```

---

## 四、页面组件设计

### 4.1 组件树结构

```
IterationTreePage
├── IterationTreeTopbar          // 顶部工具栏
│   ├── BackButton               // 返回按钮
│   ├── TaskTitle                // 任务名称
│   ├── TreeStats                // 统计信息
│   └── ViewControls             // 视图控制
├── IterationTreeCanvas          // 主画布（React Flow）
│   ├── CustomTreeNode[]         // 自定义树节点
│   └── CustomTreeEdge[]         // 自定义连接线
└── NodeDetailPanel              // 节点详情面板
    ├── NodePreview              // 图片预览
    ├── NodePromptDisplay        // 提示词展示
    ├── NodeParamsDisplay        // 参数展示
    └── NodeActions              // 操作按钮
```

### 4.2 核心组件详细设计

#### 组件 1: IterationTreePage（页面容器）

**职责：**
- 从 URL 获取 `threadId`，加载迭代树数据
- 管理全局状态：选中节点、缩放比例、视图配置
- 协调子组件通信

**状态：**
```javascript
const [treeData, setTreeData] = useState(null);
const [selectedNode, setSelectedNode] = useState(null);
const [loading, setLoading] = useState(true);
const [zoomLevel, setZoomLevel] = useState(1);
const [detailPanelOpen, setDetailPanelOpen] = useState(true);
```

**生命周期：**
```javascript
useEffect(() => {
  async function loadTree() {
    setLoading(true);
    try {
      const response = await fetch(`/gen_imgs/threads/${threadId}/iteration-tree`);
      const data = await response.json();
      const { nodes, edges } = transformToReactFlowData(data);
      const layoutedNodes = getLayoutedElements(nodes, edges, 'LR');
      setTreeData({ nodes: layoutedNodes, edges });
      
      // 自动选中当前节点
      const currentNode = nodes.find(n => n.data.isCurrent);
      if (currentNode) setSelectedNode(currentNode);
    } catch (error) {
      setToast("加载迭代树失败: " + error.message);
    } finally {
      setLoading(false);
    }
  }
  loadTree();
}, [threadId]);
```

#### 组件 2: CustomTreeNode（自定义节点）

**外观设计：**
```jsx
function CustomTreeNode({ data }) {
  const isSelected = data.isSelected;
  const isCurrent = data.isCurrent;
  
  return (
    <div className={`tree-node ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}`}>
      {/* 状态角标 */}
      {data.status === 'running' && (
        <div className="node-status-badge running">
          <Loader size={12} className="spin" />
        </div>
      )}
      
      {/* 缩略图 */}
      <div className="node-image-wrapper">
        <img 
          src={data.thumbnailUrl || data.imageUrl} 
          alt={data.label}
          loading="lazy"
        />
        {isCurrent && <div className="current-indicator">当前</div>}
      </div>
      
      {/* 节点信息 */}
      <div className="node-info">
        <span className="node-label">{data.label}</span>
        <span className="node-type">
          {data.type === 'root' ? '初始' : 
           data.type === 'iteration' ? '优化' : '变体'}
        </span>
      </div>
      
      {/* 快速操作 */}
      <div className="node-quick-actions">
        <button 
          className="node-action-btn"
          onClick={(e) => {
            e.stopPropagation();
            handleContinueFromNode(data.nodeId);
          }}
          title="从这里继续"
        >
          <RotateCw size={14} />
        </button>
      </div>
    </div>
  );
}
```

**样式要点：**
```css
.tree-node {
  width: 180px;
  background: #FFFFFF;
  border: 2px solid #E7E1D7;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tree-node:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border-color: #C4612F;
}

.tree-node.selected {
  border-color: #C4612F;
  box-shadow: 0 0 0 3px rgba(196, 97, 47, 0.1);
}

.tree-node.current {
  border-color: #C4612F;
  background: #F2E3D6;
}

.node-image-wrapper {
  position: relative;
  width: 100%;
  height: 160px;
  overflow: hidden;
}

.node-image-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.current-indicator {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 10px;
  background: #C4612F;
  color: #FFFFFF;
  font-size: 11px;
  font-weight: 600;
  border-radius: 999px;
}

.node-info {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.node-label {
  font-size: 13px;
  font-weight: 600;
  color: #1F2421;
}

.node-type {
  font-size: 11px;
  color: #5C635D;
}

.node-quick-actions {
  padding: 0 12px 10px;
  display: flex;
  gap: 6px;
}

.node-action-btn {
  padding: 6px;
  background: transparent;
  border: 1px solid #E7E1D7;
  border-radius: 6px;
  color: #5C635D;
  cursor: pointer;
  transition: all 0.15s ease;
}

.node-action-btn:hover {
  background: #F7F4EF;
  border-color: #C4612F;
  color: #C4612F;
}
```

#### 组件 3: IterationTreeCanvas（React Flow 画布）

```jsx
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap,
  useNodesState,
  useEdgesState,
  Panel
} from 'reactflow';
import 'reactflow/dist/style.css';

function IterationTreeCanvas({ 
  initialNodes, 
  initialEdges, 
  onNodeClick,
  onNodeDoubleClick,
  selectedNodeId 
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [rfInstance, setRfInstance] = useState(null);

  // 更新选中状态
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isSelected: node.id === selectedNodeId,
        },
      }))
    );
  }, [selectedNodeId, setNodes]);

  // 自动聚焦到选中节点
  useEffect(() => {
    if (rfInstance && selectedNodeId) {
      const node = nodes.find(n => n.id === selectedNodeId);
      if (node) {
        rfInstance.fitView({
          padding: 0.3,
          nodes: [node],
          duration: 400,
        });
      }
    }
  }, [selectedNodeId, rfInstance, nodes]);

  const nodeTypes = {
    treeNode: CustomTreeNode,
  };

  const edgeTypes = {
    custom: CustomTreeEdge,
  };

  return (
    <div className="iteration-tree-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(event, node) => onNodeClick(node)}
        onNodeDoubleClick={(event, node) => onNodeDoubleClick(node)}
        onInit={setRfInstance}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#C4612F', strokeWidth: 2 }
        }}
      >
        <Background color="#E7E1D7" gap={16} />
        <Controls showInteractive={false} />
        <MiniMap 
          nodeColor={(node) => node.data.isCurrent ? '#C4612F' : '#5C635D'}
          maskColor="rgba(247, 244, 239, 0.8)"
        />
        
        <Panel position="top-left" className="tree-canvas-stats">
          <span>{nodes.length} 个节点</span>
          <span>·</span>
          <span>深度 {Math.max(...nodes.map(n => n.data.depth))}</span>
        </Panel>
      </ReactFlow>
    </div>
  );
}
```

#### 组件 4: NodeDetailPanel（节点详情面板）

```jsx
function NodeDetailPanel({ node, isOpen, onToggle, onContinue }) {
  if (!node) return null;
  
  return (
    <div className={`node-detail-panel ${isOpen ? 'open' : 'collapsed'}`}>
      {/* 折叠控制 */}
      <button 
        className="panel-toggle"
        onClick={onToggle}
        aria-label={isOpen ? '收起详情' : '展开详情'}
      >
        <ChevronUp size={16} className={isOpen ? '' : 'rotated'} />
      </button>
      
      {isOpen && (
        <div className="panel-content">
          {/* 左侧：图片预览 */}
          <div className="panel-preview">
            <img src={node.data.imageUrl} alt={node.data.label} />
            <div className="preview-actions">
              <button onClick={() => window.open(node.data.imageUrl)}>
                <Maximize2 size={14} />
                查看大图
              </button>
              <button onClick={() => downloadImage(node.data.imageUrl)}>
                <Download size={14} />
                下载
              </button>
            </div>
          </div>
          
          {/* 右侧：详细信息 */}
          <div className="panel-details">
            <div className="detail-section">
              <h4>节点信息</h4>
              <dl>
                <dt>标签</dt>
                <dd>{node.data.label}</dd>
                <dt>类型</dt>
                <dd>{node.data.type === 'root' ? '初始生成' : 
                     node.data.type === 'iteration' ? '优化迭代' : '变体生成'}</dd>
                <dt>深度</dt>
                <dd>第 {node.data.depth + 1} 层</dd>
                <dt>创建时间</dt>
                <dd>{formatAttemptCreatedAt(node.data.createdAt)}</dd>
              </dl>
            </div>
            
            <div className="detail-section">
              <h4>提示词</h4>
              <p className="prompt-text">{node.data.prompt || '暂无'}</p>
            </div>
            
            <div className="detail-section">
              <h4>标签</h4>
              <div className="tags-display">
                {node.data.tags.length > 0 ? (
                  node.data.tags.map((tag, i) => (
                    <span key={i} className="tag-chip">
                      {tag.key}: {tag.value}
                    </span>
                  ))
                ) : (
                  <span className="empty-hint">暂无标签</span>
                )}
              </div>
            </div>
            
            <div className="detail-section">
              <h4>模型参数</h4>
              <dl className="params-grid">
                <dt>模型</dt>
                <dd>{node.data.modelParams.model}</dd>
                <dt>尺寸</dt>
                <dd>{node.data.modelParams.size}</dd>
                <dt>质量</dt>
                <dd>{node.data.modelParams.quality}</dd>
              </dl>
            </div>
            
            <div className="detail-section">
              <h4>参考图</h4>
              <div className="reference-grid">
                {node.data.referenceImages.length > 0 ? (
                  node.data.referenceImages.map((url, i) => (
                    <img key={i} src={url} alt={`参考图 ${i + 1}`} />
                  ))
                ) : (
                  <span className="empty-hint">无参考图</span>
                )}
              </div>
            </div>
            
            {/* 主操作按钮 */}
            <button 
              className="continue-button primary-action"
              onClick={() => onContinue(node)}
            >
              <RotateCw size={16} />
              从这里继续创作
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

#### 组件 5: IterationTreeTopbar（顶部工具栏）

```jsx
function IterationTreeTopbar({ 
  taskName, 
  nodeCount, 
  maxDepth,
  onBack,
  onZoomIn,
  onZoomOut,
  onFitView,
  onReset,
  zoomLevel 
}) {
  return (
    <header className="iteration-tree-topbar">
      <div className="topbar-left">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={18} />
          返回创作
        </button>
        <div className="topbar-divider" />
        <div className="task-info">
          <h2>{taskName}</h2>
          <span className="task-stats">
            {nodeCount} 个节点 · 最深 {maxDepth} 层
          </span>
        </div>
      </div>
      
      <div className="topbar-right">
        <div className="zoom-controls">
          <button onClick={onZoomOut} title="缩小">
            <ZoomOut size={16} />
          </button>
          <span className="zoom-indicator">{Math.round(zoomLevel * 100)}%</span>
          <button onClick={onZoomIn} title="放大">
            <ZoomIn size={16} />
          </button>
        </div>
        
        <button className="topbar-action" onClick={onFitView}>
          <Maximize2 size={16} />
          适应画布
        </button>
        
        <button className="topbar-action" onClick={onReset}>
          <RotateCcw size={16} />
          重置视图
        </button>
      </div>
    </header>
  );
}
```

---

## 五、交互流程设计

### 5.1 进入迭代树页面

**入口 1：创作页面的工作区**
```jsx
// 在 UnifiedWorkspace 或 AttemptDrawer 中添加按钮
<button 
  className="view-tree-button"
  onClick={() => navigate(`/create/iteration-tree/${threadId}`)}
>
  <GitBranch size={14} />
  查看迭代树
</button>
```

**入口 2：创作页面的结果图操作**
```jsx
// 在每张结果图的操作菜单中
<button onClick={() => navigate(`/create/iteration-tree/${threadId}?nodeId=${nodeId}`)}>
  <GitBranch size={14} />
  查看完整迭代历史
</button>
```

### 5.2 选择节点并继续创作

**流程：**
1. 用户在迭代树页面点击某个节点
2. 详情面板展开，显示该节点的完整信息
3. 用户点击"从这里继续创作"按钮
4. 触发 `handleContinueFromNode` 函数

**实现：**
```javascript
async function handleContinueFromNode(node) {
  try {
    // 1. 准备回填数据
    const continuationData = {
      prompt: node.data.prompt,
      tags: node.data.tags,
      modelParams: node.data.modelParams,
      baseImageUrl: node.data.imageUrl,      // 作为参考图
      parentNodeId: node.data.nodeId,        // 标记父节点
    };
    
    // 2. 存储到全局状态或 localStorage
    setDraft({
      ...draft,
      prompt: continuationData.prompt,
      tags: continuationData.tags,
      model: continuationData.modelParams.model,
      size: continuationData.modelParams.size,
      quality: continuationData.modelParams.quality,
      // 新增字段：标记正在基于哪个节点迭代
      iterationParentNodeId: continuationData.parentNodeId,
    });
    
    // 3. 将结果图作为参考图添加到 files
    const baseImageFile = {
      id: `iteration-base-${node.data.nodeId}`,
      url: continuationData.baseImageUrl,
      file: {
        name: `迭代基础图 - ${node.data.label}`,
        type: 'image/png'
      },
      isIterationBase: true,  // 标记为迭代基础图
    };
    
    // 4. 保存到缓存
    await saveCachedReferences([baseImageFile]);
    
    // 5. 跳转回创作页面
    navigate(`/create?from=iteration-tree&threadId=${threadId}`);
    
    setToast("已载入节点参数，可直接修改提示词继续创作");
  } catch (error) {
    setToast("载入失败: " + error.message);
  }
}
```

### 5.3 提交迭代生成

在创作页面的 `startGeneration` 或 `retryThread` 中检测：

```javascript
async function startGeneration() {
  // ... 现有逻辑
  
  const form = new FormData();
  
  // 检查是否为迭代生成
  if (draft.iterationParentNodeId) {
    form.append("parentNodeId", draft.iterationParentNodeId);
    form.append("isIteration", "true");
  }
  
  // ... 其余提交逻辑
  
  const response = await fetch("/gen_imgs/threads", { 
    method: "POST", 
    body: form 
  });
  
  // 生成成功后，清除迭代标记
  if (response.ok) {
    setDraft({ ...draft, iterationParentNodeId: null });
  }
}
```

---

## 六、样式设计

### 6.1 页面整体布局

```css
.iteration-tree-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #F7F4EF;
}

.iteration-tree-topbar {
  height: 64px;
  background: #FFFFFF;
  border-bottom: 1px solid #E7E1D7;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  flex-shrink: 0;
}

.iteration-tree-canvas {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.node-detail-panel {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: #FFFFFF;
  border-top: 2px solid #E7E1D7;
  transition: transform 0.3s ease;
  z-index: 10;
}

.node-detail-panel.collapsed {
  transform: translateY(calc(100% - 48px));
}

.node-detail-panel.open {
  transform: translateY(0);
  height: 360px;
}
```

### 6.2 React Flow 自定义样式

```css
/* 覆盖 React Flow 默认样式 */
.react-flow__node {
  background: transparent;
  border: none;
  padding: 0;
}

.react-flow__edge-path {
  stroke: #C4612F;
  stroke-width: 2;
}

.react-flow__edge.selected .react-flow__edge-path {
  stroke: #A94E22;
  stroke-width: 3;
}

.react-flow__controls {
  background: #FFFFFF;
  border: 1px solid #E7E1D7;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.react-flow__controls-button {
  background: #FFFFFF;
  border-bottom: 1px solid #E7E1D7;
  color: #5C635D;
}

.react-flow__controls-button:hover {
  background: #F7F4EF;
  color: #C4612F;
}

.react-flow__minimap {
  background: #FFFFFF;
  border: 1px solid #E7E1D7;
  border-radius: 8px;
}

.react-flow__background {
  background-color: #F7F4EF;
}
```

---

## 七、后端接口需求

### 7.1 获取迭代树

**GET** `/gen_imgs/threads/{threadId}/iteration-tree`

**响应示例：**
```json
{
  "rootNodeId": "node-001",
  "currentNodeId": "node-005",
  "nodes": [
    {
      "id": "node-001",
      "attemptId": "attempt-001",
      "imageUrl": "https://oss.example.com/img1.png",
      "thumbnailUrl": "https://oss.example.com/img1_thumb.png",
      "parentNodeId": null,
      "childNodeIds": ["node-002", "node-003"],
      "prompt": "初始提示词...",
      "tags": [...],
      "modelParams": {...},
      "referenceImages": [],
      "createdAt": "2024-03-20T10:00:00Z",
      "depth": 0,
      "iterationType": "initial",
      "status": "succeeded"
    },
    {
      "id": "node-002",
      "parentNodeId": "node-001",
      "childNodeIds": ["node-004"],
      "depth": 1,
      "iterationType": "refine",
      ...
    }
  ]
}
```

### 7.2 基于节点创建迭代

**POST** `/gen_imgs/nodes/{nodeId}/iterate`

**请求体：**
```json
{
  "prompt": "优化后的提示词...",
  "tags": [...],
  "model": "gpt-image-2",
  "size": "auto",
  "quality": "medium",
  "iterationType": "refine",
  "additionalReferences": []  // 额外的参考图（父节点图片自动添加）
}
```

**响应：**
```json
{
  "threadId": "thread-123",
  "attemptId": "attempt-456",
  "newNodeId": "node-789",
  "parentNodeId": "node-456",
  "status": "pending"
}
```

---

## 八、实施计划

### 阶段 1: 基础架构（预计 2 天）

**任务清单：**
- [ ] 安装依赖：`npm install reactflow dagre`
- [ ] 创建路由：`/create/iteration-tree/:threadId`
- [ ] 创建页面容器组件：`IterationTreePage.jsx`
- [ ] 设置基础布局：Topbar + Canvas + DetailPanel
- [ ] 实现数据加载逻辑：从后端获取迭代树数据

**验收标准：**
- ✅ 页面路由可访问
- ✅ 能从后端加载树数据并在控制台打印
- ✅ 页面基础布局正常显示

### 阶段 2: 树状图渲染（预计 3 天）

**任务清单：**
- [ ] 实现数据转换函数：后端数据 → React Flow 数据
- [ ] 实现布局算法：使用 Dagre 计算节点位置
- [ ] 开发自定义节点组件：`CustomTreeNode`
- [ ] 开发自定义边组件：`CustomTreeEdge`
- [ ] 集成 React Flow，渲染树状图
- [ ] 实现缩放、平移、自动聚焦功能

**验收标准：**
- ✅ 树状图正确渲染，横向布局
- ✅ 节点显示缩略图、标签、类型
- ✅ 连接线正确连接父子节点
- ✅ 支持鼠标拖拽平移、滚轮缩放
- ✅ 打开页面时自动聚焦到当前节点

### 阶段 3: 交互功能（预计 2 天）

**任务清单：**
- [ ] 实现节点点击：选中并展示详情
- [ ] 实现节点双击：直接跳转到创作页面
- [ ] 实现节点悬浮：显示快速预览（Tooltip）
- [ ] 开发详情面板组件：`NodeDetailPanel`
- [ ] 实现详情面板折叠/展开动画
- [ ] 实现"从这里继续"功能：跳转 + 回填参数

**验收标准：**
- ✅ 点击节点时，详情面板展开并显示该节点信息
- ✅ 双击节点时，直接跳转到创作页面
- ✅ 详情面板可折叠和展开，动画流畅
- ✅ 点击"从这里继续"后，跳转到创作页面且参数已回填

### 阶段 4: 工具栏与视图控制（预计 1 天）

**任务清单：**
- [ ] 开发顶部工具栏组件：`IterationTreeTopbar`
- [ ] 实现返回按钮：跳转回创作页面
- [ ] 实现缩放控制：放大、缩小、显示比例
- [ ] 实现适应画布：自动缩放到最佳大小
- [ ] 实现重置视图：恢复到初始状态

**验收标准：**
- ✅ 顶部工具栏完整显示
- ✅ 所有按钮功能正常
- ✅ 缩放比例实时更新

### 阶段 5: 样式美化（预计 1 天）

**任务清单：**
- [ ] 应用设计系统：暖色调、圆角、阴影
- [ ] 优化节点样式：悬浮效果、选中状态、当前节点高亮
- [ ] 优化连接线样式：颜色、粗细、曲线平滑度
- [ ] 优化详情面板样式：布局、间距、字体
- [ ] 响应式适配：确保在不同屏幕尺寸下正常显示

**验收标准：**
- ✅ 页面整体风格与创作页面一致
- ✅ 节点悬浮、选中效果明显
- ✅ 连接线美观，视觉层次清晰

### 阶段 6: 集成与测试（预计 2 天）

**任务清单：**
- [ ] 在创作页面添加"查看迭代树"入口
- [ ] 在工作区添加"查看迭代树"按钮
- [ ] 修改创作页面的生成逻辑：支持迭代生成
- [ ] 完整流程测试：
  - [ ] 初始生成 → 查看树 → 选择节点 → 继续创作 → 提交生成 → 新节点出现在树中
  - [ ] 多分支场景：从同一个节点创建多个子节点
  - [ ] 深层迭代：连续迭代 5 层以上
- [ ] 边界情况测试：
  - [ ] 只有根节点（未迭代）
  - [ ] 大型树（30+ 节点）
  - [ ] 加载失败处理

**验收标准：**
- ✅ 完整流程可跑通，无报错
- ✅ 新生成的节点正确添加到树中
- ✅ 多分支和深层迭代场景正常
- ✅ 边界情况处理合理

### 阶段 7: 性能优化与打磨（预计 1 天）

**任务清单：**
- [ ] 缩略图懒加载：使用 Intersection Observer
- [ ] 大型树优化：虚拟渲染或分页加载
- [ ] 动画性能优化：使用 CSS transform
- [ ] 错误处理优化：友好的错误提示
- [ ] 加载状态优化：骨架屏或加载动画
- [ ] 交互细节打磨：按钮禁用状态、Tooltip 提示

**验收标准：**
- ✅ 大型树（50+ 节点）渲染流畅
- ✅ 交互响应迅速，无明显卡顿
- ✅ 错误处理友好，用户体验良好

---

## 九、风险与挑战

### 9.1 技术风险

**风险 1：大型树性能问题**
- **描述**：节点数量超过 100 时，渲染可能变慢
- **缓解措施**：
  - 使用 React Flow 的虚拟渲染功能
  - 缩略图使用低分辨率版本
  - 懒加载图片资源
  - 考虑分页或折叠深层节点

**风险 2：布局算法复杂**
- **描述**：Dagre 可能在复杂树结构中产生重叠或错位
- **缓解措施**：
  - 调整 `nodesep` 和 `ranksep` 参数
  - 测试各种树结构，找到最优配置
  - 必要时手动调整部分节点位置

**风险 3：跨页面状态同步**
- **描述**：迭代树页面和创作页面之间的数据同步可能不一致
- **缓解措施**：
  - 使用全局状态管理（现有的 `useStore`）
  - 关键数据同时存储到 localStorage
  - 页面刷新后重新加载最新数据

### 9.2 用户体验风险

**风险 1：学习曲线**
- **描述**：用户可能不理解"迭代树"的概念
- **缓解措施**：
  - 首次进入时显示引导提示
  - 在节点上显示清晰的标签和图标
  - 提供帮助文档或视频教程

**风险 2：操作误导**
- **描述**：用户可能不清楚"从这里继续"的具体效果
- **缓解措施**：
  - 按钮文案明确："从这张图继续优化"
  - 跳转前显示确认提示
  - 跳转后在创作页面显示提示："正在基于节点 #05 迭代"

---

## 十、未来扩展

### 10.1 高级功能（V2.0）

1. **节点比较**
   - 选中两个节点，并排对比
   - 显示提示词 diff、参数差异
   - 帮助用户理解优化方向

2. **路径收藏**
   - 用户可以标记某条完整路径
   - 一键恢复到路径中的任意节点

3. **批量操作**
   - 选中多个节点，批量下载
   - 批量删除某个分支
   - 批量导出为 ZIP

4. **智能推荐**
   - 基于历史数据，推荐下一步优化方向
   - "用户通常会在这里调整..."

5. **导出与分享**
   - 导出迭代树为图片（PNG/SVG）
   - 生成分享链接，展示创作过程

### 10.2 可视化增强（V2.0）

1. **时间轴视图**
   - 按时间顺序排列节点
   - 展示创作时间分布

2. **紧凑模式**
   - 只显示节点缩略图，不显示详细信息
   - 适合大型树的全局预览

3. **3D 视图**
   - 使用 Three.js 渲染 3D 树状图
   - 更炫酷的可视化效果

---

## 十一、总结

本设计方案提供了一个**完整、可落地的迭代树可视化页面**，核心特点：

✅ **清晰的视觉呈现**
- 横向树状图，从左到右展示迭代历史
- 自定义节点样式，信息丰富且美观
- 平滑的动画和交互

✅ **流畅的用户体验**
- 一键跳转，参数自动回填
- 详情面板，快速查看节点信息
- 视图控制，灵活操作画布

✅ **完善的技术实现**
- React Flow + Dagre，成熟的技术栈
- 模块化组件设计，易于维护
- 性能优化考虑，支持大型树

✅ **明确的实施计划**
- 7 个阶段，12 天工期
- 清晰的任务清单和验收标准
- 风险识别和缓解措施

通过本方案，用户将获得一个专业、易用的迭代历史管理工具，显著提升创作体验和效率。
