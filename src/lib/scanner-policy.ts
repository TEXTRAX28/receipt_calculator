export const assistedLabels = {
  computer: "This computer",
  gemini: "Gemini",
  azure: "Azure",
  veryfi: "Veryfi",
  vision: "Local vision",
  openai: "OpenAI credits · last resort",
} as const;
export type AssistedReader = keyof typeof assistedLabels;
type Availability = { configured: boolean; remaining?: number } | null;

/** Choose one configured helper; selecting it never starts a scan or grants uploads.
 * Computer OCR won the saved local comparison. OpenAI remains the paid last resort.
 */
export function chooseAssistedReader(
  config: Partial<Record<AssistedReader, Availability>>,
  preferred?: AssistedReader,
): AssistedReader | undefined {
  return (
    preferred
      ? [preferred]
      : (["computer", "azure", "gemini", "veryfi", "vision", "openai"] as const)
  ).find((reader) => {
    const status = config[reader];
    return (
      status?.configured &&
      (status.remaining === undefined || status.remaining > 0)
    );
  });
}

export function isDeviceReader(reader: string) {
  return reader === "local" || reader === "enhanced" || reader === "pdf";
}
