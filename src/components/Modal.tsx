"use client";
import { useEffect, useRef, type ReactNode } from "react";
export function Modal({
  label,
  onClose,
  children,
  narrow = false,
}: {
  label: string;
  narrow?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // Closing from cleanup queues a "close" event; it must not close the modal
  // that React's development double-mount has just reopened.
  const closingFromCleanup = useRef(false);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      if (!dialog.open) return;
      closingFromCleanup.current = true;
      dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`app-dialog${narrow ? " is-narrow" : ""}`}
      aria-label={label}
      onClose={() => {
        if (closingFromCleanup.current) {
          closingFromCleanup.current = false;
          return;
        }
        onClose();
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          onClose();
      }}
    >
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
