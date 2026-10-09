import { useState, type ImgHTMLAttributes } from "react";

interface PhotoThumbProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet"> {
  photo: { photo_url: string; thumb_url?: string | null };
  /**
   * Para cards grandes (largura quase total da tela): informe `sizes` e o
   * navegador escolhe entre a miniatura (400 px) e a versão de exibição.
   * Sem `sizes`, usa sempre a miniatura (grades de 2–3 colunas).
   */
  sizes?: string;
}

/**
 * Imagem pequena (grade, card, lista): usa a miniatura quando existe e cai
 * para photo_url se a miniatura falhar. Sempre lazy + decoding async.
 */
export function PhotoThumb({ photo, alt = "", onError, sizes, ...rest }: PhotoThumbProps) {
  const [useFull, setUseFull] = useState(false);
  const hasThumb = !useFull && !!photo.thumb_url;
  const src = hasThumb ? photo.thumb_url! : photo.photo_url;
  const srcSet = hasThumb && sizes ? `${photo.thumb_url} 400w, ${photo.photo_url} 1280w` : undefined;
  return (
    <img
      {...rest}
      src={src}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={(e) => {
        if (!useFull && photo.thumb_url) setUseFull(true);
        onError?.(e);
      }}
    />
  );
}
