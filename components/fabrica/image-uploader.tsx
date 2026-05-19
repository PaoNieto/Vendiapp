"use client";

/** Drag & drop + click uploader with preview grid, removal, counter and clear states. */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { ImagePlus, Loader2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type UploadedImage = {
  id: string;
  file: File;
  previewUrl: string;
};

export type ImageUploaderProps = {
  /** Allow more than one file. Defaults to true. */
  multi?: boolean;
  /** Max number of images. Used for counter and validation. */
  max?: number;
  /** Accepted MIME types. Defaults to common bitmaps. */
  accept?: string;
  /** Max file size in MB. Defaults to 8. */
  maxSizeMb?: number;
  /** Current list of images (controlled). */
  value: UploadedImage[];
  /** Notifies parent of the new list (after add or remove). */
  onChange: (next: UploadedImage[]) => void;
  /** Whether files are being processed (e.g. uploaded to backend). */
  uploading?: boolean;
  /** Optional label shown above the dropzone. */
  label?: string;
  /** Optional helper text under the label. */
  hint?: string;
  /** Optional className passthrough on the outer wrapper. */
  className?: string;
};

const DEFAULT_ACCEPT = "image/png,image/jpeg,image/webp";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function ImageUploader({
  multi = true,
  max = 5,
  accept = DEFAULT_ACCEPT,
  maxSizeMb = 8,
  value,
  onChange,
  uploading = false,
  label,
  hint,
  className,
}: ImageUploaderProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragCounter = useRef(0);

  // Revoke object URLs that are no longer present
  useEffect(() => {
    return () => {
      value.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remaining = useMemo(() => Math.max(0, max - value.length), [
    max,
    value.length,
  ]);
  const reachedMax = remaining === 0;

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (arr.length === 0) return;

      const allowedByMime = arr.filter((f) => {
        const accepts = accept.split(",").map((s) => s.trim());
        return accepts.some((a) => {
          if (a.endsWith("/*")) {
            return f.type.startsWith(a.slice(0, -1));
          }
          return f.type === a;
        });
      });

      if (allowedByMime.length === 0) {
        setError("Formato no soportado. Probá con PNG, JPG o WebP.");
        return;
      }

      const sizeLimit = maxSizeMb * 1024 * 1024;
      const sized = allowedByMime.filter((f) => f.size <= sizeLimit);
      if (sized.length === 0) {
        setError(`Cada imagen debe pesar menos de ${maxSizeMb}MB.`);
        return;
      }

      const slice = multi ? sized.slice(0, remaining) : sized.slice(0, 1);
      if (slice.length === 0) {
        setError(`Alcanzaste el máximo de ${max} imágenes.`);
        return;
      }

      const next: UploadedImage[] = slice.map((file) => ({
        id: createId(),
        file,
        previewUrl: URL.createObjectURL(file),
      }));

      setError(null);
      onChange(multi ? [...value, ...next] : next);
    },
    [accept, max, maxSizeMb, multi, onChange, remaining, value],
  );

  function handleRemove(id: string) {
    const target = value.find((img) => img.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    onChange(value.filter((img) => img.id !== id));
    setError(null);
  }

  function handleDragEnter(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setDragOver(true);
    }
  }

  function handleDragLeave(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      setDragOver(false);
      dragCounter.current = 0;
    }
  }

  function handleDragOver(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    dragCounter.current = 0;
    if (reachedMax) {
      setError(`Alcanzaste el máximo de ${max} imágenes.`);
      return;
    }
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      handleFiles(e.target.files);
      e.target.value = "";
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      {(label || hint) && (
        <div className="flex items-start justify-between gap-2">
          <div>
            {label && (
              <div className="text-sm font-medium text-foreground">{label}</div>
            )}
            {hint && (
              <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
            )}
          </div>
          {max > 1 && (
            <span className="shrink-0 rounded-full bg-white/50 px-2.5 py-0.5 font-mono text-xs text-muted-foreground">
              {value.length}/{max}
            </span>
          )}
        </div>
      )}

      <label
        htmlFor={inputId}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={cn(
          "glass relative flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/70 px-6 py-8 text-center transition-all",
          "hover:border-primary/40 hover:bg-white/70",
          dragOver && "border-primary bg-primary/5 ring-2 ring-primary/30",
          uploading && "pointer-events-none opacity-80",
          reachedMax && "cursor-not-allowed opacity-60",
        )}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          multiple={multi}
          disabled={uploading || reachedMax}
          onChange={handleInputChange}
          className="sr-only"
        />

        {uploading ? (
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        ) : dragOver ? (
          <Upload className="h-7 w-7 text-primary" />
        ) : (
          <ImagePlus className="h-7 w-7 text-primary" />
        )}

        <div className="text-sm font-medium text-foreground">
          {uploading
            ? "Procesando…"
            : dragOver
              ? "Soltá para subir"
              : reachedMax
                ? "Máximo alcanzado"
                : multi
                  ? "Arrastrá o tocá para subir imágenes"
                  : "Arrastrá o tocá para subir una imagen"}
        </div>
        <div className="text-xs text-muted-foreground">
          PNG, JPG o WebP — hasta {maxSizeMb}MB
        </div>
      </label>

      {error && (
        <div
          role="alert"
          className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      {value.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          <AnimatePresence initial={false}>
            {value.map((img) => (
              <motion.div
                key={img.id}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="glass group relative aspect-square overflow-hidden rounded-2xl"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.previewUrl}
                  alt={img.file.name}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => handleRemove(img.id)}
                  aria-label={`Quitar ${img.file.name}`}
                  className="absolute right-2 top-2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white shadow-md backdrop-blur-sm transition-all hover:bg-black/70 sm:h-9 sm:w-9"
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
