export interface GoogleApiError {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: Array<{
      "@type": string;
      reason?: string;
      domain?: string;
      metadata?: Record<string, string>;
      errorInfo?: {
        reason: string;
      };
      validation_url?: string;
    }>;
  };
}

export function parseGoogleError(body: string): { 
  reason: string; 
  validationUrl?: string;
  isQuotaExhausted: boolean;
  isChallengeRequired: boolean;
  isModelUnsupported: boolean;
  status: number;
  message?: string;
} {
  let reason = "unknown_error";
  let validationUrl: string | undefined;
  let isQuotaExhausted = false;
  let isChallengeRequired = false;
  let isModelUnsupported = false;
  let status = 500;
  let message: string | undefined;

  try {
    const json: GoogleApiError = JSON.parse(body);
    const err = json.error;
    
    if (err) {
      message = err.message;
      if (err.status === "RESOURCE_EXHAUSTED" || err.message?.includes("quota")) {
        isQuotaExhausted = true;
        reason = "quota_exhausted";
        status = 429;
      }

      if (err.message?.includes("VALIDATION_REQUIRED")) {
        isChallengeRequired = true;
        reason = "validation_required";
        status = 403;
      }

      if (err.message?.includes("Gemini Code Assist license") || err.message?.includes("SUBSCRIPTION_REQUIRED")) {
        isChallengeRequired = true;
        reason = "subscription_required";
        status = 403;
      }

      if (err.status === "NOT_FOUND" || err.message?.includes("not found") || err.message?.includes("not supported")) {
        isModelUnsupported = true;
        reason = "model_not_found";
        status = 404;
      }

      if (err.details) {
        for (const detail of err.details) {
          if (detail.reason === "VALIDATION_REQUIRED" || detail.errorInfo?.reason === "VALIDATION_REQUIRED") {
            isChallengeRequired = true;
            reason = "validation_required";
            status = 403;
            if (detail.validation_url) validationUrl = detail.validation_url;
            if (detail.metadata?.validation_url) validationUrl = detail.metadata.validation_url;
          }
          
          if (detail.reason === "RATE_LIMIT_EXCEEDED") {
            isQuotaExhausted = true;
            reason = "quota_exhausted";
            status = 429;
          }
        }
      }
    }
  } catch (e) {
    if (body.includes("automated queries")) {
      isQuotaExhausted = true;
      reason = "quota_exhausted";
      status = 429;
    }
  }

  return { reason, validationUrl, isQuotaExhausted, isChallengeRequired, isModelUnsupported, status };
}
