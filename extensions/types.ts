export type FpdlDownloadMessage = {
  type: "FPDL_DOWNLOAD";
  url: string;
  filename: string;
};

export type FpdlDownloadResponse =
  | { ok: true; downloadId: number }
  | { ok: false; error: string };
