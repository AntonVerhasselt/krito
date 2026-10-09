"use client";
import { useId, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  MAX_FILES,
} from "../../shared/analysisSchema";
import type { AnalysisSession } from "../lib/analysisSession";
import { safeError } from "../lib/safeError";
type FileRow = NonNullable<
  FunctionReturnType<typeof api.analyses.getStatus>
>["files"][number];
function putPdf(url: string, file: File, progress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "application/pdf");
    xhr.timeout = 120_000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) progress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error("upload_failed"));
    xhr.onerror = xhr.ontimeout = () => reject(new Error("upload_failed"));
    xhr.send(file);
  });
}
export function UploadPanel({
  ensureDraft,
  session,
  files,
  enabled,
  onBusy,
}: {
  ensureDraft: () => Promise<AnalysisSession>;
  session: AnalysisSession | null;
  files: FileRow[];
  enabled: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const requestUpload = useAction(api.files.requestUpload),
    complete = useMutation(api.files.completeUpload),
    remove = useMutation(api.files.remove);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState<Record<string, number>>({});
  async function upload(chosen: File[]) {
    if (!chosen.length || busy) return;
    setError("");
    if (chosen.some((f) => !f.size || f.size > MAX_FILE_BYTES)) {
      setError(safeError("file_too_large"));
      return;
    }
    if (
      chosen.length + files.length > MAX_FILES ||
      chosen.reduce((sum, f) => sum + f.size, 0) +
        files.reduce((sum, f) => sum + f.bytes, 0) >
        MAX_TOTAL_BYTES
    ) {
      setError(safeError("total_too_large"));
      return;
    }
    setBusy(true);
    onBusy(true);
    try {
      const credentials = await ensureDraft();
      for (const file of chosen) {
        const upload = await requestUpload({
          ...credentials,
          clientFileId: crypto.randomUUID(),
          name: file.name,
          bytes: file.size,
        });
        setProgress((p) => ({ ...p, [upload.fileId]: 0 }));
        try {
          await putPdf(upload.uploadUrl, file, (value) =>
            setProgress((p) => ({ ...p, [upload.fileId]: value })),
          );
          await complete({ ...credentials, fileId: upload.fileId });
        } finally {
          setProgress((p) => {
            const next = { ...p };
            delete next[upload.fileId];
            return next;
          });
        }
      }
    } catch (error) {
      setError(safeError(error));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <div className="upload-panel">
      <label className="field-label" htmlFor={id}>
        Lesmateriaal
      </label>
      <input
        id={id}
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="file-input"
        disabled={!enabled || busy}
        onChange={(e) => {
          const chosen = Array.from(e.target.files ?? []);
          e.target.value = "";
          void upload(chosen);
        }}
      />
      <button
        type="button"
        className="upload-drop"
        disabled={!enabled || busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (enabled && !busy) void upload(Array.from(e.dataTransfer.files));
        }}
      >
        <span aria-hidden="true">↑</span>
        <strong>{busy ? "Pdf’s uploaden…" : "Voeg je pdf’s toe"}</strong>
        <small>Max. 20 pdf’s · 10 MiB per pdf · 40 MiB samen</small>
      </button>
      {!enabled && <p className="field-hint">Kies eerst je onderwerp.</p>}
      {files.length > 0 && (
        <ul className="upload-list">
          {files.map((f) => (
            <li key={f.fileId}>
              <div>
                <strong>{f.name}</strong>
                <small>
                  {progress[f.fileId] !== undefined
                    ? `Uploaden ${progress[f.fileId]}%`
                    : f.status === "ready"
                      ? `${f.pageCount} ${f.pageCount === 1 ? "pagina" : "pagina’s"} · Klaar`
                      : f.status === "validating"
                        ? "Pdf controleren…"
                        : f.status === "invalid"
                          ? safeError(f.safeError)
                          : "Upload niet afgerond; verwijder en upload opnieuw."}
                </small>
                {progress[f.fileId] !== undefined && (
                  <progress
                    max={100}
                    value={progress[f.fileId]}
                    aria-label={`Upload ${f.name}`}
                  />
                )}
              </div>
              <button
                type="button"
                aria-label={`Verwijder ${f.name}`}
                disabled={busy}
                onClick={async () => {
                  if (!session) return;
                  try {
                    await remove({
                      ...session,
                      fileId: f.fileId as Id<"files">,
                    });
                  } catch (e) {
                    setError(safeError(e));
                  }
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
