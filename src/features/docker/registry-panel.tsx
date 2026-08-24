import { Database, Pencil, Plus, RefreshCw, ShieldCheck, ShieldOff, Star, TestTube2, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DockerPanelAction, DockerPanelActionResult, DockerRegistrySummary } from "./docker-panel";
import "./resources-panel.css";

type RegistryEntry = {
  key: string;
  endpoint: string;
  name: string;
  secure: boolean;
  mutable: boolean;
  isDefault: boolean;
};

function normalizeEndpoint(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function validateEndpoint(value: string) {
  const endpoint = normalizeEndpoint(value);
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "地址必须以 http:// 或 https:// 开头";
    if (!url.hostname || url.username || url.password || url.search || url.hash)
      return "请输入不带账号、密码、查询参数的仓库地址";
    return "";
  } catch {
    return "请输入有效的仓库地址，例如 https://ghcr.io";
  }
}

export function RegistryPanel({
  language,
  onAction,
}: {
  language: "zh-CN" | "en";
  onAction?: (action: DockerPanelAction) => Promise<DockerPanelActionResult | void>;
}) {
  const zhMode = language === "zh-CN";
  const [registries, setRegistries] = useState<DockerRegistrySummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingMirror, setEditingMirror] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const refresh = async () => {
    if (!onAction || refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      const result = await onAction({ kind: "registry", operation: "list" });
      setRegistries(result?.registries || []);
    } catch (reason) {
      setError(String(reason));
      setRegistries([]);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void refresh();
    // This panel mounts only while the Registry section is visible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entries = useMemo<RegistryEntry[]>(() => {
    const rows: RegistryEntry[] = [];
    for (const registry of registries) {
      const baseName = registry.name || "docker.io";
      rows.push({
        key: `base:${baseName}`,
        endpoint: baseName,
        name: baseName,
        secure: registry.secure,
        mutable: false,
        isDefault: false,
      });
      for (const mirror of registry.mirrors) {
        const endpoint = normalizeEndpoint(mirror);
        if (!endpoint) continue;
        rows.push({
          key: `mirror:${baseName}:${endpoint}`,
          endpoint,
          name: baseName,
          secure: endpoint.startsWith("https://"),
          mutable: baseName === "docker.io",
          isDefault: baseName === "docker.io" && registry.mirrors[0] === mirror,
        });
      }
    }
    return rows;
  }, [registries]);

  const run = async (action: DockerPanelAction, key: string) => {
    if (!onAction || busyAction) return;
    setBusyAction(key);
    setError("");
    setMessage("");
    try {
      const result = await onAction(action);
      if (result?.message) setMessage(result.message);
      return result;
    } catch (reason) {
      setError(String(reason));
      return undefined;
    } finally {
      setBusyAction(null);
    }
  };

  const test = async (entry: RegistryEntry) => {
    const endpoint = entry.endpoint === "docker.io" ? "https://registry-1.docker.io" : entry.endpoint;
    await run({ kind: "registry", operation: "test", mirror: endpoint }, `test:${endpoint}`);
  };

  const openAdd = () => {
    setEditingMirror(null);
    setDraft("");
    setError("");
    setMessage("");
    setEditorOpen(true);
  };

  const openEdit = (entry: RegistryEntry) => {
    setEditingMirror(entry.endpoint);
    setDraft(entry.endpoint);
    setError("");
    setMessage("");
    setEditorOpen(true);
  };

  const save = async () => {
    const endpoint = normalizeEndpoint(draft);
    const validation = validateEndpoint(endpoint);
    if (validation) {
      setError(validation);
      return;
    }
    const operation = editingMirror ? "update" : "add";
    const result = await run(
      {
        kind: "registry",
        operation,
        mirror: endpoint,
        ...(editingMirror ? { previousMirror: editingMirror } : {}),
      },
      `${operation}:${endpoint}`,
    );
    if (!result) return;
    setEditorOpen(false);
    await refresh();
  };

  const testDraft = async () => {
    const endpoint = normalizeEndpoint(draft);
    const validation = validateEndpoint(endpoint);
    if (validation) {
      setError(validation);
      return;
    }
    await run({ kind: "registry", operation: "test", mirror: endpoint }, `test:${endpoint}`);
  };

  const remove = async (entry: RegistryEntry) => {
    if (!window.confirm(zhMode ? `删除镜像仓库“${entry.endpoint}”？Docker 配置备份会保留。` : `Remove “${entry.endpoint}”? A Docker config backup will be kept.`)) return;
    const result = await run({ kind: "registry", operation: "remove", mirror: entry.endpoint }, `remove:${entry.endpoint}`);
    if (result) await refresh();
  };

  const setDefault = async (entry: RegistryEntry) => {
    const result = await run({ kind: "registry", operation: "setDefault", mirror: entry.endpoint }, `default:${entry.endpoint}`);
    if (result) await refresh();
  };

  return (
    <section className="docker-resource-panel" aria-label={zhMode ? "镜像仓库" : "Registry"}>
      <header className="docker-resource-heading">
        <div>
          <strong>{zhMode ? "镜像仓库" : "Registry"}</strong>
          <span>{zhMode ? "查看、测试和管理 Docker 镜像加速源" : "Inspect, test and manage Docker registry mirrors"}</span>
        </div>
        <div className="docker-resource-heading-actions">
          <button type="button" onClick={openAdd} disabled={!onAction || Boolean(busyAction)} title={zhMode ? "添加仓库" : "Add registry"}><Plus size={14} /></button>
          <button type="button" onClick={() => void refresh()} disabled={!onAction || refreshing || Boolean(busyAction)} title={zhMode ? "刷新" : "Refresh"}><RefreshCw size={14} className={refreshing ? "is-spinning" : ""} /></button>
        </div>
      </header>
      {error && <div className="docker-resource-feedback is-error"><span>{error}</span><button type="button" onClick={() => setError("")}><X size={13} /></button></div>}
      {message && <div className="docker-resource-feedback is-success"><span>{message}</span><button type="button" onClick={() => setMessage("")}><X size={13} /></button></div>}
      <div className="docker-resource-list">
        {entries.length ? entries.map((entry) => (
          <article className="docker-resource-row" key={entry.key}>
            <span className="docker-resource-icon"><Database size={18} /></span>
            <div className="docker-resource-main">
              <strong>{entry.endpoint}</strong>
              <span>{entry.name === "docker.io" && entry.mutable ? (zhMode ? "Docker 镜像加速源" : "Docker mirror") : entry.name === "docker.io" ? (zhMode ? "默认仓库端点" : "Default registry endpoint") : (zhMode ? "Docker 配置中的仓库端点" : "Registry endpoint from Docker")}</span>
            </div>
            <span className={entry.secure ? "docker-resource-badge is-secure" : "docker-resource-badge is-insecure"}>{entry.secure ? <ShieldCheck size={13} /> : <ShieldOff size={13} />}{entry.secure ? (zhMode ? "安全" : "Secure") : (zhMode ? "非安全" : "Insecure")}</span>
            {entry.isDefault && <span className="docker-resource-default"><Star size={12} />{zhMode ? "首选" : "Default"}</span>}
            <div className="docker-resource-actions">
              <button type="button" onClick={() => void test(entry)} disabled={Boolean(busyAction)} title={zhMode ? "测试连接" : "Test connection"}><TestTube2 size={13} /></button>
              {entry.mutable && <>
                {!entry.isDefault && <button type="button" onClick={() => void setDefault(entry)} disabled={Boolean(busyAction)} title={zhMode ? "设为首选" : "Set as default"}><Star size={13} /></button>}
                <button type="button" onClick={() => openEdit(entry)} disabled={Boolean(busyAction)} title={zhMode ? "编辑" : "Edit"}><Pencil size={13} /></button>
                <button type="button" onClick={() => void remove(entry)} disabled={Boolean(busyAction)} title={zhMode ? "删除" : "Remove"}><Trash2 size={13} /></button>
              </>}
            </div>
          </article>
        )) : <div className="docker-resource-empty">{refreshing ? (zhMode ? "正在读取镜像仓库…" : "Loading registries…") : (zhMode ? "未读取到仓库配置" : "No registry configuration found")}</div>}
      </div>
      {editorOpen && <div className="docker-resource-modal-backdrop"><section className="docker-resource-detail-modal docker-registry-editor" role="dialog" aria-modal="true" aria-labelledby="docker-registry-editor-title"><header><div><strong id="docker-registry-editor-title">{editingMirror ? (zhMode ? "编辑镜像仓库" : "Edit registry") : (zhMode ? "添加镜像仓库" : "Add registry")}</strong><span>{zhMode ? "写入 Docker daemon.json；重启 Docker 后生效。" : "Writes Docker daemon.json; restart Docker to apply."}</span></div><button type="button" onClick={() => setEditorOpen(false)}><X size={16} /></button></header><label>{zhMode ? "仓库地址" : "Registry URL"}<input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void save(); }} placeholder="https://registry.example.com" /></label><p>{zhMode ? "仅支持 HTTP/HTTPS 地址，不会把账号或密码写入 OpsNest 配置。" : "Only HTTP/HTTPS URLs are supported. Credentials are never written to OpsNest config."}</p><footer><button type="button" onClick={() => setEditorOpen(false)}>{zhMode ? "取消" : "Cancel"}</button><button type="button" onClick={() => void testDraft()} disabled={!draft.trim() || Boolean(busyAction)}>{zhMode ? "测试连接" : "Test connection"}</button><button className="docker-images-primary" type="button" onClick={() => void save()} disabled={!draft.trim() || Boolean(busyAction)}>{busyAction ? (zhMode ? "保存中…" : "Saving…") : (zhMode ? "保存" : "Save")}</button></footer></section></div>}
    </section>
  );
}
