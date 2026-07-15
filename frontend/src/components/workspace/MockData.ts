// Mock data for UnifiedWorkspace preview (no backend yet).
// Replace with real store/state values once backend integration begins.

export type ChatRole = "user" | "assistant";

export interface MockChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  time: string;
}

export interface MockVersion {
  id: string;
  label: string;
  summary: string;
  time: string;
  active: boolean;
}

export const MOCK_CHAT: MockChatMessage[] = [
  {
    id: "m1",
    role: "user",
    content: "把按钮改成圆角，并加上柔和阴影",
    time: "刚刚",
  },
  {
    id: "m2",
    role: "assistant",
    content: "已根据一条参考图更新。",
    time: "刚刚",
  },
  {
    id: "m3",
    role: "user",
    content: "再调整一下字体间距",
    time: "1 分钟前",
  },
];

export const MOCK_VERSIONS: MockVersion[] = [
  {
    id: "v3",
    label: "v3",
    summary: "调整字体间距",
    time: "1 分钟前",
    active: true,
  },
  {
    id: "v2",
    label: "v2",
    summary: "按钮圆角 + 阴影",
    time: "3 分钟前",
    active: false,
  },
  {
    id: "v1",
    label: "v1",
    summary: "首次生成",
    time: "5 分钟前",
    active: false,
  },
];

export const MOCK_STACKS = [
  { value: "html-tailwind", label: "HTML + Tailwind" },
  { value: "react-tailwind", label: "React + Tailwind" },
  { value: "vue-tailwind", label: "Vue + Tailwind" },
  { value: "html-css", label: "HTML + CSS" },
  { value: "bootstrap", label: "Bootstrap" },
  { value: "ionic-tailwind", label: "Ionic + Tailwind" },
];

export const MOCK_DESIGN_SYSTEMS = [
  { id: "default", name: "默认" },
  { id: "shadcn", name: "shadcn/ui" },
  { id: "material", name: "Material" },
];

// Mock rendered HTML for the preview pane. Visually stands in for an AI-generated page.
export const MOCK_PREVIEW_HTML = `
<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8" />
  <style>
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #fafafa;
      color: #18181b;
    }
    .hero {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px;
      text-align: center;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border: 1px solid #e4e4e7;
      border-radius: 999px;
      font-size: 12px;
      color: #71717a;
      background: #fff;
    }
    h1 {
      margin: 24px 0 12px;
      font-size: 48px;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: #18181b;
    }
    p {
      max-width: 520px;
      color: #52525b;
      line-height: 1.6;
    }
    .cta {
      margin-top: 32px;
      display: flex;
      gap: 12px;
    }
    .btn {
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .btn-primary {
      background: #18181b;
      color: #fafafa;
    }
    .btn-ghost {
      background: transparent;
      border-color: #e4e4e7;
      color: #18181b;
    }
  </style>
</head>
<body>
  <div class="hero">
    <span class="badge">● 预览（mock 数据）</span>
    <h1>把截图变成可用代码</h1>
    <p>拖入截图、粘贴 URL，或直接描述你想构建的页面。AI 将生成可直接运行的 HTML + Tailwind 代码。</p>
    <div class="cta">
      <button class="btn btn-primary">开始使用</button>
      <button class="btn btn-ghost">查看示例</button>
    </div>
  </div>
</body>
</html>
`.trim();