import { readScheduleScreenshot, ScreenshotError } from "@/lib/gemini";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const image: unknown = body?.image;
  const mimeType: unknown = body?.mimeType;
  if (typeof image !== "string" || typeof mimeType !== "string" || !ALLOWED.includes(mimeType)) {
    return Response.json({ error: "Upload a screenshot image." }, { status: 400 });
  }
  if (image.length > 8_000_000) {
    return Response.json({ error: "That image is too big. Try a smaller screenshot." }, { status: 413 });
  }
  try {
    return Response.json(await readScheduleScreenshot(image, mimeType));
  } catch (err) {
    if (err instanceof ScreenshotError) return Response.json({ error: err.message }, { status: err.status });
    console.error(err);
    return Response.json({ error: "Something went wrong reading that screenshot." }, { status: 500 });
  }
}
