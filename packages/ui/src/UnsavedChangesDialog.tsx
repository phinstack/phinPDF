import { useEffect, useRef } from 'react';

export interface UnsavedChangesDialogProps {
  readonly fileName: string;
  readonly saving: boolean;
  readonly onSave: () => void;
  readonly onDiscard: () => void;
  readonly onCancel: () => void;
}

/** Asks whether to save before closing a document with unsaved changes. */
export function UnsavedChangesDialog({
  fileName,
  saving,
  onSave,
  onDiscard,
  onCancel,
}: UnsavedChangesDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      dialog?.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="phinpdf-dialog"
      aria-labelledby="unsaved-title"
      aria-describedby="unsaved-text"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <div className="phinpdf-dialog-body">
        <h2 id="unsaved-title">Save changes?</h2>
        <p id="unsaved-text">
          <strong>{fileName}</strong> has changes that are not saved. They will be lost if you
          don&apos;t save them.
        </p>
        <div className="phinpdf-dialog-actions">
          <button type="button" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={onDiscard} disabled={saving}>
            Don&apos;t save
          </button>
          <button type="button" className="primary" onClick={onSave} disabled={saving} autoFocus>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
