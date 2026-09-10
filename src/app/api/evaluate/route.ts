import { NextResponse } from "next/server";
import { evaluateWithDeepSeek, ConfigurationError } from "../../../lib/deepseek";
import { checkRateLimit } from "../../../lib/rate-limit";
import { validateEvaluationPayload } from "../../../lib/validation";

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "anonymous";
}

export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "İstek gövdesi geçerli JSON içermiyor." }, { status: 400 });
  }

  const validation = validateEvaluationPayload(payload);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error, field: validation.field }, { status: 400 });
  }

  if (!checkRateLimit(getClientIp(request))) {
    return NextResponse.json(
      { error: "Çok fazla değerlendirme isteği. Lütfen bir dakika sonra tekrar deneyin." },
      { status: 429 },
    );
  }

  try {
    const report = await evaluateWithDeepSeek(validation.value);
    return NextResponse.json({ report }, { status: 200 });
  } catch (error) {
    if (error instanceof ConfigurationError) {
      return NextResponse.json(
        { error: "AI değerlendirmesi yapılandırılmamış. Lütfen DEEPSEEK_API_KEY ortam değişkenini ekleyin." },
        { status: 503 },
      );
    }

    console.error("Translation evaluation failed:", error);
    return NextResponse.json(
      { error: "Değerlendirme şu anda tamamlanamadı. Lütfen birkaç saniye sonra tekrar deneyin." },
      { status: 503 },
    );
  }
}
