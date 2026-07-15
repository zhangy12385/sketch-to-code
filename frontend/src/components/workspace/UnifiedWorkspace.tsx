import { useEffect, useState } from "react";
import {
  LuPlus,
  LuSettings,
  LuMessageSquare,
  LuHistory,
  LuX,
  LuImagePlus,
} from "react-icons/lu";
import { HiOutlineSparkles } from "react-icons/hi2";
import { useWorkspace } from "./WorkspaceContext";
import Sidebar from "../sidebar/Sidebar";
import PreviewPane from "../preview/PreviewPane";
import HistoryDisplay from "../history/HistoryDisplay";
import UnifiedInputPane from "../unified-input/UnifiedInputPane";
import SettingsTab from "../settings/SettingsTab";
import DesignSystemsModal from "../settings/DesignSystemsModal";
import TermsOfServiceDialog from "../TermsOfServiceDialog";
import SelectedElementDrawer from "../select-and-edit/SelectedElementDrawer";
import { useAppStore } from "../../store/app-store";
import { AppState } from "../../types";

type LeftTab = "chat" | "history";

interface TermsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface UnifiedWorkspaceProps {
  onMountTermsDialog: TermsDialogProps | null;
}

export default function UnifiedWorkspace({ onMountTermsDialog }: UnifiedWorkspaceProps) {
  const ctx = useWorkspace();
  const inSelectAndEditMode = useAppStore((s) => s.inSelectAndEditMode);
  const [leftTab, setLeftTab] = useState<LeftTab>("chat");

  // Auto-close the new-project modal when generation actually starts
  // (appState transitions from INITIAL → CODING).
  useEffect(() => {
    if (ctx.appState !== AppState.INITIAL && ctx.isNewOpen) {
      ctx.setIsNewOpen(false);
    }
  }, [ctx.appState, ctx.isNewOpen, ctx]);

  function openNewProject() {
    // Clear any in-flight generation before showing the modal again so the
    // user starts from a clean slate.
    ctx.reset();
    ctx.setIsNewOpen(true);
  }

  return (
    <div className="flex h-dvh flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {onMountTermsDialog && <TermsOfServiceDialog {...onMountTermsDialog} />}

      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
            <HiOutlineSparkles className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">
            Screenshot to Code
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openNewProject}
            className="flex cursor-pointer items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
            data-testid="header-new"
          >
            <LuPlus className="h-3.5 w-3.5" />
            新建项目
          </button>
          <button
            onClick={() => ctx.setIsSettingsOpen(true)}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            data-testid="header-settings"
          >
            <LuSettings className="h-3.5 w-3.5" />
            设置
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left panel */}
        <aside className="flex w-80 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex shrink-0 border-b border-zinc-200 px-2 py-1.5 dark:border-zinc-800">
            <LeftTabButton
              active={leftTab === "chat"}
              onClick={() => setLeftTab("chat")}
              Icon={LuMessageSquare}
              label="对话"
            />
            <LeftTabButton
              active={leftTab === "history"}
              onClick={() => setLeftTab("history")}
              Icon={LuHistory}
              label="历史"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {!ctx.hasProject && (
              <LeftEmptyState />
            )}

            {ctx.hasProject && leftTab === "chat" && (
              <Sidebar
                doUpdate={ctx.doUpdate}
                regenerate={ctx.regenerate}
                cancelCodeGeneration={ctx.cancelCodeGeneration}
                onOpenVersions={() => setLeftTab("history")}
                designSystem={ctx.designSystemSelector}
              />
            )}

            {ctx.hasProject && leftTab === "history" && (
              <div className="px-4 py-3">
                <h2 className="mb-3 px-1 text-xs font-medium uppercase tracking-wider text-zinc-400">
                  历史生成
                </h2>
                <HistoryDisplay />
              </div>
            )}
          </div>
        </aside>

        {/* Right main area */}
        <section className="flex min-w-0 flex-1 flex-col bg-zinc-100 dark:bg-zinc-900">
          {ctx.hasProject ? (
            <PreviewPane
              settings={ctx.settings}
              onOpenVersions={() => setLeftTab("history")}
            />
          ) : (
            <RightEmptyState />
          )}
        </section>

        {/* Selected-element editor — inline panel that appears alongside the
            preview when select-and-edit mode is on. No overlay so the user
            can still click through to elements in the preview. */}
        {inSelectAndEditMode && ctx.hasProject && <SelectedElementDrawer />}
      </main>

      {/* New project modal — wraps UnifiedInputPane */}
      <NewProjectModalShell
        open={ctx.isNewOpen}
        onClose={() => ctx.setIsNewOpen(false)}
      />

      {/* Settings drawer — wraps SettingsTab */}
      <SettingsDrawerShell
        open={ctx.isSettingsOpen}
        onClose={() => ctx.setIsSettingsOpen(false)}
      />

      {/* Design systems manager (auto-opens after handleAddNewDesignSystem) */}
      <DesignSystemsModal
        open={ctx.isDesignSystemsModalOpen}
        onOpenChange={ctx.setIsDesignSystemsModalOpen}
        designSystems={ctx.designSystems}
        selectedDesignSystemId={ctx.designSystemSelector.selectedDesignSystemId}
        setSelectedDesignSystemId={ctx.designSystemSelector.setSelectedDesignSystemId}
        initialEditingId={ctx.designSystemsModalInitialId}
        createDesignSystem={ctx.createDesignSystem}
        updateDesignSystem={ctx.updateDesignSystem}
        deleteDesignSystem={ctx.deleteDesignSystem}
      />
    </div>
  );
}

/* ----------------------------- sub-components ----------------------------- */

function LeftTabButton({
  active,
  onClick,
  Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  Icon: typeof LuMessageSquare;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
          : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function LeftEmptyState() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="text-center">
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
          还没有项目
        </p>
        <p className="mt-1 text-[11px] text-zinc-500">
          点击右上角「新建项目」开始
        </p>
      </div>
    </div>
  );
}

function RightEmptyState() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
          <HiOutlineSparkles className="h-6 w-6 text-zinc-500" />
        </div>
        <h2 className="mb-1 text-base font-semibold tracking-tight">
          把截图变成可用代码
        </h2>
        <p className="text-xs leading-relaxed text-zinc-500">
          拖入截图、粘贴 URL，或直接描述你想构建的页面。AI 将生成可直接运行的 HTML + Tailwind 代码。
        </p>
      </div>
    </div>
  );
}

/* ----------------------------- modal / drawer shells ----------------------------- */

function NewProjectModalShell({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const ctx = useWorkspace();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="新建项目"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-hidden="true"
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">开始一个新项目</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              选择输入方式 — 上传截图、粘贴 URL、描述想法，或导入现有代码
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
        <div className="flex-1 overflow-y-auto px-2 py-3">
          <UnifiedInputPane
            doCreate={ctx.doCreate}
            doCreateFromText={ctx.doCreateFromText}
            importFromCode={ctx.importFromCode}
            settings={ctx.settings}
            setSettings={ctx.setSettings}
            designSystems={ctx.designSystems}
            onAddNewDesignSystem={async () => {
              // Defer to design-system selector which opens the modal
              // (kept here as a passthrough; the selector drives UX)
            }}
            onManageDesignSystems={() => {
              ctx.designSystemSelector.onManage();
            }}
          />
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <span className="mr-auto flex items-center gap-1.5 text-[11px] text-zinc-500">
            <LuImagePlus className="h-3 w-3" />
            准备好后，点击下方对应输入方式的「生成代码」按钮
          </span>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            取消
          </button>
        </footer>
      </div>
    </div>
  );
}

function SettingsDrawerShell({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const ctx = useWorkspace();

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
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-label="设置"
        className={`fixed inset-y-0 right-0 z-50 flex w-[420px] max-w-[100vw] flex-col overflow-y-auto border-l border-zinc-200 bg-white shadow-xl transition-transform duration-200 ease-out dark:border-zinc-800 dark:bg-zinc-950 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <SettingsTab
          settings={ctx.settings}
          setSettings={ctx.setSettings}
          appTheme={ctx.appTheme}
          setAppTheme={ctx.setAppTheme}
        />
      </aside>
    </>
  );
}