import { useEffect, useState, type ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import type { Item } from "./lib/model";
import {
  itemReadStamp,
  sourceViewport,
  type ItemEvidence,
  type SourcePanel,
} from "./lib/receipt-evidence";

function SourceImage({ panel }: { panel: SourcePanel }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(panel.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [panel.blob]);
  const frame = sourceViewport(panel);
  if (!url) return <p role="status">Loading receipt area…</p>;
  return (
    <svg
      className="receipt-source-image"
      role="img"
      aria-label={`Highlighted purchase area in photo ${panel.photo}, section ${panel.part}`}
      width={frame.width}
      height={frame.height}
      viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
    >
      <image href={url} width={panel.width} height={panel.height} />
      {panel.regions.map((region, index) => (
        <rect
          key={index}
          data-testid="source-region"
          className={panel.unclear ? "source-region unclear" : "source-region"}
          x={region.box[0] * panel.width}
          y={region.box[1] * panel.height}
          width={(region.box[2] - region.box[0]) * panel.width}
          height={(region.box[3] - region.box[1]) * panel.height}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

export default function ReceiptSource({
  item,
  index,
  evidence,
  children,
}: {
  item: Item;
  index: number;
  evidence: ItemEvidence;
  children: ReactNode;
}) {
  const [active, setActive] = useState(0);
  const panel = evidence.panels[active];
  const edited = itemReadStamp(item) !== evidence.fieldsStamp;
  return (
    <div className="receipt-source">
      <span className="eyebrow">CHECK THE RECEIPT</span>
      <h2>Purchase {index + 1}</h2>
      <p>
        Compare the highlighted rows with the editable details below. Every
        value still needs checking against the photo.
      </p>
      {evidence.panels.length > 1 && (
        <div
          className="source-section-picker"
          aria-label="Receipt sections for this purchase"
        >
          {evidence.panels.map((section, i) => (
            <button
              key={`${section.photo}:${section.part}`}
              className="button button-outline"
              aria-pressed={active === i}
              onClick={() => setActive(i)}
            >
              Photo {section.photo} · section {section.part}
            </button>
          ))}
        </div>
      )}
      <figure className="source-figure">
        <SourceImage key={`${panel.photo}:${panel.part}`} panel={panel} />
        <figcaption>
          Photo {panel.photo} · section {panel.part} · highlighted scanned rows
        </figcaption>
      </figure>
      {panel.unclear && (
        <p className="source-caution">
          <CircleHelp size={17} /> Some text was unclear. Check names and
          numbers carefully.
        </p>
      )}
      {edited && (
        <p className="source-edited" role="status">
          Edited since this scan. The highlight still shows the original read.
        </p>
      )}
      <details className="source-text">
        <summary>Recognized text in this area</summary>
        <pre>{panel.regions.map((r) => r.text).join("\n")}</pre>
      </details>
      {children}
    </div>
  );
}
