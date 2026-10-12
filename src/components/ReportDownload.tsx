"use client";
import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { track, captureAnalyticsError } from "../lib/analytics";
import { analyticsErrorCode } from "../../shared/analytics";
import { StatusIcon } from "./brand";

/** The pdf report, rendered on demand by Convex and saved straight to the teacher's downloads. */
export function ReportDownload({
  analysisId,
  accessToken,
  goalCount,
}: {
  analysisId: string;
  accessToken: string;
  goalCount: number;
}) {
  const download = useAction(api.node.report.download);
  const [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  return (
    <div className="report-download">
      <button
        type="button"
        className="secondary-button"
        disabled={busy}
        onClick={async () => {
          track("report_download_clicked", { analysis_id: analysisId, goal_count: goalCount });
          setBusy(true);
          setFailed(false);
          const started = performance.now();
          try {
            const { fileName, bytes } = await download({ analysisId, accessToken });
            const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = fileName;
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
            track("report_download_completed", {
              analysis_id: analysisId,
              bytes: bytes.byteLength,
              duration_ms: Math.round(performance.now() - started),
            });
          } catch (e) {
            track("report_download_failed", { analysis_id: analysisId, error_code: analyticsErrorCode(e) });
            captureAnalyticsError(e, "report_download", { analysis_id: analysisId });
            setFailed(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? (
          <>
            <StatusIcon status="loading" size={20} /> Pdf maken…
          </>
        ) : (
          <>
            <DownloadIcon /> Download als pdf
          </>
        )}
      </button>
      {failed && (
        <p className="form-error" role="alert">
          De pdf lukte niet. Probeer het opnieuw.
        </p>
      )}
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg className="download-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4.5v10.2M7.6 10.6l4.4 4.4 4.4-4.4M5 19.2h14" />
    </svg>
  );
}
