import { ImageResponse } from "next/og";

/** Renders the interim brand mark (see src/app/icon.svg) as a PNG of the given size. */
export function brandMarkPng(size: number) {
  const unit = size / 64;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4 * unit,
        background: "#141412",
      }}
    >
      <div style={{ width: 16 * unit, height: 32 * unit, background: "#3ddc97" }} />
      <div style={{ width: 16 * unit, height: 32 * unit, background: "#ff8a4c" }} />
    </div>,
    { width: size, height: size },
  );
}
