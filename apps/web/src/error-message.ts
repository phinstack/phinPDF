import { FileTooLargeError, NotImplementedError } from '@phinpdf/platform';
import { SaveError } from '@phinpdf/editor';
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

/** Turns anything thrown while saving into a message for the user. */
export function saveErrorMessage(error: unknown): string {
  if (error instanceof SaveError) {
    switch (error.code) {
      case 'password':
        return 'The file could not be saved because its password is needed. Reopen it and try again.';
      case 'open':
      case 'page':
        return 'This file is too damaged to save changes into. Try "Save as" to keep a copy.';
      case 'write':
        return 'The changes could not be written into the file.';
    }
  }
  // Errors from the desktop side arrive as plain strings.
  if (typeof error === 'string') {
    if (error.startsWith('cannot save file')) {
      return 'The file could not be saved. Check that it is not open elsewhere or read-only.';
    }
    if (error === 'unknown file') return 'The original file is no longer available. Use "Save as".';
  }
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'The browser did not allow saving to that file. Try "Save as" (Ctrl+Shift+S).';
  }
  return 'The file could not be saved.';
}
