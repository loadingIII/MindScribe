import { ChevronDown } from "lucide-react";

/**
 * 通用参数下拉框。
 * 选项支持字符串，或包含 value 和 label 的对象。
 */
export default function SelectField({ label, value, options, onChange, disabled = false, className = "", name }) {
  return <label className={`select-field ${className} ${disabled ? "is-disabled" : ""}`}><span>{label}</span><div><select name={name} value={value} disabled={disabled} onChange={(event) => onChange?.(event.target.value)}>{options.map((item) => {
    const option = typeof item === "string" ? { value: item, label: item } : item;
    return <option key={option.value} value={option.value}>{option.label}</option>;
  })}</select><ChevronDown size={14} /></div></label>;
}
