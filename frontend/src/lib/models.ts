import type { Settings } from "../types";

// Keep in sync with backend (llm.py)
// Order here matches dropdown order
export enum CodeGenerationModel {
  CLAUDE_OPUS_4_8_LOW = "claude-opus-4-8 (low effort)",
  CLAUDE_OPUS_4_8_MEDIUM = "claude-opus-4-8 (medium effort)",
  CLAUDE_OPUS_4_8_HIGH = "claude-opus-4-8 (high effort)",
  CLAUDE_OPUS_4_8_XHIGH = "claude-opus-4-8 (xhigh effort)",
  CLAUDE_OPUS_4_8_MAX = "claude-opus-4-8 (max effort)",
  CLAUDE_SONNET_4_6 = "claude-sonnet-4-6",
  GPT_5_5_NONE = "gpt-5.5 (no thinking)",
  GPT_5_5_LOW = "gpt-5.5 (low thinking)",
  GPT_5_5_MEDIUM = "gpt-5.5 (medium thinking)",
  GPT_5_5_HIGH = "gpt-5.5 (high thinking)",
  GPT_5_5_XHIGH = "gpt-5.5 (xhigh thinking)",
  GPT_5_4_MINI_LOW = "gpt-5.4-mini (low thinking)",
  GEMINI_3_FLASH_PREVIEW_HIGH = "gemini-3-flash-preview (high thinking)",
  GEMINI_3_FLASH_PREVIEW_MINIMAL = "gemini-3-flash-preview (minimal thinking)",
  GEMINI_3_1_PRO_PREVIEW_HIGH = "gemini-3.1-pro-preview (high thinking)",
  GEMINI_3_1_PRO_PREVIEW_MEDIUM = "gemini-3.1-pro-preview (medium thinking)",
  GEMINI_3_1_PRO_PREVIEW_LOW = "gemini-3.1-pro-preview (low thinking)",
  GEMINI_3_5_FLASH_HIGH = "gemini-3.5-flash (high thinking)",
  GEMINI_3_5_FLASH_MEDIUM = "gemini-3.5-flash (medium thinking)",
  GEMINI_3_5_FLASH_LOW = "gemini-3.5-flash (low thinking)",
  GEMINI_3_5_FLASH_MINIMAL = "gemini-3.5-flash (minimal thinking)",
  KIMI_FOR_CODING = "kimi-for-coding",
}

export type ModelProvider = "openai" | "anthropic" | "gemini" | "kimi";

export const MODEL_PROVIDER_LABELS: Record<ModelProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  kimi: "Kimi",
};

export const MODEL_PROVIDER_MODELS: Record<
  ModelProvider,
  CodeGenerationModel[]
> = {
  openai: [
    CodeGenerationModel.GPT_5_5_NONE,
    CodeGenerationModel.GPT_5_5_LOW,
    CodeGenerationModel.GPT_5_5_MEDIUM,
    CodeGenerationModel.GPT_5_5_HIGH,
    CodeGenerationModel.GPT_5_5_XHIGH,
    CodeGenerationModel.GPT_5_4_MINI_LOW,
  ],
  anthropic: [
    CodeGenerationModel.CLAUDE_OPUS_4_8_LOW,
    CodeGenerationModel.CLAUDE_OPUS_4_8_MEDIUM,
    CodeGenerationModel.CLAUDE_OPUS_4_8_HIGH,
    CodeGenerationModel.CLAUDE_OPUS_4_8_XHIGH,
    CodeGenerationModel.CLAUDE_OPUS_4_8_MAX,
    CodeGenerationModel.CLAUDE_SONNET_4_6,
  ],
  gemini: [
    CodeGenerationModel.GEMINI_3_5_FLASH_HIGH,
    CodeGenerationModel.GEMINI_3_5_FLASH_MEDIUM,
    CodeGenerationModel.GEMINI_3_5_FLASH_LOW,
    CodeGenerationModel.GEMINI_3_5_FLASH_MINIMAL,
    CodeGenerationModel.GEMINI_3_FLASH_PREVIEW_HIGH,
    CodeGenerationModel.GEMINI_3_FLASH_PREVIEW_MINIMAL,
    CodeGenerationModel.GEMINI_3_1_PRO_PREVIEW_HIGH,
    CodeGenerationModel.GEMINI_3_1_PRO_PREVIEW_MEDIUM,
    CodeGenerationModel.GEMINI_3_1_PRO_PREVIEW_LOW,
  ],
  kimi: [CodeGenerationModel.KIMI_FOR_CODING],
};

export const MODEL_PROVIDER_DEFAULT_MODEL: Record<
  ModelProvider,
  CodeGenerationModel
> = {
  openai: CodeGenerationModel.GPT_5_5_LOW,
  anthropic: CodeGenerationModel.CLAUDE_OPUS_4_8_MEDIUM,
  gemini: CodeGenerationModel.GEMINI_3_FLASH_PREVIEW_MINIMAL,
  kimi: CodeGenerationModel.KIMI_FOR_CODING,
};

export function getModelProvider(model: string): ModelProvider {
  for (const provider of Object.keys(
    MODEL_PROVIDER_MODELS
  ) as ModelProvider[]) {
    if (MODEL_PROVIDER_MODELS[provider].includes(model as CodeGenerationModel)) {
      return provider;
    }
  }
  return "gemini";
}

// Field names on Settings that hold each provider's API key and base URL.
// Used by both the settings form and the request builder to keep the
// "active provider" derivation in one place.
export const PROVIDER_API_KEY_FIELD: Record<ModelProvider, keyof Settings> = {
  openai: "openAiApiKey",
  anthropic: "anthropicApiKey",
  gemini: "geminiApiKey",
  kimi: "kimiApiKey",
};

export const PROVIDER_BASE_URL_FIELD: Record<ModelProvider, keyof Settings> = {
  openai: "openAiBaseURL",
  anthropic: "anthropicBaseURL",
  gemini: "geminiBaseURL",
  kimi: "kimiBaseURL",
};

// The user enters a free-form model string now, so we can't infer the
// provider from the model name. Pick the first provider whose API key is
// filled in — that's the provider the user is actively using.
export function pickActiveProvider(settings: {
  [K in keyof Settings]: Settings[K];
}): ModelProvider {
  const providers = Object.keys(PROVIDER_API_KEY_FIELD) as ModelProvider[];
  for (const provider of providers) {
    const value = settings[PROVIDER_API_KEY_FIELD[provider]];
    if (typeof value === "string" && value.trim().length > 0) {
      return provider;
    }
  }
  return providers[0];
}

export function isKnownModel(model: string): boolean {
  for (const provider of Object.keys(
    MODEL_PROVIDER_MODELS
  ) as ModelProvider[]) {
    if (MODEL_PROVIDER_MODELS[provider].includes(model as CodeGenerationModel)) {
      return true;
    }
  }
  return false;
}

export type VariantLabelTone = "fast" | "max";

export interface VariantLabel {
  text: string;
  tone: VariantLabelTone;
}

export interface VariantLabelContext {
  inputMode: "image" | "video" | "text";
  generationType: "create" | "update";
}

// Per-model badge text. Only these models are labelled. GPT-5.5 high and
// Gemini 3.1 Pro high are the heavyweight variants, so both read "Max".
const VARIANT_LABELS: Partial<Record<CodeGenerationModel, VariantLabel>> = {
  [CodeGenerationModel.GEMINI_3_FLASH_PREVIEW_MINIMAL]: { text: "Fast", tone: "fast" },
  [CodeGenerationModel.GEMINI_3_1_PRO_PREVIEW_HIGH]: { text: "Max", tone: "max" },
  [CodeGenerationModel.GPT_5_5_HIGH]: { text: "Max", tone: "max" },
};

// Badges are only shown on create flows and on any video flow. In particular
// image/text update runs reuse Flash-minimal but should stay unlabelled.
export function getVariantLabel(
  model: string | undefined,
  context: VariantLabelContext
): VariantLabel | null {
  if (!model) return null;
  const showLabels =
    context.generationType === "create" || context.inputMode === "video";
  if (!showLabels) return null;
  return VARIANT_LABELS[model as CodeGenerationModel] ?? null;
}

// Will generate a static error if a model in the enum above is not in the descriptions
export const CODE_GENERATION_MODEL_DESCRIPTIONS: {
  [key in CodeGenerationModel]: { name: string };
} = {
  "gpt-5.5 (no thinking)": {
    name: "GPT 5.5 (none)",
  },
  "gpt-5.5 (low thinking)": {
    name: "GPT 5.5 (low)",
  },
  "gpt-5.5 (medium thinking)": {
    name: "GPT 5.5 (medium)",
  },
  "gpt-5.5 (high thinking)": {
    name: "GPT 5.5 (high)",
  },
  "gpt-5.5 (xhigh thinking)": {
    name: "GPT 5.5 (xhigh)",
  },
  "gpt-5.4-mini (low thinking)": {
    name: "GPT 5.4 Mini (low)",
  },
  "claude-opus-4-8 (low effort)": {
    name: "Claude Opus 4.8 (low)",
  },
  "claude-opus-4-8 (medium effort)": {
    name: "Claude Opus 4.8 (medium)",
  },
  "claude-opus-4-8 (high effort)": {
    name: "Claude Opus 4.8 (high)",
  },
  "claude-opus-4-8 (xhigh effort)": {
    name: "Claude Opus 4.8 (xhigh)",
  },
  "claude-opus-4-8 (max effort)": {
    name: "Claude Opus 4.8 (max)",
  },
  "claude-sonnet-4-6": { name: "Claude Sonnet 4.6" },
  "gemini-3.5-flash (high thinking)": {
    name: "Gemini 3.5 Flash (high)",
  },
  "gemini-3.5-flash (medium thinking)": {
    name: "Gemini 3.5 Flash (medium)",
  },
  "gemini-3.5-flash (low thinking)": {
    name: "Gemini 3.5 Flash (low)",
  },
  "gemini-3.5-flash (minimal thinking)": {
    name: "Gemini 3.5 Flash (minimal)",
  },
  "gemini-3-flash-preview (high thinking)": {
    name: "Gemini 3 Flash (high)",
  },
  "gemini-3-flash-preview (minimal thinking)": {
    name: "Gemini 3 Flash (minimal)",
  },
  "gemini-3.1-pro-preview (high thinking)": {
    name: "Gemini 3.1 Pro (high)",
  },
  "gemini-3.1-pro-preview (medium thinking)": {
    name: "Gemini 3.1 Pro (medium)",
  },
  "gemini-3.1-pro-preview (low thinking)": {
    name: "Gemini 3.1 Pro (low)",
  },
  "kimi-for-coding": {
    name: "Kimi for Coding",
  },
};
