import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Globe, Mail, BookOpen, Image, Package, Palette, Figma } from "lucide-react";

export type SourceType = "website" | "past_campaigns" | "brand_deck" | "product_mockups" | "image_assets" | "misc_references" | "figma";

interface SourceQuizProps {
  selected: SourceType[];
  onToggle: (source: SourceType) => void;
  websiteUrl: string;
  onWebsiteUrlChange: (url: string) => void;
  figmaUrl: string;
  onFigmaUrlChange: (url: string) => void;
  figmaToken: string;
  onFigmaTokenChange: (token: string) => void;
}

const SOURCE_OPTIONS: { id: SourceType; label: string; description: string; icon: React.ReactNode; recommended?: boolean }[] = [
  { id: "figma", label: "Figma File", description: "Exact font names, colors, and spacing -- no guessing required", icon: <Figma className="w-5 h-5" /> },
  { id: "website", label: "Current Website URL", description: "We'll extract font families and color values from your site's CSS", icon: <Globe className="w-5 h-5" /> },
  { id: "past_campaigns", label: "Past Email Campaigns", description: "Upload screenshots or HTML of previous emails", icon: <Mail className="w-5 h-5" />, recommended: true },
  { id: "brand_deck", label: "Brand Deck / Brand Guidelines", description: "Upload your brand guide PDF or images", icon: <BookOpen className="w-5 h-5" /> },
  { id: "misc_references", label: "Outside Misc Branding References", description: "Any other branding materials you'd like us to reference", icon: <Palette className="w-5 h-5" /> },
  { id: "product_mockups", label: "Product Mockups", description: "Upload product mockup images", icon: <Package className="w-5 h-5" /> },
  { id: "image_assets", label: "Image Assets", description: "Logos, product shots, lifestyle photos, hero images", icon: <Image className="w-5 h-5" /> },
];

export default function SourceQuiz({ selected, onToggle, websiteUrl, onWebsiteUrlChange, figmaUrl, onFigmaUrlChange, figmaToken, onFigmaTokenChange }: SourceQuizProps) {
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
            {opt.id === "figma" && selected.includes("figma") && (
              <div className="mt-2 ml-10 space-y-2">
                <Input
                  value={figmaUrl}
                  onChange={(e) => onFigmaUrlChange(e.target.value)}
                  placeholder="https://www.figma.com/file/... or https://www.figma.com/design/..."
                  className="bg-card border-border"
                />
                <Input
                  type="password"
                  value={figmaToken}
                  onChange={(e) => onFigmaTokenChange(e.target.value)}
                  placeholder="Figma Personal Access Token"
                  className="bg-card border-border"
                />
                <p className="text-xs text-muted-foreground">
                  Generate a token at{" "}
                  <a href="https://www.figma.com/developers/api#access-tokens" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    Figma Developer Settings
                  </a>
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
