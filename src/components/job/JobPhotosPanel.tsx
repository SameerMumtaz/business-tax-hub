import { useState, useRef, useCallback } from "react";
import { useJobPhotos, type JobPhoto } from "@/hooks/useJobPhotos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Trash2, ImagePlus, Loader2 } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  before: "Before",
  after: "After",
  during: "During",
  completion: "Completion",
};

interface Props {
  jobId: string;
  compact?: boolean;
  occurrenceDate?: string | null;
}

export default function JobPhotosPanel({ jobId, compact = false, occurrenceDate = null }: Props) {
  const { photos, loading, uploading, uploadPhoto, updateCaption, deletePhoto } = useJobPhotos(jobId, occurrenceDate);
  const [selectedType, setSelectedType] = useState<JobPhoto["photo_type"]>("before");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) {
        return;
      }
      uploadPhoto(file, selectedType, undefined, occurrenceDate);
    });
  }, [selectedType, uploadPhoto, occurrenceDate]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const beforePhotos = photos.filter((p) => p.photo_type === "before");
  const afterPhotos = photos.filter((p) => p.photo_type === "after");
  const duringPhotos = photos.filter((p) => p.photo_type === "during");
  const completionPhotos = photos.filter((p) => p.photo_type === "completion");

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading photos…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={selectedType} onValueChange={(v) => setSelectedType(v as JobPhoto["photo_type"])}>
          <SelectTrigger className="w-[130px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="before">Before</SelectItem>
            <SelectItem value="after">After</SelectItem>
            <SelectItem value="during">During</SelectItem>
            <SelectItem value="completion">Completion</SelectItem>
          </SelectContent>
        </Select>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Camera className="h-4 w-4 mr-1" />}
          Upload Photos
        </Button>
      </div>

      {!compact && (
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/20"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <ImagePlus className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">
            Drag & drop photos here, or use the buttons above
          </p>
        </div>
      )}

      {(beforePhotos.length > 0 || afterPhotos.length > 0) && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Before & After</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Before</p>
              {beforePhotos.length === 0 ? (
                <div className="border border-dashed rounded-lg p-4 text-center text-xs text-muted-foreground">
                  No before photos
                </div>
              ) : (
                beforePhotos.map((photo) => (
                  <PhotoCard key={photo.id} photo={photo} onUpdateCaption={updateCaption} onDelete={deletePhoto} />
                ))
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">After</p>
              {afterPhotos.length === 0 ? (
                <div className="border border-dashed rounded-lg p-4 text-center text-xs text-muted-foreground">
                  No after photos
                </div>
              ) : (
                afterPhotos.map((photo) => (
                  <PhotoCard key={photo.id} photo={photo} onUpdateCaption={updateCaption} onDelete={deletePhoto} />
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {(duringPhotos.length > 0 || completionPhotos.length > 0) && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Progress & Completion</h4>
          <div className="grid grid-cols-2 gap-4">
            {duringPhotos.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">During</p>
                {duringPhotos.map((photo) => (
                  <PhotoCard key={photo.id} photo={photo} onUpdateCaption={updateCaption} onDelete={deletePhoto} />
                ))}
              </div>
            )}
            {completionPhotos.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Completion</p>
                {completionPhotos.map((photo) => (
                  <PhotoCard key={photo.id} photo={photo} onUpdateCaption={updateCaption} onDelete={deletePhoto} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {photos.length === 0 && !loading && (
        <div className="text-center py-6 text-muted-foreground text-sm">
          No photos yet. Upload before/after photos to document this job.
        </div>
      )}
    </div>
  );
}

function PhotoCard({
  photo,
  onUpdateCaption,
  onDelete,
}: {
  photo: JobPhoto;
  onUpdateCaption: (id: string, caption: string) => void;
  onDelete: (photo: JobPhoto) => void;
}) {
  const [caption, setCaption] = useState(photo.caption || "");
  const [editing, setEditing] = useState(false);

  return (
    <div className="rounded-lg border overflow-hidden bg-card">
      <img
        src={photo.photo_url}
        alt={photo.caption || TYPE_LABELS[photo.photo_type] || photo.photo_type}
        className="w-full h-32 object-cover"
        loading="lazy"
      />
      <div className="p-2 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground font-mono">
            {new Date(photo.uploaded_at).toLocaleString()}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onDelete(photo)}
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
        {editing ? (
          <Input
            className="h-7 text-xs"
            placeholder="Add caption…"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onBlur={() => {
              onUpdateCaption(photo.id, caption);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onUpdateCaption(photo.id, caption);
                setEditing(false);
              }
            }}
            autoFocus
          />
        ) : (
          <p
            className="text-xs text-muted-foreground cursor-pointer hover:text-foreground truncate"
            onClick={() => setEditing(true)}
          >
            {caption || "Click to add caption…"}
          </p>
        )}
      </div>
    </div>
  );
}
