import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function GlobalSettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generationRules, setGenerationRules] = useState("");
  const [qaChecklist, setQaChecklist] = useState<string[]>([]);
  const [newQaItem, setNewQaItem] = useState("");
  const [prefId, setPrefId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase.from("user_preferences").select("*").eq("user_id", user.id).single();
      if (data) {
        setPrefId(data.id);
        const prefs = data.preferences as any;
        setGenerationRules(prefs?.generation_rules || "");
        setQaChecklist(Array.isArray(prefs?.qa_checklist) ? prefs.qa_checklist : []);
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const prefs = { generation_rules: generationRules, qa_checklist: qaChecklist };
    if (prefId) {
      await supabase.from("user_preferences").update({ preferences: prefs as any }).eq("id", prefId);
    } else {
      const { data } = await supabase.from("user_preferences").insert({ user_id: user.id, preferences: prefs as any }).select().single();
      if (data) setPrefId(data.id);
    }
    toast.success("Settings saved");
    setSaving(false);
  };

  const addQaItem = () => {
    if (!newQaItem.trim()) return;
    setQaChecklist([...qaChecklist, newQaItem.trim()]);
    setNewQaItem("");
  };

  const removeQaItem = (index: number) => {
    setQaChecklist(qaChecklist.filter((_, i) => i !== index));
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Global Settings</h1>

      <Tabs defaultValue="rules" className="space-y-6">
        <TabsList>
          <TabsTrigger value="rules">Generation Rules</TabsTrigger>
          <TabsTrigger value="qa">QA Checklist</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-4">
          <div>
            <Label>Global Generation Instructions</Label>
            <p className="text-xs text-muted-foreground mt-1 mb-2">These rules are injected into every campaign generation across all brands.</p>
            <Textarea
              value={generationRules}
              onChange={e => setGenerationRules(e.target.value)}
              placeholder="e.g. Always make buttons large and tappable. Prefer minimal layouts. Never use more than 3 images..."
              className="min-h-[200px]"
            />
          </div>
          <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground">Save Rules</Button>
        </TabsContent>

        <TabsContent value="qa" className="space-y-4">
          <div>
            <Label>Global QA Checklist</Label>
            <p className="text-xs text-muted-foreground mt-1 mb-3">These items apply to QA audits for all brands.</p>
            <div className="space-y-2">
              {qaChecklist.map((item, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded bg-card border border-border">
                  <span className="text-sm flex-1">{item}</span>
                  <button onClick={() => removeQaItem(i)} className="text-muted-foreground hover:text-destructive">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <Input
                value={newQaItem}
                onChange={e => setNewQaItem(e.target.value)}
                placeholder="e.g. Check that all CTAs are above the fold"
                onKeyDown={e => e.key === "Enter" && addQaItem()}
              />
              <Button variant="outline" onClick={addQaItem} disabled={!newQaItem.trim()}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground">Save Checklist</Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
