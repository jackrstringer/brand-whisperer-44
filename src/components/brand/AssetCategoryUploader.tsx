import { useState, useCallback } from "react";
import ResourceUploader from "./ResourceUploader";

export type AssetCategory = "logo" | "product_imagery" | "hero_shots" | "lifestyle";

interface CategoryFiles {
  files: File[];
  previews: string[];
}

interface AssetCategoryUploaderProps {
  categories: Record<AssetCategory, CategoryFiles>;
  onUpdate: (category: AssetCategory, files: File[], previews: string[]) => void;
}

const CATEGORY_CONFIG: { id: AssetCategory; title: string; description: string }[] = [
  { id: "logo", title: "Logo", description: "Transparent background, light and dark versions required" },
  { id: "product_imagery", title: "Misc Product Imagery", description: "General product photos and renders" },
  { id: "hero_shots", title: "Transparent BG Product Hero Shots", description: "Product images with transparent backgrounds for hero sections" },
  { id: "lifestyle", title: "Lifestyle Imagery", description: "Lifestyle and in-context product photography" },
];

export default function AssetCategoryUploader({ categories, onUpdate }: AssetCategoryUploaderProps) {
  const handleAdd = useCallback((cat: AssetCategory, newFiles: File[]) => {
    const existing = categories[cat];
    const combined = [...existing.files, ...newFiles];
    const newPreviews = newFiles.map((f) => URL.createObjectURL(f));
    onUpdate(cat, combined, [...existing.previews, ...newPreviews]);
  }, [categories, onUpdate]);

  const handleRemove = useCallback((cat: AssetCategory, index: number) => {
    const existing = categories[cat];
    URL.revokeObjectURL(existing.previews[index]);
    onUpdate(
      cat,
      existing.files.filter((_, i) => i !== index),
      existing.previews.filter((_, i) => i !== index),
    );
  }, [categories, onUpdate]);

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-medium">Image Assets</h3>
      <p className="text-xs text-muted-foreground -mt-4">Upload images for each category</p>
      {CATEGORY_CONFIG.map((cat) => (
        <ResourceUploader
          key={cat.id}
          title={cat.title}
          description={cat.description}
          accept=".jpg,.jpeg,.png,.webp"
          files={categories[cat.id].files}
          previews={categories[cat.id].previews}
          onAdd={(files) => handleAdd(cat.id, files)}
          onRemove={(index) => handleRemove(cat.id, index)}
        />
      ))}
    </div>
  );
}
