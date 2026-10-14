// The link answers as an attachment, so navigating saves the file; a popup after an await would be blocked.
export function startDownload(url: string): void {
  window.location.assign(url);
}
