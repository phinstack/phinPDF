import { useEffect, useRef, useState, type SyntheticEvent } from 'react';

export interface PasswordDialogProps {
  readonly fileName: string;
  /** True after a wrong password was entered. */
  readonly incorrect: boolean;
  readonly onSubmit: (password: string) => void;
  readonly onCancel: () => void;
}

/** Asks for a PDF's password. Uses a modal <dialog> so focus stays inside it. */
export function PasswordDialog({ fileName, incorrect, onSubmit, onCancel }: PasswordDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      dialog?.close();
    };
  }, []);

  const submit = (event: SyntheticEvent): void => {
    event.preventDefault();
    onSubmit(password);
  };

  return (
    <dialog
      ref={dialogRef}
      className="phinpdf-dialog"
      aria-labelledby="pw-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <form method="dialog" onSubmit={submit}>
        <h2 id="pw-title">This PDF is password-protected</h2>
        <p>
          Enter the password for <strong>{fileName}</strong> to open it. The password is only used
          on this device.
        </p>
        <label htmlFor="pdf-password">Password</label>
        <input
          id="pdf-password"
          type="password"
          autoComplete="off"
          autoFocus
          value={password}
          aria-invalid={incorrect}
          aria-describedby={incorrect ? 'pw-error' : undefined}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
        {incorrect && (
          <p id="pw-error" role="alert" className="phinpdf-dialog-error">
            The password is incorrect. Try again.
          </p>
        )}
        <div className="phinpdf-dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Open
          </button>
        </div>
      </form>
    </dialog>
  );
}
