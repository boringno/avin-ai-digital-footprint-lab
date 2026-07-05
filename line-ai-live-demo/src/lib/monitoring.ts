import * as Sentry from "@sentry/nextjs";

import { sendOperationalAlert } from "@/lib/operational-alert";

const REPORTED_SYMBOL = Symbol.for("line-ai-live-demo.monitoring.reported");

type MonitoringError = Error & {
  [REPORTED_SYMBOL]?: boolean;
};

type ReportOperationalErrorInput = {
  alert?: boolean;
  error: unknown;
  extra?: Record<string, unknown>;
  source: string;
};

export function isMonitoringReported(error: unknown) {
  return error instanceof Error && Boolean((error as MonitoringError)[REPORTED_SYMBOL]);
}

function markMonitoringReported(error: Error) {
  (error as MonitoringError)[REPORTED_SYMBOL] = true;
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string") {
    return new Error(error);
  }

  return new Error("Unknown operational error");
}

export async function reportOperationalError(input: ReportOperationalErrorInput) {
  const error = normalizeError(input.error);

  if (!isMonitoringReported(error)) {
    Sentry.withScope((scope) => {
      scope.setTag("source", input.source);
      if (input.extra) {
        Object.entries(input.extra).forEach(([key, value]) => {
          scope.setExtra(key, value);
        });
      }
      Sentry.captureException(error);
    });

    Sentry.logger.error(input.source, {
      ...input.extra,
      message: error.message,
    });

    markMonitoringReported(error);
  }

  if (input.alert !== false) {
    try {
      await sendOperationalAlert({
        message: error.message,
        source: input.source,
      });
    } catch {
      // Swallow alert transport failures to avoid masking the original error path.
    }
  }
}
