import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Globe, Mail, BookOpen, Image, Package, Palette } from "lucide-react";

export type SourceType = "website" | "past_campaigns" | "brand_deck" | "product_mockups" | "image_assets" | "misc_references";

interface SourceQuizProps {
  selected: SourceType[];
  onToggle: (source: SourceType) => void;
  websiteUrl: string;
  onWebsiteUrlChange: (url: string) => void;
}

const SOURCE_OPTIONS: { id: SourceType; label: string; description: string; icon: React.ReactNode; recommended?: boolean }[] = [
  { id: "website", label: "Current Website URL", description: "We'll analyze your site's visual identity", icon: <Globe className="w-5 h-5" /> },
  { id: "past_campaigns", label: "Past Email Campaigns", description: "Upload screenshots or HTML of previous emails", icon: <Mail className="w-5 h-5" />, recommended: true },
  { id: "brand_deck", label: "Brand Deck / Brand Guidelines", description: "Upload your brand guide PDF or images", icon: <BookOpen className="w-5 h-5" /> },
  { id: "misc_references", label: "Outside Misc Branding References", description: "Any other branding materials you'd like us to reference", icon: <Palette className="w-5 h-5" /> },
  { id: "product_mockups", label: "Product Mockups", description: "Upload product mockup images", icon: <Package className="w-5 h-5" /> },
  { id: "image_assets", label: "Image Assets", description: "Logos, product shots, lifestyle photos, hero images", icon: <Image className="w-5 h-5" /> },
];

export default function SourceQuiz({ selected, onToggle, websiteUrl, onWebsiteUrlChange }: SourceQuizProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-medium">What would you like to base your email designs on?</h2>
      <p className="text-sm text-muted-foreground mb-6">Select all that apply. The more you provide, the better we can match your brand.</p>
      <div className="space-y-3">
        {SOURCE_OPTIONS.map((opt) => (
          <div key={opt.id}>
            <label
              className={`flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-all ${
                selected.includes(opt.id)
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-primary/30"
              }`}
            >
              <Checkbox
                checked={selected.includes(opt.id)}
                onCheckedChange={() => onToggle(opt.id)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{opt.icon}</span>
                  <span className="text-sm font-medium">{opt.label}</span>
                  {opt.recommended && (
                    <Badge className="bg-primary/20 text-primary text-[10px]">Recommended</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{opt.description}</p>
              </div>
            </label>
            {opt.id === "website" && selected.includes("website") && (
              <div className="mt-2 ml-10">
                <Input
                  value={websiteUrl}
                  onChange={(e) => onWebsiteUrlChange(e.target.value)}
                  placeholder="https://yoursite.com"
                  className="bg-card border-border"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
