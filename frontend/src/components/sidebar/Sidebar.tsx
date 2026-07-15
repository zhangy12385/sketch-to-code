import { useAppStore } from "../../store/app-store";
import { useProjectStore } from "../../store/project-store";
import { AppState } from "../../types";
import { Button } from "../ui/button";
import { useEffect, useRef, useState, useCallback } from "react";
import { LuMousePointerClick, LuRefreshCw, LuArrowUp } from "react-icons/lu";
import { toast } from "react-hot-toast";

import Variants from "../variants/Variants";
import UpdateImageUpload, { UpdateImagePreview } from "../UpdateImageUpload";
import AgentActivity from "../agent/AgentActivity";
import WorkingPulse from "../core/WorkingPulse";
import ImageLightbox from "../ImageLightbox";
import { Commit } from "../commits/types";
import { CodeGenerationModel } from "../../lib/models";
import DesignSystemSelector, {
  DesignSystemSelectorProps,
} from "../settings/DesignSystemSelector";

interface SidebarProps {
  doUpdate: (instruction: string) => void;
  regenerate: () => void;
  cancelCodeGeneration: () => void;
  onOpenVersions: () => void;
  designSystem: DesignSystemSelectorProps;
}

const MAX_UPDATE_IMAGES = 5;

function extractTagName(html: string): string {
  const match = html.match(/^<(\w+)/);
  return match ? match[1].toLowerCase() : "element";
}

function summarizeLatestChange(commit: Commit | null): string | null {
  if (!commit) return null;
  if (commit.type === "code_create") return "已导入现有代码。";

  const text = commit.inputs.text.trim();
  if (text.length > 0) return text;

  if (commit.type === "ai_create") {
    return "创建";
  }

  if (commit.inputs.images.length > 1) {
    return `已根据 ${commit.inputs.images.length} 张参考图更新。`;
  }
  if (commit.inputs.images.length === 1) {
    return "已根据一张参考图更新。";
  }
  return "已更新代码。";
}

function getSelectedElementTag(commit: Commit | null): string | null {
  if (!commit || commit.type === "code_create") return null;
  const html = commit.inputs.selectedElementHtml;
  if (!html) return null;
  return extractTagName(html);
}

function isSlowGeminiModel(model?: string): boolean {
  return (
    model === CodeGenerationModel.GEMINI_3_1_PRO_PREVIEW_HIGH ||
    model === CodeGenerationModel.GEMINI_3_1_PRO_PREVIEW_MEDIUM
  );
}

function Sidebar({
  doUpdate,
  regenerate,
  cancelCodeGeneration,
  onOpenVersions,
  designSystem,
}: SidebarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const middlePaneRef = useRef<HTMLDivElement>(null);
  const [isErrorExpanded, setIsErrorExpanded] = useState(false);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [isPromptClamped, setIsPromptClamped] = useState(false);
  const promptTextRef = useRef<HTMLParagraphElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const {
    appState,
    updateInstruction,
    setUpdateInstruction,
    updateImages,
    setUpdateImages,
    inSelectAndEditMode,
    toggleInSelectAndEditMode,
    selectedElement,
  } = useAppStore();

  // Helper function to convert file to data URL
  const fileToDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files).filter(
        (file) => file.type === "image/png" || file.type === "image/jpeg"
      );

      if (files.length === 0) return;

      try {
        if (updateImages.length >= MAX_UPDATE_IMAGES) {
          toast.error(
            `已达到 ${MAX_UPDATE_IMAGES} 张参考图的上限。请先移除一张后再添加。`
          );
          return;
        }

        const remainingSlots = MAX_UPDATE_IMAGES - updateImages.length;
        let filesToAdd = files;
        if (filesToAdd.length > remainingSlots) {
          toast.error(
            `仅会再添加 ${remainingSlots} 张图片，以保持在 ${MAX_UPDATE_IMAGES} 张图片的上限内。`
          );
          filesToAdd = filesToAdd.slice(0, remainingSlots);
        }

        const newImagePromises = filesToAdd.map((file) => fileToDataURL(file));
        const newImages = await Promise.all(newImagePromises);
        setUpdateImages([...updateImages, ...newImages]);
      } catch (error) {
        console.error("Error reading files:", error);
      }
    },
    [updateImages, setUpdateImages]
  );

  const { head, commits, latestCommitHash, setHead } = useProjectStore();

  const currentCommit = head ? commits[head] : null;
  const latestChangeSummary = summarizeLatestChange(currentCommit);
  const selectedElementTag = getSelectedElementTag(currentCommit);
  const latestChangeImages =
    currentCommit && currentCommit.type !== "code_create"
      ? currentCommit.inputs.images
      : [];
  const latestChangeVideos =
    currentCommit && currentCommit.type !== "code_create"
      ? currentCommit.inputs.videos ?? []
      : [];
  const selectedVariantIndex = currentCommit?.selectedVariantIndex ?? 0;
  const selectedVariant = currentCommit?.variants[selectedVariantIndex];
  const selectedVariantEvents = selectedVariant?.agentEvents ?? [];
  const showWorkingIndicator =
    appState === AppState.CODING &&
    selectedVariantEvents.length === 0 &&
    head === latestCommitHash;
  const requestStartMs =
    selectedVariant?.requestStartedAt ??
    (currentCommit?.dateCreated
      ? new Date(currentCommit.dateCreated).getTime()
      : undefined);
  const elapsedSeconds = requestStartMs
    ? Math.max(1, Math.round((nowMs - requestStartMs) / 1000))
    : undefined;

  const isFirstGeneration = currentCommit?.type === "ai_create";
  const isViewingOlderVersion = head !== null && head !== latestCommitHash;

  // Compute version number for the current head
  const currentVersionNumber = (() => {
    if (!head) return null;
    const sorted = Object.values(commits).sort(
      (a, b) => new Date(a.dateCreated).getTime() - new Date(b.dateCreated).getTime()
    );
    const index = sorted.findIndex((c) => c.hash === head);
    return index !== -1 ? index + 1 : null;
  })();

  // Check if the currently selected variant is complete
  const isSelectedVariantComplete =
    head &&
    commits[head] &&
    commits[head].variants[commits[head].selectedVariantIndex].status ===
      "complete";

  // Check if the currently selected variant has an error
  const isSelectedVariantError =
    head &&
    commits[head] &&
    commits[head].variants[commits[head].selectedVariantIndex].status ===
      "error";

  // Get the error message from the selected variant
  const selectedVariantErrorMessage =
    head &&
    commits[head] &&
    commits[head].variants[commits[head].selectedVariantIndex].errorMessage;

  // Auto-resize textarea to fit content
  const autoResize = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = textarea.scrollHeight + "px";
    }
  }, []);

  // Focus on the update instruction textarea when a variant is complete
  useEffect(() => {
    if (
      (appState === AppState.CODE_READY || isSelectedVariantComplete) &&
      textareaRef.current
    ) {
      const el = textareaRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [appState, isSelectedVariantComplete]);

  // Focus the textarea when an element is selected in the preview
  useEffect(() => {
    if (selectedElement && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [selectedElement]);

  // Reset textarea height when instruction changes externally (e.g., cleared after submit)
  useEffect(() => {
    autoResize();
  }, [updateInstruction, autoResize]);

  // Reset error expanded state when variant changes
  useEffect(() => {
    setIsErrorExpanded(false);
  }, [head, selectedVariantIndex]);

  // Reset prompt expanded state when commit changes and detect clamping
  useEffect(() => {
    setIsPromptExpanded(false);
  }, [head]);

  useEffect(() => {
    const el = promptTextRef.current;
    if (el) {
      setIsPromptClamped(el.scrollHeight > el.clientHeight);
    } else {
      setIsPromptClamped(false);
    }
  }, [latestChangeSummary, isPromptExpanded]);

  useEffect(() => {
    if (!middlePaneRef.current) return;
    requestAnimationFrame(() => {
      if (!middlePaneRef.current) return;
      middlePaneRef.current.scrollTop = middlePaneRef.current.scrollHeight;
    });
  }, [head, selectedVariantIndex]);

  useEffect(() => {
    if (appState !== AppState.CODING) return;
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [appState]);


  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-2">
        <Variants />
      </div>

      {/* Scrollable content */}
      <div
        ref={middlePaneRef}
        className="flex-1 min-h-0 overflow-y-auto sidebar-scrollbar-stable px-6 pt-4"
      >
        {latestChangeSummary && (
          <div className="mb-4 flex flex-col items-end">
            <div className="inline-block max-w-[85%] rounded-2xl rounded-br-md bg-violet-100 px-4 py-2.5 dark:bg-violet-900/30">
              <p
                ref={promptTextRef}
                className={`text-[13px] text-violet-950 dark:text-violet-100 break-words whitespace-pre-wrap ${
                  !isPromptExpanded ? "line-clamp-[10]" : ""
                }`}
              >
                {latestChangeSummary}
              </p>
              {selectedElementTag && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <LuMousePointerClick className="w-3 h-3 text-violet-500 dark:text-violet-400" />
                  <span className="text-[11px] text-violet-600 dark:text-violet-300">
                    已选择： <code className="font-mono text-[10px] bg-violet-200/60 dark:bg-violet-800/50 px-1 py-0.5 rounded">&lt;{selectedElementTag}&gt;</code>
                  </span>
                </div>
              )}
              {(isPromptClamped || isPromptExpanded) && (
                <div className="flex justify-end mt-1.5">
                  <button
                    onClick={() => setIsPromptExpanded(!isPromptExpanded)}
                    className="text-[11px] font-medium text-gray-600 bg-white/70 hover:bg-white dark:text-gray-300 dark:bg-zinc-800/70 dark:hover:bg-zinc-800 px-2 py-0.5 rounded-full transition-colors shadow-sm"
                  >
                    {isPromptExpanded ? "收起" : "展开"}
                  </button>
                </div>
              )}
            </div>
              {latestChangeImages.length > 0 && (
                <div className="mt-2 flex gap-2 flex-wrap justify-end">
                  {latestChangeImages.map((image, index) => (
                    <button
                      key={`${image.slice(0, 40)}-${index}`}
                      onClick={() => setLightboxImage(image)}
                      className="shrink-0 cursor-zoom-in rounded-lg border border-gray-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900 hover:border-violet-300 dark:hover:border-violet-500 transition-colors"
                    >
                      <img
                        src={image}
                        alt={`参考图 ${index + 1}`}
                        className="h-24 w-24 object-contain"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              )}
              {latestChangeVideos.length > 0 && (
                <div className="mt-2 space-y-2">
                  {latestChangeVideos.map((video, index) => (
                    <video
                      key={`${video.slice(0, 40)}-${index}`}
                      src={video}
                      className="w-full rounded-lg border border-gray-200 dark:border-zinc-700"
                      controls
                      preload="metadata"
                    />
                  ))}
                </div>
              )}
          </div>
        )}

        {showWorkingIndicator && (
          <div className="working-indicator-bg mb-3 rounded-xl border border-violet-200 dark:border-violet-800 px-3 py-2 transition-all duration-500">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <WorkingPulse />
                <span>处理中...</span>
              </div>
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                已用时 {elapsedSeconds ? `${elapsedSeconds} 秒` : "--"}
              </div>
            </div>
          </div>
        )}

        {currentCommit?.type === "ai_create" &&
          appState === AppState.CODING &&
          head === latestCommitHash &&
          !isSelectedVariantComplete &&
          !isSelectedVariantError &&
          isSlowGeminiModel(selectedVariant?.model) && (
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            速度较慢的高质量模型。在某些图片/视频上可能需要 5-10 分钟。
          </div>
        )}

        {isViewingOlderVersion && currentVersionNumber !== null ? (
          <div className="mb-4 flex flex-col items-center py-6">
            <p className="text-2xl font-semibold text-gray-900 dark:text-zinc-100">
              版本 {currentVersionNumber}
            </p>
            <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
              您正在查看一个旧版本
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={onOpenVersions}
                className="rounded-lg border border-gray-300 dark:border-zinc-600 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
              >
                所有版本
              </button>
              <button
                onClick={() => latestCommitHash && setHead(latestCommitHash)}
                className="rounded-lg bg-gray-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-black hover:bg-black dark:hover:bg-gray-200 transition-colors"
              >
                查看最新
              </button>
            </div>
          </div>
        ) : (
          <AgentActivity />
        )}

        {/* Regenerate button for first generation.
            Scenarios:
            1) `appState === CODE_READY`: request fully ended and user can retry.
            2) `isSelectedVariantComplete`: selected option completed even if app state
               has not yet fully transitioned.
            3) `isSelectedVariantError`: selected option failed; keep retry visible so
               users can rerun create without losing uploaded inputs. */}
        {isFirstGeneration &&
          head === latestCommitHash &&
          (appState === AppState.CODE_READY ||
            isSelectedVariantComplete ||
            isSelectedVariantError) && (
          <div className="flex justify-end mb-3">
            <button
              onClick={regenerate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <LuRefreshCw className="w-3.5 h-3.5" />
              重试
            </button>
          </div>
        )}

        {/* Show cancel button when coding */}
        {appState === AppState.CODING && !isSelectedVariantComplete && (
          <div className="flex w-full">
            <Button
              onClick={cancelCodeGeneration}
              className="w-full dark:text-white dark:bg-gray-700"
            >
              取消所有生成
            </Button>
          </div>
        )}

        {/* Show error message when selected option has an error */}
        {isSelectedVariantError && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md p-3 mb-2">
            <div className="text-red-800 dark:text-red-200 text-sm">
              <div className="font-medium mb-1">
                此选项生成失败，原因是
              </div>
              {selectedVariantErrorMessage && (
                <div className="mb-2">
                  <div className="text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40 border border-red-300 dark:border-red-700 rounded px-2 py-1 text-xs font-mono break-words">
                    {selectedVariantErrorMessage.length > 200 && !isErrorExpanded
                      ? `${selectedVariantErrorMessage.slice(0, 200)}...`
                      : selectedVariantErrorMessage}
                  </div>
                  {selectedVariantErrorMessage.length > 200 && (
                    <button
                      onClick={() => setIsErrorExpanded(!isErrorExpanded)}
                      className="text-red-600 dark:text-red-400 text-xs underline mt-1 hover:text-red-800 dark:hover:text-red-300"
                    >
                      {isErrorExpanded ? "收起" : "展开"}
                    </button>
                  )}
                </div>
              )}
              <div>
                {isFirstGeneration
                  ? "点击“重试”以再次运行创建请求。"
                  : "在上方切换到另一个选项以进行更新。"}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pinned bottom: prompt box + option selector */}
      {(appState === AppState.CODE_READY || isSelectedVariantComplete) &&
        !isSelectedVariantError && (
          <div
            className="shrink-0 border-t border-gray-200 bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900 px-4 py-4"
            onDragEnter={() => setIsDragging(true)}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setIsDragging(false);
              }
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {/* Select and edit indicator — hidden once an element is selected
                because the right-side drawer is always visible while select
                mode is on and shows its own hint + close button. */}
            {inSelectAndEditMode && (
              <div className="mb-2 flex items-center gap-2 rounded-xl border border-violet-200 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/20 px-3 py-2">
                <LuMousePointerClick className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400 shrink-0" />
                <span className="flex-1 text-sm font-medium text-violet-700 dark:text-violet-300">
                  {selectedElement
                    ? "在右侧抽屉中编辑当前元素，或继续对话修改其它部分"
                    : "在预览中点击任意元素以开始编辑"}
                </span>
              </div>
            )}
            <div className="relative w-full overflow-hidden rounded-2xl border-2 border-violet-300 bg-white transition-all focus-within:border-violet-500 dark:border-violet-500/50 dark:bg-zinc-900 dark:focus-within:border-violet-400">
              <UpdateImagePreview
                updateImages={updateImages}
                setUpdateImages={setUpdateImages}
              />
              <textarea
                ref={textareaRef}
                placeholder={
                  inSelectAndEditMode && selectedElement
                    ? `继续对话，或在右侧面板直接修改此元素的样式与内容…`
                    : "告诉 AI 需要修改什么..."
                }
                onChange={(e) => {
                  setUpdateInstruction(e.target.value);
                  autoResize();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    doUpdate(updateInstruction);
                  }
                }}
                value={updateInstruction}
                data-testid="update-input"
                rows={1}
                className="max-h-40 w-full resize-none border-0 bg-transparent px-4 pt-4 pb-6 text-[15px] leading-6 text-gray-800 placeholder:text-gray-400 focus:outline-none dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
              <div className="flex items-center justify-between px-3 pb-3">
                <div className="flex items-center gap-1">
                  <UpdateImageUpload
                    updateImages={updateImages}
                    setUpdateImages={setUpdateImages}
                  />
                  <button
                    onClick={toggleInSelectAndEditMode}
                    data-testid="select-edit-toggle-prompt"
                    className={`rounded-lg p-2 transition-colors ${
                      inSelectAndEditMode
                        ? "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"
                        : "text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                    }`}
                    title={inSelectAndEditMode ? "退出选择模式" : "在预览中选择一个元素以作为修改目标"}
                  >
                    <LuMousePointerClick className="w-[18px] h-[18px]" />
                  </button>
                  <DesignSystemSelector {...designSystem} compact />
                </div>
                <button
                  onClick={() => doUpdate(updateInstruction)}
                  disabled={!updateInstruction.trim()}
                  className={`rounded-xl p-2 transition-colors update-btn ${
                    updateInstruction.trim()
                      ? "bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400"
                      : "cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-zinc-700 dark:text-zinc-500"
                  }`}
                  title="发送"
                >
                  <LuArrowUp className="w-[18px] h-[18px]" strokeWidth={2.5} />
                </button>
              </div>

              {isDragging && (
                <div className="absolute inset-0 bg-blue-50/90 dark:bg-gray-800/90 border-2 border-dashed border-blue-400 dark:border-blue-600 rounded-xl flex items-center justify-center pointer-events-none z-10">
                  <p className="text-blue-600 dark:text-blue-400 font-medium">将图片拖放到此处</p>
                </div>
              )}
            </div>
          </div>
        )}

      <ImageLightbox
        image={lightboxImage}
        onClose={() => setLightboxImage(null)}
      />
    </div>
  );
}

export default Sidebar;
