import { createHash } from "crypto";
import { readScheduleScreenshot, ScreenshotError } from "@/lib/gemini";
import { takeScreenshotRead } from "@/lib/store";

// Reading can take a while when Google's free models are busy and the site has to try several.
export const maxDuration = 180;

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

// Each person can read this many screenshots per hour, so nobody can use up the site's free Gemini
// allowance for everyone else.
const READS_PER_HOUR = 10;

// A scrambled id for whoever is asking, based on their internet address. The real address isn't stored.
function whoIsAsking(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`whenworks:${ip}`).digest("hex").slice(0, 32);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const image: unknown = body?.image;
  const mimeType: unknown = body?.mimeType;
  if (typeof image !== "string" || typeof mimeType !== "string" || !ALLOWED.includes(mimeType)) {
    return Response.json({ error: "Upload a screenshot image." }, { status: 400 });
  }
  if (image.length > 4_000_000) {
    return Response.json({ error: "That image is too big. Try a smaller screenshot." }, { status: 413 });
  }
  try {
    const allowed = await takeScreenshotRead(whoIsAsking(request), READS_PER_HOUR);
    if (!allowed.ok) {
      const minutes = Math.max(1, Math.ceil(((allowed.retryAt?.getTime() ?? Date.now()) - Date.now()) / 60000));
      return Response.json(
        {
          error: `You've read ${READS_PER_HOUR} screenshots in the last hour, which is the limit that keeps the free reader working for everyone. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        },
        { status: 429 },
      );
    }
    return Response.json(await readScheduleScreenshot(image, mimeType));
  } catch (err) {
    if (err instanceof ScreenshotError) return Response.json({ error: err.message }, { status: err.status });
    console.error(err);
    return Response.json({ error: "Something went wrong reading that screenshot." }, { status: 500 });
  }
}
