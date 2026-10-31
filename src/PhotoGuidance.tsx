import type { ReceiptImage } from "./lib/images";
import type { CaptureFlag } from "./lib/image-quality";

const messages: Record<CaptureFlag, string> = {
  blur: "Text may be blurred. Hold the camera steady, tap to focus and try another photo.",
  dark: "The photo looks very dark. Use brighter, even lighting without a shadow over the receipt.",
  "low-resolution":
    "The image is small. Take a closer, higher-resolution photo, keeping all receipt edges visible.",
  "low-detail":
    "Very little detail is visible. Check that the printed text is readable and is not washed out.",
};

export default function PhotoGuidance({ images }: { images: ReceiptImage[] }) {
  const groups = (Object.keys(messages) as CaptureFlag[]).flatMap((flag) => {
    const photos = images.flatMap((image, index) =>
      !image.document && image.quality?.flags.includes(flag) ? [index + 1] : [],
    );
    return photos.length ? [{ flag, photos }] : [];
  });
  if (!groups.length) return null;
  return (
    <div className="capture-guidance" role="status" aria-label="Photo checks">
      <strong>Check these photos before reading</strong>
      <ul>
        {groups.map(({ flag, photos }) => (
          <li key={flag}>
            <strong>
              {photos.length === 1 ? "Image" : "Images"} {photos.join(", ")}:
            </strong>{" "}
            {messages[flag]}
          </li>
        ))}
      </ul>
      <p>
        Preview the text and total. You can replace a photo, or continue and
        check the result carefully.
      </p>
    </div>
  );
}
