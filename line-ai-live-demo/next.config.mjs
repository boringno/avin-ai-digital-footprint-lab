import { withSentryConfig } from "@sentry/nextjs";

const nextConfig = {
  outputFileTracingIncludes: {
    "/api/health": ["./data/live-demo-seed/**/*"],
    "/api/line/webhook": ["./data/live-demo-seed/**/*"],
  },
};

const sentryBuildOptions = {
  silent: !process.env.CI,
  ...(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
    ? {
        authToken: process.env.SENTRY_AUTH_TOKEN,
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        widenClientFileUpload: true,
      }
    : {}),
};

export default withSentryConfig(nextConfig, sentryBuildOptions);
