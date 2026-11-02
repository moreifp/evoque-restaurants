/**
 * Tradução do cardápio "sem explicação": tira as linhas de explicação entre
 * parênteses que a IA põe embaixo de cada prato, e notas soltas (> ...).
 * Mantém títulos, seções, pratos e preços.
 */
export function withoutExplanations(text: string): string {
  const out: string[] = [];
  let dentro = 0; // explicação entre parênteses que continua na linha seguinte
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const l = raw.trim();
    if (dentro > 0) {
      dentro += (l.match(/\(/g) || []).length - (l.match(/\)/g) || []).length;
      continue;
    }
    // Linha que é só explicação: "(...)" — às vezes em itálico "*(...)*"
    const semMarca = l.replace(/^[*_]+|[*_]+$/g, "");
    if (semMarca.startsWith("(")) {
      const saldo = (semMarca.match(/\(/g) || []).length - (semMarca.match(/\)/g) || []).length;
      if (saldo > 0) dentro = saldo;
      continue;
    }
    if (l.startsWith(">")) continue;
    out.push(raw);
  }
  // Sem linhas em branco repetidas
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
