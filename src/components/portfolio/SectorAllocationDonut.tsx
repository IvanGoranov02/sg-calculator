"use client";

import { useMemo, useRef, type FocusEvent, type KeyboardEvent, type PointerEvent } from "react";

import { donutAnnulusPath, donutSliceAngles } from "@/lib/portfolioAllocation";

export type SectorDonutSlice = {
  name: string;
  /** Whole-percent label shared with the bar list and the center readout. */
  pctLabel: string;
  /** One-decimal label drawn outside the ring, like a holdings donut. */
  ringLabel: string;
  color: string;
  value: number;
};

const VIEW = 360;
const CENTER = 180;
const INNER_RADIUS = 82;
const OUTER_RADIUS = 118;
const LABEL_RADIUS = 136;
/** Outside percentages need about this much of the ring or they collide. */
const LABEL_MIN_SWEEP = 16;

function calloutPlacement(midDeg: number): { x: number; y: number; anchor: "start" | "middle" | "end" } {
  const rad = ((midDeg - 90) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const anchor = cos > 0.4 ? "start" : cos < -0.4 ? "end" : "middle";
  const radius = anchor === "middle" ? LABEL_RADIUS + 8 : LABEL_RADIUS;
  return {
    x: CENTER + radius * cos,
    y: CENTER + radius * sin,
    anchor,
  };
}

export function SectorAllocationDonut({
  slices,
  activeName,
  focusName,
  chartLabel,
  onHover,
  onFocusName,
  onSelect,
}: {
  slices: SectorDonutSlice[];
  activeName: string | null;
  focusName: string | null;
  chartLabel: string;
  onHover: (name: string | null) => void;
  onFocusName: (name: string | null) => void;
  /** Opens the sector company list. Does not pin the hover expansion. */
  onSelect: (name: string) => void;
}) {
  const buttonRefs = useRef<Array<SVGPathElement | null>>([]);
  // Stays set from pointerdown until focus leaves the chart, so a click that
  // focuses after pointerup cannot pin the wedge through :focus-visible.
  const pointerFocusRef = useRef(false);
  const angles = useMemo(
    () => donutSliceAngles(slices.map((slice) => slice.value), { gapDegrees: 0.8, minSweepDegrees: 3 }),
    [slices],
  );

  const active = slices.find((slice) => slice.name === activeName) ?? null;
  const tabName = focusName ?? slices[0]?.name ?? null;

  if (slices.length === 0 || angles.length !== slices.length) return null;

  function moveFocus(nextIndex: number) {
    const next = slices[nextIndex];
    if (!next) return;
    onHover(null);
    onFocusName(next.name);
    buttonRefs.current[nextIndex]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<SVGPathElement>, index: number) {
    const last = slices.length - 1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(index === last ? 0 : index + 1);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(index === 0 ? last : index - 1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      moveFocus(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      moveFocus(last);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(slices[index].name);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onFocusName(null);
      event.currentTarget.blur();
    }
  }

  function onKeyUp(event: KeyboardEvent<SVGPathElement>) {
    if (event.key === " ") event.preventDefault();
  }

  function onGroupBlur(event: FocusEvent<SVGSVGElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    pointerFocusRef.current = false;
    onFocusName(null);
  }

  function isPointingDevice(pointerType: string) {
    return pointerType === "mouse" || pointerType === "pen";
  }

  function onChartLeave(event: PointerEvent<SVGSVGElement>) {
    if (isPointingDevice(event.pointerType)) onHover(null);
  }

  function onSliceBlur(event: FocusEvent<SVGPathElement>) {
    const next = event.relatedTarget;
    const svg = event.currentTarget.ownerSVGElement;
    if (next instanceof Node && svg?.contains(next)) return;
    pointerFocusRef.current = false;
  }

  const activeIndex = slices.findIndex((slice) => slice.name === activeName);
  const activeAngle = activeIndex >= 0 ? angles[activeIndex] : null;
  const activePath =
    active && activeAngle
      ? donutAnnulusPath(
          CENTER,
          CENTER,
          INNER_RADIUS,
          OUTER_RADIUS + 6,
          activeAngle.startAngle,
          activeAngle.endAngle,
        )
      : null;

  return (
    <div className="relative mx-auto w-full max-w-[19.5rem]">
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        role="group"
        aria-label={chartLabel}
        className="block aspect-square w-full touch-manipulation overflow-visible"
        onBlur={onGroupBlur}
        onPointerLeave={onChartLeave}
      >
        {slices.map((slice, index) => {
          const angle = angles[index];
          const focused = slice.name === focusName;
          const path = donutAnnulusPath(
            CENTER,
            CENTER,
            INNER_RADIUS,
            OUTER_RADIUS,
            angle.startAngle,
            angle.endAngle,
          );
          return (
            <path
              key={slice.name}
              ref={(node) => {
                buttonRefs.current[index] = node;
              }}
              d={path}
              fill={slice.color}
              fillRule="evenodd"
              stroke={focused ? "var(--ring)" : "var(--card)"}
              strokeWidth={focused ? 2.5 : 1.5}
              className="cursor-pointer outline-none"
              role="button"
              tabIndex={slice.name === tabName ? 0 : -1}
              aria-label={`${slice.name}, ${slice.ringLabel}`}
              data-sector-slice={slice.name}
              data-active={slice.name === activeName ? "true" : "false"}
              onPointerDown={(event) => {
                pointerFocusRef.current = true;
                if (event.pointerType === "touch") onHover(slice.name);
              }}
              onPointerUp={(event) => {
                if (event.pointerType === "touch") onHover(null);
              }}
              onPointerCancel={() => {
                onHover(null);
              }}
              onPointerEnter={(event) => {
                if (isPointingDevice(event.pointerType)) onHover(slice.name);
              }}
              onPointerLeave={(event) => {
                if (!isPointingDevice(event.pointerType)) return;
                const next = event.relatedTarget;
                if (next instanceof Element && next.closest("[data-sector-slice]")) return;
                onHover(null);
              }}
              onFocus={(event) => {
                if (pointerFocusRef.current) return;
                if (event.currentTarget.matches(":focus-visible")) onFocusName(slice.name);
              }}
              onBlur={onSliceBlur}
              onClick={() => onSelect(slice.name)}
              onKeyDown={(event) => onKeyDown(event, index)}
              onKeyUp={onKeyUp}
            />
          );
        })}
        {active && activePath ? (
          <path
            pointerEvents="none"
            d={activePath}
            fill={active.color}
            fillRule="evenodd"
            stroke={focusName === active.name ? "var(--ring)" : "none"}
            strokeWidth={focusName === active.name ? 2 : 0}
          />
        ) : null}
        {slices.map((slice, index) => {
          const angle = angles[index];
          const sweep = angle.endAngle - angle.startAngle;
          const activeWedge = slice.name === activeName;
          if (!activeWedge && sweep < LABEL_MIN_SWEEP) return null;
          const mid = sweep >= 359.5 ? 0 : (angle.startAngle + angle.endAngle) / 2;
          const place = calloutPlacement(mid);
          return (
            <text
              key={`${slice.name}-label`}
              x={place.x}
              y={place.y}
              textAnchor={place.anchor}
              dominantBaseline="central"
              fill={activeWedge ? "var(--foreground)" : "var(--muted-foreground)"}
              fontSize={activeWedge ? 13 : 11}
              fontWeight={activeWedge ? 600 : 500}
              className="pointer-events-none font-mono"
              opacity={activeName != null && !activeWedge ? 0.45 : 1}
            >
              {slice.ringLabel}
            </text>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center [&_*]:pointer-events-none" aria-hidden="true">
        {active ? (
          <div className="pointer-events-none flex w-[34%] flex-col items-center gap-1 text-center">
            <p className="line-clamp-3 text-[11px] leading-tight font-medium text-foreground">
              <span
                className="mr-1 inline-block size-1.5 translate-y-[-1px] rounded-full"
                style={{ background: active.color }}
              />
              {active.name}
            </p>
            <p className="font-mono text-lg leading-none font-semibold tabular-nums text-foreground">
              {active.ringLabel}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
