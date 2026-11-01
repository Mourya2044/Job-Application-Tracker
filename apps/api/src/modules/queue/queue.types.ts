import { QueueJobRecord } from "../../db/schema/queue";

export type QueueJobName =
  | "career_sync"
  | "batch_scrape"
  | "gmail_sync"
  | "email_process"
  | "ai_inference"
  | "reconcile_expiration"
  | "periodic_maintenance";

export interface QueueJobPayloads {
  career_sync: {
    careerPageId: string;
    companyName: string;
    provider: string;
    slug: string;
  };
  batch_scrape: {
    queries: string[];
    limit?: number;
  };
  gmail_sync: {
    userId: string;
    mailboxAccountId: string;
    fullReconciliation?: boolean;
    historyId?: string;
  };
  email_process: {
    userId: string;
    messageId: string;
    mailboxAccountId: string;
    rawSnippet?: string;
  };
  ai_inference: {
    capability: string;
    payload: Record<string, any>;
    userId?: string;
  };
  reconcile_expiration: {
    daysThreshold?: number;
  };
  periodic_maintenance: {
    retentionDays?: number;
  };
}

export interface SendJobOptions {
  priority?: number;
  startAfter?: Date | string;
  retryLimit?: number;
  retryDelaySeconds?: number;
  retryBackoff?: boolean;
  singletonKey?: string;
}

export type JobHandler<T = any> = (data: T, job: QueueJobRecord) => Promise<any>;

