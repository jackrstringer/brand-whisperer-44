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
  Plus,
  Database,
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

function truncate(val: string, max = 40): string {
  return val.length > max ? val.slice(0, max) + "…" : val;
}

/* ── Copy / Insert buttons ────────────────────────────── */

function CopyBtn({ liquidPath }: { liquidPath: string }) {
  const [copied, setCopied] = useState(false);
  const syntax = `{{ ${liquidPath} }}`;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(syntax); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted transition-all shrink-0"
      title={`Copy ${syntax}`}
    >
      {copied ? <Check className="w-2.5 h-2.5 text-green-500" /> : <Copy className="w-2.5 h-2.5 text-muted-foreground" />}
    </button>
  );
}

function InsertBtn({ liquidPath, onInsert }: { liquidPath: string; onInsert?: (path: string) => void }) {
  if (!onInsert) return null;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onInsert(liquidPath); }}
      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-primary/10 transition-all shrink-0"
      title="Insert into chat"
    >
      <Plus className="w-2.5 h-2.5 text-primary" />
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

/* ── Key-Value row with Liquid path ───────────────────── */

function KVRow({ label, value, liquidPath, mono, onInsert }: {
  label: string; value: string; liquidPath?: string; mono?: boolean; onInsert?: (path: string) => void;
}) {
  if (!value) return null;
  return (
    <div className="group flex items-start justify-between gap-2 py-[3px]">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground shrink-0 uppercase tracking-wider">{label}</span>
          <span className={`text-[11px] text-foreground text-right flex-1 ${mono ? "font-mono" : ""}`} style={{ wordBreak: "break-word" }}>
            {value}
          </span>
        </div>
        {liquidPath && (
          <div className="text-[9px] font-mono text-primary/50 mt-0.5 truncate">
            {"{{ "}{liquidPath}{" }}"}
          </div>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
        {liquidPath && <CopyBtn liquidPath={liquidPath} />}
        {liquidPath && <InsertBtn liquidPath={liquidPath} onInsert={onInsert} />}
      </div>
    </div>
  );
}

/* ── Line Item Card ───────────────────────────────────── */

function LineItemCard({ item, index, onInsert }: { item: any; index: number; onInsert?: (path: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const name = item.name || item.title || item.ProductName || `Item ${index + 1}`;
  const qty = item.quantity ?? 1;
  const price = item.price || item.ItemPrice;
  const sku = item.sku;
  const variant = item.variant_title;
  const imgUrl = item.product?.images?.[0]?.src || item.image_url || item.product_image_url;
  const properties: any[] = item.properties || [];
  const p = (field: string) => `event.extra.line_items[].${field}`;

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
          <KVRow label="Name" value={name} liquidPath={p("name")} onInsert={onInsert} />
          <KVRow label="Price" value={fmt$(price)} liquidPath={p("price")} onInsert={onInsert} />
          <KVRow label="Quantity" value={String(qty)} liquidPath={p("quantity")} onInsert={onInsert} />
          {sku && <KVRow label="SKU" value={sku} liquidPath={p("sku")} mono onInsert={onInsert} />}
          {variant && <KVRow label="Variant" value={variant} liquidPath={p("variant_title")} onInsert={onInsert} />}
          {item.variant_id && <KVRow label="Variant ID" value={String(item.variant_id)} liquidPath={p("variant_id")} mono onInsert={onInsert} />}
          {item.product_id && <KVRow label="Product ID" value={String(item.product_id)} liquidPath={p("product_id")} mono onInsert={onInsert} />}
          {item.vendor && <KVRow label="Vendor" value={item.vendor} liquidPath={p("vendor")} onInsert={onInsert} />}
          {item.grams && <KVRow label="Weight" value={`${item.grams}g`} liquidPath={p("grams")} onInsert={onInsert} />}
          {item.requires_shipping !== undefined && <KVRow label="Requires shipping" value={item.requires_shipping ? "Yes" : "No"} liquidPath={p("requires_shipping")} onInsert={onInsert} />}
          {item.taxable !== undefined && <KVRow label="Taxable" value={item.taxable ? "Yes" : "No"} liquidPath={p("taxable")} onInsert={onInsert} />}
          {properties.length > 0 && properties.map((prop: any, i: number) => (
            <KVRow key={i} label={prop.name || `Prop ${i}`} value={String(prop.value)} liquidPath={p(`properties[${i}].value`)} onInsert={onInsert} />
          ))}
          {item.total_discount && parseFloat(item.total_discount) > 0 && (
            <KVRow label="Discount" value={`-${fmt$(item.total_discount)}`} liquidPath={p("total_discount")} onInsert={onInsert} />
          )}
        </div>
      )}
    </div>
  );
}

/* ── Recursive "All Fields" browser ───────────────────── */

function buildFieldTree(obj: any, prefix: string): { path: string; value: string; isArray?: boolean }[] {
  const fields: { path: string; value: string; isArray?: boolean }[] = [];
  if (obj === null || obj === undefined) return fields;
  if (typeof obj !== "object") return fields;

  for (const [key, val] of Object.entries(obj)) {
    // Skip internal Klaviyo keys
    if (key.startsWith("$")) continue;
    const path = prefix ? `${prefix}.${key}` : key;

    if (Array.isArray(val)) {
      fields.push({ path, value: `[${val.length} items]`, isArray: true });
      // Show fields from first item as examples
      if (val.length > 0 && typeof val[0] === "object") {
        const childFields = buildFieldTree(val[0], `${path}[]`);
        fields.push(...childFields);
      }
    } else if (val && typeof val === "object") {
      const childFields = buildFieldTree(val, path);
      fields.push(...childFields);
    } else {
      fields.push({ path, value: String(val ?? "") });
    }
  }
  return fields;
}

function AllFieldsBrowser({ eventProperties, onInsert }: { eventProperties: any; onInsert?: (path: string) => void }) {
  const [search, setSearch] = useState("");
  const fields = buildFieldTree(eventProperties, "event");

  const filtered = search
    ? fields.filter(f => f.path.toLowerCase().includes(search.toLowerCase()) || f.value.toLowerCase().includes(search.toLowerCase()))
    : fields;

  return (
    <Section icon={Database} title="All Available Fields" defaultOpen={false} count={fields.length}>
      <div className="space-y-1.5">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search fields…"
          className="w-full px-2 py-1 text-[10px] rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
        <div className="max-h-[300px] overflow-y-auto space-y-0">
          {filtered.map((field) => (
            <div key={field.path} className="group flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/30 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-mono text-primary/70 truncate" title={field.path}>
                  {field.path}
                </div>
                <div className={`text-[10px] text-muted-foreground truncate ${field.isArray ? "italic" : ""}`}>
                  {truncate(field.value, 50)}
                </div>
              </div>
              <CopyBtn liquidPath={field.path} />
              <InsertBtn liquidPath={field.path} onInsert={onInsert} />
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-[10px] text-muted-foreground text-center py-2">No fields match</div>
          )}
        </div>
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
  onInsertField?: (liquidPath: string) => void;
}

export default function EventDataViewer({ eventProperties, profileName, profileEmail, onClose, onInsertField }: EventDataViewerProps) {
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
  const [rawCopied, setRawCopied] = useState(false);

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

      {/* Hint bar */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-muted/40 border border-border/50 text-[9px] text-muted-foreground">
        <Copy className="w-2.5 h-2.5 shrink-0" />
        <span>Hover any field to copy its <span className="font-mono text-primary/60">{"{{ liquid }}"}</span> syntax or insert it into the chat</span>
      </div>

      {showRawJson ? (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="flex justify-end px-2 py-1 bg-muted/30 border-b border-border">
            <button
              onClick={() => { navigator.clipboard.writeText(JSON.stringify(props, null, 2)); setRawCopied(true); setTimeout(() => setRawCopied(false), 1500); }}
              className="p-0.5 rounded hover:bg-muted transition-all"
              title="Copy all"
            >
              {rawCopied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
            </button>
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
              {profileName && <KVRow label="Name" value={profileName} liquidPath="person.first_name" onInsert={onInsertField} />}
              {profileEmail && <KVRow label="Email" value={profileEmail} liquidPath="person.email" onInsert={onInsertField} />}
              {extra.phone && <KVRow label="Phone" value={extra.phone} liquidPath="event.extra.phone" onInsert={onInsertField} />}
            </div>
          </Section>

          {/* Order Overview */}
          <Section icon={ReceiptText} title="Order">
            <div className="space-y-0.5">
              {orderNumber && <KVRow label="Order" value={`#${String(orderNumber).replace("#", "")}`} liquidPath="event.extra.order_number" onInsert={onInsertField} />}
              {orderDate && <KVRow label="Date" value={fmtDate(orderDate)} liquidPath="event.extra.created_at" onInsert={onInsertField} />}
              <KVRow label="Currency" value={currency} liquidPath="event.extra.currency" onInsert={onInsertField} />
              {financialStatus && <KVRow label="Payment" value={financialStatus} liquidPath="event.extra.financial_status" onInsert={onInsertField} />}
              {fulfillmentStatus && <KVRow label="Fulfillment" value={fulfillmentStatus || "Unfulfilled"} liquidPath="event.extra.fulfillment_status" onInsert={onInsertField} />}
              {gateway && <KVRow label="Gateway" value={gateway} liquidPath="event.extra.gateway" onInsert={onInsertField} />}
            </div>
          </Section>

          {/* Line Items */}
          {lineItems.length > 0 && (
            <Section icon={Package} title="Items" count={lineItems.length}>
              <div className="space-y-1.5">
                {lineItems.map((item: any, i: number) => (
                  <LineItemCard key={i} item={item} index={i} onInsert={onInsertField} />
                ))}
              </div>
            </Section>
          )}

          {/* Totals */}
          <Section icon={CreditCard} title="Totals">
            <div className="space-y-0.5">
              {subtotal && <KVRow label="Subtotal" value={fmt$(subtotal)} liquidPath="event.extra.subtotal_price" onInsert={onInsertField} />}
              {shippingLines.map((sl: any, i: number) => (
                <KVRow key={i} label={`Shipping (${sl.title || "Standard"})`} value={fmt$(sl.price)} liquidPath={`event.extra.shipping_lines[${i}].price`} onInsert={onInsertField} />
              ))}
              {totalDiscount && parseFloat(totalDiscount) > 0 && (
                <KVRow label="Discounts" value={`-${fmt$(totalDiscount)}`} liquidPath="event.extra.total_discounts" onInsert={onInsertField} />
              )}
              {taxLines.map((tl: any, i: number) => (
                <KVRow key={i} label={`Tax (${tl.title || "Tax"})`} value={fmt$(tl.price)} liquidPath={`event.extra.tax_lines[${i}].price`} onInsert={onInsertField} />
              ))}
              {totalTax && !taxLines.length && <KVRow label="Tax" value={fmt$(totalTax)} liquidPath="event.extra.total_tax" onInsert={onInsertField} />}
              <div className="border-t border-border/50 mt-1 pt-1">
                <KVRow label="Total" value={fmt$(total)} liquidPath="event.extra.total_price" onInsert={onInsertField} />
              </div>
            </div>
          </Section>

          {/* Discount Codes */}
          {discountCodes.length > 0 && (
            <Section icon={Tag} title="Discount Codes" defaultOpen={false} count={discountCodes.length}>
              <div className="space-y-1">
                {discountCodes.map((dc: any, i: number) => (
                  <div key={i}>
                    <KVRow label="Code" value={dc.code} liquidPath={`event.extra.discount_codes[${i}].code`} onInsert={onInsertField} />
                    <KVRow label="Amount" value={`-${fmt$(dc.amount)}`} liquidPath={`event.extra.discount_codes[${i}].amount`} onInsert={onInsertField} />
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Shipping Address */}
          {shipping.address1 && (
            <Section icon={MapPin} title="Shipping Address" defaultOpen={false}>
              <div className="space-y-0.5">
                {shipping.first_name && <KVRow label="Name" value={[shipping.first_name, shipping.last_name].filter(Boolean).join(" ")} liquidPath="event.extra.shipping_address.first_name" onInsert={onInsertField} />}
                {shipping.address1 && <KVRow label="Address" value={shipping.address1} liquidPath="event.extra.shipping_address.address1" onInsert={onInsertField} />}
                {shipping.address2 && <KVRow label="Address 2" value={shipping.address2} liquidPath="event.extra.shipping_address.address2" onInsert={onInsertField} />}
                {shipping.city && <KVRow label="City" value={shipping.city} liquidPath="event.extra.shipping_address.city" onInsert={onInsertField} />}
                {shipping.province_code && <KVRow label="State" value={shipping.province_code} liquidPath="event.extra.shipping_address.province_code" onInsert={onInsertField} />}
                {shipping.zip && <KVRow label="ZIP" value={shipping.zip} liquidPath="event.extra.shipping_address.zip" onInsert={onInsertField} />}
                {shipping.country && <KVRow label="Country" value={shipping.country} liquidPath="event.extra.shipping_address.country" onInsert={onInsertField} />}
                {shipping.phone && <KVRow label="Phone" value={shipping.phone} liquidPath="event.extra.shipping_address.phone" onInsert={onInsertField} />}
              </div>
            </Section>
          )}

          {/* Billing Address */}
          {billing.address1 && (
            <Section icon={CreditCard} title="Billing Address" defaultOpen={false}>
              <div className="space-y-0.5">
                {billing.first_name && <KVRow label="Name" value={[billing.first_name, billing.last_name].filter(Boolean).join(" ")} liquidPath="event.extra.billing_address.first_name" onInsert={onInsertField} />}
                {billing.address1 && <KVRow label="Address" value={billing.address1} liquidPath="event.extra.billing_address.address1" onInsert={onInsertField} />}
                {billing.city && <KVRow label="City" value={billing.city} liquidPath="event.extra.billing_address.city" onInsert={onInsertField} />}
                {billing.zip && <KVRow label="ZIP" value={billing.zip} liquidPath="event.extra.billing_address.zip" onInsert={onInsertField} />}
                {billing.country && <KVRow label="Country" value={billing.country} liquidPath="event.extra.billing_address.country" onInsert={onInsertField} />}
              </div>
            </Section>
          )}

          {/* Notes & Tags */}
          {(note || tags) && (
            <Section icon={FileText} title="Notes & Tags" defaultOpen={false}>
              <div className="space-y-1">
                {note && <KVRow label="Note" value={note} liquidPath="event.extra.note" onInsert={onInsertField} />}
                {tags && <KVRow label="Tags" value={String(tags)} liquidPath="event.extra.tags" onInsert={onInsertField} />}
              </div>
            </Section>
          )}

          {/* All Available Fields — recursive browser */}
          <AllFieldsBrowser eventProperties={props} onInsert={onInsertField} />
        </div>
      )}
    </div>
  );
}
