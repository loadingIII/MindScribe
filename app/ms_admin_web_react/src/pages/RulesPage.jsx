import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { api } from "../api";

const EMPTY_FORM = {
  action: "image_generation",
  model: "",
  baseCost: 20,
  img2imgCost: 30,
  sizeMultipliers: '{"auto": 1}',
  qualityMultipliers: '{"high": 1, "medium": 0.8, "low": 0.6}',
  isActive: true,
  remark: ""
};

/** 计价规则页：列表 + 新建/编辑弹层；保存后同进程热更新，无需重启服务。 */
export default function RulesPage() {
  const [rules, setRules] = useState([]);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async function load() {
    try { setRules(await api.get("/admin/pricing/rules")); setError(""); }
    catch (loadError) { setError(loadError.message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function flash(text) {
    setMessage(text);
    setTimeout(() => setMessage(""), 2500);
  }

  /** 保存表单：区分新建与编辑；系数 JSON 非法时直接提示。 */
  async function save(event) {
    event.preventDefault();
    try {
      const sizeFactor = JSON.parse(editing.sizeMultipliers);
      const qualityFactor = JSON.parse(editing.qualityMultipliers);
      const payload = { ...editing, sizeMultipliers: JSON.stringify(sizeFactor), qualityMultipliers: JSON.stringify(qualityFactor) };
      if (editing.id) {
        await api.put(`/admin/pricing/rules/${editing.id}`, payload);
        flash("规则已保存并即时生效");
      } else {
        await api.post("/admin/pricing/rules", payload);
        flash("规则已创建并即时生效");
      }
      setEditing(null);
      load();
    } catch (saveError) {
      setError(saveError.message || "保存失败：请检查系数 JSON 格式");
    }
  }

  async function deactivate(rule) {
    if (rule.model === "default" && !window.confirm("default 是兜底规则，停用后未配置的模型将无法计价，确定停用？")) return;
    if (!window.confirm(`确认停用规则 ${rule.action} / ${rule.model}？`)) return;
    try { await api.delete(`/admin/pricing/rules/${rule.id}`); flash("规则已停用并即时生效"); load(); }
    catch (error) { setError(error.message); }
  }

  return <section className="panel">
    <header className="panel-head">
      <div><h2>计价规则</h2><p>保存后立即生效，无需重启服务；未知尺寸/质量按系数 1.0 计价。</p></div>
      <div className="panel-actions">
        <button type="button" className="ghost" onClick={load}><RefreshCw size={15} />刷新</button>
        <button type="button" onClick={() => setEditing({ ...EMPTY_FORM })}><Plus size={15} />新建规则</button>
      </div>
    </header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="form-ok">{message}</p>}
    <table>
      <thead><tr>
        <th>动作</th><th>模型</th><th>文生图/张</th><th>图生图/张</th>
        <th>尺寸系数</th><th>质量系数</th><th>状态</th><th>备注</th><th></th>
      </tr></thead>
      <tbody>
        {rules.map((rule) => <tr key={rule.id} className={rule.isActive ? "" : "muted"}>
          <td>{rule.action}</td><td><b>{rule.model}</b></td>
          <td>{rule.baseCost}</td><td>{rule.img2imgCost}</td>
          <td><code>{rule.sizeMultipliers}</code></td>
          <td><code>{rule.qualityMultipliers}</code></td>
          <td>{rule.isActive ? <span className="badge ok">生效中</span> : <span className="badge">已停用</span>}</td>
          <td>{rule.remark || "—"}</td>
          <td className="row-actions">
            <button type="button" className="ghost" onClick={() => setEditing({
              ...rule,
              sizeMultipliers: JSON.stringify(JSON.parse(rule.sizeMultipliers || "{}"), null, 1),
              qualityMultipliers: JSON.stringify(JSON.parse(rule.qualityMultipliers || "{}"), null, 1)
            })}>编辑</button>
            {rule.isActive && <button type="button" className="danger ghost" onClick={() => deactivate(rule)}>停用</button>}
          </td>
        </tr>)}
        {!rules.length && <tr><td colSpan={9} className="empty">暂无规则，请先新建。</td></tr>}
      </tbody>
    </table>

    {editing && <div className="modal-mask" role="dialog" aria-modal="true">
      <form className="modal" onSubmit={save}>
        <h3>{editing.id ? "编辑规则" : "新建规则"}</h3>
        <div className="grid2">
          <label><span>计费动作</span>
            <select value={editing.action} disabled={Boolean(editing.id)} onChange={(event) => setEditing({ ...editing, action: event.target.value })}>
              <option value="image_generation">image_generation（生图）</option>
            </select>
          </label>
          <label><span>模型名（default 为兜底）</span>
            <input value={editing.model} disabled={Boolean(editing.id)} onChange={(event) => setEditing({ ...editing, model: event.target.value })} placeholder="gpt-image-2" />
          </label>
          <label><span>文生图基准价/张</span><input type="number" min="0" value={editing.baseCost} onChange={(event) => setEditing({ ...editing, baseCost: Number(event.target.value) })} /></label>
          <label><span>图生图基准价/张</span><input type="number" min="0" value={editing.img2imgCost} onChange={(event) => setEditing({ ...editing, img2imgCost: Number(event.target.value) })} /></label>
          <label><span>尺寸系数 JSON</span><textarea rows={3} value={editing.sizeMultipliers} onChange={(event) => setEditing({ ...editing, sizeMultipliers: event.target.value })} /></label>
          <label><span>质量系数 JSON</span><textarea rows={3} value={editing.qualityMultipliers} onChange={(event) => setEditing({ ...editing, qualityMultipliers: event.target.value })} /></label>
          <label><span>备注</span><input value={editing.remark || ""} onChange={(event) => setEditing({ ...editing, remark: event.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={editing.isActive} onChange={(event) => setEditing({ ...editing, isActive: event.target.checked })} /><span>是否生效</span></label>
        </div>
        <footer>
          <button type="button" className="ghost" onClick={() => setEditing(null)}>取消</button>
          <button type="submit">保存并生效</button>
        </footer>
      </form>
    </div>}
  </section>;
}
