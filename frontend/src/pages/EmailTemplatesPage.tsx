import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Container,
  Dropdown,
  Form,
  Modal,
  Row,
  Spinner,
  Table,
} from "react-bootstrap";
import {
  ArrowClockwise,
  ChevronRight,
  Clipboard,
  ClipboardCheck,
  EnvelopePaper,
  Link45deg,
  Stars,
  ThreeDotsVertical,
} from "react-bootstrap-icons";
import AppLayout from "../components/AppLayout";
import { useAuth } from "../lib/AuthProvider";
import {
  EMAIL_TEMPLATE_EMAIL_TYPES,
  EMAIL_TEMPLATE_LENGTHS,
  EMAIL_TEMPLATE_RECIPIENT_TYPES,
  EMAIL_TEMPLATE_SENDER_ROLES,
  EMAIL_TEMPLATE_TONES,
  fetchEmailTemplate,
  fetchEmailTemplateHistory,
  fetchEmailTemplateUsage,
  generateEmailTemplate,
  rewriteEmailTemplate,
  updateEmailTemplate,
  uploadAttachment,
  validateAttachmentFile,
  type EmailTemplateEmailType,
  type EmailTemplateLength,
  type EmailTemplateListItem,
  type EmailTemplateRecipientType,
  type EmailTemplateSenderRole,
  type EmailTemplateTone,
  type EmailTemplateUsage,
} from "../lib/emailTemplatesApi";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function preview(text: string | null, max = 80): string {
  if (!text) return "—";
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

const BODY_TEXTAREA_MIN_PX = 320;

function OptionGroup<T extends string>({
  label,
  options,
  value,
  disabled,
  onChange,
  idPrefix,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  disabled?: boolean;
  onChange: (next: T) => void;
  idPrefix: string;
}) {
  return (
    <Form.Group className="mb-3" controlId={idPrefix}>
      <Form.Label className="small fw-medium text-body-secondary mb-2">{label}</Form.Label>
      <div className="email-template-option-group" role="group" aria-label={label}>
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              className={`email-template-option${active ? " is-active" : ""}`}
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onChange(opt.value)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </Form.Group>
  );
}

function StepHeader({
  step,
  title,
  action,
}: {
  step: number;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="email-template-step-header">
      <span className="email-template-step-badge" aria-hidden>
        {step}
      </span>
      <h3 className="email-template-step-title">{title}</h3>
      {action && <div className="ms-auto">{action}</div>}
    </div>
  );
}

function CollapsibleSection({
  icon,
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="email-template-collapse">
      <button
        type="button"
        className="email-template-collapse-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="email-template-collapse-icon" aria-hidden>
          {icon}
        </span>
        <span className="email-template-collapse-title">
          {title}
          {hint && <span className="fw-normal text-body-secondary"> {hint}</span>}
        </span>
        <ChevronRight
          size={14}
          className={`email-template-collapse-chevron${open ? " is-open" : ""}`}
          aria-hidden
        />
      </button>
      {open && <div className="email-template-collapse-body">{children}</div>}
    </div>
  );
}

export default function EmailTemplatesPage() {
  const { user } = useAuth();
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [userRequest, setUserRequest] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [length, setLength] = useState<EmailTemplateLength>("standard");
  const [tone, setTone] = useState<EmailTemplateTone>("professional");
  const [emailType, setEmailType] = useState<EmailTemplateEmailType | "">("");
  const [senderRole, setSenderRole] = useState<EmailTemplateSenderRole | "">("");
  const [recipientType, setRecipientType] = useState<EmailTemplateRecipientType | "">("");
  const [senderName, setSenderName] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [productOrService, setProductOrService] = useState("");
  const [rewriteLength, setRewriteLength] = useState<EmailTemplateLength>("standard");
  const [rewriteTone, setRewriteTone] = useState<EmailTemplateTone>("professional");
  const [rewriteInstruction, setRewriteInstruction] = useState("");
  const [showRewriteModal, setShowRewriteModal] = useState(false);

  const [usage, setUsage] = useState<EmailTemplateUsage | null>(null);
  const [history, setHistory] = useState<EmailTemplateListItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);

  const [subject, setSubject] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resultEditable, setResultEditable] = useState(false);

  const [loading, setLoading] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<"subject" | "body" | null>(null);

  const nameBlank = !companyName.trim();
  const websiteBlank = !companyWebsite.trim();
  const requestBlank = !userRequest.trim();
  const canSubmit = !(nameBlank && websiteBlank && requestBlank);
  const requestRequired = nameBlank && websiteBlank;

  const dirty =
    resultEditable &&
    (editSubject !== (subject ?? "") || editBody !== (body ?? ""));
  const canSave =
    resultEditable &&
    dirty &&
    editSubject.trim().length > 0 &&
    editBody.trim().length > 0 &&
    editSubject.trim().length <= 300;

  const hasResult = Boolean(subject || body || resultEditable);
  const wordCount = editBody.trim() ? editBody.trim().split(/\s+/).length : 0;
  const generationHint =
    usage?.has_active_period && usage.free_remaining > 0
      ? `This will use 1 of your ${usage.free_remaining} remaining free generations`
      : "This will use 1 credit";

  function loadResult(next: {
    id: string;
    subject: string | null;
    body: string | null;
    editable: boolean;
  }) {
    setSelectedId(next.id);
    setSubject(next.subject);
    setBody(next.body);
    setEditSubject(next.subject ?? "");
    setEditBody(next.body ?? "");
    setResultEditable(next.editable);
    setSaveNotice(null);
  }

  const refreshUsage = useCallback(async (signal?: AbortSignal) => {
    const next = await fetchEmailTemplateUsage(signal);
    setUsage(next);
  }, []);

  const refreshHistory = useCallback(async (page: number, signal?: AbortSignal) => {
    setHistoryLoading(true);
    try {
      const res = await fetchEmailTemplateHistory(page, 10, signal);
      setHistory(res.items);
      setHistoryTotal(res.total);
      setHistoryPage(res.page);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([refreshUsage(controller.signal), refreshHistory(1, controller.signal)]).catch(
      (err: unknown) => {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError(err instanceof Error ? err.message : "Could not load email templates");
        }
      },
    );
    return () => controller.abort();
  }, [refreshUsage, refreshHistory]);

  // Grow the body editor with its content so the full email is readable
  // without an inner scrollbar (page scroll handles overflow instead).
  useEffect(() => {
    const el = bodyTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(BODY_TEXTAREA_MIN_PX, el.scrollHeight)}px`;
  }, [editBody, resultEditable, loading]);

  function openRewriteModal() {
    setShowRewriteModal(true);
  }

  function closeRewriteModal() {
    if (rewriting) return;
    setShowRewriteModal(false);
  }

  async function runGenerate() {
    if (!canSubmit || !user || loading) return;

    setLoading(true);
    setError(null);
    setCopied(null);

    try {
      let brochure:
        | { storage_path: string; filename: string; mime_type: string; size_bytes: number }
        | undefined;

      if (attachmentFile) {
        const validation = validateAttachmentFile(attachmentFile);
        if (validation) throw new Error(validation);
        brochure = await uploadAttachment(user.id, attachmentFile);
      }

      const result = await generateEmailTemplate({
        user_request: userRequest.trim(),
        company_profile: companyName.trim(),
        company_website: companyWebsite.trim(),
        length,
        tone,
        brochure,
        email_type: emailType,
        sender_role: senderRole,
        recipient_type: recipientType,
        sender_name: senderName.trim(),
        recipient_name: recipientName.trim(),
        product_or_service: productOrService.trim(),
      });

      loadResult({
        id: result.id,
        subject: result.subject,
        body: result.body,
        editable: true,
      });
      setRewriteLength(length);
      setRewriteTone(tone);
      setUsage(result.usage);
      setAttachmentFile(null);
      await refreshHistory(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      try {
        await refreshUsage();
      } catch {
        /* ignore */
      }
    } finally {
      setLoading(false);
    }
  }

  function handleGenerate(e: FormEvent) {
    e.preventDefault();
    void runGenerate();
  }

  function handleResetForm() {
    if (loading) return;
    setEmailType("");
    setUserRequest("");
    setSenderRole("");
    setSenderName("");
    setRecipientType("");
    setRecipientName("");
    setCompanyName("");
    setProductOrService("");
    setCompanyWebsite("");
    setLength("standard");
    setTone("professional");
    setAttachmentFile(null);
  }

  async function openHistoryItem(id: string) {
    setError(null);
    setCopied(null);
    setSaveNotice(null);
    try {
      const { generation } = await fetchEmailTemplate(id);
      const editable = generation.status === "completed" && !!generation.subject && !!generation.body;
      loadResult({
        id: generation.id,
        subject: generation.subject,
        body: generation.body,
        editable,
      });
      if (generation.status === "failed") {
        setError(generation.error_message || "This generation failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load generation");
    }
  }

  async function handleRewrite() {
    if (!resultEditable || !editSubject.trim() || !editBody.trim() || rewriting) return;
    setRewriting(true);
    setError(null);
    setSaveNotice(null);
    try {
      const result = await rewriteEmailTemplate({
        subject: editSubject.trim(),
        body: editBody.trim(),
        length: rewriteLength,
        tone: rewriteTone,
        instruction: rewriteInstruction.trim() || undefined,
      });
      setEditSubject(result.subject);
      setEditBody(result.body);
      setRewriteInstruction("");
      setShowRewriteModal(false);
      setSaveNotice("Rewritten — save to keep changes");
      setTimeout(() => setSaveNotice(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rewrite failed");
    } finally {
      setRewriting(false);
    }
  }

  async function handleSaveEdits() {
    if (!selectedId || !canSave) return;
    setSaving(true);
    setError(null);
    setSaveNotice(null);
    try {
      const { generation } = await updateEmailTemplate(selectedId, {
        subject: editSubject.trim(),
        body: editBody.trim(),
      });
      loadResult({
        id: generation.id,
        subject: generation.subject,
        body: generation.body,
        editable: true,
      });
      setSaveNotice("Saved");
      setTimeout(() => setSaveNotice(null), 2000);
      await refreshHistory(historyPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save edits");
    } finally {
      setSaving(false);
    }
  }

  function handleCancelEdits() {
    setEditSubject(subject ?? "");
    setEditBody(body ?? "");
    setSaveNotice(null);
  }

  async function copyText(kind: "subject" | "body", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  const totalPages = Math.max(1, Math.ceil(historyTotal / 10));

  return (
    <AppLayout>
      <Container fluid className="py-4 px-3 px-md-4 email-templates-page">
        <div className="d-flex flex-column flex-md-row align-items-start justify-content-between gap-2 gap-md-3 mb-4">
          <div>
            <h1 className="h4 mb-1">Email Template Generator</h1>
            <p className="text-body-secondary mb-0 small">
              Create personalized, high-quality emails in seconds using your context.
            </p>
          </div>
          <div className="text-start text-md-end">
            {usage?.has_active_period ? (
              <>
                <span className="email-template-usage-pill">
                  {usage.free_remaining} of {usage.free_limit} free remaining
                </span>
                <div className="text-body-secondary small mt-1">
                  Plan period ends {usage.period_end ? formatWhen(usage.period_end) : "—"}
                  {usage.free_remaining === 0 ? " · further gens cost 1 credit" : ""}
                </div>
              </>
            ) : (
              <>
                <span className="email-template-usage-pill is-muted">1 credit per generation</span>
                <div className="text-body-secondary small mt-1">
                  No active plan — free quota unavailable
                </div>
              </>
            )}
          </div>
        </div>

        {error && (
          <Alert variant="danger" dismissible onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Row className="g-4 align-items-start">
          <Col lg={5}>
            <Card className="shadow-sm border-0 email-templates-card">
              <Card.Body className="p-4">
                <Form onSubmit={handleGenerate}>
                  <StepHeader
                    step={1}
                    title="What do you want to do?"
                    action={
                      <button
                        type="button"
                        className="email-template-reset-link"
                        onClick={handleResetForm}
                        disabled={loading}
                      >
                        <ArrowClockwise size={13} />
                        Reset
                      </button>
                    }
                  />

                  <Form.Group className="mb-3" controlId="emailType">
                    <Form.Label>Email type</Form.Label>
                    <Form.Select
                      value={emailType}
                      onChange={(e) => setEmailType(e.target.value as EmailTemplateEmailType | "")}
                      disabled={loading}
                    >
                      <option value="">Not specified</option>
                      {EMAIL_TEMPLATE_EMAIL_TYPES.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>

                  <Form.Group className="mb-4" controlId="userRequest">
                    <Form.Label>
                      What's this email about?{" "}
                      {requestRequired && <span className="text-danger">*</span>}
                    </Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      value={userRequest}
                      onChange={(e) => setUserRequest(e.target.value)}
                      placeholder="e.g. Follow up with James after our SaaStr demo — he mentioned inventory tracking challenges."
                      disabled={loading}
                      required={requestRequired}
                    />
                    <Form.Text muted>
                      Include any specific detail — who it's for, what happened, what you want
                      them to do.
                    </Form.Text>
                  </Form.Group>

                  <StepHeader step={2} title="Who is this email from and to?" />
                  <Row className="g-3 mb-3">
                    <Col sm={6}>
                      <Form.Group controlId="senderRole">
                        <Form.Label>Sender role</Form.Label>
                        <Form.Select
                          value={senderRole}
                          onChange={(e) =>
                            setSenderRole(e.target.value as EmailTemplateSenderRole | "")
                          }
                          disabled={loading}
                        >
                          <option value="">Not specified</option>
                          {EMAIL_TEMPLATE_SENDER_ROLES.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </Form.Select>
                      </Form.Group>
                    </Col>
                    <Col sm={6}>
                      <Form.Group controlId="senderName">
                        <Form.Label>Your name</Form.Label>
                        <Form.Control
                          value={senderName}
                          onChange={(e) => setSenderName(e.target.value)}
                          placeholder="e.g. Sarah"
                          disabled={loading}
                          maxLength={120}
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                  <Row className="g-3 mb-4">
                    <Col sm={6}>
                      <Form.Group controlId="recipientType">
                        <Form.Label>Recipient type</Form.Label>
                        <Form.Select
                          value={recipientType}
                          onChange={(e) =>
                            setRecipientType(e.target.value as EmailTemplateRecipientType | "")
                          }
                          disabled={loading}
                        >
                          <option value="">Not specified</option>
                          {EMAIL_TEMPLATE_RECIPIENT_TYPES.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </Form.Select>
                      </Form.Group>
                    </Col>
                    <Col sm={6}>
                      <Form.Group controlId="recipientName">
                        <Form.Label>Recipient name</Form.Label>
                        <Form.Control
                          value={recipientName}
                          onChange={(e) => setRecipientName(e.target.value)}
                          placeholder="e.g. James"
                          disabled={loading}
                          maxLength={120}
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <StepHeader step={3} title="Company & product context" />
                  <Row className="g-3 mb-3">
                    <Col sm={6}>
                      <Form.Group controlId="companyName">
                        <Form.Label>Company name</Form.Label>
                        <Form.Control
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          placeholder="e.g. Acme Inc"
                          disabled={loading}
                          maxLength={120}
                        />
                      </Form.Group>
                    </Col>
                    <Col sm={6}>
                      <Form.Group controlId="productOrService">
                        <Form.Label>Product / service</Form.Label>
                        <Form.Control
                          value={productOrService}
                          onChange={(e) => setProductOrService(e.target.value)}
                          placeholder="e.g. Odoo ERP"
                          disabled={loading}
                          maxLength={120}
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                  <Form.Group className="mb-3" controlId="companyWebsite">
                    <Form.Label>Website URL</Form.Label>
                    <div className="email-template-input-icon">
                      <Link45deg size={14} aria-hidden />
                      <Form.Control
                        type="url"
                        value={companyWebsite}
                        onChange={(e) => setCompanyWebsite(e.target.value)}
                        placeholder="https://example.com"
                        disabled={loading}
                      />
                    </div>
                  </Form.Group>

                  <div className="email-template-collapse-group mb-4">
                    <CollapsibleSection icon={<Stars size={14} />} title="Style & length">
                      <Row className="g-3">
                        <Col sm={7}>
                          <OptionGroup
                            idPrefix="generateLength"
                            label="Length"
                            options={EMAIL_TEMPLATE_LENGTHS}
                            value={length}
                            disabled={loading}
                            onChange={setLength}
                          />
                        </Col>
                        <Col sm={5}>
                          <OptionGroup
                            idPrefix="generateTone"
                            label="Tone"
                            options={EMAIL_TEMPLATE_TONES}
                            value={tone}
                            disabled={loading}
                            onChange={setTone}
                          />
                        </Col>
                      </Row>
                    </CollapsibleSection>

                    <CollapsibleSection
                      icon={<Clipboard size={14} />}
                      title="Supporting materials"
                      hint="(optional)"
                    >
                      <Form.Text muted className="d-block mb-2">
                        Upload a brochure, product profile, or company document to help generate a
                        more accurate email. Used as reference context only — it is not attached to
                        the email itself.
                      </Form.Text>
                      <Form.Control
                        type="file"
                        accept=".pdf,application/pdf"
                        disabled={loading}
                        onChange={(e) => {
                          const input = e.target as HTMLInputElement;
                          const file = input.files?.[0] ?? null;
                          setAttachmentFile(file);
                        }}
                      />
                      <Form.Text muted>PDF only · max 5 MB</Form.Text>
                      {attachmentFile && (
                        <div className="small mt-1 text-success d-flex align-items-center gap-1">
                          <ClipboardCheck size={14} />
                          {attachmentFile.name} — selected, uploaded on generate
                        </div>
                      )}
                    </CollapsibleSection>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!canSubmit || loading}
                    className="d-flex align-items-center justify-content-center gap-2 w-100"
                    size="lg"
                  >
                    {loading ? (
                      <>
                        <Spinner animation="border" size="sm" />
                        Generating…
                      </>
                    ) : (
                      <>
                        <Stars size={16} />
                        Generate Email
                      </>
                    )}
                  </Button>
                  <div className="text-center text-body-secondary small mt-2">{generationHint}</div>
                </Form>
              </Card.Body>
            </Card>
          </Col>

          <Col lg={7}>
            <Card className="shadow-sm border-0 email-templates-card">
              <Card.Body className="p-4">
                <div className="d-flex align-items-center justify-content-between gap-2 mb-3 flex-wrap">
                  <div className="d-flex align-items-center gap-2">
                    <h2 className="h6 mb-0">Generated Email</h2>
                    {hasResult && !loading && (
                      <Badge bg="success" className="email-template-ready-badge">
                        Ready
                      </Badge>
                    )}
                  </div>
                  {resultEditable && !loading && (
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      {saveNotice && <span className="small text-success">{saveNotice}</span>}
                      <Button
                        size="sm"
                        variant="outline-primary"
                        className="d-inline-flex align-items-center gap-1"
                        disabled={
                          rewriting || saving || !editSubject.trim() || !editBody.trim()
                        }
                        onClick={openRewriteModal}
                      >
                        <Stars size={14} />
                        Rewrite with AI
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={!canSave || saving || rewriting}
                        onClick={handleSaveEdits}
                        className="d-inline-flex align-items-center gap-1"
                      >
                        {saving ? (
                          <>
                            <Spinner animation="border" size="sm" />
                            Saving…
                          </>
                        ) : (
                          "Save"
                        )}
                      </Button>
                      <Dropdown align="end">
                        <Dropdown.Toggle
                          as="button"
                          className="email-template-kebab-toggle"
                          id="email-template-more-actions"
                        >
                          <ThreeDotsVertical size={16} />
                        </Dropdown.Toggle>
                        <Dropdown.Menu>
                          <Dropdown.Item
                            disabled={!dirty || saving || rewriting}
                            onClick={handleCancelEdits}
                          >
                            Cancel edits
                          </Dropdown.Item>
                        </Dropdown.Menu>
                      </Dropdown>
                    </div>
                  )}
                </div>

                {!hasResult && !loading && (
                  <div className="email-templates-empty">
                    <span className="email-templates-empty-icon" aria-hidden>
                      <EnvelopePaper size={22} />
                    </span>
                    <p className="mb-1 fw-medium">Your email will appear here</p>
                    <p className="text-body-secondary small mb-0">
                      Choose your settings on the left and click Generate template.
                    </p>
                  </div>
                )}

                {loading && (
                  <div className="email-templates-empty">
                    <Spinner animation="border" size="sm" className="mb-2" />
                    <p className="text-body-secondary small mb-0">Working with your provider…</p>
                  </div>
                )}

                {(subject || resultEditable) && !loading && (
                  <div className="mb-3">
                    <div className="d-flex align-items-center justify-content-between gap-2 mb-1">
                      <div className="small text-body-secondary">Subject</div>
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        className="d-inline-flex align-items-center gap-1"
                        disabled={!editSubject.trim()}
                        onClick={() => copyText("subject", editSubject)}
                      >
                        {copied === "subject" ? <ClipboardCheck size={14} /> : <Clipboard size={14} />}
                        Copy
                      </Button>
                    </div>
                    {resultEditable ? (
                      <Form.Control
                        value={editSubject}
                        onChange={(e) => setEditSubject(e.target.value)}
                        disabled={saving || rewriting}
                        maxLength={300}
                      />
                    ) : (
                      <div className="fw-semibold">{subject}</div>
                    )}
                  </div>
                )}

                {(body || resultEditable) && !loading && (
                  <div>
                    <div className="d-flex align-items-center justify-content-between gap-2 mb-1">
                      <div className="small text-body-secondary">Body</div>
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        className="d-inline-flex align-items-center gap-1"
                        disabled={!editBody.trim()}
                        onClick={() => copyText("body", editBody)}
                      >
                        {copied === "body" ? <ClipboardCheck size={14} /> : <Clipboard size={14} />}
                        Copy
                      </Button>
                    </div>
                    {resultEditable ? (
                      <Form.Control
                        as="textarea"
                        ref={bodyTextareaRef}
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        disabled={saving || rewriting}
                        className="email-template-body-editor"
                        style={{
                          fontFamily: "inherit",
                          whiteSpace: "pre-wrap",
                          minHeight: BODY_TEXTAREA_MIN_PX,
                          overflow: "hidden",
                          resize: "vertical",
                          lineHeight: 1.55,
                        }}
                      />
                    ) : (
                      <pre
                        className="mb-0 p-3 bg-body-tertiary rounded small"
                        style={{
                          whiteSpace: "pre-wrap",
                          fontFamily: "inherit",
                          lineHeight: 1.55,
                        }}
                      >
                        {body}
                      </pre>
                    )}
                  </div>
                )}

                {hasResult && !loading && (
                  <div className="d-flex align-items-center justify-content-between gap-2 mt-3">
                    <span className="text-body-secondary small">Word count: {wordCount}</span>
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      className="d-inline-flex align-items-center gap-1"
                      disabled={!canSubmit || loading}
                      onClick={() => void runGenerate()}
                    >
                      <ArrowClockwise size={13} />
                      Regenerate
                    </Button>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>

        <Card className="shadow-sm border-0 email-templates-card mt-4">
          <Card.Body className="p-4">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <h2 className="h6 mb-0">Recent generations</h2>
              {historyLoading && <Spinner animation="border" size="sm" />}
            </div>

            {history.length === 0 && !historyLoading ? (
              <p className="text-body-secondary small mb-0">No generations yet.</p>
            ) : (
              <>
                <Table hover responsive size="sm" className="mb-2 align-middle email-templates-history">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Request</th>
                      <th>Subject</th>
                      <th>Status</th>
                      <th>Billing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr
                        key={row.id}
                        role="button"
                        className={selectedId === row.id ? "table-active" : undefined}
                        onClick={() => openHistoryItem(row.id)}
                      >
                        <td className="text-nowrap small">{formatWhen(row.created_at)}</td>
                        <td className="small">{preview(row.user_request || row.company_profile)}</td>
                        <td className="small">{preview(row.subject)}</td>
                        <td>
                          <Badge
                            bg={
                              row.status === "completed"
                                ? "success"
                                : row.status === "failed"
                                  ? "danger"
                                  : "secondary"
                            }
                          >
                            {row.status}
                          </Badge>
                        </td>
                        <td className="small">
                          {row.billing_type === "free"
                            ? "Free"
                            : row.billing_type === "credit"
                              ? `${row.credits_charged || 1} credit`
                              : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                {totalPages > 1 && (
                  <div className="d-flex justify-content-between align-items-center">
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      disabled={historyPage <= 1 || historyLoading}
                      onClick={() => refreshHistory(historyPage - 1)}
                    >
                      Previous
                    </Button>
                    <span className="small text-body-secondary">
                      Page {historyPage} of {totalPages}
                    </span>
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      disabled={historyPage >= totalPages || historyLoading}
                      onClick={() => refreshHistory(historyPage + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card.Body>
        </Card>
      </Container>

      <Modal show={showRewriteModal} onHide={closeRewriteModal} centered>
        <Modal.Header closeButton={!rewriting}>
          <Modal.Title className="h6 mb-0 d-flex align-items-center gap-2">
            <Stars size={16} className="text-primary" />
            Rewrite with AI
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-body-secondary small mb-3">
            Optionally describe what to change, pick length and tone, then rewrite the current
            editor text. Free — does not use credits or free quota.
          </p>
          <Form.Group className="mb-3" controlId="rewriteInstruction">
            <Form.Label className="small fw-medium text-body-secondary mb-2">
              What should change? <span className="fw-normal">(optional)</span>
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={rewriteInstruction}
              onChange={(e) => setRewriteInstruction(e.target.value.slice(0, 2000))}
              disabled={rewriting}
              placeholder="e.g. Make the CTA softer, mention our free trial, shorten the opening…"
              maxLength={2000}
            />
          </Form.Group>
          <OptionGroup
            idPrefix="rewriteLength"
            label="Length"
            options={EMAIL_TEMPLATE_LENGTHS}
            value={rewriteLength}
            disabled={rewriting}
            onChange={setRewriteLength}
          />
          <OptionGroup
            idPrefix="rewriteTone"
            label="Tone"
            options={EMAIL_TEMPLATE_TONES}
            value={rewriteTone}
            disabled={rewriting}
            onChange={setRewriteTone}
          />
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={closeRewriteModal}
            disabled={rewriting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={rewriting || !editSubject.trim() || !editBody.trim()}
            onClick={handleRewrite}
            className="d-inline-flex align-items-center gap-2"
          >
            {rewriting ? (
              <>
                <Spinner animation="border" size="sm" />
                Rewriting…
              </>
            ) : (
              <>
                <Stars size={14} />
                Rewrite
              </>
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </AppLayout>
  );
}
