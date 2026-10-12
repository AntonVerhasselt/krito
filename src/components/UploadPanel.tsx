"use client";
import { useId, useRef, useState, type ReactNode } from "react";
import { useAction, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  MAX_FILES,
} from "../../shared/analysisSchema";
import {
  ACCEPTED_FILES,
  ACCEPTED_LABEL,
  fileTypeOf,
} from "../../shared/fileTypes";
import type { AnalysisSession } from "../lib/analysisSession";
import { track, captureAnalyticsError } from "../lib/analytics";
import { analyticsErrorCode } from "../../shared/analytics";
import { safeError } from "../lib/safeError";
import { StatusIcon } from "./brand";
import { DropArt } from "./brand";
type FileRow = NonNullable<
  FunctionReturnType<typeof api.analyses.getStatus>
>["files"][number];
function putFile(
  url: string,
  file: File,
  contentType: string,
  progress: (percent: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
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
const materialKinds = [
  "Lesvoorbereidingen",
  "Presentaties",
  "Oefenbladen en werkbladen",
  "Toetsen en evaluaties",
  "Ander lesmateriaal",
];
function pages(name: string, n: number | null) {
  const kind = fileTypeOf(name)?.kind;
  if (kind === "image") return "Afbeelding";
  if (kind === "presentation") return `${n} ${n === 1 ? "dia" : "dia’s"}`;
  if (kind === "spreadsheet")
    return `${n} ${n === 1 ? "werkblad" : "werkbladen"}`;
  return `${n} ${n === 1 ? "pagina" : "pagina’s"}`;
}
export function UploadPanel({
  ensureDraft,
  session,
  files,
  enabled,
  onBusy,
  footer,
}: {
  ensureDraft: () => Promise<AnalysisSession>;
  session: AnalysisSession | null;
  files: FileRow[];
  enabled: boolean;
  onBusy: (busy: boolean) => void;
  footer?: ReactNode;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const requestUpload = useAction(api.files.requestUpload),
    complete = useMutation(api.files.completeUpload),
    remove = useMutation(api.files.remove);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dragging, setDragging] = useState(false),
    [progress, setProgress] = useState<Record<string, number>>({});
  const uploading = Object.values(progress);
  const overall = uploading.length
    ? uploading.reduce((a, b) => a + b, 0) / uploading.length
    : 0;
  const disabled = !enabled || busy;

  async function upload(chosen: File[], method: "picker" | "drop") {
    if (!chosen.length || busy) return;
    setError("");
    const totalBytes = chosen.reduce((sum, f) => sum + f.size, 0);
    track("upload_files_selected", { file_count: chosen.length, total_bytes: totalBytes, interaction_method: method });
    if (chosen.some((f) => !fileTypeOf(f.name))) {
      track("upload_selection_rejected", { reason: "unsupported_type", file_count: chosen.length, total_bytes: totalBytes });
      setError(safeError("unsupported_type"));
      return;
    }
    if (chosen.some((f) => !f.size || f.size > MAX_FILE_BYTES)) {
      track("upload_selection_rejected", { reason: "file_too_large", file_count: chosen.length, total_bytes: totalBytes });
      setError(safeError("file_too_large"));
      return;
    }
    if (
      chosen.length + files.length > MAX_FILES ||
      chosen.reduce((sum, f) => sum + f.size, 0) +
        files.reduce((sum, f) => sum + f.bytes, 0) >
        MAX_TOTAL_BYTES
    ) {
      track("upload_selection_rejected", { reason: "total_too_large", file_count: chosen.length, total_bytes: totalBytes });
      setError(safeError("total_too_large"));
      return;
    }
    const batchId = crypto.randomUUID();
    const batchStarted = Date.now();
    let completed = 0;
    let attempted = 0;
    let stage = "draft";
    let currentFileId: string | undefined;
    let analysisId = session?.analysisId;
    track("upload_batch_started", { batch_id: batchId, file_count: chosen.length, total_bytes: totalBytes });
    setBusy(true);
    onBusy(true);
    try {
      const credentials = await ensureDraft();
      analysisId = credentials.analysisId;
      for (const file of chosen) {
        attempted++;
        stage = "registration";
        currentFileId = undefined;
        const type = fileTypeOf(file.name)!;
        const upload = await requestUpload({
          ...credentials,
          clientFileId: crypto.randomUUID(),
          name: file.name,
          bytes: file.size,
        });
        currentFileId = upload.fileId;
        stage = "transfer";
        const transferStarted = Date.now();
        track("upload_started", { analysis_id: analysisId, batch_id: batchId, position: attempted,
          extension: type.extension, file_kind: type.kind, bytes: file.size });

        setProgress((p) => ({ ...p, [upload.fileId]: 0 }));
        try {
          await putFile(upload.uploadUrl, file, upload.contentType, (value) =>
            setProgress((p) => ({ ...p, [upload.fileId]: value })),
          );
          stage = "acknowledgement";
          await complete({ ...credentials, fileId: upload.fileId });
          completed++;
          track("upload_completed", { analysis_id: analysisId, file_id: upload.fileId,
            batch_id: batchId, bytes: file.size, extension: type.extension, file_kind: type.kind,
            duration_ms: Date.now() - transferStarted });
        } finally {
          setProgress((p) => {
            const next = { ...p };
            delete next[upload.fileId];
            return next;
          });
        }
      }
    } catch (error) {
      const props = { analysis_id: analysisId, file_id: currentFileId, batch_id: batchId,
        stage, error_code: analyticsErrorCode(error) };
      track("upload_failed", props);
      captureAnalyticsError(error, "file_upload", props);
      setError(safeError(error));
    } finally {
      track("upload_batch_finished", { analysis_id: analysisId, batch_id: batchId,
        completed_count: completed, failed_count: Number(completed < attempted || stage === "draft"),
        unattempted_count: chosen.length - attempted, duration_ms: Date.now() - batchStarted });
      setBusy(false);
      onBusy(false);
    }
  }
  const state = dragging
    ? "dragging"
    : busy
      ? "uploading"
      : files.length
        ? "filled"
        : "empty";
  const lines = (
    {
      empty: [
        "Sleep je lesmateriaal hierheen",
        "of klik om bestanden te kiezen",
      ],
      dragging: ["Laat los om toe te voegen", "Je bestanden worden toegevoegd"],
      uploading: ["Bestanden uploaden…", `${Math.round(overall)}%`],
      filled: [
        `${files.length} ${files.length === 1 ? "bestand" : "bestanden"} toegevoegd`,
        "Nog meer? Sleep of klik.",
      ],
    } satisfies Record<string, [string, string]>
  )[state];

  return (
    <section className="upload-panel" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="visually-hidden">
        Lesmateriaal
      </h2>
      <input
        id={id}
        ref={input}
        type="file"
        accept={ACCEPTED_FILES}
        multiple
        className="file-input"
        disabled={disabled}
        onChange={(e) => {
          const chosen = Array.from(e.target.files ?? []);
          e.target.value = "";
          void upload(chosen, "picker");
        }}
      />
      <div className="upload-layout">
        <div className="upload-main">
          <div className={`board-stage is-${state}`}>
            <button
              type="button"
              className="board"
              disabled={disabled}
              aria-describedby={`${id}-limits`}
              onClick={() => { track("upload_picker_opened", { source: "upload_board" }); input.current?.click(); }}
              onDragEnter={(e) => {
                e.preventDefault();
                dragDepth.current += 1;
                if (!disabled) setDragging(true);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={() => {
                dragDepth.current = Math.max(0, dragDepth.current - 1);
                if (!dragDepth.current) setDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                dragDepth.current = 0;
                setDragging(false);
                if (disabled) return;
                void upload(Array.from(e.dataTransfer.files), "drop");
              }}
            >
              <DropArt state={state} lines={lines} overall={overall} />
            </button>
          </div>
          <p id={`${id}-limits`} className="upload-limits">
            {ACCEPTED_LABEL}. Max. 20 bestanden, 10 MiB per bestand en 40 MiB
            samen.
            {!enabled && !busy && " Even geduld, je onderwerp wordt geladen."}
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <aside className="file-panel" aria-labelledby={`${id}-files`}>
          <div className="file-panel-head">
            <h2 id={`${id}-files`}>
              {files.length ? "Je materiaal" : "Wat kun je toevoegen?"}
            </h2>
            {files.length > 0 && (
              <span className="file-count">
                {files.length} / {MAX_FILES}
              </span>
            )}
          </div>
          {files.length > 0 ? (
            <ul className="file-slips">
              {files.map((f) => {
                const pct = progress[f.fileId];
                const state =
                  pct !== undefined ||
                  f.status === "uploading" ||
                  f.status === "validating"
                    ? "loading"
                    : f.status === "ready"
                      ? "covered"
                      : "not_found";
                return (
                  <li key={f.fileId} className={`file-slip slip-${state} ph-no-capture`} data-private>
                    <StatusIcon status={state} size={30} />
                    <div className="slip-body">
                      <strong title={f.name}>{f.name}</strong>
                      <small>
                        {pct !== undefined
                          ? `Uploaden ${pct}%`
                          : f.status === "ready"
                            ? `${pages(f.name, f.pageCount)} · Klaar`
                            : f.status === "validating"
                              ? fileTypeOf(f.name)?.kind === "pdf"
                                ? "Bestand controleren…"
                                : "Omzetten naar pdf…"
                              : f.status === "invalid"
                                ? safeError(f.safeError)
                                : "Upload niet afgerond; verwijder en upload opnieuw."}
                      </small>
                      {pct !== undefined && (
                        <progress
                          max={100}
                          value={pct}
                          aria-label={`Upload ${f.name}`}
                        />
                      )}
                    </div>
                    <button
                      type="button"
                      className="slip-remove"
                      aria-label={`Verwijder ${f.name}`}
                      disabled={busy}
                      onClick={async () => {
                        if (!session) return;
                        track("file_remove_clicked", { analysis_id: session.analysisId, file_id: f.fileId });
                        try {
                          await remove({
                            ...session,
                            fileId: f.fileId as Id<"files">,
                          });
                        } catch (e) {
                          track("file_remove_failed", { analysis_id: session.analysisId, file_id: f.fileId, error_code: analyticsErrorCode(e) });
                          captureAnalyticsError(e, "file_remove", { analysis_id: session.analysisId });
                          setError(safeError(e));
                        }
                      }}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="material-guide">
              <p>
                Voeg zoveel mogelijk toe van wat je voor dit onderwerp gebruikt.
                Hoe meer Krito ziet, hoe vollediger het beeld per leerdoel.
              </p>
              <ul>
                {materialKinds.map((kind) => (
                  <li key={kind}>{kind}</li>
                ))}
              </ul>
              <p className="material-formats">Werkt met {ACCEPTED_LABEL}.</p>
              <button
                type="button"
                className="secondary-button"
                disabled={disabled}
                onClick={() => { track("upload_picker_opened", { source: "choose_files" }); input.current?.click(); }}
              >
                Kies bestanden
              </button>
            </div>
          )}
          {footer && <div className="file-panel-foot">{footer}</div>}
        </aside>
      </div>
    </section>
  );
}
