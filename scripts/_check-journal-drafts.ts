// Scratch check: render every manifest draft through the same Body renderer the
// journal uses, and report structure that suggests a markup mistake.
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Body } from "../components/content-body";

async function main() {
const manifest = JSON.parse(await readFile("content/blog/manifest.json", "utf8")) as {
  slug: string;
  title: string;
  file: string;
}[];

for (const post of manifest) {
  const text = await readFile(post.file, "utf8");
  if (text.split("\n")[0] !== `# ${post.title}`) {
    console.log(`H1 MISMATCH ${post.slug}`);
    continue;
  }
  const body = text.replace(/^# .+\n+/, "").trim();
  const html = renderToStaticMarkup(createElement(Body, { text: body }));
  const words = body.split(/\s+/).filter(Boolean).length;
  const counts = {
    words,
    h2: (html.match(/<h2>/g) ?? []).length,
    h3: (html.match(/<h3>/g) ?? []).length,
    tables: (html.match(/<table>/g) ?? []).length,
    links: (html.match(/<a /g) ?? []).length,
    paragraphs: (html.match(/<p>/g) ?? []).length,
    rawPipes: (html.match(/\|/g) ?? []).length,
    rawStars: (html.match(/\*\*/g) ?? []).length,
  };
  console.log(post.slug.padEnd(38), JSON.stringify(counts));
}
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
