import React, { useEffect, useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import type { ClothingCategory } from "@/types/local";
import { ImagePlus, Loader2 } from "lucide-react";
import { getImageUrl } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { PhotoCleanup, blobToBase64, isPhotoCleanupAvailable } from "@/lib/photoCleanup";
import { PhotoCompareSheet } from "@/components/clothing/PhotoCompareSheet";

const CATEGORIES: ClothingCategory[] = ["makeup", "skincare", "hair", "fragrances"];

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.enum(["makeup", "skincare", "hair", "fragrances"]),
  color: z.string().optional(),
  brand: z.string().optional(),
  notes: z.string().optional(),
  isFavorite: z.boolean().default(false),
  imageObjectPath: z.string().optional().nullable(),
});

export type ClothingFormData = z.infer<typeof formSchema>;

interface ClothingFormProps {
  initialData?: Partial<ClothingFormData>;
  onSubmit: (data: ClothingFormData) => void;
  isSubmitting: boolean;
  submitLabel: string;
}

/** Convert a base64 string (no prefix) to a JPEG data URL. */
function base64ToDataUrl(b64: string): string {
  return `data:image/jpeg;base64,${b64}`;
}

/** Resize a File to at most 800px wide and return a JPEG data URL. */
async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 800 / img.naturalWidth);
      canvas.width  = Math.round(img.naturalWidth  * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = reject;
    img.src = url;
  });
}

type UploadPhase = "idle" | "cleaning" | "comparing";

interface CompareState {
  originalDataUrl: string;
  cleanedDataUrl:  string;
  hadSubject:      boolean;
}

export function ClothingForm({ initialData, onSubmit, isSubmitting, submitLabel }: ClothingFormProps) {
  const form = useForm<ClothingFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData?.name || "",
      category: initialData?.category || "makeup",
      color: initialData?.color || "",
      brand: initialData?.brand || "",
      notes: initialData?.notes || "",
      isFavorite: initialData?.isFavorite || false,
      imageObjectPath: initialData?.imageObjectPath || null,
    },
  });

  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
  const [compareState, setCompareState] = useState<CompareState | null>(null);

  const isUploading = uploadPhase !== "idle";

  const uploadFile = useCallback(async (file: File) => {
    setUploadPhase("cleaning");
    try {
      // Always build the 800px JPEG original first
      const origDataUrl = await fileToDataUrl(file);

      if (!isPhotoCleanupAvailable()) {
        // Web/dev: skip Vision, commit immediately
        form.setValue("imageObjectPath", origDataUrl);
        setUploadPhase("idle");
        return;
      }

      // Native path: run Vision cleanup
      try {
        const b64    = await blobToBase64(file, 1200);
        const result = await PhotoCleanup.processPhoto({ imageData: b64 });

        console.log(
          `[PhotoCleanup] supported:${result.supported} hadSubject:${result.hadSubject}`,
        );

        if (result.hadSubject) {
          // Show comparison — defer commit until user chooses
          const cleanedUrl = base64ToDataUrl(result.cleanedImageData);
          setCompareState({
            originalDataUrl: origDataUrl,
            cleanedDataUrl:  cleanedUrl,
            hadSubject:      result.hadSubject,
          });
          setUploadPhase("comparing");
          return;
        }

        // No foreground subject found — save original without comparison
        form.setValue("imageObjectPath", origDataUrl);
        setUploadPhase("idle");
      } catch (err) {
        console.warn("[PhotoCleanup] Plugin error — saving original:", err);
        form.setValue("imageObjectPath", origDataUrl);
        setUploadPhase("idle");
      }
    } catch (err) {
      console.error("Upload error:", err);
      setUploadPhase("idle");
    }
  }, [form]);

  /** User picked a version in the comparison sheet. */
  const handleCompareSelect = useCallback((chosenDataUrl: string) => {
    form.setValue("imageObjectPath", chosenDataUrl);
    setCompareState(null);
    setUploadPhase("idle");
  }, [form]);

  /** User cancelled the comparison sheet — discard, keep previous photo. */
  const handleCompareCancel = useCallback(() => {
    setCompareState(null);
    setUploadPhase("idle");
  }, []);

  const imagePath = form.watch("imageObjectPath");

  return (
    <div className="relative">
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        
        {/* Image Upload Area */}
        <div className="relative">
          <div className="aspect-[4/3] w-full border-4 border-dashed border-black bg-muted flex items-center justify-center relative overflow-hidden group">
            {imagePath ? (
              <img src={getImageUrl(imagePath)!} alt="Upload preview" className="w-full h-full object-cover" />
            ) : (
              <div className="text-center flex flex-col items-center p-4">
                <div className="w-16 h-16 bg-white border-2 border-black rounded-full shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center mb-4">
                  <ImagePlus className="w-8 h-8" />
                </div>
                <span className="font-bold uppercase text-muted-foreground">Upload Photo</span>
              </div>
            )}
            
            {/* Cleaning overlay */}
            {uploadPhase === "cleaning" && (
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-12 h-12 text-white animate-spin" />
                {isPhotoCleanupAvailable() && (
                  <span className="text-white text-xs font-bold uppercase tracking-wider">Cleaning up…</span>
                )}
              </div>
            )}

            <input 
              type="file" 
              accept="image/*"
              disabled={isUploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadFile(file);
                e.currentTarget.value = "";
              }}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block font-bold uppercase text-sm mb-1">Item Name *</label>
            <input 
              {...form.register("name")}
              placeholder="e.g. Charlotte Tilbury Flawless Filter"
              className="w-full px-4 py-3 bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:translate-y-0.5 focus:translate-x-0.5 outline-none transition-all font-medium"
            />
            {form.formState.errors.name && (
              <span className="text-destructive text-sm font-bold mt-1 block">{form.formState.errors.name.message}</span>
            )}
          </div>

          <div>
            <label className="block font-bold uppercase text-sm mb-2">Category *</label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map(cat => (
                <label key={cat} className="cursor-pointer">
                  <input 
                    type="radio" 
                    value={cat} 
                    {...form.register("category")} 
                    className="sr-only peer"
                  />
                  <div className="px-2 py-3 text-center border-2 border-black bg-white peer-checked:bg-secondary font-bold text-xs uppercase tracking-tight transition-colors">
                    {cat}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-bold uppercase text-sm mb-1">Color</label>
              <input 
                {...form.register("color")}
                placeholder="Rose Gold"
                className="w-full px-3 py-2 bg-white border-2 border-black focus:bg-accent outline-none font-medium"
              />
            </div>
            <div>
              <label className="block font-bold uppercase text-sm mb-1">Brand</label>
              <input 
                {...form.register("brand")}
                placeholder="e.g. NARS"
                className="w-full px-3 py-2 bg-white border-2 border-black focus:bg-accent outline-none font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold uppercase text-sm mb-1">Notes</label>
            <textarea 
              {...form.register("notes")}
              placeholder="Anything worth remembering..."
              rows={3}
              className="w-full px-3 py-2 bg-white border-2 border-black focus:bg-accent outline-none font-medium resize-none"
            />
          </div>

          <label className="flex items-center gap-3 p-4 border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] cursor-pointer">
            <input 
              type="checkbox" 
              {...form.register("isFavorite")}
              className="w-6 h-6 border-2 border-black appearance-none checked:bg-primary checked:after:content-['★'] checked:after:text-black checked:after:flex checked:after:items-center checked:after:justify-center checked:after:h-full checked:after:text-sm transition-colors"
            />
            <span className="font-bold uppercase tracking-wider">Mark as Favorite</span>
          </label>
        </div>

        <button 
          type="submit"
          disabled={isSubmitting || isUploading}
          className="btn-brutalist py-4 rounded-xl w-full text-lg mt-4 disabled:opacity-50"
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> saving...
            </span>
          ) : submitLabel}
        </button>
      </form>

      {/* Comparison overlay — rendered on top of the form, full-screen within the edit view */}
      <AnimatePresence>
        {uploadPhase === "comparing" && compareState && (
          <motion.div
            key="compare-overlay"
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 240 }}
            className="fixed inset-0 z-[80] flex flex-col max-w-md mx-auto"
          >
            <PhotoCompareSheet
              originalDataUrl={compareState.originalDataUrl}
              cleanedDataUrl={compareState.cleanedDataUrl}
              hadSubject={compareState.hadSubject}
              onSelect={handleCompareSelect}
              onCancel={handleCompareCancel}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
