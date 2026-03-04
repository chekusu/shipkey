import { parse } from "dotenv";
import { expand } from "dotenv-expand";

export interface ParsedVar {
  key: string;
  value: string;
}

export function parseDotenv(content: string): ParsedVar[] {
  const parsed = parse(content);
  const { parsed: expanded } = expand({ parsed });

  return Object.entries(expanded ?? parsed).map(([key, value]) => ({
    key,
    value: value ?? "",
  }));
}
