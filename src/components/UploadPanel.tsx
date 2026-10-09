"use client";
import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Image from "next/image";
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
import { safeError } from "../lib/safeError";
import { StatusIcon } from "./SiteHeader";
import chalkboard from "../../public/illustrations/chalkboard.webp";
import krito from "../../public/illustrations/krito-pointer.webp";
type FileRow = NonNullable<
  FunctionReturnType<typeof api.analyses.getStatus>
>["files"][number];
type Burst = { id: number; x: number; y: number };
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
    [bursts, setBursts] = useState<Burst[]>([]),
    [progress, setProgress] = useState<Record<string, number>>({});
  const uploading = Object.values(progress);
  const overall = uploading.length
    ? uploading.reduce((a, b) => a + b, 0) / uploading.length
    : 0;
  const disabled = !enabled || busy;

  function burst(x: number, y: number) {
    const id = Date.now() + Math.random();
    setBursts((b) => [...b, { id, x, y }]);
    setTimeout(() => setBursts((b) => b.filter((p) => p.id !== id)), 1000);
  }
  async function upload(chosen: File[]) {
    if (!chosen.length || busy) return;
    setError("");
    if (chosen.some((f) => !fileTypeOf(f.name))) {
      setError(safeError("unsupported_type"));
      return;
    }
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
          await putFile(upload.uploadUrl, file, upload.contentType, (value) =>
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
  const state = dragging
    ? "dragging"
    : busy
      ? "uploading"
      : files.length
        ? "filled"
        : "empty";
  const lines = {
    empty: ["Sleep je lesmateriaal hierheen", "of klik om bestanden te kiezen"],
    dragging: ["Laat maar los!", "Krito neemt het over"],
    uploading: ["Bestanden uploaden…", `${Math.round(overall)}%`],
    filled: [
      `${files.length} ${files.length === 1 ? "bestand" : "bestanden"} toegevoegd`,
      "Nog meer? Sleep of klik.",
    ],
  }[state];

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
          void upload(chosen);
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
              onClick={() => input.current?.click()}
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
                const r = e.currentTarget.getBoundingClientRect();
                burst(
                  ((e.clientX - r.left) / r.width) * 100,
                  ((e.clientY - r.top) / r.height) * 100,
                );
                void upload(Array.from(e.dataTransfer.files));
              }}
            >
              <Image
                src={chalkboard}
                alt=""
                priority
                sizes="(max-width: 900px) 92vw, 760px"
                className="board-image"
                draggable={false}
              />
              <span className="board-surface">
                <span className="board-glow" aria-hidden="true" />
                <svg
                  className="chalk-doodle"
                  viewBox="0 0 120 120"
                  aria-hidden="true"
                >
                  <path
                    pathLength={1}
                    d="M30 14h42l20 20v70c0 2-1 3-3 3H31c-2 0-3-1-3-3V17c0-2 1-3 2-3Z"
                  />
                  <path pathLength={1} d="M71 15v20h20" />
                  <path pathLength={1} d="M60 40v42m-16-15 16 16 16-16" />
                </svg>
                <span className="chalk-text" key={state}>
                  <span className="chalk-line chalk-line-big">{lines[0]}</span>
                  <svg
                    className="chalk-underline"
                    viewBox="0 0 300 16"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <path
                      pathLength={1}
                      d="M4 10c40-6 90-7 140-4s100 4 152-3"
                    />
                  </svg>
                  <span className="chalk-line">{lines[1]}</span>
                </span>
                {state === "uploading" && (
                  <span className="chalk-progress" aria-hidden="true">
                    <span style={{ width: `${overall}%` }} />
                  </span>
                )}
                {bursts.map((b) => (
                  <span
                    key={b.id}
                    className="chalk-burst"
                    style={{ left: `${b.x}%`, top: `${b.y}%` } as CSSProperties}
                    aria-hidden="true"
                  >
                    {Array.from({ length: 10 }, (_, i) => (
                      <i
                        key={i}
                        style={{ "--a": `${i * 36}deg` } as CSSProperties}
                      />
                    ))}
                  </span>
                ))}
              </span>
            </button>
            <span className="krito-wrap" aria-hidden="true">
              <Image
                src={krito}
                alt=""
                priority
                sizes="300px"
                className="board-krito"
                draggable={false}
              />
            </span>
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
                  <li key={f.fileId} className={`file-slip slip-${state}`}>
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
              <p className="material-formats">
                Werkt met {ACCEPTED_LABEL.replace(/^PDF/, "pdf")}-bestanden.
              </p>
              <button
                type="button"
                className="secondary-button"
                disabled={disabled}
                onClick={() => input.current?.click()}
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
