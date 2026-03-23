import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    // Skip non-image or already-small files
    if (!file.type.startsWith("image/") || file.size < 500 * 1024) {
      resolve(file);
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width <= MAX_DIMENSION && height <= MAX_DIMENSION && file.size < 1024 * 1024) {
        resolve(file);
        return;
      }
      // Scale down
      if (width > height && width > MAX_DIMENSION) {
        height = Math.round(height * (MAX_DIMENSION / width));
        width = MAX_DIMENSION;
      } else if (height > MAX_DIMENSION) {
        width = Math.round(width * (MAX_DIMENSION / height));
        height = MAX_DIMENSION;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          const compressed = new File([blob], file.name.replace(/\.\w+$/, ".jpg"), {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
          resolve(compressed);
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

export interface JobPhoto {
  id: string;
  job_id: string;
  user_id: string;
  photo_url: string;
  photo_type: "before" | "after" | "during" | "completion";
  caption: string | null;
  uploaded_at: string;
}

export function useJobPhotos(jobId: string | null) {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchPhotos = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("job_photos")
      .select("*")
      .eq("job_id", jobId)
      .order("uploaded_at", { ascending: true });
    if (error) {
      console.error("Error fetching job photos:", error);
    } else {
      setPhotos((data || []) as JobPhoto[]);
    }
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const uploadPhoto = useCallback(async (
    file: File,
    photoType: JobPhoto["photo_type"],
    caption?: string
  ) => {
    if (!user || !jobId) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10MB");
      return;
    }

    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const ext = compressed.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${jobId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("job-photos")
        .upload(path, compressed, { cacheControl: "3600", upsert: false });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("job-photos")
        .getPublicUrl(path);

      const { error: insertError } = await supabase
        .from("job_photos")
        .insert({
          job_id: jobId,
          user_id: user.id,
          photo_url: urlData.publicUrl,
          photo_type: photoType,
          caption: caption || null,
        });
      if (insertError) throw insertError;

      toast.success("Photo uploaded");
      fetchPhotos();
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    }
    setUploading(false);
  }, [user, jobId, fetchPhotos]);

  const updateCaption = useCallback(async (photoId: string, caption: string) => {
    const { error } = await supabase
      .from("job_photos")
      .update({ caption })
      .eq("id", photoId);
    if (error) {
      toast.error("Failed to update caption");
    } else {
      setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, caption } : p));
    }
  }, []);

  const deletePhoto = useCallback(async (photo: JobPhoto) => {
    // Extract storage path from URL
    const url = new URL(photo.photo_url);
    const pathMatch = url.pathname.match(/\/object\/public\/job-photos\/(.+)/);
    if (pathMatch) {
      await supabase.storage.from("job-photos").remove([pathMatch[1]]);
    }
    const { error } = await supabase
      .from("job_photos")
      .delete()
      .eq("id", photo.id);
    if (error) {
      toast.error("Failed to delete photo");
    } else {
      toast.success("Photo deleted");
      setPhotos(prev => prev.filter(p => p.id !== photo.id));
    }
  }, []);

  const photoCountByType = {
    before: photos.filter(p => p.photo_type === "before").length,
    after: photos.filter(p => p.photo_type === "after").length,
    during: photos.filter(p => p.photo_type === "during").length,
    completion: photos.filter(p => p.photo_type === "completion").length,
    total: photos.length,
  };

  return {
    photos,
    loading,
    uploading,
    uploadPhoto,
    updateCaption,
    deletePhoto,
    photoCountByType,
    refetch: fetchPhotos,
  };
}
