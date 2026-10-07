import { FileTooLargeError, NotImplementedError } from '@phinpdf/platform';
import { describeOpenError, OpenError } from '@phinpdf/renderer';

/** Turns anything thrown while opening a file into a message for the user. */
export function errorMessage(error: unknown): string {
  if (error instanceof OpenError) return describeOpenError(error.code);
  if (error instanceof FileTooLargeError) return describeOpenError('too-large');
  if (error instanceof NotImplementedError) return error.message;
  // Errors from the desktop side arrive as plain strings.
  if (typeof error === 'string' && error === 'not a PDF') return describeOpenError('not-pdf');
  return 'The file could not be opened.';
}
