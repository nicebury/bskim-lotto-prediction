import { permanentRedirect } from "next/navigation";

/**
 * 003 개편으로 이 화면은 `/lotto/stat` 자체가 됐다.
 *
 * 링크·북마크가 죽지 않도록 영구 리다이렉트(308)를 남긴다. 아직 배포 전이라 색인된 URL 은
 * 없지만, 사이트 안의 오래된 링크가 남아 있을 수 있고 그것을 404 로 떨어뜨릴 이유가 없다.
 * 사이트맵에서는 빠진다(→ app/sitemap.ts).
 */
export default function HotColdRedirect(): never {
  permanentRedirect("/lotto/stat");
}
