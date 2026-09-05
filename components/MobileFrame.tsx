"use client";

import { useEffect, useRef, useState } from "react";
import SoundToggleButton from "./SoundToggleButton";

/**
 * 모든 페이지를 이 프레임으로 감싼다.
 * - 항상 모바일 세로 비율(BASE_WIDTH x BASE_HEIGHT)로 레이아웃을 그림
 * - 실제 화면(특히 PC)이 더 크면 비율을 유지한 채 transform: scale() 로 확대
 * - 실제 화면이 더 작으면 축소 (풀스크린 모바일 브라우저에서도 자연스럽게 동작)
 */

const BASE_WIDTH = 420; // 기준 모바일 폭(px)
const BASE_HEIGHT = 900; // 기준 모바일 높이(px)

export default function MobileFrame({ children }: { children: React.ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    function updateScale() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // 가로/세로 중 더 작게 맞춰지는 비율로 스케일 (전체가 항상 화면 안에 들어오게)
      const nextScale = Math.min(vw / BASE_WIDTH, vh / BASE_HEIGHT);
      setScale(nextScale);
    }
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b0b0f", // 프레임 바깥 여백 색 (PC에서 레터박스처럼 보이는 부분)
        overflow: "hidden",
      }}
    >
      <div
        ref={wrapperRef}
        style={{
          width: BASE_WIDTH,
          height: BASE_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: BASE_WIDTH,
            height: BASE_HEIGHT,
            overflow: "hidden",
            position: "relative",
            background: "var(--app-bg, #111114)",
            color: "var(--app-fg, #fff)",
          }}
        >
          {children}
          <SoundToggleButton />
        </div>
      </div>
    </div>
  );
}
