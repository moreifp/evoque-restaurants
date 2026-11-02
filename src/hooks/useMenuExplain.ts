import { useEffect, useState } from "react";

const KEY = "evoque:menu-com-explicacao";
const EVENTO = "evoque:menu-explicacao";

function ler(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Preferência "com explicação" da tradução do cardápio (padrão: só os pratos).
 * Guardada no aparelho e igual em todas as telas abertas.
 */
export function useMenuExplain(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState(ler);
  useEffect(() => {
    const sync = () => setOn(ler());
    window.addEventListener(EVENTO, sync);
    return () => window.removeEventListener(EVENTO, sync);
  }, []);
  const set = (v: boolean) => {
    try {
      localStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      /* sem armazenamento: vale só nesta tela */
    }
    setOn(v);
    window.dispatchEvent(new Event(EVENTO));
  };
  return [on, set];
}
