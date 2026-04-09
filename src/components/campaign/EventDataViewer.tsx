import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Package,
  MapPin,
  CreditCard,
  Tag,
  Hash,
  Clock,
  Mail,
  User,
  Truck,
  ReceiptText,
  FileText,
  Braces,
} from "lucide-react";

/* ── helpers ──────────────────────────────────────────── */

function fmt$(val: any): string {
  const n = parseFloat(val);
  return isNaN(n) ? String(val ?? "") : `$${n.toFixed(2)}`;
}

function fmtDate(val: any): string {
  if (!val) return "";
  try {
    return new Date(val).toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  } catch { return String(val); }
}

function fmtAddr(a: any): string[] {
  if (!a || typeof a !== "object") return [];
  return [
    [a.first_name, a.last_name].filter(Boolean).join(" "),
    a.company, a.address1, a.address2,
    [a.city, a.province_code || a.province, a.zip].filter(Boolean).join(", "),
    a.country,
  ].filter(Boolean) as string[];
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted transition-all shrink-0"
      title="Copy"
    >
      {copied ? <Check className="w-2.5 h-2.5 text-green-500" /> : <Copy className="w-2.5 h-2.5 text-muted-foreground" />}
    </button>
  );
}

/* ── Section wrapper ──────────────────────────────────── */

function Section({ icon: Icon, title, children, defaultOpen = true, count }: {
  icon: any; title: string; children: React.ReactNode; defaultOpen?: boolean; count?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-[11px] font-medium text-foreground flex-1">{title}</span>
        {count !== undefined && (
          <span className="text-[10px] text-muted-foreground">{count}</span>
        )}
        {open ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
      </button>
      {open && <div className="px-3 py-2">{children}</div>}
    </div>
  );
}

/* ── Key-Value row ────────────────────────────────────── */

function KVRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="group flex items-start justify-between gap-2 py-[3px]">
      <span className="text-[10px] text-muted-foreground shrink-0 uppercase tracking-wider">{label}</span>
      <span className={`text-[11px] text-foreground text-right ${mono ? "font-mono" : ""}`} style={{ wordBreak: "break-word" }}>
        {value}
      </span>
      <CopyBtn text={value} />
    </div>
  );
}

/* ── Line Item Card ───────────────────────────────────── */

function LineItemCard({ item, index }: { item: any; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const name = item.name || item.title || item.ProductName || `Item ${index + 1}`;
  const qty = item.quantity ?? 1;
  const price = item.price || item.ItemPrice;
  const sku = item.sku;
  const variant = item.variant_title;
  const imgUrl = item.product?.images?.[0]?.src || item.image_url || item.product_image_url;
  const properties: any[] = item.properties || [];

  return (
    <div className="border border-border/60 rounded-md overflow-hidden">
      <div
        className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {imgUrl ? (
          <img src={imgUrl} alt="" className="w-8 h-8 rounded object-cover shrink-0 bg-muted" />
        ) : (
          <div className="w-8 h-8 rounded bg-muted/50 flex items-center justify-center shrink-0">
            <Package className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-foreground font-medium leading-tight line-clamp-2">{name}</div>
          <div className="flex gap-2 text-[10px] text-muted-foreground">
            {qty > 1 && <span>Qty {qty}</span>}
            {variant && <span>{variant}</span>}
          </div>
        </div>
        <span className="text-[11px] text-foreground font-medium shrink-0">{fmt$(price)}</span>
        <ChevronRight className={`w-3 h-3 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
      </div>
      {expanded && (
        <div className="px-2 pb-2 pt-0 space-y-0.5 border-t border-border/40">
          {sku && <KVRow label="SKU" value={sku} mono />}
          {item.variant_id && <KVRow label="Variant ID" value={String(item.variant_id)} mono />}
          {item.product_id && <KVRow label="Product ID" value={String(item.product_id)} mono />}
          {item.vendor && <KVRow label="Vendor" value={item.vendor} />}
          {item.grams && <KVRow label="Weight" value={`${item.grams}g`} />}
          {item.requires_shipping !== undefined && <KVRow label="Requires shipping" value={item.requires_shipping ? "Yes" : "No"} />}
          {item.taxable !== undefined && <KVRow label="Taxable" value={item.taxable ? "Yes" : "No"} />}
          {properties.length > 0 && properties.map((p: any, i: number) => (
            <KVRow key={i} label={p.name || `Prop ${i}`} value={String(p.value)} />
          ))}
          {item.total_discount && parseFloat(item.total_discount) > 0 && (
            <KVRow label="Discount" value={`-${fmt$(item.total_discount)}`} />
          )}
        </div>
      )}
    </div>
  );
}

/* ── Remaining fields (catch-all) ─────────────────────── */

const KNOWN_KEYS = new Set([
  "extra", "$extra", "value", "$value", "Items", "event_id", "$event_id",
]);

function OtherFieldsSection({ data }: { data: Record<string, any> }) {
  const entries = Object.entries(data).filter(([k]) => !KNOWN_KEYS.has(k));
  if (entries.length === 0) return null;

  return (
    <Section icon={Braces} title="Other Fields" defaultOpen={false} count={entries.length}>
      <div className="space-y-0.5">
        {entries.map(([k, v]) => (
          <KVRow key={k} label={k} value={typeof v === "object" ? JSON.stringify(v) : String(v ?? "")} />
        ))}
      </div>
    </Section>
  );
}

/* ── Main Component ───────────────────────────────────── */

interface EventDataViewerProps {
  eventProperties: any;
  profileName?: string;
  profileEmail?: string;
  onClose: () => void;
}

export default function EventDataViewer({ eventProperties, profileName, profileEmail, onClose }: EventDataViewerProps) {
  const props = eventProperties || {};
  const extra = props.extra || props.$extra || {};
  const lineItems: any[] = extra.line_items || props.Items || [];
  const shipping = extra.shipping_address || {};
  const billing = extra.billing_address || {};
  const discountCodes: any[] = extra.discount_codes || [];
  const shippingLines: any[] = extra.shipping_lines || [];
  const taxLines: any[] = extra.tax_lines || [];
  const orderNumber = extra.order_number || extra.name || props.OrderId || "";
  const orderDate = extra.created_at;
  const total = extra.total_price || props.value || props.$value;
  const subtotal = extra.subtotal_price;
  const totalDiscount = extra.total_discounts;
  const totalTax = extra.total_tax;
  const financialStatus = extra.financial_status;
  const fulfillmentStatus = extra.fulfillment_status;
  const note = extra.note;
  const tags = extra.tags;
  const currency = extra.currency || "USD";
  const gateway = extra.gateway || extra.payment_gateway_names?.[0];

  const [showRawJson, setShowRawJson] = useState(false);

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-foreground">Event Details</span>
        <div className="flex gap-2">
          <button onClick={() => setShowRawJson(!showRawJson)} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
            {showRawJson ? "Visual view" : "Raw JSON"}
          </button>
          <button onClick={onClose} className="text-[10px] text-primary hover:underline">Summary</button>
        </div>
      </div>

      {showRawJson ? (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="flex justify-end px-2 py-1 bg-muted/30 border-b border-border">
            <CopyBtn text={JSON.stringify(props, null, 2)} />
          </div>
          <pre className="p-2 text-[9px] font-mono text-muted-foreground overflow-auto max-h-[450px] whitespace-pre-wrap break-all">
            {JSON.stringify(props, null, 2)}
          </pre>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Customer */}
          <Section icon={User} title="Customer">
            <div className="space-y-0.5">
              {profileName && <KVRow label="Name" value={profileName} />}
              {profileEmail && <KVRow label="Email" value={profileEmail} />}
              {extra.phone && <KVRow label="Phone" value={extra.phone} />}
            </div>
          </Section>

          {/* Order Overview */}
          <Section icon={ReceiptText} title="Order">
            <div className="space-y-0.5">
              {orderNumber && <KVRow label="Order" value={`#${String(orderNumber).replace("#", "")}`} />}
              {orderDate && <KVRow label="Date" value={fmtDate(orderDate)} />}
              <KVRow label="Currency" value={currency} />
              {financialStatus && <KVRow label="Payment" value={financialStatus} />}
              {fulfillmentStatus && <KVRow label="Fulfillment" value={fulfillmentStatus || "Unfulfilled"} />}
              {gateway && <KVRow label="Gateway" value={gateway} />}
            </div>
          </Section>

          {/* Line Items */}
          {lineItems.length > 0 && (
            <Section icon={Package} title="Items" count={lineItems.length}>
              <div className="space-y-1.5">
                {lineItems.map((item: any, i: number) => (
                  <LineItemCard key={i} item={item} index={i} />
                ))}
              </div>
            </Section>
          )}

          {/* Totals */}
          <Section icon={CreditCard} title="Totals">
            <div className="space-y-0.5">
              {subtotal && <KVRow label="Subtotal" value={fmt$(subtotal)} />}
              {shippingLines.map((sl: any, i: number) => (
                <KVRow key={i} label={`Shipping (${sl.title || "Standard"})`} value={fmt$(sl.price)} />
              ))}
              {totalDiscount && parseFloat(totalDiscount) > 0 && (
                <KVRow label="Discounts" value={`-${fmt$(totalDiscount)}`} />
              )}
              {taxLines.map((tl: any, i: number) => (
                <KVRow key={i} label={`Tax (${tl.title || "Tax"})`} value={fmt$(tl.price)} />
              ))}
              {totalTax && !taxLines.length && <KVRow label="Tax" value={fmt$(totalTax)} />}
              <div className="border-t border-border/50 mt-1 pt-1">
                <KVRow label="Total" value={fmt$(total)} />
              </div>
            </div>
          </Section>

          {/* Discount Codes */}
          {discountCodes.length > 0 && (
            <Section icon={Tag} title="Discount Codes" defaultOpen={false} count={discountCodes.length}>
              <div className="space-y-1">
                {discountCodes.map((dc: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 py-1">
                    <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-foreground">{dc.code}</span>
                    <span className="text-[10px] text-muted-foreground">{dc.type} · -{fmt$(dc.amount)}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Shipping Address */}
          {shipping.address1 && (
            <Section icon={MapPin} title="Shipping Address" defaultOpen={false}>
              <div className="text-[11px] text-foreground leading-relaxed">
                {fmtAddr(shipping).map((line, i) => <div key={i}>{line}</div>)}
                {shipping.phone && <div className="text-muted-foreground mt-1">{shipping.phone}</div>}
              </div>
            </Section>
          )}

          {/* Billing Address */}
          {billing.address1 && (
            <Section icon={CreditCard} title="Billing Address" defaultOpen={false}>
              <div className="text-[11px] text-foreground leading-relaxed">
                {fmtAddr(billing).map((line, i) => <div key={i}>{line}</div>)}
              </div>
            </Section>
          )}

          {/* Notes & Tags */}
          {(note || tags) && (
            <Section icon={FileText} title="Notes & Tags" defaultOpen={false}>
              <div className="space-y-1">
                {note && <div className="text-[11px] text-foreground">{note}</div>}
                {tags && (
                  <div className="flex flex-wrap gap-1">
                    {String(tags).split(",").map((t: string, i: number) => (
                      <span key={i} className="px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground">{t.trim()}</span>
                    ))}
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Other fields */}
          <OtherFieldsSection data={props} />
        </div>
      )}
    </div>
  );
}
