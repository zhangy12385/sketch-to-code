import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LuMousePointerClick,
  LuX,
  LuRotateCcw,
  LuInfo,
} from "react-icons/lu";
import { useAppStore } from "../../store/app-store";
import { useProjectStore } from "../../store/project-store";

// --- helpers --------------------------------------------------------------

const LENGTH_UNITS = ["px", "rem", "em", "%", "vw", "vh"] as const;
type LengthUnit = (typeof LENGTH_UNITS)[number];

const FONT_WEIGHTS = [
  "100", "200", "300", "400", "500", "600", "700", "800", "900",
] as const;

const DISPLAY_OPTIONS = [
  "block", "inline", "inline-block", "flex", "inline-flex",
  "grid", "inline-grid", "none",
] as const;

const TEXT_ALIGN_OPTIONS = ["left", "center", "right", "justify"] as const;

type Side = "Top" | "Right" | "Bottom" | "Left";

// The selected element lives inside the preview iframe, so its computed
// styles must be resolved through that document's own window — the parent
// window's getComputedStyle does not reliably resolve cross-document nodes.
function viewOf(el: HTMLElement): Window {
  return el.ownerDocument?.defaultView ?? window;
}

function readComputedLength(el: HTMLElement, prop: string): { num: number; unit: LengthUnit } {
  const cs = viewOf(el).getComputedStyle(el);
  const raw = cs.getPropertyValue(prop);
  const m = raw.match(/^(-?\d*\.?\d+)\s*([a-z%]*)/i);
  if (!m) return { num: 0, unit: "px" };
  const num = parseFloat(m[1]);
  const unit = (LENGTH_UNITS as readonly string[]).includes(m[2])
    ? (m[2] as LengthUnit)
    : "px";
  return { num, unit };
}

function readComputedColor(el: HTMLElement, prop: string): string {
  const cs = viewOf(el).getComputedStyle(el);
  // getPropertyValue returns rgb(...) for color properties; convert to hex for <input type=color>
  const raw = cs.getPropertyValue(prop).trim();
  return raw || "#000000";
}

// Convert any CSS color string (rgb/rgba/hex/named) to #RRGGBB for <input type=color>.
function toHexColor(value: string): string {
  const trimmed = value.trim();
  if (/^#([0-9a-f]{3}){1,2}$/i.test(trimmed)) {
    return trimmed.length === 4
      ? "#" + trimmed.slice(1).split("").map((c) => c + c).join("")
      : trimmed;
  }
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return "#000000";
  ctx.fillStyle = "#000";
  ctx.fillStyle = trimmed;
  return ctx.fillStyle as string; // browser normalizes to #rrggbb or rgba(...)
}

interface Draft {
  id: string;
  className: string;
  text: string;
  placeholder: string;
  display: string;
  color: string;
  backgroundColor: string;
  fontSize: { num: number; unit: LengthUnit };
  fontWeight: string;
  textAlign: string;
  borderRadius: { num: number; unit: LengthUnit };
  padding: Record<Side, { num: number; unit: LengthUnit }>;
  margin: Record<Side, { num: number; unit: LengthUnit }>;
}

// Only <input>/<textarea> carry a placeholder ("为空提示"), and only when the
// generated markup actually declared one — matching the user's intent to edit
// existing placeholders rather than add them to arbitrary elements.
function supportsPlaceholder(el: HTMLElement): boolean {
  return (
    (el.tagName === "INPUT" || el.tagName === "TEXTAREA") &&
    el.hasAttribute("placeholder")
  );
}

// Snapshot every editable property from the live element into a draft. Reads
// go through the element's own document view so styles resolve correctly for
// nodes living inside the preview iframe.
function buildDraft(el: HTMLElement): Draft {
  const cs = viewOf(el).getComputedStyle(el);
  const side = (s: Side) => readComputedLength(el, `padding-${s.toLowerCase()}`);
  const sideMargin = (s: Side) => readComputedLength(el, `margin-${s.toLowerCase()}`);
  return {
    id: el.id ?? "",
    className: typeof el.className === "string" ? el.className : "",
    text: el.tagName === "IMG" ? "" : (el.textContent ?? ""),
    placeholder: supportsPlaceholder(el) ? el.getAttribute("placeholder") ?? "" : "",
    display: cs.display || "block",
    color: readComputedColor(el, "color"),
    backgroundColor: readComputedColor(el, "background-color"),
    fontSize: readComputedLength(el, "font-size"),
    fontWeight: cs.fontWeight || "400",
    textAlign: cs.textAlign || "left",
    borderRadius: readComputedLength(el, "border-radius"),
    padding: {
      Top: side("Top"),
      Right: side("Right"),
      Bottom: side("Bottom"),
      Left: side("Left"),
    },
    margin: {
      Top: sideMargin("Top"),
      Right: sideMargin("Right"),
      Bottom: sideMargin("Bottom"),
      Left: sideMargin("Left"),
    },
  };
}

// --- per-property input components --------------------------------------
// Shared class names so every control in the inspector matches pixel-for-pixel.
const CONTROL_BASE =
  "h-8 w-full rounded-md border border-zinc-200 bg-white font-mono text-xs text-zinc-800 placeholder:text-zinc-400 transition-shadow focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-100 dark:focus:ring-zinc-100/10";

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <FieldRow label={label}>
      <div className="flex items-center gap-2">
        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md border border-zinc-200 shadow-sm dark:border-zinc-700">
          <input
            type="color"
            value={toHexColor(value)}
            onChange={(e) => onChange(e.target.value)}
            aria-label={`${label}颜色选择`}
            className="absolute inset-0 h-full w-full cursor-pointer border-0 bg-transparent p-0"
          />
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className={CONTROL_BASE + " px-2.5"}
        />
      </div>
    </FieldRow>
  );
}

function LengthField({
  label,
  num,
  unit,
  onChange,
}: {
  label: string;
  num: number;
  unit: LengthUnit;
  onChange: (n: number, u: LengthUnit) => void;
}) {
  return (
    <FieldRow label={label}>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={Number.isFinite(num) ? num : 0}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0, unit)}
          className={CONTROL_BASE + " min-w-0 flex-1 px-2.5"}
        />
        <select
          value={unit}
          onChange={(e) => onChange(num, e.target.value as LengthUnit)}
          className="h-8 cursor-pointer rounded-md border border-zinc-200 bg-white px-1.5 font-mono text-xs text-zinc-700 transition-shadow focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:focus:border-zinc-100 dark:focus:ring-zinc-100/10"
        >
          {LENGTH_UNITS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </div>
    </FieldRow>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <FieldRow label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={
          CONTROL_BASE +
          " cursor-pointer appearance-none bg-[length:0.65rem] bg-[right_0.5rem_center] bg-no-repeat pl-2.5 pr-7 text-left text-zinc-800 dark:text-zinc-100"
        }
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path fill='%2371717A' d='M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z'/></svg>\")",
        }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </FieldRow>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <FieldRow label={label}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className={CONTROL_BASE + " px-2.5"}
      />
    </FieldRow>
  );
}

// A single labelled row inside a Section card: left-aligned label, right-aligned
// control filling the remaining width. Matches Figma/DevTools inspector layout.
function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] items-center gap-3 px-3.5 py-2 transition-colors first:rounded-t-[inherit] last:rounded-b-[inherit] hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40">
      <span className="select-none text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="flex h-full flex-col items-center justify-start px-5 py-10 text-center">
      <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100 text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
        <LuMousePointerClick className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        在预览中点选一个元素
      </h3>
      <p className="mt-1.5 max-w-[280px] text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
        点选任意元素后，此处会出现可编辑的样式与内容字段。修改会实时写入内联样式并同步到代码，不发起 AI 调用。
      </p>

      <div className="mt-7 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white text-left dark:border-zinc-800 dark:bg-zinc-950">
        <header className="flex items-center gap-1.5 border-b border-zinc-200 bg-zinc-50/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
          <LuInfo className="h-3 w-3" />
          操作提示
        </header>
        <ul className="divide-y divide-zinc-100 text-[13px] text-zinc-600 dark:divide-zinc-800/70 dark:text-zinc-400">
          <li className="flex items-center justify-between px-3 py-2">
            <span>悬停元素</span>
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500">描边高亮</span>
          </li>
          <li className="flex items-center justify-between px-3 py-2">
            <span>单击元素</span>
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500">加载到此处</span>
          </li>
          <li className="flex items-center justify-between px-3 py-2">
            <span>退出选择</span>
            <kbd className="rounded border border-zinc-300 bg-white px-1.5 font-mono text-[11px] dark:border-zinc-700 dark:bg-zinc-800">
              Esc
            </kbd>
          </li>
          <li className="flex items-center justify-between px-3 py-2">
            <span>重置所有修改</span>
            <kbd className="rounded border border-zinc-300 bg-white px-1.5 font-mono text-[11px] dark:border-zinc-700 dark:bg-zinc-800">
              ↺
            </kbd>
          </li>
        </ul>
      </div>
    </div>
  );
}

// --- main drawer ---------------------------------------------------------

export default function SelectedElementDrawer() {
  const {
    selectedElement,
    setSelectedElement,
    disableInSelectAndEditMode,
  } = useAppStore();
  const { head, commits, setCommitCode } = useProjectStore();

  // Drawer follows select-and-edit mode, not the per-element selection.
  // Users open it once via the toolbar and it stays open while they click
  // around; only an empty-state hint is shown when no element is selected.
  // The parent (UnifiedWorkspace) is responsible for conditionally rendering
  // this panel in the layout grid — it stays out of the DOM when the mode
  // is off.

  // Local draft state — initialized from the element, then mutated by controls.
  // We commit each property change directly to the element so the user sees
  // the effect live (matches Chrome DevTools behavior).
  const [draft, setDraft] = useState<Draft | null>(null);

  // Re-read from element whenever the selection changes
  useEffect(() => {
    if (!selectedElement) {
      setDraft(null);
      return;
    }
    setDraft(buildDraft(selectedElement));
  }, [selectedElement]);

  // Detect stale element (iframe reloaded) and clear the selection
  useEffect(() => {
    if (!selectedElement) return;
    const interval = setInterval(() => {
      if (selectedElement && !selectedElement.isConnected) {
        setSelectedElement(null);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [selectedElement, setSelectedElement]);

  // Serialize the live iframe document (minus the select-mode overlays and
  // cursor style, which live outside <body>) back into the current commit's
  // code, so inline-style edits become part of the generated source and
  // survive a preview reload / leaving select mode.
  const persistEdits = useCallback(() => {
    if (!selectedElement || !head) return;
    const doc = selectedElement.ownerDocument;
    if (!doc?.documentElement) return;
    const currentCommit = commits[head];
    if (!currentCommit) return;
    const clone = doc.documentElement.cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll(
        "#__s2c-hover-overlay, #__s2c-selection-overlay, #__s2c-select-cursor"
      )
      .forEach((n) => n.remove());
    const html = `<!DOCTYPE html>\n${clone.outerHTML}`;
    setCommitCode(head, currentCommit.selectedVariantIndex, html);
  }, [selectedElement, head, commits, setCommitCode]);

  // Generic mutator that both updates draft state and writes back to the DOM
  const commit = useCallback(
    <K extends keyof NonNullable<typeof draft>>(key: K, value: NonNullable<typeof draft>[K]) => {
      if (!selectedElement || !draft) return;
      setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
      applyToElement(selectedElement, key, value);
      persistEdits();
    },
    [selectedElement, draft, persistEdits]
  );

  // Reset draft + revert the element to its originally-read state
  const resetAll = useCallback(() => {
    if (!selectedElement) return;
    const el = selectedElement;
    // Clear all inline styles we touched
    [
      "display", "color", "background-color", "font-size", "font-weight",
      "text-align", "border-radius", "padding", "padding-top", "padding-right",
      "padding-bottom", "padding-left", "margin", "margin-top", "margin-right",
      "margin-bottom", "margin-left",
    ].forEach((p) => el.style.removeProperty(p));
    setDraft(buildDraft(el));
    persistEdits();
  }, [selectedElement, persistEdits]);

  const handleClose = useCallback(() => {
    // Closing the drawer exits select-and-edit mode entirely (not just
    // clears the current selection). The user can re-enter via the toolbar.
    disableInSelectAndEditMode();
  }, [disableInSelectAndEditMode]);

  const info = useMemo(() => {
    if (!selectedElement) return null;
    return {
      tag: selectedElement.tagName.toLowerCase(),
      id: selectedElement.id,
      classes:
        typeof selectedElement.className === "string"
          ? selectedElement.className.trim().replace(/\s+/g, " ")
          : "",
    };
  }, [selectedElement]);

  return (
    <aside
      role="region"
      aria-label="元素编辑"
      data-testid="selected-element-drawer"
      className="flex h-full w-[420px] shrink-0 flex-col border-l border-zinc-200 bg-zinc-50/30 dark:border-zinc-800 dark:bg-zinc-950"
    >
        {/* Header */}
        <header className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              <LuMousePointerClick className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                元素编辑
              </div>
              <div className="mt-0.5 flex items-center gap-1 truncate">
                <code className="rounded bg-zinc-900 px-1.5 py-px font-mono text-xs font-medium text-white dark:bg-white dark:text-zinc-900">
                  &lt;{info?.tag ?? "…"}&gt;
                </code>
                {info?.id && (
                  <code className="truncate rounded bg-zinc-200/70 px-1.5 py-px font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    #{info.id}
                  </code>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              onClick={resetAll}
              title="重置所有修改"
              className="cursor-pointer rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <LuRotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleClose}
              title="关闭 (Esc)"
              className="cursor-pointer rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <LuX className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-3.5 py-3">
          {!selectedElement ? (
            <EmptyHint />
          ) : !draft ? (
            <div className="flex h-full items-center justify-center py-12">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                读取元素属性…
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Identity */}
              <Section title="标识" count={2}>
                <TextField
                  label="id"
                  value={draft.id}
                  placeholder="元素 id"
                  onChange={(v) => commit("id", v)}
                />
                <TextField
                  label="class"
                  value={draft.className}
                  placeholder="空格分隔"
                  onChange={(v) => commit("className", v)}
                />
              </Section>

              {/* Content */}
              {selectedElement.tagName !== "IMG" && (
                <Section title="内容">
                  <div className="px-3.5 py-2.5 transition-colors hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40">
                    <textarea
                      value={draft.text}
                      onChange={(e) => commit("text", e.target.value)}
                      rows={3}
                      placeholder="文本内容"
                      className="block w-full resize-none rounded-md border border-zinc-200 bg-white px-2.5 py-2 font-mono text-xs leading-relaxed text-zinc-800 placeholder:text-zinc-400 transition-shadow focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-100 dark:focus:ring-zinc-100/10"
                    />
                  </div>
                </Section>
              )}

              {/* Placeholder — only for input/textarea that declare one */}
              {supportsPlaceholder(selectedElement) && (
                <Section title="为空提示">
                  <TextField
                    label="placeholder"
                    value={draft.placeholder}
                    placeholder="占位提示文本"
                    onChange={(v) => commit("placeholder", v)}
                  />
                </Section>
              )}

              {/* Layout */}
              <Section title="布局">
                <SelectField
                  label="display"
                  value={draft.display}
                  options={DISPLAY_OPTIONS}
                  onChange={(v) => commit("display", v)}
                />
              </Section>

              {/* Spacing */}
              <Section title="内边距">
                <BoxSidesGrid
                  values={draft.padding}
                  onChange={(side, v) =>
                    commit("padding", { ...draft.padding, [side]: v })
                  }
                />
              </Section>

              <Section title="外边距">
                <BoxSidesGrid
                  values={draft.margin}
                  onChange={(side, v) =>
                    commit("margin", { ...draft.margin, [side]: v })
                  }
                />
              </Section>

              {/* Typography */}
              <Section title="排版" count={5}>
                <ColorField
                  label="文字颜色"
                  value={draft.color}
                  onChange={(v) => commit("color", v)}
                />
                <ColorField
                  label="背景颜色"
                  value={draft.backgroundColor}
                  onChange={(v) => commit("backgroundColor", v)}
                />
                <LengthField
                  label="字号"
                  num={draft.fontSize.num}
                  unit={draft.fontSize.unit}
                  onChange={(n, u) =>
                    commit("fontSize", { num: n, unit: u })
                  }
                />
                <SelectField
                  label="字重"
                  value={draft.fontWeight}
                  options={FONT_WEIGHTS}
                  onChange={(v) => commit("fontWeight", v)}
                />
                <SelectField
                  label="对齐"
                  value={draft.textAlign}
                  options={TEXT_ALIGN_OPTIONS}
                  onChange={(v) => commit("textAlign", v)}
                />
              </Section>

              {/* Border */}
              <Section title="边框">
                <LengthField
                  label="圆角"
                  num={draft.borderRadius.num}
                  unit={draft.borderRadius.unit}
                  onChange={(n, u) =>
                    commit("borderRadius", { num: n, unit: u })
                  }
                />
              </Section>
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="shrink-0 border-t border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
          实时写入内联样式 · Esc 关闭 ·{" "}
          <button
            onClick={handleClose}
            className="cursor-pointer text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
          >
            完成
          </button>
        </div>
    </aside>
  );
}

// --- small layout helpers ------------------------------------------------

// Bordered card grouping related properties under an uppercase header. Rows
// inside the card use <FieldRow> and are separated by hairline dividers.
function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-[0_1px_0_rgba(0,0,0,0.02)] dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/70 px-3.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/50">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
          {title}
        </h3>
        {typeof count === "number" && (
          <span className="rounded-full bg-zinc-200 px-1.5 text-[10px] font-medium tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {count}
          </span>
        )}
      </header>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800/70">{children}</div>
    </section>
  );
}

const SIDE_LABELS: Record<Side, string> = {
  Top: "上",
  Right: "右",
  Bottom: "下",
  Left: "左",
};

function BoxSidesGrid({
  values,
  onChange,
}: {
  values: Record<Side, { num: number; unit: LengthUnit }>;
  onChange: (side: Side, v: { num: number; unit: LengthUnit }) => void;
}) {
  return (
    <div className="px-3.5 py-3">
      <div className="grid grid-cols-4 gap-2">
        {(["Top", "Right", "Bottom", "Left"] as Side[]).map((s) => (
          <div key={s} className="flex flex-col gap-1">
            <span className="text-center text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {SIDE_LABELS[s]}
            </span>
            <input
              type="number"
              value={values[s].num}
              onChange={(e) =>
                onChange(s, {
                  num: parseFloat(e.target.value) || 0,
                  unit: values[s].unit,
                })
              }
              className="h-8 w-full rounded-md border border-zinc-200 bg-white px-1 text-center font-mono text-xs text-zinc-800 transition-shadow focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-100 dark:focus:ring-zinc-100/10"
            />
            <select
              value={values[s].unit}
              onChange={(e) =>
                onChange(s, {
                  num: values[s].num,
                  unit: e.target.value as LengthUnit,
                })
              }
              className="h-6 cursor-pointer rounded-md border border-zinc-200 bg-white text-center text-[10px] uppercase tracking-wider text-zinc-600 transition-shadow focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:focus:border-zinc-100 dark:focus:ring-zinc-100/10"
            >
              {LENGTH_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- DOM writer ----------------------------------------------------------

function applyToElement(
  el: HTMLElement,
  key: keyof Draft,
  value: unknown
): void {
  switch (key) {
    case "id":
      if (value) el.id = String(value);
      else el.removeAttribute("id");
      return;
    case "className":
      el.className = String(value);
      return;
    case "placeholder":
      if (value) el.setAttribute("placeholder", String(value));
      else el.removeAttribute("placeholder");
      return;
    case "text":
      el.textContent = String(value);
      return;
    case "display":
      el.style.display = String(value);
      return;
    case "color":
      el.style.color = String(value);
      return;
    case "backgroundColor":
      el.style.backgroundColor = String(value);
      return;
    case "fontSize": {
      const v = value as { num: number; unit: LengthUnit };
      el.style.fontSize = `${v.num}${v.unit}`;
      return;
    }
    case "fontWeight":
      el.style.fontWeight = String(value);
      return;
    case "textAlign":
      el.style.textAlign = String(value);
      return;
    case "borderRadius": {
      const v = value as { num: number; unit: LengthUnit };
      el.style.borderRadius = `${v.num}${v.unit}`;
      return;
    }
    case "padding": {
      const v = value as Record<Side, { num: number; unit: LengthUnit }>;
      el.style.paddingTop = `${v.Top.num}${v.Top.unit}`;
      el.style.paddingRight = `${v.Right.num}${v.Right.unit}`;
      el.style.paddingBottom = `${v.Bottom.num}${v.Bottom.unit}`;
      el.style.paddingLeft = `${v.Left.num}${v.Left.unit}`;
      return;
    }
    case "margin": {
      const v = value as Record<Side, { num: number; unit: LengthUnit }>;
      el.style.marginTop = `${v.Top.num}${v.Top.unit}`;
      el.style.marginRight = `${v.Right.num}${v.Right.unit}`;
      el.style.marginBottom = `${v.Bottom.num}${v.Bottom.unit}`;
      el.style.marginLeft = `${v.Left.num}${v.Left.unit}`;
      return;
    }
    default:
      return;
  }
}