"use client";

import { useMemo, useRef, type FocusEvent, type KeyboardEvent, type PointerEvent } from "react";

import { donutAnnulusPath, donutSliceAngles } from "@/lib/portfolioAllocation";

export type SectorDonutSlice = {
  name: string;
  pctLabel: string;
  color: string;
  value: number;
};

const VIEW = 200;
const CENTER = 100;
const INNER_RADIUS = 58;
const OUTER_RADIUS = 80;

export function SectorAllocationDonut({
  slices,
  activeName,
  focusName,
  pinnedName,
  chartLabel,
  onHover,
  onFocusName,
  onToggle,
}: {
  slices: SectorDonutSlice[];
  activeName: string | null;
  focusName: string | null;
  pinnedName: string | null;
  chartLabel: string;
  onHover: (name: string | null) => void;
  onFocusName: (name: string | null) => void;
  onToggle: (name: string) => void;
}) {
  const buttonRefs = useRef<Array<SVGPathElement | null>>([]);
  const angles = useMemo(
    () => donutSliceAngles(slices.map((slice) => slice.value), { gapDegrees: 2.6, minSweepDegrees: 4 }),
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
      onToggle(slices[index].name);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onFocusName(null);
      event.currentTarget.blur();
    }
  }

  function onGroupBlur(event: FocusEvent<SVGSVGElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    onFocusName(null);
  }

  function onChartLeave(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerType === "mouse") onHover(null);
  }

  const activeIndex = slices.findIndex((slice) => slice.name === activeName);
  const activeAngle = activeIndex >= 0 ? angles[activeIndex] : null;
  const activePath =
    active && activeAngle
      ? donutAnnulusPath(CENTER, CENTER, INNER_RADIUS, OUTER_RADIUS, activeAngle.startAngle, activeAngle.endAngle)
      : null;

  return (
    <div className="relative mx-auto w-full max-w-[16.5rem]">
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
              aria-label={`${slice.name}, ${slice.pctLabel}`}
              aria-pressed={pinnedName === slice.name}
              data-sector-slice={slice.name}
              data-active={slice.name === activeName ? "true" : "false"}
              onPointerDown={(event) => {
                event.currentTarget.focus();
              }}
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") onHover(slice.name);
              }}
              onFocus={(event) => {
                if (event.currentTarget.matches(":focus-visible")) onFocusName(slice.name);
              }}
              onClick={() => onToggle(slice.name)}
              onKeyDown={(event) => onKeyDown(event, index)}
            />
          );
        })}
        {active && activePath ? (
          <g key={active.name} pointerEvents="none" className="sector-wedge-pop">
            <path
              d={activePath}
              fill={active.color}
              fillRule="evenodd"
              stroke={focusName === active.name ? "var(--ring)" : "var(--card)"}
              strokeWidth={focusName === active.name ? 2.5 : 1.5}
            />
          </g>
        ) : null}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
        {active ? (
          <div className="flex w-[46%] flex-col items-center gap-1 text-center">
            <p className="line-clamp-3 text-[11px] leading-tight font-medium text-foreground">
              <span
                className="mr-1 inline-block size-1.5 translate-y-[-1px] rounded-full"
                style={{ background: active.color }}
              />
              {active.name}
            </p>
            <p className="font-mono text-lg leading-none font-semibold tabular-nums text-foreground">
              {active.pctLabel}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
