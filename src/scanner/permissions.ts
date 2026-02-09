import type { ProviderConfig } from "../config";

// Cloudflare: wrangler binding/feature → permission
const CF_BINDING_MAP: Record<string, string> = {
  kv_namespaces: "Workers KV Storage: Edit",
  r2_buckets: "R2 Storage: Edit",
  d1_databases: "D1: Edit",
  queues: "Queues: Edit",
  analytics_engine_datasets: "Analytics Engine: Edit",
  ai: "Workers AI: Run",
  durable_objects: "Workers Scripts: Edit",
  routes: "Zone > Workers Routes: Edit",
};

// AWS: package name → service
const AWS_SDK_MAP: Record<string, string> = {
  "@aws-sdk/client-s3": "S3",
  "@aws-sdk/client-dynamodb": "DynamoDB",
  "@aws-sdk/client-ses": "SES",
  "@aws-sdk/client-sqs": "SQS",
  "@aws-sdk/client-sns": "SNS",
  "@aws-sdk/client-lambda": "Lambda",
  "@aws-sdk/client-secrets-manager": "Secrets Manager",
  "@aws-sdk/client-cloudfront": "CloudFront",
  "@aws-sdk/client-cognito-identity-provider": "Cognito",
  "@aws-sdk/client-ssm": "Systems Manager (SSM)",
};

// Generic: package name → { provider, permission }
const GENERIC_PKG_MAP: Record<string, { provider: string; permission: string }> = {
  "@supabase/supabase-js": {
    provider: "Supabase",
    permission: "anon key (client) / service_role key (admin)",
  },
  stripe: {
    provider: "Stripe",
    permission: "Secret key (full API access)",
  },
};

function addCfPermission(
  cf: ProviderConfig,
  permission: string,
  source: string
): void {
  if (!cf.permissions) cf.permissions = [];
  if (!cf.permissions.some((p) => p.permission === permission)) {
    cf.permissions.push({ permission, source });
  }
}

export function inferPermissions(
  providers: Record<string, ProviderConfig>,
  deps: string[],
  wranglerBindings: string[],
  wranglerFile: string | null,
  wranglerCommands: string[] = []
): void {
  // Cloudflare permissions from wrangler.toml
  if (providers["Cloudflare"] && wranglerFile) {
    const cf = providers["Cloudflare"];

    addCfPermission(cf, "Workers Scripts: Edit", wranglerFile);

    for (const binding of wranglerBindings) {
      const permission = CF_BINDING_MAP[binding];
      if (permission) {
        addCfPermission(cf, permission, wranglerFile);
      }
    }
  }

  // Cloudflare permissions from workflow wrangler-action commands
  if (providers["Cloudflare"] && wranglerCommands.length > 0) {
    const cf = providers["Cloudflare"];

    for (const cmd of wranglerCommands) {
      if (cmd.includes("pages deploy") || cmd.includes("pages publish")) {
        addCfPermission(cf, "Cloudflare Pages: Edit", "workflow");
      } else if (cmd.startsWith("deploy") || cmd.startsWith("publish")) {
        addCfPermission(cf, "Workers Scripts: Edit", "workflow");
      } else if (cmd.startsWith("r2 ")) {
        addCfPermission(cf, "R2 Storage: Edit", "workflow");
      } else if (cmd.startsWith("kv ") || cmd.startsWith("kv:")) {
        addCfPermission(cf, "Workers KV Storage: Edit", "workflow");
      } else if (cmd.startsWith("d1 ")) {
        addCfPermission(cf, "D1: Edit", "workflow");
      }
    }
  }

  // AWS permissions from @aws-sdk/* packages
  if (providers["AWS"]) {
    const aws = providers["AWS"];
    if (!aws.permissions) aws.permissions = [];

    for (const dep of deps) {
      const service = AWS_SDK_MAP[dep];
      if (service && !aws.permissions.some((p) => p.permission === service)) {
        aws.permissions.push({ permission: service, source: "package.json" });
      }
    }
  }

  // Generic package → provider mapping
  for (const dep of deps) {
    const mapping = GENERIC_PKG_MAP[dep];
    if (!mapping) continue;

    const provider = providers[mapping.provider];
    if (!provider) continue;

    if (!provider.permissions) provider.permissions = [];
    if (!provider.permissions.some((p) => p.permission === mapping.permission)) {
      provider.permissions.push({
        permission: mapping.permission,
        source: "package.json",
      });
    }
  }
}
