import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { BsCheckCircleFill, BsExclamationTriangleFill } from "react-icons/bs";
import { AppTheme, EditorTheme, Settings } from "../../types";
import { capitalize } from "../../lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "../ui/select";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { HTTP_BACKEND_URL, IS_RUNNING_ON_CLOUD } from "../../config";
import {
  ModelProvider,
  pickActiveProvider,
} from "../../lib/models";

interface Props {
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  appTheme: AppTheme;
  setAppTheme: React.Dispatch<React.SetStateAction<AppTheme>>;
}

interface ProviderField {
  apiKey: keyof Settings;
  baseURL: keyof Settings;
}

// Map each provider to the Settings keys that hold its credentials. Kept
// here (and only here) so the active provider can be derived from the
// credentials the user actually filled in.
const PROVIDER_FIELDS: Record<ModelProvider, ProviderField> = {
  openai: { apiKey: "openAiApiKey", baseURL: "openAiBaseURL" },
  anthropic: { apiKey: "anthropicApiKey", baseURL: "anthropicBaseURL" },
  gemini: { apiKey: "geminiApiKey", baseURL: "geminiBaseURL" },
  kimi: { apiKey: "kimiApiKey", baseURL: "kimiBaseURL" },
};

function SettingsTab({ settings, setSettings, appTheme, setAppTheme }: Props) {
  const [screenshotPreviewAvailable, setScreenshotPreviewAvailable] = useState<
    boolean | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${HTTP_BACKEND_URL}/api/capabilities`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.screenshot_preview === "boolean") {
          setScreenshotPreviewAvailable(data.screenshot_preview);
        }
      })
      .catch(() => {
        /* leave as null — don't show a false alarm if the backend is unreachable */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleThemeChange = (theme: EditorTheme) => {
    setSettings((s) => ({
      ...s,
      editorTheme: theme,
    }));
  };

  const activeProvider: ModelProvider = useMemo(
    () => pickActiveProvider(settings),
    [settings]
  );

  // Whether the active provider has a configured API key — controls whether
  // the dropdown accepts the current model.
  const activeProviderHasKey = useMemo(() => {
    const key = settings[PROVIDER_FIELDS[activeProvider].apiKey];
    return typeof key === "string" && key.trim().length > 0;
  }, [activeProvider, settings]);

  function updateActiveProviderField(
    field: "apiKey" | "baseURL",
    value: string | null
  ) {
    const fieldKey = PROVIDER_FIELDS[activeProvider][field] as keyof Settings;
    setSettings((prev) => ({
      ...prev,
      [fieldKey]: value,
    }));
  }

  type TestState =
    | { status: "idle" }
    | { status: "running" };

  const [connectionTest, setConnectionTest] = useState<TestState>({
    status: "idle",
  });

  async function handleTestConnection() {
    const fields = PROVIDER_FIELDS[activeProvider];
    const apiKey =
      (settings[fields.apiKey] as string | null)?.trim() ?? "";
    const model = settings.codeGenerationModel.trim();
    if (!apiKey || !model) {
      toast.error("请先填写 API 密钥和模型标识符。");
      return;
    }
    const baseURL =
      (settings[fields.baseURL] as string | null)?.trim() || null;
    setConnectionTest({ status: "running" });
    try {
      const response = await fetch(
        `${HTTP_BACKEND_URL}/api/test-model-connection`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: activeProvider,
            apiKey,
            baseURL,
            model,
          }),
        }
      );
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
      };
      if (response.ok && data.ok) {
        toast.success(data.message || "连通正常。");
      } else {
        toast.error(data.message || `测试失败 (HTTP ${response.status})`);
      }
    } catch (err) {
      toast.error(
        `无法连接到后端:${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setConnectionTest({ status: "idle" });
    }
  }

  return (
    <div>
      <div className="px-4 py-4 lg:px-6 lg:py-6">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
            设置
          </h1>
        </div>

        <div className="mx-auto max-w-lg space-y-6">
          {/* Theme */}
          <div className="rounded-lg border border-gray-200 bg-white dark:border-zinc-700 dark:bg-zinc-800/60">
            <div className="border-b border-gray-100 px-4 py-3 dark:border-zinc-700">
              <h2 className="text-sm font-medium text-gray-900 dark:text-white">
                主题
              </h2>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-zinc-700">
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="text-sm text-gray-700 dark:text-zinc-300">
                    应用主题
                  </span>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-zinc-400">
                    默认跟随系统,可手动切换为浅色或深色
                  </p>
                </div>
                <Select
                  name="app-theme"
                  value={appTheme}
                  onValueChange={(value) => setAppTheme(value as AppTheme)}
                >
                  <SelectTrigger className="w-[140px]">
                    {capitalize(appTheme)}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AppTheme.SYSTEM}>跟随系统</SelectItem>
                    <SelectItem value={AppTheme.LIGHT}>浅色</SelectItem>
                    <SelectItem value={AppTheme.DARK}>深色</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="text-sm text-gray-700 dark:text-zinc-300">
                    代码编辑器主题
                  </span>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-zinc-400">
                    需要刷新页面后生效
                  </p>
                </div>
                <Select
                  name="editor-theme"
                  value={settings.editorTheme}
                  onValueChange={(value) =>
                    handleThemeChange(value as EditorTheme)
                  }
                >
                  <SelectTrigger className="w-[140px]">
                    <span className="notranslate" translate="no">
                      {capitalize(settings.editorTheme)}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cobalt">
                      <span className="notranslate" translate="no">Cobalt</span>
                    </SelectItem>
                    <SelectItem value="espresso">
                      <span className="notranslate" translate="no">Espresso</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Model provider — one unified config card */}
          <div className="rounded-lg border border-gray-200 bg-white dark:border-zinc-700 dark:bg-zinc-800/60">
            <div className="border-b border-gray-100 px-4 py-3 dark:border-zinc-700">
              <h2 className="text-sm font-medium text-gray-900 dark:text-white">
                模型提供商
              </h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-zinc-400">
                以 ChatGPT 为例:Base URL 可填写 https://api.openai.com/v1(或任意兼容 OpenAI 接口的地址),
                API 密钥填写自己的 OpenAI 密钥,模型标识符填写 gpt-5.5 (medium thinking)。
                所有字段由用户自行配置,后端不做默认回退。
              </p>
            </div>
            <div className="space-y-4 p-4">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                  Base URL
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                  例如:https://api.openai.com/v1
                </p>
                <Input
                  id="active-provider-base-url"
                  name="active-provider-base-url"
                  className="mt-2"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="https://api.openai.com/v1"
                  value={
                    (settings[
                      PROVIDER_FIELDS[activeProvider].baseURL
                    ] as string | null) ?? ""
                  }
                  onChange={(e) =>
                    updateActiveProviderField(
                      "baseURL",
                      e.target.value || null
                    )
                  }
                />
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                  API 密钥
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                  仅存储在浏览器中。
                </p>
                <Input
                  id="active-provider-api-key"
                  name="active-provider-api-key"
                  className="mt-2"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="OpenAI API 密钥"
                  value={
                    (settings[
                      PROVIDER_FIELDS[activeProvider].apiKey
                    ] as string | null) ?? ""
                  }
                  onChange={(e) =>
                    updateActiveProviderField("apiKey", e.target.value || null)
                  }
                />
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                  模型
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                  例如:ChatGPT 的标识符是 gpt-5.5 (medium thinking)。后端不做校验,无法连通时会直接返回错误。
                </p>
                <Input
                  id="code-generation-model"
                  name="code-generation-model"
                  className="mt-2"
                  autoComplete="off"
                  spellCheck={false}
                  value={settings.codeGenerationModel}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      codeGenerationModel: e.target.value,
                    }))
                  }
                  placeholder="gpt-5.5 (medium thinking)"
                />
              </div>

              {!activeProviderHasKey && (
                <p className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200">
                  请填写 API 密钥才能生成代码。
                </p>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={connectionTest.status === "running"}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  {connectionTest.status === "running"
                    ? "正在测试…"
                    : "测试模型连通性"}
                </button>
              </div>
            </div>
          </div>

          {/* Image Generation — Replicate API key is now inside this card */}
          <div className="rounded-lg border border-gray-200 bg-white dark:border-zinc-700 dark:bg-zinc-800/60">
            <div className="border-b border-gray-100 px-4 py-3 dark:border-zinc-700">
              <h2 className="text-sm font-medium text-gray-900 dark:text-white">
                图像生成
              </h2>
            </div>
            <div className="space-y-4 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-700 dark:text-zinc-300">
                    占位图
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                    开启会让效果更有趣,但如果想节省费用,可以关闭。
                  </p>
                </div>
                <Switch
                  id="image-generation"
                  checked={settings.isImageGenerationEnabled}
                  onCheckedChange={() =>
                    setSettings((s) => ({
                      ...s,
                      isImageGenerationEnabled: !s.isImageGenerationEnabled,
                    }))
                  }
                />
              </div>
              {!IS_RUNNING_ON_CLOUD && settings.isImageGenerationEnabled && (
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                    Replicate API 密钥
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                    仅在启用「占位图」时使用。用于图像编辑与生成。
                  </p>
                  <Input
                    id="replicate-api-key"
                    className="mt-2"
                    placeholder="Replicate API 密钥"
                    value={settings.replicateApiKey || ""}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        replicateApiKey: e.target.value,
                      }))
                    }
                  />
                </div>
              )}
            </div>
          </div>

          {/* Screenshot Preview (agent self-verification) */}
          <div className="rounded-lg border border-gray-200 bg-white dark:border-zinc-700 dark:bg-zinc-800/60">
            <div className="border-b border-gray-100 px-4 py-3 dark:border-zinc-700">
              <h2 className="text-sm font-medium text-gray-900 dark:text-white">
                截图预览
              </h2>
            </div>
            <div className="p-4">
              {screenshotPreviewAvailable === false ? (
                <div className="flex items-start gap-2.5 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700/60 dark:bg-amber-900/20">
                  <BsExclamationTriangleFill className="mt-0.5 shrink-0 text-amber-500" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      截图预览不可用
                    </p>
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                      后端未安装无头 Chromium,因此智能体无法渲染并可视化验证自己的输出。请使用{" "}
                      <code className="rounded bg-amber-100 px-1 py-0.5 font-mono dark:bg-amber-900/40">
                        playwright install chromium
                      </code>{" "}
                      命令安装,然后重启后端。
                    </p>
                  </div>
                </div>
              ) : screenshotPreviewAvailable === true ? (
                <div className="flex items-start gap-2.5">
                  <BsCheckCircleFill className="mt-0.5 shrink-0 text-emerald-500" />
                  <div>
                    <p className="text-sm text-gray-700 dark:text-zinc-300">
                      可用
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                      智能体会使用无头浏览器渲染你生成的页面,可视化检查结果并修复布局问题。
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  正在检查后端能力…
                </p>
              )}
            </div>
          </div>

          {/* Screenshot by URL */}
          <div className="rounded-lg border border-gray-200 bg-white dark:border-zinc-700 dark:bg-zinc-800/60">
            <div className="border-b border-gray-100 px-4 py-3 dark:border-zinc-700">
              <h2 className="text-sm font-medium text-gray-900 dark:text-white">
                通过 URL 截图
              </h2>
            </div>
            <div className="p-4">
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                如果想直接使用 URL 而不是自己截图,请添加 ScreenshotOne API 密钥。{" "}
                <a
                  href="https://screenshotone.com?via=screenshot-to-code"
                  className="text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
                  target="_blank"
                >
                  免费获得每月 100 次截图额度。
                </a>
              </p>
              <Input
                id="screenshot-one-api-key"
                className="mt-3"
                placeholder="ScreenshotOne API 密钥"
                value={settings.screenshotOneApiKey || ""}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    screenshotOneApiKey: e.target.value,
                  }))
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsTab;
