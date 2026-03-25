import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Save, Loader2, Palette } from "lucide-react";

interface AssetData {
  id: string;
  url: string;
  filename: string | null;
  description: string | null;
  dominant_colors: string[] | null;
  ai_category: string | null;
  category?: string;
  bucket?: string;
  composition_notes?: string | null;
}

interface AssetLightboxProps {
  asset: AssetData | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Record<string, any>) => Promise<void>;
  categories?: { id: string; title: string }[];
  categoryField?: "category" | "bucket";
}

export default function AssetLightbox({ asset, open, onClose, onSave, categories, categoryField = "category" }: AssetLightboxProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [description, setDescription] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");

  const startEdit = () => {
    if (!asset) return;
    setDescription(asset.description || "");
    setSelectedCategory((asset as any)[categoryField] || "");
    setEditing(true);
  };

  const handleSave = async () => {
    if (!asset) return;
    setSaving(true);
    const updates: Record<string, any> = { description: description.trim() || null };
    if (categories && selectedCategory) {
      updates[categoryField] = selectedCategory;
    }
    await onSave(asset.id, updates);
    setSaving(false);
    setEditing(false);
  };

  if (!asset) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setEditing(false); onClose(); } }}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden bg-card border-border">
        <button onClick={onClose} className="absolute top-3 right-3 z-10 p-1 rounded-full bg-background/80 hover:bg-background transition-colors">
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col md:flex-row">
          {/* Image preview */}
          <div className="md:w-1/2 bg-background flex items-center justify-center p-4 min-h-[300px]">
            <img
              src={asset.url}
              alt={asset.filename || ""}
              className="max-w-full max-h-[500px] object-contain rounded"
            />
          </div>

          {/* Details panel */}
          <div className="md:w-1/2 p-5 space-y-4 overflow-y-auto max-h-[600px]">
            <div>
              <p className="text-xs text-muted-foreground">Filename</p>
              <p className="text-sm font-medium text-foreground truncate">{asset.filename || "Untitled"}</p>
            </div>

            {editing ? (
              <>
                {categories && (
                  <div>
                    <Label className="text-xs">Category</Label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger className="mt-1 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id} className="text-xs">{c.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label className="text-xs">Description</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="mt-1 text-xs min-h-[80px]"
                    placeholder="AI-generated or manual description..."
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSave} disabled={saving} className="flex-1">
                    {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </>
            ) : (
              <>
                {(asset as any)[categoryField] && (
                  <div>
                    <p className="text-xs text-muted-foreground">Category</p>
                    <p className="text-sm text-foreground capitalize">
                      {((asset as any)[categoryField] || "").replace(/_/g, " ")}
                    </p>
                  </div>
                )}

                {asset.description && (
                  <div>
                    <p className="text-xs text-muted-foreground">Description</p>
                    <p className="text-sm text-foreground">{asset.description}</p>
                  </div>
                )}

                {asset.ai_category && (
                  <div>
                    <p className="text-xs text-muted-foreground">AI Category</p>
                    <p className="text-sm text-foreground capitalize">{asset.ai_category.replace(/_/g, " ")}</p>
                  </div>
                )}

                {asset.composition_notes && (
                  <div>
                    <p className="text-xs text-muted-foreground">Composition</p>
                    <p className="text-sm text-foreground">{asset.composition_notes}</p>
                  </div>
                )}

                {asset.dominant_colors && asset.dominant_colors.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Palette className="w-3 h-3" /> Colors</p>
                    <div className="flex gap-1.5 mt-1">
                      {asset.dominant_colors.map((c, i) => (
                        <div key={i} className="flex items-center gap-1">
                          <div className="w-5 h-5 rounded border border-border" style={{ backgroundColor: c }} />
                          <span className="text-[10px] text-muted-foreground">{c}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button size="sm" variant="outline" onClick={startEdit} className="w-full mt-2">
                  Edit Details
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
