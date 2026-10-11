import { Node, type Project, SyntaxKind } from "ts-morph";
import type { EdgeKind } from "./types";

export interface RawImport {
  kind: EdgeKind;
  /** null when a dynamic import's argument isn't a string literal. */
  specifier: string | null;
  line: number;
  /** Source text of a non-literal argument, for reporting. */
  argumentText: string;
}

// Three constructs become imports: `import ... from`, `export ... from`, and
// `import("literal")`. `require()` is out of scope for this phase.
export function extractImports(
  project: Project,
  relPath: string,
  text: string,
): RawImport[] {
  const sf = project.createSourceFile(relPath, text, { overwrite: true });
  try {
    const found: RawImport[] = [];
    for (const d of sf.getImportDeclarations()) {
      found.push({
        kind: "import",
        specifier: d.getModuleSpecifierValue(),
        line: d.getStartLineNumber(),
        argumentText: "",
      });
    }
    for (const d of sf.getExportDeclarations()) {
      const specifier = d.getModuleSpecifierValue();
      if (specifier === undefined) continue; // `export { a }` re-exports nothing
      found.push({
        kind: "re-export",
        specifier,
        line: d.getStartLineNumber(),
        argumentText: "",
      });
    }
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) continue;
      const arg = call.getArguments()[0];
      const literal =
        arg && (Node.isStringLiteral(arg) || Node.isNoSubstitutionTemplateLiteral(arg))
          ? arg.getLiteralValue()
          : null;
      found.push({
        kind: "dynamic-import",
        specifier: literal,
        line: call.getStartLineNumber(),
        argumentText: arg ? arg.getText().slice(0, 80) : "",
      });
    }
    return found;
  } finally {
    project.removeSourceFile(sf);
  }
}
