/**
 * Image Processing Pipeline
 *
 * encodeToPng(file) — re-encodes any camera JPEG or image file to a
 * normalised PNG.  This is the only function called by the upload flow.
 */

/**
 * Encode a File/Blob to PNG via canvas.
 *
 * Used by the upload flow to normalise camera JPEGs before storing.
 * Preserves the original dimensions; does NOT remove the background.
 */
export async function encodeToPng(input: File | Blob): Promise<Blob> {
  const url = URL.createObjectURL(input);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = rej;
      img.src = url;
    });
    const cvs = document.createElement("canvas");
    cvs.width  = img.naturalWidth;
    cvs.height = img.naturalHeight;
    cvs.getContext("2d")!.drawImage(img, 0, 0);
    return await new Promise<Blob>((res, rej) =>
      cvs.toBlob(
        (b) => (b ? res(b) : rej(new Error("canvas.toBlob failed"))),
        "image/png",
      )
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
