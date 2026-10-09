# 图像迭代分叉树设计方案

## 一、需求背景

### 当前问题
目前的创作模块中，每次重试都会以第一张原图（Thread 的初始提示词和参考图）为基础进行迭代。所有的 Attempt 都是线性的重试关系，无法基于已生成的某个结果图继续优化。

### 用户需求
- 用户希望能在已有结果图的基础上进行迭代优化
- 形成树状的迭代历史，而不是线性的重试链
- 可以从任意一个结果图分叉出新的优化方向
- 能够回溯和查看完整的迭代路径

---

## 二、核心概念设计

### 2.1 迭代节点（Iteration Node）

每个生成的结果图都是一个**迭代节点**，节点包含：

```typescript
interface IterationNode {
  id: string;                    // 节点唯一 ID
  attemptId: string;             // 所属的 Attempt ID
  imageUrl: string;              // 结果图 URL
  imageIndex: number;            // 在 Attempt 中的图片索引
  parentNodeId: string | null;   // 父节点 ID（null 表示根节点）
  childNodeIds: string[];        // 子节点 ID 列表
  prompt: string;                // 本次使用的提示词
  tags: Tag[];                   // 本次使用的标签
  modelParams: {                 // 模型参数
    model: string;
    size: string;
    quality: string;
  };
  referenceImages: string[];     // 参考图列表（包括父节点的结果图）
  createdAt: string;             // 创建时间
  depth: number;                 // 节点深度（0 为根节点）
  iterationType: 'initial' | 'refine' | 'variation';  // 迭代类型
}
```

### 2.2 迭代类型

- **initial**：初始生成（根节点）
- **refine**：基于父图优化（微调提示词、参数）
- **variation**：基于父图变体（较大改动）

### 2.3 迭代树（Iteration Tree）

```typescript
interface IterationTree {
  threadId: string;              // 所属 Thread
  rootNodeId: string;            // 根节点 ID
  nodes: Map<string, IterationNode>;  // 所有节点
  activePath: string[];          // 当前激活路径（从根到当前节点）
}
```

---

## 三、数据库设计

### 3.1 新增表：iteration_nodes

```sql
CREATE TABLE iteration_nodes (
    node_id VARCHAR(36) PRIMARY KEY,
    thread_id VARCHAR(36) NOT NULL,
    attempt_id VARCHAR(36) NOT NULL,
    image_url TEXT NOT NULL,
    image_index INT NOT NULL DEFAULT 0,
    parent_node_id VARCHAR(36) NULL,
    prompt TEXT NOT NULL,
    tags_json TEXT,
    model_params_json TEXT NOT NULL,
    reference_images_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    depth INT NOT NULL DEFAULT 0,
    iteration_type VARCHAR(20) NOT NULL DEFAULT 'initial',
    INDEX idx_thread_id (thread_id),
    INDEX idx_parent_node_id (parent_node_id),
    FOREIGN KEY (thread_id) REFERENCES gen_imgs_threads(thread_id) ON DELETE CASCADE
);
```

### 3.2 修改表：gen_imgs_attempts

增加字段：

```sql
ALTER TABLE gen_imgs_attempts 
ADD COLUMN parent_node_id VARCHAR(36) NULL COMMENT '父迭代节点ID',
ADD COLUMN is_iteration BOOLEAN DEFAULT FALSE COMMENT '是否为迭代生成';
```

---

## 四、前端交互设计

### 4.1 结果图操作菜单

在每张结果图上增加操作按钮：

```jsx
<div className="result-image-actions">
  <button onClick={() => continueFromThis(result)}>
    <RotateCw size={14} />
    从这张继续
  </button>
  <button onClick={() => createVariation(result)}>
    <Sparkles size={14} />
    生成变体
  </button>
  <button onClick={() => viewIterationTree(result)}>
    <GitBranch size={14} />
    查看迭代树
  </button>
</div>
```

### 4.2 迭代树可视化

使用树状图展示迭代历史：

```
[根节点: 初始生成]
├── [节点1: 优化光线]
│   ├── [节点3: 调整构图]
│   └── [节点4: 增强细节]
└── [节点2: 改变色调]
    └── [节点5: 添加元素]
```

每个节点显示：
- 缩略图
- 提示词变化摘要
- 参数变化
- 创建时间

### 4.3 路径导航

在画布顶部显示当前迭代路径：

```jsx
<div className="iteration-breadcrumb">
  <button onClick={() => jumpToNode(rootNode)}>
    初始 #01
  </button>
  <ChevronRight size={12} />
  <button onClick={() => jumpToNode(parentNode)}>
    优化 #03
  </button>
  <ChevronRight size={12} />
  <span className="current">当前 #07</span>
</div>
```

---

## 五、后端接口设计

### 5.1 基于节点迭代

**POST** `/gen_imgs/nodes/{nodeId}/iterate`

请求体：
```json
{
  "prompt": "优化后的提示词",
  "tags": [...],
  "model": "gpt-image-2",
  "size": "auto",
  "quality": "medium",
  "iterationType": "refine",
  "promptDelta": "增强了光线和细节"  // 提示词变化摘要
}
```

响应：
```json
{
  "threadId": "thread-123",
  "attemptId": "attempt-456",
  "newNodeId": "node-789",
  "parentNodeId": "node-456"
}
```

### 5.2 获取迭代树

**GET** `/gen_imgs/threads/{threadId}/iteration-tree`

响应：
```json
{
  "rootNodeId": "node-001",
  "nodes": [
    {
      "id": "node-001",
      "parentNodeId": null,
      "childNodeIds": ["node-002", "node-003"],
      "imageUrl": "...",
      "prompt": "...",
      "depth": 0
    }
  ]
}
```

### 5.3 获取节点详情

**GET** `/gen_imgs/nodes/{nodeId}`

响应包含完整的节点信息和上下文：
```json
{
  "node": {...},
  "parent": {...},
  "children": [...],
  "path": [...]  // 从根到当前节点的完整路径
}
```

---

## 六、核心业务流程

### 6.1 初始生成流程

```
用户提交 → 创建 Thread → 创建 Attempt → 生成图片
                                ↓
                        创建根节点（parent_node_id = null）
```

### 6.2 基于结果图迭代流程

```
用户选择结果图 → 点击"从这张继续" → 回填提示词和参数
                                    ↓
                    用户修改 → 提交迭代请求
                                    ↓
              创建新 Attempt（parent_node_id = 选中节点ID）
                                    ↓
                生成图片 → 创建新节点（关联父节点）
                                    ↓
                        更新父节点的 childNodeIds
```

### 6.3 服务端逻辑

```java
public IterationNode createIterationNode(
    String parentNodeId, 
    CreateIterationRequest request
) {
    // 1. 获取父节点
    IterationNode parentNode = getNodeById(parentNodeId);
    
    // 2. 准备参考图列表：父节点的结果图 + 用户新增的参考图
    List<String> references = new ArrayList<>();
    references.add(parentNode.getImageUrl());  // 父节点作为主参考图
    references.addAll(request.getAdditionalReferences());
    
    // 3. 创建 Attempt，标记为迭代生成
    Attempt attempt = createAttempt(
        parentNode.getThreadId(),
        request.getPrompt(),
        references,
        request.getModelParams()
    );
    attempt.setParentNodeId(parentNodeId);
    attempt.setIsIteration(true);
    
    // 4. 调用生成服务
    List<String> imageUrls = generateImages(attempt);
    
    // 5. 为每张结果图创建节点
    List<IterationNode> newNodes = new ArrayList<>();
    for (int i = 0; i < imageUrls.size(); i++) {
        IterationNode node = new IterationNode();
        node.setId(UUID.randomUUID().toString());
        node.setThreadId(parentNode.getThreadId());
        node.setAttemptId(attempt.getId());
        node.setImageUrl(imageUrls.get(i));
        node.setImageIndex(i);
        node.setParentNodeId(parentNodeId);
        node.setDepth(parentNode.getDepth() + 1);
        node.setIterationType(request.getIterationType());
        newNodes.add(node);
    }
    
    // 6. 更新父节点的子节点列表
    parentNode.getChildNodeIds().addAll(
        newNodes.stream().map(IterationNode::getId).collect(Collectors.toList())
    );
    updateNode(parentNode);
    
    return newNodes.get(0);
}
```

---

## 七、前端状态管理

### 7.1 新增状态

```javascript
const [iterationTree, setIterationTree] = useState(null);
const [currentNodeId, setCurrentNodeId] = useState(null);
const [selectedNodeForIteration, setSelectedNodeForIteration] = useState(null);
```

### 7.2 迭代操作

```javascript
/**
 * 从选中的结果图继续创作
 */
async function continueFromResult(result, nodeId) {
  try {
    // 1. 获取节点详情
    const response = await fetch(`/gen_imgs/nodes/${nodeId}`);
    const nodeData = await response.json();
    
    // 2. 回填提示词、标签和参数
    setPrompt(nodeData.prompt);
    setDraft({
      ...draft,
      tags: nodeData.tags,
      model: nodeData.modelParams.model,
      size: nodeData.modelParams.size,
      quality: nodeData.modelParams.quality
    });
    
    // 3. 标记当前正在基于哪个节点迭代
    setSelectedNodeForIteration(nodeId);
    
    // 4. 提示用户
    setToast("已载入该图的参数，修改后点击生成将基于此图优化");
  } catch (error) {
    setToast("载入失败：" + error.message);
  }
}

/**
 * 提交迭代生成
 */
async function submitIteration() {
  if (!selectedNodeForIteration) {
    // 普通生成流程
    await startGeneration();
    return;
  }
  
  // 迭代生成流程
  const form = new FormData();
  form.append("prompt", JSON.stringify(
    buildGenImgsPrompt(prompt.trim(), draftTags, additionalSystemPrompt, files)
  ));
  form.append("model", draft.model);
  form.append("size", draft.size);
  form.append("quality", draft.quality);
  form.append("iterationType", "refine");
  
  try {
    const response = await fetch(
      `/gen_imgs/nodes/${selectedNodeForIteration}/iterate`,
      { method: "POST", body: form }
    );
    
    if (!response.ok) throw new Error("迭代生成失败");
    
    const result = await response.json();
    setCurrentNodeId(result.newNodeId);
    setSelectedNodeForIteration(null);
    
    // 刷新迭代树
    await loadIterationTree(result.threadId);
    
  } catch (error) {
    setToast(error.message);
  }
}
```

---

## 八、可视化组件设计

### 8.1 迭代树组件

```jsx
function IterationTreeView({ tree, currentNodeId, onSelectNode }) {
  const [expanded, setExpanded] = useState(new Set([tree.rootNodeId]));
  
  function renderNode(nodeId, depth = 0) {
    const node = tree.nodes.get(nodeId);
    if (!node) return null;
    
    const isExpanded = expanded.has(nodeId);
    const isCurrent = nodeId === currentNodeId;
    const hasChildren = node.childNodeIds.length > 0;
    
    return (
      <div className="tree-node" style={{ paddingLeft: `${depth * 24}px` }}>
        <div className={`node-content ${isCurrent ? 'current' : ''}`}>
          {hasChildren && (
            <button 
              className="node-toggle"
              onClick={() => {
                const next = new Set(expanded);
                isExpanded ? next.delete(nodeId) : next.add(nodeId);
                setExpanded(next);
              }}
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          )}
          
          <img 
            src={node.imageUrl} 
            alt={`节点 ${nodeId}`}
            className="node-thumbnail"
            onClick={() => onSelectNode(node)}
          />
          
          <div className="node-info">
            <span className="node-label">
              {node.iterationType === 'initial' ? '初始生成' : '优化迭代'} 
              #{node.attemptNo}
            </span>
            <small className="node-prompt">
              {getPromptExcerpt(node.prompt, 40)}
            </small>
            <small className="node-time">
              {formatAttemptCreatedAt(node.createdAt)}
            </small>
          </div>
          
          <button 
            className="node-action"
            onClick={() => continueFromResult(node, nodeId)}
            title="从这个节点继续"
          >
            <RotateCw size={13} />
          </button>
        </div>
        
        {isExpanded && hasChildren && (
          <div className="node-children">
            {node.childNodeIds.map(childId => 
              renderNode(childId, depth + 1)
            )}
          </div>
        )}
      </div>
    );
  }
  
  return (
    <div className="iteration-tree-view">
      <div className="tree-header">
        <h3>迭代历史</h3>
        <small>{tree.nodes.size} 个节点</small>
      </div>
      <div className="tree-body">
        {renderNode(tree.rootNodeId)}
      </div>
    </div>
  );
}
```

### 8.2 路径面包屑

```jsx
function IterationBreadcrumb({ path, onJumpToNode }) {
  return (
    <div className="iteration-breadcrumb">
      {path.map((node, index) => (
        <React.Fragment key={node.id}>
          {index > 0 && <ChevronRight size={12} className="breadcrumb-separator" />}
          <button
            className={`breadcrumb-node ${index === path.length - 1 ? 'current' : ''}`}
            onClick={() => onJumpToNode(node)}
            disabled={index === path.length - 1}
          >
            {node.iterationType === 'initial' ? '初始' : '迭代'} #{node.attemptNo}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}
```

---

## 九、实施步骤

### 阶段一：数据层（后端）
1. 创建 `iteration_nodes` 表
2. 修改 `gen_imgs_attempts` 表，增加 `parent_node_id` 字段
3. 实现 `IterationNode` 实体和 DAO
4. 实现迭代树构建和查询逻辑

### 阶段二：接口层（后端）
1. 实现 `/nodes/{nodeId}/iterate` 接口
2. 实现 `/threads/{threadId}/iteration-tree` 接口
3. 实现 `/nodes/{nodeId}` 接口
4. 修改现有生成接口，支持节点创建

### 阶段三：交互层（前端）
1. 在结果图上增加"从这张继续"按钮
2. 实现节点选择和参数回填逻辑
3. 修改生成提交逻辑，支持迭代模式

### 阶段四：可视化层（前端）
1. 实现迭代树组件
2. 实现路径面包屑组件
3. 在工作区增加"迭代历史"tab

### 阶段五：优化与测试
1. 性能优化：大型迭代树的加载
2. 交互优化：节点比较、diff 展示
3. 完整测试：多分支、深层迭代场景

---

## 十、技术细节与注意事项

### 10.1 参考图处理

当基于结果图迭代时：
- **方案A（推荐）**：父节点的结果图自动作为第一张参考图
- **方案B**：用户可以选择是否使用父图作为参考
- 用户可以额外添加其他参考图（最多 3 张，总共不超过 4 张）

### 10.2 提示词继承

- 默认继承父节点的提示词和标签
- 用户可以修改或追加内容
- 记录提示词的 diff，便于回溯时理解改动

### 10.3 树的深度限制

- 建议限制最大深度为 10 层，避免无限递归
- 超过深度后禁用"从这张继续"按钮
- 提示用户"已达到最大迭代深度，请新建任务"

### 10.4 积分计算

- 初始生成：按正常规则扣费
- 迭代生成：
  - 选项1：与初始生成相同
  - 选项2：迭代优惠 8 折（鼓励精细化创作）

### 10.5 性能优化

**前端：**
- 迭代树懒加载：只加载当前路径 ± 1 层的节点
- 缩略图使用缩略版 URL（OSS 样式参数）
- 虚拟滚动：大型树结构使用虚拟列表

**后端：**
- 查询优化：使用 CTE 递归查询树结构
- 缓存策略：Redis 缓存常访问的节点路径
- 索引优化：parent_node_id 和 thread_id 建立联合索引

---

## 十一、未来扩展

### 11.1 批量分支

支持从一个节点同时创建多个分支：
- 一次提交，生成 N 张变体
- 每张变体作为独立分支节点

### 11.2 节点对比

选中两个节点，并排展示：
- 图片对比
- 参数差异
- 提示词 diff

### 11.3 路径收藏

用户可以收藏某条路径：
- 标记完整路径（从根到叶）
- 一键恢复到路径中的任意节点

### 11.4 智能推荐

基于当前节点的历史数据，推荐可能的优化方向：
- "基于相似场景，用户通常会调整..."
- "建议尝试增强细节/改变色调"

---

## 十二、总结

本设计方案通过引入**迭代节点**和**树结构**，实现了图像生成的分叉迭代能力：

✅ **核心价值**
- 支持基于任意结果图继续优化
- 完整保留迭代历史和路径
- 树状可视化，清晰展示分支关系

✅ **技术亮点**
- 节点化设计，易于扩展
- 前后端分离，接口清晰
- 递归查询 + 缓存，性能可控

✅ **用户体验**
- 一键继续，操作简单
- 路径导航，快速回溯
- 树状可视化，全局把控

通过分阶段实施，可以逐步将该功能集成到现有系统中，显著提升用户的创作迭代体验。
