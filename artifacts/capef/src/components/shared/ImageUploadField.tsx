import React from 'react';
import { Upload } from 'lucide-react';

export type ImageUploadFieldProps = {
  label: string;
  value?: string | null;
  onChange: (base64: string | null) => void;
  required?: boolean;
};

export default function ImageUploadField({ label, value, onChange, required }: ImageUploadFieldProps) {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onChange(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const idSafe = label.replace(/\s+/g, '-').replace(/[^\w-]/g, '');

  return (
    <div className="space-y-2 text-left">
      <label className="text-sm font-semibold text-foreground">{label} {required && '*'}</label>
      <div className="flex flex-col sm:flex-row items-center gap-4 p-4 border border-dashed border-border rounded-lg bg-muted/10">
        {value ? (
          <div className="relative h-24 w-24 rounded border border-border overflow-hidden shrink-0 bg-background">
            <img src={value} alt={label} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(null)}
              className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 text-[10px] h-5 w-5 flex items-center justify-center font-bold hover:bg-red-700 shadow"
            >
              ×
            </button>
          </div>
        ) : (
          <div className="h-24 w-24 bg-muted rounded border border-border flex flex-col items-center justify-center text-[10px] text-muted-foreground font-medium shrink-0">
            <Upload className="h-5 w-5 mb-1 opacity-60" />
            Pas d'image
          </div>
        )}
        <div className="flex-1 w-full text-center sm:text-left">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
            id={`file-input-${idSafe}`}
          />
          <label
            htmlFor={`file-input-${idSafe}`}
            className="inline-flex px-4 py-2 bg-secondary text-secondary-foreground font-semibold rounded hover:bg-secondary/90 transition-colors cursor-pointer text-sm"
          >
            Choisir un fichier / Prendre une photo
          </label>
        </div>
      </div>
    </div>
  );
}
