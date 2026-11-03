/** One-pass output with indentation owned by blocks. */
export class Writer {
  output = "";
  depth = 0;

  write(...chunks: string[]): void {
    for (const chunk of chunks) {
      for (const line of chunk.split("\n")) {
        this.output += (line ? "  ".repeat(this.depth) + line : "") + "\n";
      }
    }
  }

  block(header: string, body: () => void, footer = "}"): void {
    this.write(header);
    this.depth++;
    body();
    this.depth--;
    this.write(footer);
  }
}
