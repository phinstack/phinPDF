export type OpenErrorCode =
  'not-pdf' | 'too-large' | 'password-required' | 'password-incorrect' | 'invalid' | 'unknown';

/** Why a document could not be opened, in a form the UI can turn into a message. */
export class OpenError extends Error {
  constructor(
    readonly code: OpenErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'OpenError';
  }
}

/** Plain-language message for each error code. */
export function describeOpenError(code: OpenErrorCode): string {
  switch (code) {
    case 'not-pdf':
      return 'This file is not a PDF.';
    case 'too-large':
      return 'This file is too large to open.';
    case 'password-required':
      return 'This PDF is password-protected.';
    case 'password-incorrect':
      return 'The password is incorrect.';
    case 'invalid':
      return 'This PDF is damaged and could not be opened.';
    case 'unknown':
      return 'Something went wrong while opening this PDF.';
  }
}
