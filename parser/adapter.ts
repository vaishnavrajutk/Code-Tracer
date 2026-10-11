// Framework knowledge lives behind this interface and nowhere else. The parser
// asks "what is this file?" and takes whatever answer comes back.
export interface Adapter {
  name: string;
  /** A label for the file, or null when this adapter can't tell. */
  classify(file: { path: string; folder: string }): string | null;
}

// Assumes no framework at all, so it never claims to know what a file is.
export const fallbackAdapter: Adapter = {
  name: "none",
  classify: () => null,
};
