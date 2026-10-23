export interface KeyLocation {
  file: string;
  line: number;
}

export interface SourceResult {
  source: string;
  env?: string;
  keys: Map<string, KeyLocation[]>;
}

export interface KeyGraph {
  allKeys: Set<string>;
  sources: Map<string, SourceResult>;
}

export interface Check {
  severity: "error" | "warning" | "info";
  type: string;
  key: string;
  message: string;
  locations?: KeyLocation[];
  suggestion?: string;
}

export interface CheckResult {
  checks: Check[];
  errors: number;
  warnings: number;
  info: number;
}

export interface Config {
  ignore?: string[];
  required?: string[];
  providers?: {
    vercel?: {
      projectId?: string;
      token?: string;
    };
    netlify?: {
      siteId?: string;
      token?: string;
    };
    github?: {
      repo?: string;
      token?: string;
    };
  };
}

export interface License {
  email_hash: string;
  purchased_at: number;
  plan: "free" | "lifetime";
  id: string;
}
