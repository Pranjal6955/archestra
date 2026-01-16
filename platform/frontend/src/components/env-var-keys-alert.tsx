"use client";

import { Info } from "lucide-react";
import { capitalize } from "lodash-es";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface EnvVarKeysAlertProps {
    /**
     * List of providers configured via environment variables
     */
    providers: string[];
}

/**
 * Alert component showing which providers are configured via environment variables.
 * Used in LLM API Keys settings page.
 */
export function EnvVarKeysAlert({ providers }: EnvVarKeysAlertProps) {
    if (!providers || providers.length === 0) {
        return null;
    }

    const formattedProviders = providers
        .map((p) => capitalize(p))
        .join(", ");

    return (
        <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Providers configured via Environment Variables</AlertTitle>
            <AlertDescription className="inline">
                The following providers are configured via environment variables (platform/.env) and do
                not need to be added here: <strong>{formattedProviders}</strong>.
            </AlertDescription>
        </Alert>
    );
}
