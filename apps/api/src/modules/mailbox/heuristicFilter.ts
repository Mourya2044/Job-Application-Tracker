const RECRUITING_KEYWORDS = [
  "application",
  "interview",
  "offer",
  "candidate",
  "recruiter",
  "talent",
  "applied",
  "position",
  "opportunity",
  "hiring",
  "schedule",
  "next steps",
  "assessment",
  "take-home",
  "coding challenge",
  "phone screen",
  "technical screen",
  "congratulations",
  "regret to inform",
  "unfortunately",
  "status of your",
  "thank you for applying",
  "moving forward",
  "career",
  "job",
];

const NON_RECRUITMENT_SENDER_PATTERNS = [
  "noreply@github.com",
  "notifications@github.com",
  "no-reply@accounts.google.com",
  "news@medium.com",
  "digest@",
  "newsletter@",
  "receipts@",
  "billing@",
  "orders@",
  "marketing@",
  "promotions@",
  "updates@linkedin.com",
];

export interface EmailFilterResult {
  isRecruitmentRelated: boolean;
  confidence: number;
  matchedKeywords: string[];
  reason: string;
}

export class EmailHeuristicFilter {
  /**
   * Fast pre-filtering to verify if an incoming email is job/application related
   * before delegating to full AI classification.
   */
  static inspectEmail(
    sender?: string | null,
    subject?: string | null,
    snippet?: string | null
  ): EmailFilterResult {
    const senderLower = (sender || "").toLowerCase();
    const subjectLower = (subject || "").toLowerCase();
    const snippetLower = (snippet || "").toLowerCase();
    const combined = `${subjectLower} ${snippetLower}`;

    // 1. Exclude obvious non-recruiting automated senders
    for (const pattern of NON_RECRUITMENT_SENDER_PATTERNS) {
      if (senderLower.includes(pattern)) {
        return {
          isRecruitmentRelated: false,
          confidence: 0.95,
          matchedKeywords: [],
          reason: `Filtered out automated non-recruitment sender: ${pattern}`,
        };
      }
    }

    // 2. Check for recruitment keywords
    const matchedKeywords: string[] = [];
    for (const keyword of RECRUITING_KEYWORDS) {
      if (combined.includes(keyword)) {
        matchedKeywords.push(keyword);
      }
    }

    if (matchedKeywords.length === 0) {
      return {
        isRecruitmentRelated: false,
        confidence: 0.85,
        matchedKeywords: [],
        reason: "No recruiting or application signals found in subject or snippet.",
      };
    }

    // High confidence if multiple signals match or explicit application keywords match
    let confidence = Math.min(0.95, 0.6 + matchedKeywords.length * 0.15);
    if (
      combined.includes("interview") ||
      combined.includes("offer") ||
      combined.includes("thank you for applying") ||
      combined.includes("status of your application") ||
      combined.includes("interview scheduled")
    ) {
      confidence = Math.max(confidence, 0.90);
    }

    return {
      isRecruitmentRelated: true,
      confidence,
      matchedKeywords,
      reason: `Detected hiring signals: [${matchedKeywords.slice(0, 4).join(", ")}]`,
    };
  }
}
