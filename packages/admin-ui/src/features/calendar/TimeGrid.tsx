import { theme } from 'antd';
import type { Dayjs } from 'dayjs';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  layoutBars,
  layoutTimeColumn,
  type ViewEvent,
} from '../../lib/calendarLayout';
import { dayKey, formatTimeRange } from '../../lib/events';
import { eventLabel } from './eventLabel';
import { useEventColors, useTodayColors } from './useEventColors';

/** Height of one hour in the grid, in pixels. */
export const HOUR_PX = 48;
const GUTTER_PX = 56;
const BAR_HEIGHT = 22;
const reset = { border: 0, cursor: 'pointer', font: 'inherit' } as const;

/**
 * The hour the grid is scrolled to when it opens: two hours before now when
 * today is shown, else an hour before the first event, else 8 o'clock.
 */
export function firstVisibleHour(
  days: readonly Dayjs[],
  events: readonly ViewEvent[],
  now: Dayjs,
): number {
  if (days.some((day) => day.isSame(now, 'day'))) {
    return Math.max(0, now.hour() - 2);
  }
  const starts = days.flatMap((day) =>
    layoutTimeColumn(events, day).map((block) => block.top / 60),
  );
  if (starts.length === 0) {
    return 7;
  }
  return Math.max(0, Math.min(Math.floor(Math.min(...starts)) - 1, 8));
}

/**
 * The week or the day as a time grid: a column per day, a row per hour, the
 * all-day events in a strip above, timed events as tinted blocks at their
 * time (overlapping ones side by side) and a red line for the current time.
 */
export function TimeGrid({
  days,
  today,
  now,
  events,
  onOpenEvent,
  onOpenDay,
}: {
  days: readonly Dayjs[];
  today: Dayjs;
  now: Dayjs;
  events: readonly ViewEvent[];
  onOpenEvent: (event: ViewEvent) => void;
  onOpenDay: (day: Dayjs) => void;
}) {
  const { t, i18n } = useTranslation();
  const { token } = theme.useToken();
  const colors = useEventColors();
  const todayColors = useTodayColors();
  const locale = i18n.language;
  const body = useRef<HTMLDivElement>(null);
  const line = `1px solid ${token.colorBorderSecondary}`;
  const columns = `${GUTTER_PX}px repeat(${days.length}, minmax(0, 1fr))`;
  const { bars, lanes } = layoutBars(events, days);
  const firstKey = days[0]?.valueOf();
  const hour = firstVisibleHour(days, events, now);

  // Open at a sensible hour; moving to another period starts there again.
  useEffect(() => {
    if (body.current) {
      body.current.scrollTop = hour * HOUR_PX;
    }
    // Only when the period changes, not when events load in or the clock ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstKey, days.length]);

  const hourLabel = new Intl.DateTimeFormat(locale, { hour: 'numeric' });
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const nowMinutes = now.hour() * 60 + now.minute();

  return (
    <section
      aria-label={t(
        days.length === 1 ? 'calendar.views.day' : 'calendar.views.week',
      )}
      style={{
        overflowX: 'auto',
        border: line,
        borderRadius: 8,
        background: token.colorBgContainer,
      }}
    >
      <div style={{ minWidth: days.length > 1 ? 720 : 0 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: columns,
            borderBottom: line,
          }}
        >
          <div />
          {days.map((day) => {
            const isToday = day.isSame(today, 'day');
            return (
              <div
                key={day.valueOf()}
                style={{
                  padding: '6px 4px',
                  textAlign: 'center',
                  borderInlineStart: line,
                }}
              >
                <button
                  type="button"
                  onClick={() => onOpenDay(day)}
                  // The name starts with what is shown ("Sun 18"), then says the whole date.
                  aria-label={`${weekday.format(day.toDate())} ${day.date()}, ${new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(day.toDate())}`}
                  aria-current={isToday ? 'date' : undefined}
                  style={{
                    ...reset,
                    background: 'transparent',
                    color: isToday
                      ? todayColors.text
                      : token.colorTextSecondary,
                    fontSize: 12,
                  }}
                >
                  {weekday.format(day.toDate())}{' '}
                  <span
                    style={{
                      display: 'inline-block',
                      minWidth: 26,
                      height: 26,
                      lineHeight: '26px',
                      borderRadius: 13,
                      fontSize: 15,
                      fontWeight: 600,
                      background: isToday ? todayColors.fill : 'transparent',
                      color: isToday ? '#fff' : token.colorText,
                    }}
                  >
                    {day.date()}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        {lanes > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: columns,
              borderBottom: line,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: token.colorTextSecondary,
                padding: '4px 6px',
                textAlign: 'end',
              }}
            >
              {t('content.allDay')}
            </div>
            <div
              style={{
                gridColumn: `2 / span ${days.length}`,
                display: 'grid',
                gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
                gridAutoRows: BAR_HEIGHT + 2,
                padding: '2px 0',
              }}
            >
              {bars.map((bar) => {
                const palette = colors.solid(bar.event.color);
                return (
                  <button
                    key={`${bar.event.key}-${bar.startColumn}`}
                    type="button"
                    onClick={() => onOpenEvent(bar.event)}
                    aria-label={eventLabel(
                      bar.event,
                      days[bar.startColumn],
                      locale,
                      t,
                    )}
                    style={{
                      ...reset,
                      gridColumn: `${bar.startColumn + 1} / ${bar.endColumn + 2}`,
                      gridRow: bar.lane + 1,
                      height: BAR_HEIGHT,
                      margin: '1px 3px',
                      padding: '0 6px',
                      borderRadius: 6,
                      background: palette.background,
                      color: palette.text,
                      fontSize: 12,
                      textAlign: 'start',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {bar.event.summary ?? t('content.untitled')}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div
          ref={body}
          style={{
            height: 'min(640px, 70vh)',
            overflowY: 'auto',
            position: 'relative',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: columns,
              height: 24 * HOUR_PX,
            }}
          >
            <div aria-hidden style={{ position: 'relative' }}>
              {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
                <span
                  key={h}
                  style={{
                    position: 'absolute',
                    insetInlineEnd: 8,
                    top: h * HOUR_PX - 8,
                    fontSize: 11,
                    color: token.colorTextSecondary,
                  }}
                >
                  {hourLabel.format(new Date(2000, 0, 1, h))}
                </span>
              ))}
            </div>
            {days.map((day) => {
              const blocks = layoutTimeColumn(events, day);
              const isToday = day.isSame(now, 'day');
              return (
                <div
                  key={day.valueOf()}
                  data-day={dayKey(day)}
                  role="group"
                  aria-label={new Intl.DateTimeFormat(locale, {
                    dateStyle: 'full',
                  }).format(day.toDate())}
                  style={{
                    position: 'relative',
                    borderInlineStart: line,
                    backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX - 1}px, ${token.colorBorderSecondary} ${HOUR_PX - 1}px, ${token.colorBorderSecondary} ${HOUR_PX}px)`,
                  }}
                >
                  {blocks.map((block) => {
                    const palette = colors.tinted(block.event.color);
                    const width = 100 / block.columns;
                    return (
                      <button
                        key={`${block.event.key}-${dayKey(day)}`}
                        type="button"
                        onClick={() => onOpenEvent(block.event)}
                        aria-label={eventLabel(block.event, day, locale, t)}
                        style={{
                          ...reset,
                          position: 'absolute',
                          top: (block.top / 60) * HOUR_PX,
                          height: (block.height / 60) * HOUR_PX - 2,
                          insetInlineStart: `calc(${block.column * width}% + 2px)`,
                          width: `calc(${width}% - 4px)`,
                          boxSizing: 'border-box',
                          overflow: 'hidden',
                          padding: '2px 6px',
                          borderRadius: 6,
                          borderInlineStart: `4px solid ${palette.border}`,
                          background: palette.background,
                          color: palette.text,
                          textAlign: 'start',
                          fontSize: 12,
                          lineHeight: 1.25,
                          zIndex: 1,
                        }}
                      >
                        <span
                          style={{
                            display: 'block',
                            fontWeight: 600,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {block.event.summary ?? t('content.untitled')}
                        </span>{' '}
                        {block.height >= 40 && (
                          <span style={{ display: 'block', fontSize: 11 }}>
                            {formatTimeRange(block.event, locale, dayKey(day))}
                          </span>
                        )}{' '}
                        {block.height >= 60 && block.event.location && (
                          <span
                            style={{
                              display: 'block',
                              fontSize: 11,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {block.event.location}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {isToday && (
                    <div
                      aria-hidden
                      data-testid="now-line"
                      style={{
                        position: 'absolute',
                        insetInline: 0,
                        top: (nowMinutes / 60) * HOUR_PX,
                        borderTop: `2px solid ${token.colorError}`,
                        zIndex: 2,
                        pointerEvents: 'none',
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          insetInlineStart: -5,
                          top: -6,
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          background: token.colorError,
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
