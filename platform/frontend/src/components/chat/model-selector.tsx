"use client";

import {
  type ModelCapability,
  providerDisplayNames,
  type SupportedProvider,
} from "@shared";
import {
  Brain,
  CheckIcon,
  Eye,
  FileText,
  Image as ImageIcon,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelector as ModelSelectorRoot,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useModelsByProvider } from "@/lib/chat-models.query";
import { cn } from "@/lib/utils";

interface ModelSelectorProps {
  /** Currently selected model */
  selectedModel: string;
  /** Callback when model is changed */
  onModelChange: (model: string) => void;
  /** Whether the selector should be disabled */
  disabled?: boolean;
  /** Number of messages in current conversation (for mid-conversation warning) */
  messageCount?: number;
}

/** Map our provider names to logo provider names */
const providerToLogoProvider: Record<SupportedProvider, string> = {
  openai: "openai",
  anthropic: "anthropic",
  gemini: "google",
  vllm: "vllm",
  ollama: "ollama",
};

/** Capability filter configuration */
const capabilityFilters: Array<{
  capability: ModelCapability;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  borderColor: string;
}> = [
    {
      capability: "vision",
      label: "Vision",
      icon: Eye,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/50",
    },
    {
      capability: "reasoning",
      label: "Reasoning",
      icon: Brain,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
      borderColor: "border-purple-500/50",
    },
    {
      capability: "image_generation",
      label: "Image Gen",
      icon: ImageIcon,
      color: "text-pink-500",
      bgColor: "bg-pink-500/10",
      borderColor: "border-pink-500/50",
    },
    {
      capability: "fast",
      label: "Fast",
      icon: Zap,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
      borderColor: "border-amber-500/50",
    },
    {
      capability: "docs",
      label: "Docs",
      icon: FileText,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
      borderColor: "border-emerald-500/50",
    },
  ];

/**
 * Model selector dialog with:
 * - Models grouped by provider with provider name headers
 * - Search functionality to filter models
 * - Models filtered by configured API keys
 * - Capability filters to show only models with specific features
 * - Mid-conversation warning when switching models
 */
export function ModelSelector({
  selectedModel,
  onModelChange,
  disabled = false,
  messageCount = 0,
}: ModelSelectorProps) {
  const { modelsByProvider } = useModelsByProvider();
  const [pendingModel, setPendingModel] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedCapabilities, setSelectedCapabilities] = useState<
    Set<ModelCapability>
  >(new Set());

  // Get available providers from the fetched models
  const availableProviders = useMemo(() => {
    return Object.keys(modelsByProvider) as SupportedProvider[];
  }, [modelsByProvider]);

  // Toggle capability filter
  const toggleCapability = (capability: ModelCapability) => {
    setSelectedCapabilities((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(capability)) {
        newSet.delete(capability);
      } else {
        newSet.add(capability);
      }
      return newSet;
    });
  };

  // Filter models by selected capabilities
  const filteredModelsByProvider = useMemo(() => {
    if (selectedCapabilities.size === 0) {
      return modelsByProvider;
    }

    const filtered: Partial<typeof modelsByProvider> = {};
    for (const provider of availableProviders) {
      const models = modelsByProvider[provider]?.filter((model) => {
        // Model must have ALL selected capabilities
        return Array.from(selectedCapabilities).every((cap) =>
          model.capabilities.includes(cap),
        );
      });
      if (models && models.length > 0) {
        filtered[provider] = models;
      }
    }
    return filtered;
  }, [modelsByProvider, selectedCapabilities, availableProviders]);

  // Find the provider for a given model
  const getProviderForModel = (model: string): SupportedProvider | null => {
    for (const provider of availableProviders) {
      if (modelsByProvider[provider]?.some((m) => m.id === model)) {
        return provider;
      }
    }
    return null;
  };

  // Get selected model's provider for logo
  const selectedModelProvider = getProviderForModel(selectedModel);
  const selectedModelLogo = selectedModelProvider
    ? providerToLogoProvider[selectedModelProvider]
    : null;

  // Get display name for selected model
  const selectedModelDisplayName = useMemo(() => {
    for (const provider of availableProviders) {
      const model = modelsByProvider[provider]?.find(
        (m) => m.id === selectedModel,
      );
      if (model) return model.displayName;
    }
    return selectedModel; // Fall back to ID if not found
  }, [selectedModel, availableProviders, modelsByProvider]);

  const handleSelectModel = (model: string) => {
    // If selecting the same model, just close the dialog
    if (model === selectedModel) {
      setOpen(false);
      return;
    }

    // If there are messages, show warning dialog
    if (messageCount > 0) {
      setPendingModel(model);
    } else {
      onModelChange(model);
    }
    setOpen(false);
  };

  const handleConfirmChange = () => {
    if (pendingModel) {
      onModelChange(pendingModel);
      setPendingModel(null);
    }
  };

  const handleCancelChange = () => {
    setPendingModel(null);
  };

  // Check if selectedModel is in the available models
  const allAvailableModelIds = useMemo(
    () =>
      availableProviders.flatMap(
        (provider) => modelsByProvider[provider]?.map((m) => m.id) ?? [],
      ),
    [availableProviders, modelsByProvider],
  );
  const isModelAvailable = allAvailableModelIds.includes(selectedModel);

  // If no providers configured, show disabled state
  if (availableProviders.length === 0) {
    return (
      <PromptInputButton disabled className="min-w-40">
        <ModelSelectorName>No models available</ModelSelectorName>
      </PromptInputButton>
    );
  }

  return (
    <>
      <ModelSelectorRoot open={open} onOpenChange={setOpen}>
        <ModelSelectorTrigger asChild>
          <PromptInputButton disabled={disabled}>
            {selectedModelLogo && (
              <ModelSelectorLogo provider={selectedModelLogo} />
            )}
            <ModelSelectorName>
              {selectedModelDisplayName || "Select model"}
            </ModelSelectorName>
          </PromptInputButton>
        </ModelSelectorTrigger>
        <ModelSelectorContent title="Select Model">
          <ModelSelectorInput placeholder="Search models..." />

          {/* Capability Filters */}
          <div className="px-4 py-2 border-b">
            <div className="flex flex-wrap gap-2">
              {capabilityFilters.map((filter) => {
                const Icon = filter.icon;
                const isSelected = selectedCapabilities.has(filter.capability);
                return (
                  <Tooltip key={filter.capability}>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className={cn(
                          "cursor-pointer transition-all hover:scale-105",
                          isSelected
                            ? `${filter.bgColor} ${filter.borderColor} ${filter.color}`
                            : "opacity-60 hover:opacity-100",
                        )}
                        onClick={() => toggleCapability(filter.capability)}
                      >
                        <Icon className={cn("size-3 mr-1", filter.color)} />
                        {filter.label}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isSelected ? "Click to remove filter" : "Click to filter"}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
              {selectedCapabilities.size > 0 && (
                <Badge
                  variant="secondary"
                  className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => setSelectedCapabilities(new Set())}
                >
                  Clear Filters ({selectedCapabilities.size})
                </Badge>
              )}
            </div>
          </div>

          <ModelSelectorList>
            <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>

            {/* Show current model if not in available list */}
            {!isModelAvailable && selectedModel && (
              <ModelSelectorGroup heading="Current (API key missing)">
                <ModelSelectorItem
                  disabled
                  value={selectedModel}
                  className="text-yellow-600"
                >
                  {selectedModelLogo && (
                    <ModelSelectorLogo provider={selectedModelLogo} />
                  )}
                  <ModelSelectorName>{selectedModel}</ModelSelectorName>
                  <CheckIcon className="ml-auto size-4" />
                </ModelSelectorItem>
              </ModelSelectorGroup>
            )}

            {availableProviders.map((provider) => {
              const models = filteredModelsByProvider[provider];
              if (!models || models.length === 0) return null;

              return (
                <ModelSelectorGroup
                  key={provider}
                  heading={providerDisplayNames[provider]}
                >
                  {models.map((model) => (
                    <ModelSelectorItem
                      key={model.id}
                      value={model.id}
                      onSelect={() => handleSelectModel(model.id)}
                    >
                      <ModelSelectorLogo
                        provider={providerToLogoProvider[provider]}
                      />
                      <ModelSelectorName>{model.displayName}</ModelSelectorName>
                      <div className="flex items-center gap-1.5 ml-2">
                        {model.capabilities.includes("vision") && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Eye className="size-3.5 text-blue-500" />
                            </TooltipTrigger>
                            <TooltipContent>Vision Capable</TooltipContent>
                          </Tooltip>
                        )}
                        {model.capabilities.includes("reasoning") && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Brain className="size-3.5 text-purple-500" />
                            </TooltipTrigger>
                            <TooltipContent>Advanced Reasoning</TooltipContent>
                          </Tooltip>
                        )}
                        {model.capabilities.includes("image_generation") && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <ImageIcon className="size-3.5 text-pink-500" />
                            </TooltipTrigger>
                            <TooltipContent>Image Generation</TooltipContent>
                          </Tooltip>
                        )}
                        {model.capabilities.includes("fast") && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Zap className="size-3.5 text-amber-500" />
                            </TooltipTrigger>
                            <TooltipContent>Fast / Low Latency</TooltipContent>
                          </Tooltip>
                        )}
                        {model.capabilities.includes("docs") && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <FileText className="size-3.5 text-emerald-500" />
                            </TooltipTrigger>
                            <TooltipContent>
                              Large Context / Documents
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      {selectedModel === model.id ? (
                        <CheckIcon className="ml-auto size-4" />
                      ) : (
                        <div className="ml-auto size-4" />
                      )}
                    </ModelSelectorItem>
                  ))}
                </ModelSelectorGroup>
              );
            })}
          </ModelSelectorList>
        </ModelSelectorContent>
      </ModelSelectorRoot>

      {/* Mid-conversation warning dialog */}
      <AlertDialog
        open={!!pendingModel}
        onOpenChange={(open) => !open && handleCancelChange()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change model mid-conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              Switching models during a conversation may affect response quality
              and consistency. The new model may not have the same context
              understanding as the previous one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmChange}>
              Change Model
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
