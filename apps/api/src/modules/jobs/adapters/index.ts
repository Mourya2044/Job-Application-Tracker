import { AtsProvider } from "@track/shared";
import { JobAdapter } from "./base";
import { GreenhouseAdapter } from "./greenhouse.adapter";
import { LeverAdapter } from "./lever.adapter";
import { AshbyAdapter } from "./ashby.adapter";
import { WorkableAdapter } from "./workable.adapter";
import { RemoteOKAdapter } from "./remoteok.adapter";
import { RemotiveAdapter } from "./remotive.adapter";
import { ArbeitnowAdapter } from "./arbeitnow.adapter";

export * from "./base";
export * from "./greenhouse.adapter";
export * from "./lever.adapter";
export * from "./ashby.adapter";
export * from "./workable.adapter";
export * from "./remoteok.adapter";
export * from "./remotive.adapter";
export * from "./arbeitnow.adapter";

export const CURATED_COMPANIES = [
  { name: "Stripe", slug: "stripe", provider: "greenhouse" as const, domain: "stripe.com" },
  { name: "Figma", slug: "figma", provider: "lever" as const, domain: "figma.com" },
  { name: "Airbnb", slug: "airbnb", provider: "greenhouse" as const, domain: "airbnb.com" },
  { name: "Vercel", slug: "vercel", provider: "greenhouse" as const, domain: "vercel.com" },
  { name: "Cloudflare", slug: "cloudflare", provider: "greenhouse" as const, domain: "cloudflare.com" },
  { name: "Linear", slug: "linear", provider: "ashby" as const, domain: "linear.app" },
  { name: "OpenAI", slug: "openai", provider: "greenhouse" as const, domain: "openai.com" },
  { name: "Datadog", slug: "datadog", provider: "greenhouse" as const, domain: "datadoghq.com" },
  { name: "GitHub", slug: "github", provider: "greenhouse" as const, domain: "github.com" },
  { name: "Twitch", slug: "twitch", provider: "greenhouse" as const, domain: "twitch.tv" },
] as const;

export class AdapterRegistry {
  private static adapters: Map<string, JobAdapter> = new Map<string, JobAdapter>([
    ["greenhouse", new GreenhouseAdapter()],
    ["lever", new LeverAdapter()],
    ["ashby", new AshbyAdapter()],
    ["workable", new WorkableAdapter()],
    ["remoteok", new RemoteOKAdapter()],
    ["remotive", new RemotiveAdapter()],
    ["arbeitnow", new ArbeitnowAdapter()],
  ] as [string, JobAdapter][]);

  static getAdapter(provider: AtsProvider | string): JobAdapter {
    const adapter = this.adapters.get(provider.toLowerCase());
    if (!adapter) {
      throw new Error(`Unsupported job provider: '${provider}'. Available providers: ${Array.from(this.adapters.keys()).join(", ")}`);
    }
    return adapter;
  }

  static hasAdapter(provider: string): boolean {
    return this.adapters.has(provider.toLowerCase());
  }

  static getSupportedProviders(): string[] {
    return Array.from(this.adapters.keys());
  }
}
