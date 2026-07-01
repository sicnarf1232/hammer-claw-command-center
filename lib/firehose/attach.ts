// Detect inline attachments (email-signature logos, embedded images) so they do
// not show up as real attachments. Outlook names inline images imageNNN.ext and
// often flags them isInline; signature icons are also small images. Real OEM
// attachments (PDFs, drawings, specs, spreadsheets) are not images or are large.

const INLINE_NAME = /^image\d{2,}\.(png|jpe?g|gif|bmp|webp)$/i;
const INLINE_IMAGE_MAX = 40 * 1024; // images under ~40KB are almost always signatures/icons

export function isInlineAttachment(
  name: string | null | undefined,
  contentType: string | null | undefined,
  sizeBytes: number | null | undefined,
  isInlineFlag?: boolean | null,
): boolean {
  if (isInlineFlag === true) return true;
  if (name && INLINE_NAME.test(name)) return true;
  const isImage =
    (contentType ?? "").toLowerCase().startsWith("image/") ||
    /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(name ?? "");
  if (isImage && typeof sizeBytes === "number" && sizeBytes > 0 && sizeBytes < INLINE_IMAGE_MAX) {
    return true;
  }
  return false;
}
