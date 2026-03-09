export async function extractTextFromImage(
  imageBase64: string
): Promise<string> {
  const apiKey = process.env.OPTIIC_API_KEY;
  if (!apiKey) throw new Error("OPTIIC_API_KEY not set");

  const response = await fetch("https://api.optiic.dev/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey,
      image: imageBase64,
      mode: "ocr",
    }),
  });

  if (!response.ok) {
    throw new Error(`Optiic API error: ${response.status}`);
  }

  const data = await response.json();
  return data.text || "";
}
