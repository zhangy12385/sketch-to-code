import { useEffect } from "react";
import { LuX } from "react-icons/lu";

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
}

const ROWS = [
  { label: "OpenAI API Key", placeholder: "sk-..." },
  { label: "Anthropic API Key", placeholder: "sk-ant-..." },
  { label: "Gemini API Key", placeholder: "AIza..." },
  { label: "Replicate API Key", placeholder: "r8_..." },
];

const MODEL_OPTIONS = [
  "Claude Opus 4.8",
  "Claude Sonnet 4.6",
  "GPT-5.5",
  "GPT-5.4 Mini",
  "Gemini 3.1 Pro Preview",
  "Gemini 3 Flash Preview",
];

const THEME_OPTIONS = ["跟随系统", "浅色", "深色"];

export default function SettingsDrawer({ open, onClose }: SettingsDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-label="设置"
        className={`fixed inset-y-0 right-0 z-50 w-[400px] max-w-[100vw] transform border-l border-zinc-200 bg-white shadow-xl transition-transform duration-200 ease-out dark:border-zinc-800 dark:bg-zinc-950 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex h-14 items-center justify-between border-b border-zinc-200 px-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold tracking-tight">设置</h2>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            aria-label="关闭设置"
          >
            <LuX className="h-4 w-4" />
          </button>
        </header>

        <div className="h-[calc(100%-3.5rem)] overflow-y-auto px-4 py-4">
          <p className="mb-4 text-xs text-zinc-500">
            以下为视觉占位 — 真实功能将在确认后接入。
          </p>

          <section className="mb-6">
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
              API 密钥
            </h3>
            <p className="mb-3 text-xs text-zinc-500">
              用于调用模型生成代码（仅保存在本地浏览器）
            </p>
            <div className="space-y-2">
              {ROWS.map((r) => (
                <label key={r.label} className="block">
                  <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                    {r.label}
                  </span>
                  <input
                    type="password"
                    placeholder={r.placeholder}
                    disabled
                    className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-700 placeholder:text-zinc-400 disabled:cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="mb-6">
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
              代码生成模型
            </h3>
            <p className="mb-3 text-xs text-zinc-500">
              选择生成代码所用的 AI 模型
            </p>
            <select
              disabled
              className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-700 disabled:cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </section>

          <section className="mb-6">
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
              主题
            </h3>
            <p className="mb-3 text-xs text-zinc-500">切换浅色 / 深色 / 跟随系统</p>
            <div className="flex gap-2">
              {THEME_OPTIONS.map((t, i) => (
                <button
                  key={t}
                  disabled
                  className={`cursor-not-allowed rounded-md border px-3 py-1.5 text-xs ${
                    i === 0
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                      : "border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
              图像生成
            </h3>
            <p className="mb-3 text-xs text-zinc-500">
              生成代码时是否同时生成示例图片
            </p>
            <div className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <span className="text-sm">启用图像生成</span>
              <span className="relative inline-block h-5 w-9 cursor-not-allowed rounded-full bg-zinc-900 dark:bg-white">
                <span className="absolute right-0.5 top-0.5 inline-block h-4 w-4 rounded-full bg-white shadow dark:bg-zinc-900" />
              </span>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}