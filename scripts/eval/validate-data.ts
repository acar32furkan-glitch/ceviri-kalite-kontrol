/**
 * Veri seti doğrulama CLI'si (Faz 1).
 *
 * Kullanım:
 *   npx tsx scripts/eval/validate-data.ts [dosya]
 *   npm run eval:validate
 *
 * Dosya verilmezse sırayla `data/eval-set.jsonl` → `data/eval-set.example.jsonl` denenir.
 * Şema hatası varsa **çıkış kodu 1** olur; hatalı veri sessizce işlenmiş sayılmaz (ADR-006).
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  buildValidationReport,
  DEFAULT_DATA_FILE,
  EXAMPLE_DATA_FILE,
} from "./validation-report";

function resolveDataFile(argv: readonly string[], cwd: string): string {
  const requested = argv.find((argument) => !argument.startsWith("-"));
  if (requested !== undefined) return requested;
  if (existsSync(path.join(cwd, DEFAULT_DATA_FILE))) return DEFAULT_DATA_FILE;
  return EXAMPLE_DATA_FILE;
}

function main(argv: readonly string[]): number {
  const cwd = process.cwd();
  const file = resolveDataFile(argv, cwd);
  const absolute = path.isAbsolute(file) ? file : path.join(cwd, file);

  if (!existsSync(absolute)) {
    console.error(`HATA: dosya bulunamadı → ${file}`);
    console.error(
      `Beklenen konum: ${path.join(DEFAULT_DATA_FILE)} (yoksa ${path.join(EXAMPLE_DATA_FILE)} kullanılır).`,
    );
    return 1;
  }

  let text: string;
  try {
    text = readFileSync(absolute, "utf8");
  } catch (error) {
    console.error(`HATA: dosya okunamadı → ${file}`);
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const report = buildValidationReport(text, file);
  for (const line of report.lines) console.log(line);
  return report.exitCode;
}

process.exitCode = main(process.argv.slice(2));
