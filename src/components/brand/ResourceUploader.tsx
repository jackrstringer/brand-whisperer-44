import { useCallback } from "react";
import { Upload, X } from "lucide-react";

interface ResourceUploaderProps {
  title: string;
  description: string;
  accept: string;
  files: File[];
  previews: string[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  minFiles?: number;
}

export default function ResourceUploader({
  title, description, accept, files, previews, onAdd, onRemove, minFiles,
}: ResourceUploaderProps) {
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    onAdd(dropped);
  }, [onAdd]);

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) onAdd(Array.from(e.target.files));
  };

  const inputId = `upload-${title.replace(/\s/g, "-")}`;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
        onClick={() => document.getElementById(inputId)?.click()}
      >
        <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Drop files here or click to browse</p>
        <input id={inputId} type="file" multiple accept={accept} onChange={handleSelect} className="hidden" />
      </div>

      {files.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">
            {files.length} file{files.length !== 1 ? "s" : ""}
            {minFiles && files.length < minFiles && (
              <span className="text-yellow-400"> — minimum {minFiles} required</span>
            )}
          </p>
          <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
            {previews.map((src, i) => (
              <div key={i} className="relative group aspect-square rounded-md overflow-hidden border border-border bg-card">
                {/\.(jpg|jpeg|png|webp)$/i.test(files[i]?.name || "") ? (
                  <img src={src} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                    {files[i]?.name?.split(".").pop()?.toUpperCase()}
                  </div>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(i); }}
                  className="absolute top-1 right-1 bg-background/80 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
