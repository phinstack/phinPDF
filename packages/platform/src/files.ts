import { FileTooLargeError, MAX_FILE_BYTES, type OpenedFile } from './types.ts';

let nextId = 0;

/** Reads a browser File (picked, dropped, or launched) into an OpenedFile. */
export async function readFile(file: File, prefix: string): Promise<OpenedFile> {
  if (file.size > MAX_FILE_BYTES) throw new FileTooLargeError(file.size);
  nextId += 1;
  return {
    id: `${prefix}-${String(nextId)}`,
    name: file.name,
    bytes: new Uint8Array(await file.arrayBuffer()),
  };
}
