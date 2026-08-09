import { apiGet, apiPatch, apiPost } from "./api";
import { supabase } from "./supabaseClient";

export const EMAIL_TEMPLATE_BUCKET = "email-template-uploads";
export const MAX_ATTACHMENT_BYTES = 5_242_880;
export const ALLOWED_ATTACHMENT_MIMES = ["application/pdf"] as const;

export type EmailTemplateUsage = {
  free_limit: number;
  free_used: number;
  free_remaining: number;
  subscription_period_id: string | null;
  period_start: string | null;
  period_end: string | null;
  has_active_period: boolean;
};

export type EmailTemplateListItem = {
  id: string;
  user_request: string | null;
  company_profile: string | null;
  company_website: string | null;
  subject: string | null;
  status: "pending" | "running" | "completed" | "failed";
  billing_type: "free" | "credit" | null;
  credits_charged: number;
  created_at: string;
  completed_at: string | null;
};

export type EmailTemplateDetail = {
  id: string;
  user_request: string | null;
  company_profile: string | null;
  company_website: string | null;
  subject: string | null;
  body: string | null;
  status: EmailTemplateListItem["status"];
  billing_type: "free" | "credit" | null;
  credits_charged: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

export type GenerateEmailTemplateResult = {
  id: string;
  subject: string;
  body: string;
  billing_type: "free" | "credit";
  usage: EmailTemplateUsage;
};

export type EmailTemplateLength = "short" | "standard" | "detailed";
export type EmailTemplateTone =
  | "professional"
  | "friendly"
  | "formal"
  | "casual"
  | "urgent"
  | "persuasive";

export type EmailTemplateEmailType =
  | "sales_outreach"
  | "follow_up"
  | "meeting_request"
  | "proposal"
  | "thank_you"
  | "introduction"
  | "partnership_inquiry"
  | "customer_onboarding"
  | "invoice_reminder"
  | "feedback_request"
  | "announcement"
  | "cold_email"
  | "referral_ask"
  | "complaint_response"
  | "welcome_email"
  | "re_engagement";

export type EmailTemplateSenderRole =
  | "ceo"
  | "founder"
  | "sales_rep"
  | "account_manager"
  | "customer_support"
  | "marketing"
  | "hr";

export type EmailTemplateRecipientType =
  | "prospect"
  | "customer"
  | "partner"
  | "employee"
  | "vendor"
  | "investor";

export type EmailTemplateAttachmentMeta = {
  storage_path: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
};

export const EMAIL_TEMPLATE_LENGTHS: { value: EmailTemplateLength; label: string }[] = [
  { value: "short", label: "Short" },
  { value: "standard", label: "Standard" },
  { value: "detailed", label: "Detailed" },
];

export const EMAIL_TEMPLATE_TONES: { value: EmailTemplateTone; label: string }[] = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "formal", label: "Formal" },
  { value: "casual", label: "Casual" },
  { value: "urgent", label: "Urgent" },
  { value: "persuasive", label: "Persuasive" },
];

export const EMAIL_TEMPLATE_EMAIL_TYPES: { value: EmailTemplateEmailType; label: string }[] = [
  { value: "sales_outreach", label: "Sales outreach" },
  { value: "follow_up", label: "Follow-up" },
  { value: "meeting_request", label: "Meeting request" },
  { value: "proposal", label: "Proposal" },
  { value: "thank_you", label: "Thank you" },
  { value: "introduction", label: "Introduction" },
  { value: "partnership_inquiry", label: "Partnership inquiry" },
  { value: "customer_onboarding", label: "Customer onboarding" },
  { value: "invoice_reminder", label: "Invoice reminder" },
  { value: "feedback_request", label: "Feedback request" },
  { value: "announcement", label: "Announcement" },
  { value: "cold_email", label: "Cold email" },
  { value: "referral_ask", label: "Referral ask" },
  { value: "complaint_response", label: "Complaint response" },
  { value: "welcome_email", label: "Welcome email" },
  { value: "re_engagement", label: "Re-engagement" },
];

export const EMAIL_TEMPLATE_SENDER_ROLES: { value: EmailTemplateSenderRole; label: string }[] = [
  { value: "ceo", label: "CEO" },
  { value: "founder", label: "Founder" },
  { value: "sales_rep", label: "Sales Rep" },
  { value: "account_manager", label: "Account Manager" },
  { value: "customer_support", label: "Customer Support" },
  { value: "marketing", label: "Marketing" },
  { value: "hr", label: "HR" },
];

export const EMAIL_TEMPLATE_RECIPIENT_TYPES: { value: EmailTemplateRecipientType; label: string }[] = [
  { value: "prospect", label: "Prospect" },
  { value: "customer", label: "Customer" },
  { value: "partner", label: "Partner" },
  { value: "employee", label: "Employee" },
  { value: "vendor", label: "Vendor" },
  { value: "investor", label: "Investor" },
];

function safeFilename(name: string): string {
  const cleaned = name.replace(/[^\w.\- ]+/g, "_").slice(-120);
  return cleaned || "attachment.pdf";
}

export function validateAttachmentFile(file: File): string | null {
  if (!ALLOWED_ATTACHMENT_MIMES.includes(file.type as (typeof ALLOWED_ATTACHMENT_MIMES)[number])) {
    return `${file.name}: only PDF files can be attached.`;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `${file.name}: files must be 5 MB or smaller.`;
  }
  if (file.size === 0) return `${file.name}: file is empty.`;
  return null;
}

export async function uploadAttachment(
  userId: string,
  file: File,
): Promise<EmailTemplateAttachmentMeta> {
  const path = `${userId}/${crypto.randomUUID()}/${safeFilename(file.name)}`;
  const { error } = await supabase.storage.from(EMAIL_TEMPLATE_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`Could not upload ${file.name}: ${error.message}`);
  return {
    storage_path: path,
    filename: safeFilename(file.name),
    mime_type: file.type,
    size_bytes: file.size,
  };
}

export function fetchEmailTemplateUsage(signal?: AbortSignal): Promise<EmailTemplateUsage> {
  return apiGet("/api/email-templates/usage", signal);
}

export function fetchEmailTemplateHistory(
  page = 1,
  pageSize = 20,
  signal?: AbortSignal,
): Promise<{ items: EmailTemplateListItem[]; page: number; pageSize: number; total: number }> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return apiGet(`/api/email-templates?${params}`, signal);
}

export function fetchEmailTemplate(
  id: string,
  signal?: AbortSignal,
): Promise<{ generation: EmailTemplateDetail; attachments: unknown[] }> {
  return apiGet(`/api/email-templates/${id}`, signal);
}

export function generateEmailTemplate(body: {
  user_request: string;
  company_profile: string;
  company_website: string;
  length?: EmailTemplateLength;
  tone?: EmailTemplateTone;
  /** Stored as brochure kind in DB; wire format unchanged. */
  brochure?: EmailTemplateAttachmentMeta;
  /** All fields below are optional generation context — not persisted, forwarded to the AI provider only. */
  email_type?: EmailTemplateEmailType | "";
  sender_role?: EmailTemplateSenderRole | "";
  recipient_type?: EmailTemplateRecipientType | "";
  sender_name?: string;
  recipient_name?: string;
  product_or_service?: string;
  specific_context?: string;
}): Promise<GenerateEmailTemplateResult> {
  return apiPost("/api/email-templates/generate", body);
}

export function rewriteEmailTemplate(body: {
  subject: string;
  body: string;
  length: EmailTemplateLength;
  tone: EmailTemplateTone;
  /** Optional free-text guidance for what to change. */
  instruction?: string;
}): Promise<{ subject: string; body: string }> {
  return apiPost("/api/email-templates/rewrite", body);
}

export function updateEmailTemplate(
  id: string,
  body: { subject: string; body: string },
): Promise<{ generation: EmailTemplateDetail }> {
  return apiPatch(`/api/email-templates/${id}`, body);
}
