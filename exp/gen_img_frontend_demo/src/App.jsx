import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Download,
  ImagePlus,
  LoaderCircle,
  Plus,
  Sparkles,
  Trash2,
  WandSparkles,
  X
} from "lucide-react";

const MAX_IMAGES = 4;
const POLL_INTERVAL = 1800;

function selectFilePreview(file) {
  // 为用户选择的图片生成浏览器本地预览地址。
  return { id: crypto.randomUUID(), file, url: URL.createObjectURL(file) };
}

function Field({ label, value, onChange, children }) {
  // 渲染带标签的紧凑参数控件。
  return (
    <label className="field">
      <span>{label}</span>
      {children || (
        <div className="select-wrap">
          <select value={value} onChange={(event) => onChange(event.target.value)}>
            <option>{value}</option>
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </div>
      )}
    </label>
  );
}

function ResultState({ status, imageUrls, error }) {
  // 根据异步任务状态显示生成中的、成功或失败内容。
  if (status === "idle") {
    return (
      <div className="empty-result">
        <div className="result-star"><Sparkles size={22} /></div>
        <h2>留出一块想象的空间</h2>
        <p>添加参考图与文字描述，结果会在这里出现。</p>
      </div>
    );
  }

  if (status === "pending" || status === "running") {
    return (
      <div className="empty-result generating">
        <LoaderCircle className="spinner" size={25} />
        <h2>{status === "pending" ? "任务已排队" : "正在构成画面"}</h2>
        <p>模型正在理解你的描述与参考图。</p>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="empty-result failed">
        <div className="result-star"><X size={22} /></div>
        <h2>这次没有完成</h2>
        <p>{error || "生成服务暂时不可用，请稍后再试。"}</p>
      </div>
    );
  }

  return (
    <div className="results-grid">
      {imageUrls.map((url, index) => (
        <figure className="result-card" key={url}>
          <img src={url} alt={`生成图片 ${index + 1}`} />
          <figcaption>
            <span>生成结果 {String(index + 1).padStart(2, "0")}</span>
            <a href={url} target="_blank" rel="noreferrer" title="打开图片">
              <ArrowUpRight size={17} />
            </a>
            <a href={url} download title="下载图片">
              <Download size={17} />
            </a>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export default function App() {
  // 提供图片上传、参数设置、任务提交和结果展示的生图工作台。
  const [images, setImages] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("dall-e-3");
  const [size, setSize] = useState("auto");
  const [quality, setQuality] = useState("standard");
  const [format, setFormat] = useState("png");
  const [count, setCount] = useState("1");
  const [status, setStatus] = useState("idle");
  const [imageUrls, setImageUrls] = useState([]);
  const [error, setError] = useState("");
  const [taskId, setTaskId] = useState("");
  const inputRef = useRef(null);
  const imagesRef = useRef([]);

  const isReady = prompt.trim().length > 0 && images.length > 0 && status !== "pending" && status !== "running";
  const statusLabel = useMemo(() => {
    if (status === "pending") return "已排队";
    if (status === "running") return "生成中";
    if (status === "succeeded") return "已完成";
    if (status === "failed") return "需重试";
    return "就绪";
  }, [status]);

  useEffect(() => {
    if (!taskId || status === "succeeded" || status === "failed") return undefined;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/tasks/${taskId}`);
        if (!response.ok) throw new Error("无法读取生成任务状态");
        const task = await response.json();
        setStatus(task.status);
        setImageUrls(task.image_urls || []);
        setError(task.error || "");
      } catch (requestError) {
        setStatus("failed");
        setError(requestError.message);
      }
    }, POLL_INTERVAL);
    return () => window.clearInterval(timer);
  }, [taskId, status]);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => () => {
    imagesRef.current.forEach((image) => URL.revokeObjectURL(image.url));
  }, []);

  function addFiles(fileList) {
    // 校验并添加用户选择或拖拽进来的参考图片。
    const accepted = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
    setImages((currentImages) => {
      const remaining = MAX_IMAGES - currentImages.length;
      return [...currentImages, ...accepted.slice(0, remaining).map(selectFilePreview)];
    });
  }

  function removeImage(id) {
    // 删除一张参考图片并释放对应的本地预览资源。
    setImages((currentImages) => {
      const image = currentImages.find((item) => item.id === id);
      if (image) URL.revokeObjectURL(image.url);
      return currentImages.filter((item) => item.id !== id);
    });
  }

  function resizePrompt(event) {
    """根据提示词内容调整输入框高度，并限制最大可视高度。"""
    const textarea = event.currentTarget;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 260)}px`;
  }

  async function submitGeneration() {
    // 将表单内容提交给后端并启动任务状态轮询。
    if (!isReady) return;
    const formData = new FormData();
    formData.append("prompt", prompt.trim());
    formData.append("model", model);
    formData.append("size", size);
    formData.append("quality", quality);
    formData.append("output_format", format);
    formData.append("n", count);
    images.forEach(({ file }) => formData.append("reference_images", file));
    setStatus("pending");
    setImageUrls([]);
    setError("");

    try {
      const response = await fetch("/generate", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "创建任务失败");
      setTaskId(data.task_id);
    } catch (requestError) {
      setStatus("failed");
      setError(requestError.message);
    }
  }

  return (
    <main className="studio-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="MindScribe Studio 首页">
          <span className="brand-mark"><WandSparkles size={17} /></span>
          <span>MINDSCRIBE</span><i>STUDIO</i>
        </a>
        <div className="topbar-right">
          <span className={`status-dot ${status}`} />
          <span>{statusLabel}</span>
          <span className="vertical-rule" />
          <span className="task-code">{taskId ? `#${taskId.slice(0, 8)}` : "DRAFT"}</span>
        </div>
      </header>

      <section className="workspace" id="top">
        <section className="control-panel" aria-label="图片生成设置">
          <div className="eyebrow">REFERENCE BOARD</div>
          <div className="panel-heading">
            <h1>让灵感<br />落在纸上。</h1>
            <p>将图像、语言和一点直觉交给画面。</p>
          </div>

          <div
            className={`dropzone ${images.length ? "has-images" : ""}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }}
          >
            {images.length === 0 ? (
              <button className="dropzone-empty" type="button" onClick={() => inputRef.current?.click()}>
                <ImagePlus size={24} />
                <strong>添加参考图</strong>
                <span>拖入图片或浏览文件</span>
              </button>
            ) : (
              <div className="reference-grid">
                {images.map((image) => (
                  <div className="reference-thumb" key={image.id}>
                    <img src={image.url} alt={image.file.name} />
                    <button type="button" onClick={() => removeImage(image.id)} title="移除参考图"><Trash2 size={15} /></button>
                  </div>
                ))}
                {images.length < MAX_IMAGES && (
                  <button className="add-tile" type="button" onClick={() => inputRef.current?.click()} title="添加参考图"><Plus size={20} /></button>
                )}
              </div>
            )}
            <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(event) => addFiles(event.target.files)} />
          </div>
          <p className="upload-note">最多 {MAX_IMAGES} 张 · 单张不超过 10MB</p>

          <label className="prompt-box">
            <span>你的构想</span>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onInput={resizePrompt} placeholder="描述你希望画面呈现的故事、情绪、材质或光线..." maxLength={5000} />
            <small>{prompt.length}/5000</small>
          </label>

          <div className="settings-grid">
            <Field label="模型" value={model} onChange={setModel}>
              <div className="select-wrap"><select value={model} onChange={(event) => setModel(event.target.value)}><option>dall-e-3</option><option>gpt-image-2</option></select><ChevronDown size={14} /></div>
            </Field>
            <Field label="比例" value={size} onChange={setSize}>
              <div className="select-wrap"><select value={size} onChange={(event) => setSize(event.target.value)}><option>auto</option><option>1024x1024</option><option>1536x1024</option><option>1024x1536</option></select><ChevronDown size={14} /></div>
            </Field>
            <Field label="质感" value={quality} onChange={setQuality}>
              <div className="select-wrap"><select value={quality} onChange={(event) => setQuality(event.target.value)}><option>standard</option><option>high</option><option>auto</option></select><ChevronDown size={14} /></div>
            </Field>
            <Field label="数量" value={count} onChange={setCount}>
              <div className="select-wrap"><select value={count} onChange={(event) => setCount(event.target.value)}><option>1</option><option>2</option><option>3</option><option>4</option></select><ChevronDown size={14} /></div>
            </Field>
          </div>

          <div className="action-row">
            <button className="format-button" type="button" onClick={() => setFormat(format === "png" ? "webp" : "png")}>{format.toUpperCase()}</button>
            <button className="generate-button" type="button" disabled={!isReady} onClick={submitGeneration}>
              <WandSparkles size={17} />
              {status === "failed" ? "重新生成" : "开始生成"}
            </button>
          </div>
        </section>

        <section className="canvas-panel" aria-label="生成结果">
          <div className="canvas-topline"><span>OUTPUT / {imageUrls.length ? String(imageUrls.length).padStart(2, "0") : "--"}</span><span>{status === "succeeded" ? "READY TO KEEP" : "IMAGE LAB"}</span></div>
          <ResultState status={status} imageUrls={imageUrls} error={error} />
          <div className="canvas-foot"><span>MindScribe / Generative image workspace</span><span>{status === "succeeded" && <><Check size={13} /> 交付完成</>}</span></div>
        </section>
      </section>
    </main>
  );
}
