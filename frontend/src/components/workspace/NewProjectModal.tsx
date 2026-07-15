import { useEffect, useRef, useState } from "react";
import {
  LuUpload,
  LuLink2,
  LuTextCursorInput,
  LuFileCode2,
  LuX,
  LuImagePlus,
} from "react-icons/lu";
import toast from "react-hot-toast";
import { MOCK_STACKS, MOCK_DESIGN_SYSTEMS } from "./MockData";

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (params: {
    inputMode: "upload" | "url" | "text" | "import";
    payload: string;
    stack: string;
    designSystemId: string | null;
  }) => void;
}

type Tab = "upload" | "url" | "text" | "import";

const TABS: { value: Tab; label: string; Icon: typeof LuUpload }[] = [
  { value: "upload", label: "上传", Icon: LuUpload },
  { value: "url", label: "URL", Icon: LuLink2 },
  { value: "text", label: "文本", Icon: LuTextCursorInput },
  { value: "import", label: "导入", Icon: LuFileCode2 },
];

export default function NewProjectModal({
  open,
  onClose,
  onGenerate,
}: NewProjectModalProps) {
  const [tab, setTab] = useState<Tab>("upload");
  const [stack, setStack] = useState(MOCK_STACKS[0].value);
  const [designSystemId, setDesignSystemId] = useState<string | null>(
    MOCK_DESIGN_SYSTEMS[0].id,
  );
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [importCode, setImportCode] = useState("");
  const [uploadName, setUploadName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset transient state when modal opens/closes
  useEffect(() => {
    if (open) {
      setTab("upload");
      setUploadName(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function handleGenerate() {
    let payload = "";
    if (tab === "upload") {
      if (!uploadName) {
        toast.error("请先选择截图文件");
        return;
      }
      payload = uploadName;
    } else if (tab === "url") {
      if (!url.trim()) {
        toast.error("请粘贴一个 URL");
        return;
      }
      payload = url.trim();
    } else if (tab === "text") {
      if (!text.trim()) {
        toast.error("请输入提示词");
        return;
      }
      payload = text.trim();
    } else if (tab === "import") {
      if (!importCode.trim()) {
        toast.error("请粘贴代码");
        return;
      }
      payload = importCode.trim();
    }

    toast.success("已生成（mock 数据 — 后端待接入）");
    onGenerate({ inputMode: tab, payload, stack, designSystemId });
    onClose();
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setUploadName(f.name);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) setUploadName(f.name);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="新建项目"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* Card */}
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">开始一个新项目</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              选择输入方式 — 视觉占位，未接入后端
            </p>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            aria-label="关闭"
          >
            <LuX className="h-4 w-4" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Tabs */}
          <div
            role="tablist"
            aria-label="输入方式"
            className="mb-4 grid grid-cols-4 gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900"
          >
            {TABS.map(({ value, label, Icon }) => (
              <button
                key={value}
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  tab === value
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                }`}
                data-testid={`new-tab-${value}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === "upload" && (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50 px-6 py-10 text-center transition-colors hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
            >
              <LuImagePlus className="mb-3 h-8 w-8 text-zinc-400" />
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                拖拽截图到此处，或点击选择文件
              </p>
              <p className="mt-1 text-xs text-zinc-500">支持 PNG / JPG / WebP</p>
              {uploadName && (
                <p className="mt-3 rounded-md bg-white px-2 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                  ✓ {uploadName}
                </p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPickFile}
              />
            </div>
          )}

          {tab === "url" && (
            <div>
              <label className="mb-1.5 block text-xs text-zinc-600 dark:text-zinc-400">
                网页 URL
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <p className="mt-2 text-xs text-zinc-500">
                后端将自动截图并提取布局
              </p>
            </div>
          )}

          {tab === "text" && (
            <div>
              <label className="mb-1.5 block text-xs text-zinc-600 dark:text-zinc-400">
                用一段话描述你想构建的页面
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="例如：创建一个登录页，居中卡片，包含邮箱、密码输入框和登录按钮"
                rows={6}
                className="w-full resize-none rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
          )}

          {tab === "import" && (
            <div>
              <label className="mb-1.5 block text-xs text-zinc-600 dark:text-zinc-400">
                粘贴现有代码（HTML / JSX / Vue）
              </label>
              <textarea
                value={importCode}
                onChange={(e) => setImportCode(e.target.value)}
                placeholder="<div>...</div>"
                rows={6}
                className="w-full resize-none rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
          )}

          {/* Stack + Design system */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs text-zinc-600 dark:text-zinc-400">
                技术栈
              </span>
              <select
                value={stack}
                onChange={(e) => setStack(e.target.value)}
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {MOCK_STACKS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs text-zinc-600 dark:text-zinc-400">
                设计系统
              </span>
              <select
                value={designSystemId ?? ""}
                onChange={(e) => setDesignSystemId(e.target.value || null)}
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {MOCK_DESIGN_SYSTEMS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <button
            onClick={onClose}
            className="cursor-pointer rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            取消
          </button>
          <button
            onClick={handleGenerate}
            className="cursor-pointer rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
            data-testid="new-generate"
          >
            生成代码 →
          </button>
        </footer>
      </div>
    </div>
  );
}