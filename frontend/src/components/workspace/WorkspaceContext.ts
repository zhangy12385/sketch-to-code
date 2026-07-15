import { createContext, useContext } from "react";
import { AppState, AppTheme, DesignSystem, Settings } from "../../types";
import { Stack } from "../../lib/stacks";

export interface DesignSystemSelectorValue {
  designSystems: DesignSystem[];
  selectedDesignSystemId: string | null;
  setSelectedDesignSystemId: (id: string | null) => void;
  onAddNew: () => Promise<void> | void;
  onManage: () => void;
}

export interface WorkspaceContextValue {
  // Settings + theme
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  appTheme: AppTheme;
  setAppTheme: React.Dispatch<React.SetStateAction<AppTheme>>;

  // App state
  appState: AppState;
  hasProject: boolean;

  // Design systems
  designSystems: DesignSystem[];
  designSystemSelector: DesignSystemSelectorValue;
  createDesignSystem: (input: { name: string; content: string }) => Promise<DesignSystem>;
  updateDesignSystem: (
    id: string,
    input: { name?: string; content?: string },
  ) => Promise<DesignSystem>;
  deleteDesignSystem: (id: string) => Promise<void>;

  // Modal/drawer state (UI-level, but exposed via context so any descendant
  // — including the existing Sidebar / SettingsTab / DesignSystemsModal —
  // can read or toggle them).
  isNewOpen: boolean;
  setIsNewOpen: (open: boolean) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  isDesignSystemsModalOpen: boolean;
  setIsDesignSystemsModalOpen: (open: boolean) => void;
  designSystemsModalInitialId: string | null;
  setDesignSystemsModalInitialId: (id: string | null) => void;

  // Core actions
  reset: () => void;
  doCreate: (
    referenceImages: string[],
    inputMode: "image" | "video",
    textPrompt?: string,
  ) => void;
  doCreateFromText: (text: string) => void;
  importFromCode: (code: string, stack: Stack) => void;
  doUpdate: (instruction: string) => Promise<void>;
  regenerate: () => void;
  cancelCodeGeneration: () => void;

  // Stack setter (used by tabs)
  setStack: (stack: Stack) => void;

  // Selection handlers (used by tabs)
  setSelectedElement: (el: HTMLElement | null) => void;
  selectedElement: HTMLElement | null;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return ctx;
}

export { WorkspaceContext };